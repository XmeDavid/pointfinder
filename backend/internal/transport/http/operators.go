package http

import (
	"backend/internal/config"
	"backend/internal/email"
	"backend/internal/middleware"
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
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

	// List operators (admin only)
	adminGrp.Get("/", func(c *fiber.Ctx) error {
		rows, err := pool.Query(context.Background(), `
			select o.id, o.email, o.name, o.status, o.created_at,
			       count(distinct og.game_id) as game_count
			from operators o
			left join operator_games og on o.id = og.operator_id
			group by o.id, o.email, o.name, o.status, o.created_at
			order by o.created_at desc`)
		if err != nil {
			return fiber.ErrInternalServerError
		}
		defer rows.Close()

		var operators []fiber.Map
		for rows.Next() {
			var id, email, name, status string
			var createdAt time.Time
			var gameCount int
			if err := rows.Scan(&id, &email, &name, &status, &createdAt, &gameCount); err != nil {
				return fiber.ErrInternalServerError
			}
			operators = append(operators, fiber.Map{
				"id": id, "email": email, "name": name, "status": status,
				"createdAt": createdAt, "gameCount": gameCount,
			})
		}
		return c.JSON(operators)
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

	// Operator registration endpoint (public, token-protected)
	api.Post("/operators/register", func(c *fiber.Ctx) error {
		var req struct {
			Token    string `json:"token"`
			Email    string `json:"email"`
			Password string `json:"password"`
			Name     string `json:"name"`
		}
		if err := c.BodyParser(&req); err != nil {
			return fiber.ErrBadRequest
		}

		req.Token = middleware.SanitizeString(req.Token)
		req.Email = middleware.SanitizeString(req.Email)
		req.Name = middleware.SanitizeString(req.Name)

		if !middleware.ValidateEmail(req.Email) || !middleware.ValidatePassword(req.Password) || req.Name == "" {
			return c.Status(400).JSON(fiber.Map{"error": "Invalid input"})
		}

		// Validate invite token
		var inviteEmail string
		var expiresAt time.Time
		err := pool.QueryRow(context.Background(),
			`select email, expires_at from operator_invites where token = $1 and used_at is null`,
			req.Token).Scan(&inviteEmail, &expiresAt)
		if err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Invalid or expired token"})
		}

		if time.Now().After(expiresAt) {
			return c.Status(400).JSON(fiber.Map{"error": "Token expired"})
		}

		if inviteEmail != req.Email {
			return c.Status(400).JSON(fiber.Map{"error": "Email mismatch"})
		}

		// Hash password
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			return fiber.ErrInternalServerError
		}

		// Create operator
		var operatorID string
		err = pool.QueryRow(context.Background(),
			`insert into operators (email, password_hash, name) values ($1, $2, $3) returning id`,
			req.Email, string(hashedPassword), req.Name).Scan(&operatorID)
		if err != nil {
			return fiber.ErrInternalServerError
		}

		// Mark invite as used
		_, _ = pool.Exec(context.Background(),
			`update operator_invites set used_at = now() where token = $1`, req.Token)

		// Generate tokens
		accessToken, err := middleware.GenerateOperatorToken(cfg.JWTSecret, operatorID)
		if err != nil {
			return fiber.ErrInternalServerError
		}

		refreshToken, err := middleware.GenerateOperatorRefreshToken(cfg.JWTSecret, operatorID)
		if err != nil {
			return fiber.ErrInternalServerError
		}

		return c.JSON(fiber.Map{
			"token":         accessToken,
			"refresh_token": refreshToken,
			"operator":      fiber.Map{"id": operatorID, "email": req.Email, "name": req.Name},
		})
	})
}
