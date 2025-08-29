package http

import (
	"backend/internal/config"
	"backend/internal/db"
	"backend/internal/email"
	"backend/internal/middleware"
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

func RegisterOperators(api fiber.Router, pool *pgxpool.Pool, cfg *config.Config) {
	// Initialize email service
	emailService := email.NewService(cfg)

	// Admin-only endpoints for operator management
	adminGrp := api.Group("/admin/operators")
	adminGrp.Use(middleware.RequireAdmin(middleware.JWTConfig{Secret: cfg.JWTSecret}))

	// Create operator invite (admin only)
	adminGrp.Post("/invite", func(c *fiber.Ctx) error {
		var req struct {
			Email string `json:"email"`
			Name  string `json:"name"`
		}
		if err := c.BodyParser(&req); err != nil {
			return fiber.ErrBadRequest
		}

		req.Email = middleware.SanitizeString(req.Email)
		req.Name = middleware.SanitizeString(req.Name)

		if !middleware.ValidateEmail(req.Email) || req.Name == "" {
			return c.Status(400).JSON(fiber.Map{"error": "Invalid email or name"})
		}

		// Generate secure token
		tokenBytes := make([]byte, 32)
		rand.Read(tokenBytes)
		token := hex.EncodeToString(tokenBytes)

		// Insert invite
		_, err := pool.Exec(context.Background(),
			`insert into operator_invites (email, token, expires_at) values ($1, $2, $3)`,
			req.Email, token, time.Now().Add(48*time.Hour))
		if err != nil {
			return fiber.ErrInternalServerError
		}

		// Generate invitation link - point to frontend registration page
		inviteLink := fmt.Sprintf("https://dbvnfc-games-web-neon.vercel.app/register?token=%s", token)
		fmt.Println("Sending invite to", req.Email, "with link: ", inviteLink)

		// Send invitation email
		if err := emailService.SendOperatorInvite(req.Email, req.Name, inviteLink); err != nil {
			// Log the error but don't fail the request - admin can use the link manually
			fmt.Printf("Failed to send invitation email to %s: %v\n", req.Email, err)
			return c.JSON(fiber.Map{
				"message":     "Invitation created (email failed to send)",
				"invite_link": inviteLink,
				"error":       "Email service unavailable - please send the link manually",
			})
		}

		return c.JSON(fiber.Map{
			"message":     "Invitation sent successfully",
			"invite_link": inviteLink,
		})
	})

	// List pending invitations (admin only) - with pagination
	adminGrp.Get("/invitations", func(c *fiber.Ctx) error {
		// Parse pagination parameters
		params := &db.PaginationParams{
			Page:     1,
			PageSize: 20,
		}
		
		if pageStr := c.Query("page"); pageStr != "" {
			if page, err := strconv.Atoi(pageStr); err == nil {
				params.Page = page
			}
		}
		
		if sizeStr := c.Query("pageSize"); sizeStr != "" {
			if size, err := strconv.Atoi(sizeStr); err == nil {
				params.PageSize = size
			}
		}
		
		params.Validate()

		// Get total count
		var total int
		err := pool.QueryRow(context.Background(), 
			"select count(*) from operator_invites").Scan(&total)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{
				"error":   "database_error",
				"message": "Failed to count invitations",
			})
		}

		// Get paginated results
		rows, err := pool.Query(context.Background(), `
			select email, token, created_at, expires_at, used_at
			from operator_invites 
			order by created_at desc
			limit $1 offset $2`, params.PageSize, params.GetOffset())
		if err != nil {
			return c.Status(500).JSON(fiber.Map{
				"error":   "database_error",
				"message": "Failed to fetch invitations",
			})
		}
		defer rows.Close()

		var invitations []fiber.Map
		for rows.Next() {
			var email, token string
			var createdAt, expiresAt time.Time
			var usedAt *time.Time
			if err := rows.Scan(&email, &token, &createdAt, &expiresAt, &usedAt); err != nil {
				return c.Status(500).JSON(fiber.Map{
					"error":   "database_error",
					"message": "Failed to parse invitation data",
				})
			}

			status := "pending"
			if usedAt != nil {
				status = "used"
			} else if time.Now().After(expiresAt) {
				status = "expired"
			}

			invitations = append(invitations, fiber.Map{
				"email": email, "token": token, "createdAt": createdAt,
				"expiresAt": expiresAt, "usedAt": usedAt, "status": status,
			})
		}

		// Return paginated result
		result := db.NewPaginatedResult(invitations, total, params)
		return c.JSON(result)
	})

	// Cancel invitation (admin only)
	adminGrp.Delete("/invitations/:token", func(c *fiber.Ctx) error {
		token := middleware.SanitizeString(c.Params("token"))
		
		result, err := pool.Exec(context.Background(),
			`delete from operator_invites where token = $1 and used_at is null`, token)
		if err != nil {
			return fiber.ErrInternalServerError
		}
		
		rowsAffected := result.RowsAffected()
		if rowsAffected == 0 {
			return c.Status(404).JSON(fiber.Map{"error": "Invitation not found or already used"})
		}

		return c.JSON(fiber.Map{"message": "Invitation cancelled"})
	})

	// List operators (admin only) - with pagination
	adminGrp.Get("/", func(c *fiber.Ctx) error {
		// Parse pagination parameters
		params := &db.PaginationParams{
			Page:     1,
			PageSize: 20,
		}
		
		if pageStr := c.Query("page"); pageStr != "" {
			if page, err := strconv.Atoi(pageStr); err == nil {
				params.Page = page
			}
		}
		
		if sizeStr := c.Query("pageSize"); sizeStr != "" {
			if size, err := strconv.Atoi(sizeStr); err == nil {
				params.PageSize = size
			}
		}
		
		params.Validate()

		// Get total count
		var total int
		err := pool.QueryRow(context.Background(), 
			"select count(*) from operators").Scan(&total)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{
				"error":   "database_error",
				"message": "Failed to count operators",
			})
		}

		// Get paginated results
		rows, err := pool.Query(context.Background(), `
			select o.id, o.email, o.name, o.status, o.created_at,
			       count(distinct og.game_id) as game_count
			from operators o
			left join operator_games og on o.id = og.operator_id
			group by o.id, o.email, o.name, o.status, o.created_at
			order by o.created_at desc
			limit $1 offset $2`, params.PageSize, params.GetOffset())
		if err != nil {
			return c.Status(500).JSON(fiber.Map{
				"error":   "database_error",
				"message": "Failed to fetch operators",
			})
		}
		defer rows.Close()

		var operators []fiber.Map
		for rows.Next() {
			var id, email, name, status string
			var createdAt time.Time
			var gameCount int
			if err := rows.Scan(&id, &email, &name, &status, &createdAt, &gameCount); err != nil {
				return c.Status(500).JSON(fiber.Map{
					"error":   "database_error",
					"message": "Failed to parse operator data",
				})
			}
			operators = append(operators, fiber.Map{
				"id": id, "email": email, "name": name, "status": status,
				"createdAt": createdAt, "gameCount": gameCount,
			})
		}

		// Return paginated result
		result := db.NewPaginatedResult(operators, total, params)
		return c.JSON(result)
	})

	// Get operator details (admin only)
	adminGrp.Get("/:id", func(c *fiber.Ctx) error {
		operatorID := c.Params("id")

		// Get operator basic info
		var operator struct {
			ID        string    `json:"id"`
			Email     string    `json:"email"`
			Name      string    `json:"name"`
			Status    string    `json:"status"`
			CreatedAt time.Time `json:"createdAt"`
		}

		err := pool.QueryRow(context.Background(),
			`select id, email, name, status, created_at from operators where id = $1`,
			operatorID).Scan(&operator.ID, &operator.Email, &operator.Name, &operator.Status, &operator.CreatedAt)
		if err != nil {
			return fiber.ErrNotFound
		}

		// Get operator's games
		rows, err := pool.Query(context.Background(), `
			select g.id, g.name, g.status, g.created_at,
				   count(distinct t.id) as team_count,
				   count(distinct b.value->>'id') as base_count
			from games g
			join operator_games og on g.id = og.game_id
			left join teams t on t.game_id = g.id
			left join jsonb_array_elements(g.bases) as b on true
			where og.operator_id = $1
			group by g.id, g.name, g.status, g.created_at
			order by g.created_at desc`, operatorID)
		if err != nil {
			return fiber.ErrInternalServerError
		}
		defer rows.Close()

		var games []fiber.Map
		for rows.Next() {
			var gameID, gameName, gameStatus, createdAt string
			var teamCount, baseCount int
			if err := rows.Scan(&gameID, &gameName, &gameStatus, &createdAt, &teamCount, &baseCount); err != nil {
				return fiber.ErrInternalServerError
			}
			games = append(games, fiber.Map{
				"id": gameID, "name": gameName, "status": gameStatus,
				"createdAt": createdAt, "teamCount": teamCount, "baseCount": baseCount,
			})
		}

		return c.JSON(fiber.Map{
			"id": operator.ID, "email": operator.Email, "name": operator.Name,
			"status": operator.Status, "createdAt": operator.CreatedAt, "games": games,
		})
	})

	// Get operator's games (admin only)
	adminGrp.Get("/:id/games", func(c *fiber.Ctx) error {
		operatorID := c.Params("id")

		// Verify operator exists
		var exists bool
		err := pool.QueryRow(context.Background(),
			`select exists(select 1 from operators where id = $1)`, operatorID).Scan(&exists)
		if err != nil || !exists {
			return fiber.ErrNotFound
		}

		// Get operator's games
		rows, err := pool.Query(context.Background(), `
			select g.id, g.name, g.status, g.created_at, og.role,
				   count(distinct t.id) as team_count,
				   count(distinct b.value->>'id') as base_count
			from games g
			join operator_games og on g.id = og.game_id
			left join teams t on t.game_id = g.id
			left join jsonb_array_elements(g.bases) as b on true
			where og.operator_id = $1
			group by g.id, g.name, g.status, g.created_at, og.role
			order by g.created_at desc`, operatorID)
		if err != nil {
			return fiber.ErrInternalServerError
		}
		defer rows.Close()

		var games []fiber.Map
		for rows.Next() {
			var gameID, gameName, gameStatus, createdAt, role string
			var teamCount, baseCount int
			if err := rows.Scan(&gameID, &gameName, &gameStatus, &createdAt, &role, &teamCount, &baseCount); err != nil {
				return fiber.ErrInternalServerError
			}
			games = append(games, fiber.Map{
				"id": gameID, "name": gameName, "status": gameStatus,
				"createdAt": createdAt, "role": role,
				"teamCount": teamCount, "baseCount": baseCount,
			})
		}

		return c.JSON(games)
	})

	// Update operator status (admin only)
	adminGrp.Patch("/:id", func(c *fiber.Ctx) error {
		operatorID := c.Params("id")

		var req struct {
			Status string `json:"status"`
		}
		if err := c.BodyParser(&req); err != nil {
			return fiber.ErrBadRequest
		}

		req.Status = middleware.SanitizeString(req.Status)
		if req.Status != "active" && req.Status != "inactive" && req.Status != "pending" {
			return c.Status(400).JSON(fiber.Map{"error": "Invalid status. Must be 'active', 'inactive', or 'pending'"})
		}

		// Update operator status
		result, err := pool.Exec(context.Background(),
			`update operators set status = $1, updated_at = now() where id = $2`,
			req.Status, operatorID)
		if err != nil {
			return fiber.ErrInternalServerError
		}

		rowsAffected := result.RowsAffected()
		if rowsAffected == 0 {
			return fiber.ErrNotFound
		}

		// Get updated operator
		var operator struct {
			ID        string    `json:"id"`
			Email     string    `json:"email"`
			Name      string    `json:"name"`
			Status    string    `json:"status"`
			CreatedAt time.Time `json:"createdAt"`
			UpdatedAt time.Time `json:"updatedAt"`
		}

		err = pool.QueryRow(context.Background(),
			`select id, email, name, status, created_at, updated_at from operators where id = $1`,
			operatorID).Scan(&operator.ID, &operator.Email, &operator.Name,
			&operator.Status, &operator.CreatedAt, &operator.UpdatedAt)
		if err != nil {
			return fiber.ErrInternalServerError
		}

		return c.JSON(operator)
	})

	// Delete operator (admin only)
	adminGrp.Delete("/:id", func(c *fiber.Ctx) error {
		operatorID := c.Params("id")

		// Check if operator has active games
		var activeGameCount int
		err := pool.QueryRow(context.Background(), `
			select count(*) from games g 
			join operator_games og on g.id = og.game_id 
			where og.operator_id = $1 and g.status = 'live'`, operatorID).Scan(&activeGameCount)
		if err != nil {
			return fiber.ErrInternalServerError
		}

		if activeGameCount > 0 {
			return c.Status(400).JSON(fiber.Map{
				"error": fmt.Sprintf("Cannot delete operator with %d active games. Please finish or transfer the games first.", activeGameCount),
			})
		}

		// Soft delete: mark as inactive instead of hard delete
		result, err := pool.Exec(context.Background(),
			`update operators set status = 'inactive', updated_at = now() where id = $1`,
			operatorID)
		if err != nil {
			return fiber.ErrInternalServerError
		}

		rowsAffected := result.RowsAffected()
		if rowsAffected == 0 {
			return fiber.ErrNotFound
		}

		return c.JSON(fiber.Map{"message": "Operator marked as inactive", "operatorId": operatorID})
	})

	// Token validation endpoint (public) - returns email for pre-filling
	api.Get("/operators/validate-token/:token", func(c *fiber.Ctx) error {
		token := middleware.SanitizeString(c.Params("token"))

		if token == "" {
			return c.Status(400).JSON(fiber.Map{"error": "Token is required"})
		}

		// Validate invite token and get associated email
		var inviteEmail string
		var expiresAt time.Time
		err := pool.QueryRow(context.Background(),
			`select email, expires_at from operator_invites where token = $1 and used_at is null`,
			token).Scan(&inviteEmail, &expiresAt)
		if err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Invalid or expired token"})
		}

		if time.Now().After(expiresAt) {
			return c.Status(400).JSON(fiber.Map{"error": "Token expired"})
		}

		return c.JSON(fiber.Map{
			"email": inviteEmail,
			"valid": true,
		})
	})

}
