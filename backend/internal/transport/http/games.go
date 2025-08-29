package http

import (
	"backend/internal/config"
	"backend/internal/db"
	"backend/internal/middleware"
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

func RegisterGames(api fiber.Router, pool *pgxpool.Pool, cfg *config.Config) {
	// Admin endpoints (legacy)
	adminGrp := api.Group("/games")
	adminGrp.Use(middleware.RequireAdmin(middleware.JWTConfig{Secret: cfg.JWTSecret}))

	// List all games (admin) - with pagination
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
		err := pool.QueryRow(context.Background(), `
			select count(distinct g.id) from games g`).Scan(&total)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{
				"error":   "database_error",
				"message": "Failed to count games",
			})
		}

		// Get paginated results
		rows, err := pool.Query(context.Background(), `
			select g.id, g.name, g.status, g.bases_linked, g.created_at,
			       count(distinct t.id) as team_count,
			       count(distinct b.value->>'id') as base_count
			from games g
			left join teams t on t.game_id = g.id
			left join jsonb_array_elements(g.bases) as b on true
			group by g.id, g.name, g.status, g.bases_linked, g.created_at
			order by g.created_at desc
			limit $1 offset $2`, params.PageSize, params.GetOffset())
		if err != nil {
			return c.Status(500).JSON(fiber.Map{
				"error":   "database_error",
				"message": "Failed to fetch games",
			})
		}
		defer rows.Close()

		var games []fiber.Map
		for rows.Next() {
			var id, name, status, createdAt string
			var basesLinked bool
			var teamCount, baseCount int
			if err := rows.Scan(&id, &name, &status, &basesLinked, &createdAt, &teamCount, &baseCount); err != nil {
				return c.Status(500).JSON(fiber.Map{
					"error":   "database_error",
					"message": "Failed to parse game data",
				})
			}
			games = append(games, fiber.Map{
				"id": id, "name": name, "status": status,
				"basesLinked": basesLinked, "createdAt": createdAt,
				"teamCount": teamCount, "baseCount": baseCount,
			})
		}

		// Return paginated result
		result := db.NewPaginatedResult(games, total, params)
		return c.JSON(result)
	})

	adminGrp.Get("/:id", func(c *fiber.Ctx) error {
		id := c.Params("id")
		var json string
		err := pool.QueryRow(context.Background(), `select jsonb_build_object(
            'id', g.id,
            'name', g.name,
            'rulesHtml', g.rules_html,
            'bases', g.bases,
            'enigmas', g.enigmas,
            'status', g.status,
            'basesLinked', g.bases_linked
        ) from games g where g.id=$1`, id).Scan(&json)
		if err != nil {
			return fiber.ErrNotFound
		}
		return c.Type("json").SendString(json)
	})

	adminGrp.Post("/", func(c *fiber.Ctx) error {
		var body map[string]any
		if err := c.BodyParser(&body); err != nil {
			return fiber.ErrBadRequest
		}
		err := pool.QueryRow(context.Background(),
			`insert into games (name, rules_html, bases, enigmas) values ($1,$2,$3,$4) returning id`,
			body["name"], body["rulesHtml"], body["bases"], body["enigmas"],
		).Scan(new(string))
		if err != nil {
			return fiber.ErrInternalServerError
		}
		return c.SendStatus(fiber.StatusCreated)
	})

	// PATCH endpoint for updating game bases (iOS client compatibility)
	adminGrp.Patch("/:id", func(c *fiber.Ctx) error {
		id := c.Params("id")
		var body struct {
			Bases []map[string]any `json:"bases"`
		}
		if err := c.BodyParser(&body); err != nil {
			return fiber.ErrBadRequest
		}

		// Update only the bases field
		_, err := pool.Exec(context.Background(),
			`update games set bases = $1 where id = $2`,
			body.Bases, id)
		if err != nil {
			return fiber.ErrInternalServerError
		}
		
		return c.SendStatus(fiber.StatusOK)
	})

	// Operator endpoints
	operatorGrp := api.Group("/operator/games")
	operatorGrp.Use(middleware.RequireOperator(middleware.JWTConfig{Secret: cfg.JWTSecret}))

	// JWT debug endpoint
	api.Get("/operator/debug-jwt", func(c *fiber.Ctx) error {
		h := c.Get("Authorization")
		if h == "" {
			return c.JSON(fiber.Map{"error": "no auth header"})
		}
		parts := strings.SplitN(h, " ", 2)
		if len(parts) != 2 {
			return c.JSON(fiber.Map{"error": "invalid auth format", "header": h})
		}
		
		return c.JSON(fiber.Map{
			"message": "JWT debug",
			"prefix": parts[0],
			"tokenLength": len(parts[1]),
			"tokenStart": parts[1][:20] + "...",
		})
	})

	// Test endpoint - super simple  
	operatorGrp.Get("/test", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"message": "test works with middleware", "operatorID": c.Locals("operatorID")})
	})

	// List operator's games
	operatorGrp.Get("/", func(c *fiber.Ctx) error {
		defer func() {
			if r := recover(); r != nil {
				fmt.Printf("PANIC in operator games endpoint: %v\n", r)
			}
		}()

		// Debug what's in c.Locals
		raw := c.Locals("operatorID")
		fmt.Printf("Raw operatorID from locals: %v (type: %T)\n", raw, raw)
		
		operatorID, ok := raw.(string)
		if !ok {
			return c.Status(500).JSON(fiber.Map{"error": "operatorID is not a string", "type": fmt.Sprintf("%T", raw), "value": raw})
		}
		
		fmt.Printf("operatorID as string: %s\n", operatorID)
		
		// Simple test response first
		return c.JSON(fiber.Map{
			"message": "Endpoint working",
			"operatorID": operatorID,
		})
	})

	// Create new game
	operatorGrp.Post("/", func(c *fiber.Ctx) error {
		operatorID := c.Locals("operatorID").(string)
		var body struct {
			Name      string `json:"name"`
			RulesHtml string `json:"rulesHtml"`
		}
		if err := c.BodyParser(&body); err != nil {
			return fiber.ErrBadRequest
		}

		body.Name = middleware.SanitizeString(body.Name)
		if body.Name == "" {
			return c.Status(400).JSON(fiber.Map{"error": "Name is required"})
		}

		// Create game
		var gameID string
		err := pool.QueryRow(context.Background(),
			`insert into games (name, rules_html, created_by_operator_id) values ($1,$2,$3) returning id`,
			body.Name, body.RulesHtml, operatorID).Scan(&gameID)
		if err != nil {
			return fiber.ErrInternalServerError
		}

		// Add operator as creator
		_, err = pool.Exec(context.Background(),
			`insert into operator_games (operator_id, game_id, role) values ($1, $2, 'creator')`,
			operatorID, gameID)
		if err != nil {
			return fiber.ErrInternalServerError
		}

		return c.JSON(fiber.Map{"id": gameID, "message": "Game created"})
	})

	// Get specific game details
	operatorGrp.Get("/:id", func(c *fiber.Ctx) error {
		operatorID := c.Locals("operatorID").(string)
		gameID := c.Params("id")

		// Check operator access
		var role string
		err := pool.QueryRow(context.Background(),
			`select role from operator_games where operator_id = $1 and game_id = $2`,
			operatorID, gameID).Scan(&role)
		if err != nil {
			return fiber.ErrNotFound
		}

		var json string
		err = pool.QueryRow(context.Background(), `select jsonb_build_object(
            'id', g.id,
            'name', g.name,
            'rulesHtml', g.rules_html,
            'bases', g.bases,
            'enigmas', g.enigmas,
            'status', g.status,
            'basesLinked', g.bases_linked,
            'role', $2
        ) from games g where g.id=$1`, gameID, role).Scan(&json)
		if err != nil {
			return fiber.ErrNotFound
		}
		return c.Type("json").SendString(json)
	})

	// Update game
	operatorGrp.Put("/:id", func(c *fiber.Ctx) error {
		operatorID := c.Locals("operatorID").(string)
		gameID := c.Params("id")

		// Check operator access
		var role string
		err := pool.QueryRow(context.Background(),
			`select role from operator_games where operator_id = $1 and game_id = $2`,
			operatorID, gameID).Scan(&role)
		if err != nil {
			return fiber.ErrNotFound
		}

		var body struct {
			Name      string                 `json:"name"`
			RulesHtml string                 `json:"rulesHtml"`
			Bases     []map[string]any       `json:"bases"`
			Enigmas   []map[string]any       `json:"enigmas"`
		}
		if err := c.BodyParser(&body); err != nil {
			return fiber.ErrBadRequest
		}

		body.Name = middleware.SanitizeString(body.Name)
		if body.Name == "" {
			return c.Status(400).JSON(fiber.Map{"error": "Name is required"})
		}

		// Update game
		_, err = pool.Exec(context.Background(),
			`update games set name = $1, rules_html = $2, bases = $3, enigmas = $4, updated_at = now()
			 where id = $5`,
			body.Name, body.RulesHtml, body.Bases, body.Enigmas, gameID)
		if err != nil {
			return fiber.ErrInternalServerError
		}

		return c.JSON(fiber.Map{"message": "Game updated"})
	})

	// Set game live/setup
	operatorGrp.Post("/:id/status", func(c *fiber.Ctx) error {
		operatorID := c.Locals("operatorID").(string)
		gameID := c.Params("id")

		// Check operator access
		var role string
		err := pool.QueryRow(context.Background(),
			`select role from operator_games where operator_id = $1 and game_id = $2`,
			operatorID, gameID).Scan(&role)
		if err != nil {
			return fiber.ErrNotFound
		}

		var body struct {
			Status string `json:"status"`
		}
		if err := c.BodyParser(&body); err != nil {
			return fiber.ErrBadRequest
		}

		// Validate status values
		validStatuses := map[string]bool{"setup": true, "live": true, "finished": true}
		if !validStatuses[body.Status] {
			return c.Status(400).JSON(fiber.Map{
				"error":   "invalid_status",
				"message": "Status must be one of: setup, live, finished",
			})
		}

		// Get current status to validate transitions
		var currentStatus string
		err := pool.QueryRow(context.Background(), 
			`select status from games where id = $1`, gameID).Scan(&currentStatus)
		if err != nil {
			return c.Status(404).JSON(fiber.Map{
				"error":   "game_not_found",
				"message": "Game not found",
			})
		}

		// Validate status transitions
		if !isValidStatusTransition(currentStatus, body.Status) {
			return c.Status(400).JSON(fiber.Map{
				"error":   "invalid_status_transition",
				"message": fmt.Sprintf("Cannot change status from '%s' to '%s'", currentStatus, body.Status),
				"details": fiber.Map{
					"currentStatus": currentStatus,
					"requestedStatus": body.Status,
					"validTransitions": getValidTransitions(currentStatus),
				},
			})
		}

		// Enhanced validation for going live
		if body.Status == "live" {
			// Get current game status and details
			var currentStatus, basesJSON string
			var basesLinked bool
			err := pool.QueryRow(context.Background(), `
				select status, bases::text, bases_linked 
				from games where id = $1`, gameID).Scan(&currentStatus, &basesJSON, &basesLinked)
			if err != nil {
				return c.Status(500).JSON(fiber.Map{
					"error":   "database_error",
					"message": "Failed to fetch game details",
				})
			}

			// Check if game is already live or finished
			if currentStatus == "live" {
				return c.Status(400).JSON(fiber.Map{
					"error":   "game_already_live",
					"message": "Game is already live",
				})
			}
			if currentStatus == "finished" {
				return c.Status(400).JSON(fiber.Map{
					"error":   "game_already_finished",
					"message": "Cannot make finished game live",
				})
			}

			// Parse and validate bases
			var bases []map[string]interface{}
			if err := json.Unmarshal([]byte(basesJSON), &bases); err != nil {
				return c.Status(500).JSON(fiber.Map{
					"error":   "data_parsing_error",
					"message": "Failed to parse game bases",
				})
			}

			// Validate game setup
			if len(bases) == 0 {
				return c.Status(400).JSON(fiber.Map{
					"error":   "no_bases_configured",
					"message": "Game must have at least one base",
				})
			}

			// Check if all bases have NFC tags linked
			var nfcLinkedCount int
			err = pool.QueryRow(context.Background(), `
				select count(*) from nfc_tags where game_id = $1`, gameID).Scan(&nfcLinkedCount)
			if err != nil {
				return c.Status(500).JSON(fiber.Map{
					"error":   "database_error",
					"message": "Failed to check NFC tag status",
				})
			}

			if nfcLinkedCount != len(bases) {
				return c.Status(400).JSON(fiber.Map{
					"error":   "nfc_setup_incomplete",
					"message": fmt.Sprintf("All bases must be linked to NFC tags. %d of %d bases linked", nfcLinkedCount, len(bases)),
					"details": fiber.Map{
						"totalBases":  len(bases),
						"linkedBases": nfcLinkedCount,
					},
				})
			}

			// Check if game has teams
			var teamCount int
			err = pool.QueryRow(context.Background(), `
				select count(*) from teams where game_id = $1`, gameID).Scan(&teamCount)
			if err != nil {
				return c.Status(500).JSON(fiber.Map{
					"error":   "database_error",
					"message": "Failed to count teams",
				})
			}

			if teamCount == 0 {
				return c.Status(400).JSON(fiber.Map{
					"error":   "no_teams_configured",
					"message": "Game must have at least one team",
				})
			}

			// Update bases_linked flag when going live
			basesLinked = true
		}

		// Additional validation for finishing a game
		if body.Status == "finished" {
			if currentStatus != "live" {
				return c.Status(400).JSON(fiber.Map{
					"error":   "cannot_finish_non_live_game",
					"message": "Only live games can be finished",
				})
			}

			// Optional: Add validation for minimum game duration
			// or other completion requirements here
		}

		// Use transaction for atomic update
		err = db.WithTransaction(context.Background(), pool, func(tx pgx.Tx) error {
			// Update game status and bases_linked flag
			_, err := tx.Exec(context.Background(), `
				update games 
				set status = $1, bases_linked = $2, updated_at = now() 
				where id = $3`,
				body.Status, basesLinked, gameID)
			if err != nil {
				return err
			}

			// Log activity with more details
			activityDetails := fiber.Map{"new_status": body.Status}
			if body.Status == "live" {
				// Get team count for logging
				var teamCount int
				tx.QueryRow(context.Background(), `select count(*) from teams where game_id = $1`, gameID).Scan(&teamCount)
				activityDetails["total_teams"] = teamCount
				activityDetails["total_bases"] = len(bases)
			}

			_, _ = tx.Exec(context.Background(),
				`insert into game_activities (game_id, operator_id, action, details) values ($1, $2, $3, $4)`,
				gameID, operatorID, "status_changed", activityDetails)

			// Create global event for game status changes
			if body.Status == "live" {
				_, _ = tx.Exec(context.Background(),
					`insert into events (type, message) values ($1, $2)`,
					"game_started", fmt.Sprintf("Game %s went live", gameID))
			} else if body.Status == "finished" {
				// Get final game stats for the finish event
				var totalTeams, totalBases int
				tx.QueryRow(context.Background(), `select count(*) from teams where game_id = $1`, gameID).Scan(&totalTeams)
				tx.QueryRow(context.Background(), `select jsonb_array_length(bases) from games where id = $1`, gameID).Scan(&totalBases)
				
				_, _ = tx.Exec(context.Background(),
					`insert into events (type, message) values ($1, $2)`,
					"game_finished", fmt.Sprintf("Game %s finished with %d teams and %d bases", gameID, totalTeams, totalBases))
			}

			return nil
		})

		if err != nil {
			return c.Status(500).JSON(fiber.Map{
				"error":   "database_error",
				"message": "Failed to update game status",
			})
		}

		response := fiber.Map{
			"message": "Game status updated to " + body.Status,
			"status":  body.Status,
		}

		// Add additional info based on status
		if body.Status == "live" {
			var teamCount int
			pool.QueryRow(context.Background(), `select count(*) from teams where game_id = $1`, gameID).Scan(&teamCount)
			response["totalTeams"] = teamCount
			response["totalBases"] = len(bases)
			response["message"] = "Game is now live!"
		} else if body.Status == "finished" {
			// Get final statistics
			var teamCount, totalBases int
			pool.QueryRow(context.Background(), `select count(*) from teams where game_id = $1`, gameID).Scan(&teamCount)
			pool.QueryRow(context.Background(), `select jsonb_array_length(bases) from games where id = $1`, gameID).Scan(&totalBases)
			
			// Get completion stats
			var completedBases int
			pool.QueryRow(context.Background(), `
				select count(distinct base_id) 
				from progress 
				where team_id in (select id from teams where game_id = $1) 
				and completed_at is not null`, gameID).Scan(&completedBases)
			
			response["totalTeams"] = teamCount
			response["totalBases"] = totalBases
			response["completedBases"] = completedBases
			response["message"] = "Game has been finished"
		} else if body.Status == "setup" {
			response["message"] = "Game returned to setup mode"
		}

		return c.JSON(response)
	})

	// Link NFC tag to base (operator mobile app)
	operatorGrp.Post("/:id/bases/:baseId/link", func(c *fiber.Ctx) error {
		operatorID := c.Locals("operatorID").(string)
		gameID := c.Params("id")
		baseID := c.Params("baseId")

		// Check operator access
		var role string
		err := pool.QueryRow(context.Background(),
			`select role from operator_games where operator_id = $1 and game_id = $2`,
			operatorID, gameID).Scan(&role)
		if err != nil {
			return fiber.ErrNotFound
		}

		var body struct {
			TagUUID string `json:"tagUUID"`
		}
		if err := c.BodyParser(&body); err != nil {
			return fiber.ErrBadRequest
		}

		body.TagUUID = middleware.SanitizeString(body.TagUUID)
		if body.TagUUID == "" {
			return c.Status(400).JSON(fiber.Map{"error": "tagUUID is required"})
		}

		// Log NFC tag linking for audit trail
		_, _ = pool.Exec(context.Background(),
			`insert into game_activities (game_id, operator_id, action, details) values ($1, $2, $3, $4)`,
			gameID, operatorID, "nfc_linked", fiber.Map{"base_id": baseID, "tag_uuid": body.TagUUID})

		return c.JSON(fiber.Map{"message": "NFC tag linked"})
	})
}

// isValidStatusTransition validates if a status transition is allowed
func isValidStatusTransition(from, to string) bool {
	// Define valid state transitions
	validTransitions := map[string][]string{
		"setup": {"live"},                    // setup can only go to live
		"live":  {"finished"},               // live can only go to finished
		"finished": {},                      // finished is terminal state
	}

	// Same status is always allowed (idempotent)
	if from == to {
		return true
	}

	// Check if transition is in allowed list
	allowedNext, exists := validTransitions[from]
	if !exists {
		return false
	}

	for _, allowed := range allowedNext {
		if allowed == to {
			return true
		}
	}

	return false
}

// getValidTransitions returns valid next statuses for a given current status
func getValidTransitions(currentStatus string) []string {
	validTransitions := map[string][]string{
		"setup": {"setup", "live"},         // can stay in setup or go live
		"live":  {"live", "finished"},     // can stay live or finish
		"finished": {"finished"},          // can only stay finished
	}

	if transitions, exists := validTransitions[currentStatus]; exists {
		return transitions
	}
	return []string{}
}
