package http

import (
	"backend/internal/config"
	"backend/internal/db"
	"backend/internal/middleware"
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

func RegisterTeamGame(api fiber.Router, pool *pgxpool.Pool, cfg *config.Config) {
	// Team runtime endpoints
	teamGrp := api.Group("/team")

	// Get team's current game state - requires team token
	teamGrp.Get("/me/state", middleware.RequireTeam(middleware.JWTConfig{Secret: cfg.JWTSecret}), func(c *fiber.Ctx) error {
		teamID := c.Locals("teamID").(string)
		deviceID, _ := c.Locals("deviceID").(string)

		// Get team info with game
		var team struct {
			ID             string `json:"id"`
			Name           string `json:"name"`
			LeaderDeviceID string `json:"leaderDeviceId"`
			GameID         string `json:"gameId"`
			GameName       string `json:"gameName"`
			GameStatus     string `json:"gameStatus"`
		}
		
		err := db.QueryRowWithTimeout(context.Background(), pool, `
			select t.id::text, t.name, coalesce(t.leader_device_id,''), coalesce(t.game_id::text,''), coalesce(g.name,''), coalesce(g.status,'setup')
			from teams t
			left join games g on t.game_id = g.id
			where t.id = $1`, teamID).Scan(&team.ID, &team.Name, &team.LeaderDeviceID, &team.GameID, &team.GameName, &team.GameStatus)
		if err != nil {
			return c.Status(404).JSON(fiber.Map{
				"error":   "team_not_found",
				"message": "Team not found",
			})
		}

		// If no game assigned or game not live, return minimal state
		if team.GameID == "" || team.GameStatus != "live" {
			return c.JSON(fiber.Map{
				"team":       team,
				"gameLive":   false,
				"isLeader":   deviceID == team.LeaderDeviceID,
				"message":    "Game not live yet",
			})
		}

		// Get game details
		var gameJSON string
		err = db.QueryRowWithTimeout(context.Background(), pool, `
			select jsonb_build_object(
				'id', g.id,
				'name', g.name,
				'rulesHtml', g.rules_html,
				'bases', g.bases,
				'enigmas', g.enigmas
			) from games g where g.id = $1`, team.GameID).Scan(&gameJSON)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{
				"error":   "database_error", 
				"message": "Failed to fetch game details",
			})
		}

		// Get team progress
		rows, err := db.QueryWithTimeout(context.Background(), pool, `
			select base_id, arrived_at, solved_at, completed_at, score
			from progress where team_id = $1`, teamID)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{
				"error":   "database_error",
				"message": "Failed to fetch team progress",
			})
		}
		defer rows.Close()

		progress := make([]fiber.Map, 0)
		for rows.Next() {
			var baseID string
			var arrived, solved, completed *time.Time
			var score int
			if err := rows.Scan(&baseID, &arrived, &solved, &completed, &score); err != nil {
				return c.Status(500).JSON(fiber.Map{
					"error":   "database_error",
					"message": "Failed to parse progress data",
				})
			}
			progress = append(progress, fiber.Map{
				"baseId": baseID, "arrivedAt": arrived, "solvedAt": solved,
				"completedAt": completed, "score": score,
			})
		}

		// Parse game JSON for response
		var game map[string]any
		json.Unmarshal([]byte(gameJSON), &game)

		return c.JSON(fiber.Map{
			"team":     team,
			"game":     game,
			"progress": progress,
			"gameLive": true,
			"isLeader": deviceID == team.LeaderDeviceID,
		})
	})

	// Solve enigma at base - requires team leader
	teamGrp.Post("/enigma/solve", middleware.RequireTeamLeader(pool, middleware.JWTConfig{Secret: cfg.JWTSecret}), func(c *fiber.Ctx) error {
		teamID := c.Locals("teamID").(string)
		deviceID, _ := c.Locals("deviceID").(string)

		var req struct {
			BaseID   string `json:"baseId"`
			EnigmaID string `json:"enigmaId"`
			Answer   string `json:"answer"`
		}
		if err := c.BodyParser(&req); err != nil {
			return c.Status(400).JSON(fiber.Map{
				"error":   "invalid_request",
				"message": "Invalid request body",
			})
		}

		req.BaseID = middleware.SanitizeStringWithLimit(req.BaseID, 36) // UUID length
		req.EnigmaID = middleware.SanitizeStringWithLimit(req.EnigmaID, middleware.MaxNameLength)
		req.Answer = middleware.SanitizeStringWithLimit(req.Answer, middleware.MaxAnswerLength)
		
		if !middleware.ValidateUUID(req.BaseID) {
			return c.Status(400).JSON(fiber.Map{
				"error":   "invalid_base_id",
				"message": "Base ID is invalid",
			})
		}
		if req.EnigmaID == "" {
			return c.Status(400).JSON(fiber.Map{
				"error":   "missing_enigma_id",
				"message": "Enigma ID is required",
			})
		}
		if len(strings.TrimSpace(req.Answer)) == 0 {
			return c.Status(400).JSON(fiber.Map{
				"error":   "missing_answer",
				"message": "Answer is required",
			})
		}

		// Check that team is at this base (arrived but not completed)
		var arrivedAt, completedAt *time.Time
		err := db.QueryRowWithTimeout(context.Background(), pool,
			`select arrived_at, completed_at from progress where team_id = $1 and base_id = $2`,
			teamID, req.BaseID).Scan(&arrivedAt, &completedAt)
		if err != nil || arrivedAt == nil {
			return c.Status(400).JSON(fiber.Map{
				"error":   "base_not_arrived",
				"message": "Team must arrive at base first",
			})
		}
		if completedAt != nil {
			return c.Status(400).JSON(fiber.Map{
				"error":   "base_already_completed",
				"message": "Base already completed",
			})
		}

		// Get enigma details from game
		var gameEnigmas string
		err = pool.QueryRow(context.Background(),
			`select enigmas::text from games g 
			 join teams t on g.id = t.game_id 
			 where t.id = $1`, teamID).Scan(&gameEnigmas)
		if err != nil {
			return fiber.ErrInternalServerError
		}

		// Parse enigmas to find correct answer
		var enigmas []map[string]any
		if err := json.Unmarshal([]byte(gameEnigmas), &enigmas); err != nil {
			return fiber.ErrInternalServerError
		}

		var correctAnswer string
		for _, enigma := range enigmas {
			if enigma["id"] == req.EnigmaID {
				if template, ok := enigma["answerTemplate"].(string); ok {
					// Apply team-specific template if needed
					if strings.Contains(template, "+") {
						parts := strings.Split(template, "+")
						if len(parts) == 2 && strings.TrimSpace(parts[1]) == "<teamId>" {
							correctAnswer = strings.TrimSpace(parts[0]) + teamID
						}
					} else {
						correctAnswer = template
					}
				}
				break
			}
		}

		isCorrect := strings.EqualFold(req.Answer, correctAnswer)

		// Record solution attempt
		_, err = db.ExecWithTimeout(context.Background(), pool,
			`insert into enigma_solutions (team_id, base_id, enigma_id, answer_given, is_correct, device_id) 
			 values ($1, $2, $3, $4, $5, $6)`,
			teamID, req.BaseID, req.EnigmaID, req.Answer, isCorrect, deviceID)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{
				"error":   "database_error",
				"message": "Failed to record solution attempt",
			})
		}

		if isCorrect {
			// Mark enigma as solved in progress
			_, err = pool.Exec(context.Background(),
				`update progress set solved_at = now() where team_id = $1 and base_id = $2`,
				teamID, req.BaseID)
			if err != nil {
				return fiber.ErrInternalServerError
			}

			// Log event
			_, _ = pool.Exec(context.Background(),
				`insert into events (type, team_id, message) values ($1, $2, $3)`,
				"enigma_solved", teamID, "Solved enigma at base "+req.BaseID)

			// Broadcast enigma solved via WebSocket
			if wsHub, ok := c.Locals("wsHub").(*WSHub); ok {
				// Get team's current game ID for broadcast
				var gameID string
				if err := pool.QueryRow(context.Background(), "select game_id::text from teams where id = $1", teamID).Scan(&gameID); err == nil && gameID != "" {
					BroadcastEnigmaSolved(wsHub, gameID, teamID, req.BaseID, req.EnigmaID)
				}
			}
		}

		return c.JSON(fiber.Map{
			"correct": isCorrect,
			"message": func() string {
				if isCorrect {
					return "Correct! Enigma solved."
				}
				return "Incorrect answer. Try again."
			}(),
		})
	})

	// Post location ping - requires team token  
	teamGrp.Post("/location", middleware.RequireTeam(middleware.JWTConfig{Secret: cfg.JWTSecret}), func(c *fiber.Ctx) error {
		teamID := c.Locals("teamID").(string)
		deviceID, _ := c.Locals("deviceID").(string)

		var req struct {
			Latitude  float64 `json:"latitude"`
			Longitude float64 `json:"longitude"`
			Accuracy  float64 `json:"accuracy"`
		}
		if err := c.BodyParser(&req); err != nil {
			return fiber.ErrBadRequest
		}

		// Store location
		_, err := pool.Exec(context.Background(),
			`insert into team_locations (team_id, latitude, longitude, accuracy, device_id) 
			 values ($1, $2, $3, $4, $5)`,
			teamID, req.Latitude, req.Longitude, req.Accuracy, deviceID)
		if err != nil {
			return fiber.ErrInternalServerError
		}

		// Also log as event for monitoring
		_, _ = pool.Exec(context.Background(),
			`insert into events (type, team_id, message) values ($1, $2, $3)`,
			"locationPing", teamID, fmt.Sprintf("Location: %.6f,%.6f", req.Latitude, req.Longitude))

		// Broadcast location update via WebSocket
		if wsHub, ok := c.Locals("wsHub").(*WSHub); ok {
			// Get team's current game ID for broadcast
			var gameID string
			if err := pool.QueryRow(context.Background(), "select game_id::text from teams where id = $1", teamID).Scan(&gameID); err == nil && gameID != "" {
				BroadcastTeamLocation(wsHub, gameID, teamID, req.Latitude, req.Longitude)
			}
		}

		return c.SendStatus(fiber.StatusCreated)
	})

	// NFC-based base check-in - requires team leader
	teamGrp.Post("/base/checkin", middleware.RequireTeamLeader(pool, middleware.JWTConfig{Secret: cfg.JWTSecret}), middleware.ValidateJSONRequest(1024), func(c *fiber.Ctx) error {
		teamID := c.Locals("teamID").(string)
		deviceID, _ := c.Locals("deviceID").(string)

		var req struct {
			TagUUID string `json:"tagUuid"`
		}
		if err := c.BodyParser(&req); err != nil {
			return c.Status(400).JSON(fiber.Map{
				"error":   "invalid_request",
				"message": "Invalid request body",
			})
		}

		req.TagUUID = middleware.SanitizeStringWithLimit(req.TagUUID, 100)
		if req.TagUUID == "" {
			return c.Status(400).JSON(fiber.Map{
				"error":   "missing_tag_uuid",
				"message": "NFC tag UUID is required",
			})
		}

		// Use transaction for atomic check-in
		err := db.WithTransaction(context.Background(), pool, func(tx pgx.Tx) error {
			// Validate NFC tag and get base info
			var gameID, baseID, baseName string
			var gameStatus string
			err := tx.QueryRow(context.Background(), `
				select nt.game_id::text, nt.base_id, g.status
				from nfc_tags nt
				join games g on nt.game_id = g.id
				join teams t on g.id = t.game_id
				where nt.tag_uuid = $1 and t.id = $2`, 
				req.TagUUID, teamID).Scan(&gameID, &baseID, &gameStatus)
			if err != nil {
				if err == pgx.ErrNoRows {
					return c.Status(404).JSON(fiber.Map{
						"error":   "invalid_nfc_tag",
						"message": "NFC tag not found or not accessible by your team",
					})
				}
				return err
			}

			// Check if game is live
			if gameStatus != "live" {
				return c.Status(400).JSON(fiber.Map{
					"error":   "game_not_live",
					"message": "Game is not currently live",
				})
			}

			// Check if team has an active base that's not completed
			var activeBaseID string
			var arrivedAt, completedAt *time.Time
			err = tx.QueryRow(context.Background(), `
				select coalesce(t.active_base_id::text, ''), p.arrived_at, p.completed_at
				from teams t
				left join progress p on t.active_base_id::text = p.base_id and p.team_id = t.id
				where t.id = $1`, teamID).Scan(&activeBaseID, &arrivedAt, &completedAt)
			if err != nil {
				return err
			}

			// Check if team is already at another base that's not completed
			if activeBaseID != "" && activeBaseID != baseID && completedAt == nil {
				return c.Status(400).JSON(fiber.Map{
					"error":   "already_at_another_base",
					"message": "You must complete your current base before checking into a new one",
					"details": fiber.Map{
						"currentBaseId": activeBaseID,
					},
				})
			}

			// Check if already checked into this base
			var existingArrival *time.Time
			var existingCompletion *time.Time
			err = tx.QueryRow(context.Background(), `
				select arrived_at, completed_at 
				from progress 
				where team_id = $1 and base_id = $2`,
				teamID, baseID).Scan(&existingArrival, &existingCompletion)
			
			if err == nil && existingArrival != nil {
				if existingCompletion != nil {
					return c.Status(400).JSON(fiber.Map{
						"error":   "base_already_completed",
						"message": "This base has already been completed",
					})
				}
				// Already arrived but not completed - return current state
				return c.JSON(fiber.Map{
					"message":   "Already checked in to this base",
					"baseId":    baseID,
					"arrivedAt": existingArrival,
					"canSolveEnigma": true,
				})
			}

			// Create or update progress record
			_, err = tx.Exec(context.Background(), `
				insert into progress (team_id, base_id, arrived_at, nfc_tag_uuid) 
				values ($1, $2, now(), $3)
				on conflict (team_id, base_id) 
				do update set arrived_at = now(), nfc_tag_uuid = $3`,
				teamID, baseID, req.TagUUID)
			if err != nil {
				return err
			}

			// Update team's active base
			_, err = tx.Exec(context.Background(), `
				update teams set active_base_id = $1 where id = $2`,
				baseID, teamID)
			if err != nil {
				return err
			}

			// Get base details from game
			var basesJSON string
			err = tx.QueryRow(context.Background(),
				`select bases::text from games where id = $1`, gameID).Scan(&basesJSON)
			if err != nil {
				return err
			}

			var bases []map[string]interface{}
			if err := json.Unmarshal([]byte(basesJSON), &bases); err != nil {
				return err
			}

			// Find base details
			var baseDetails map[string]interface{}
			for _, base := range bases {
				if base["id"] == baseID {
					baseName, _ = base["name"].(string)
					baseDetails = base
					break
				}
			}

			// Log check-in event
			_, _ = tx.Exec(context.Background(),
				`insert into events (type, team_id, message) values ($1, $2, $3)`,
				"base_arrived", teamID, fmt.Sprintf("Team arrived at base: %s", baseName))

			// Broadcast base arrival via WebSocket (outside transaction)
			go func() {
				if wsHub, ok := c.Locals("wsHub").(*WSHub); ok {
					BroadcastBaseArrival(wsHub, gameID, teamID, baseID, baseName)
				}
			}()

			return c.JSON(fiber.Map{
				"message":         "Successfully checked in to base",
				"baseId":          baseID,
				"baseName":        baseName,
				"base":            baseDetails,
				"arrivedAt":       time.Now(),
				"canSolveEnigma":  true,
			})
		})

		if err != nil {
			// Check if response was already sent
			if c.Response().StatusCode() != 200 {
				return nil
			}
			return c.Status(500).JSON(fiber.Map{
				"error":   "database_error",
				"message": "Failed to check in to base",
			})
		}

		return nil
	})

	// NFC-based base completion - requires team leader
	teamGrp.Post("/base/complete", middleware.RequireTeamLeader(pool, middleware.JWTConfig{Secret: cfg.JWTSecret}), middleware.ValidateJSONRequest(1024), func(c *fiber.Ctx) error {
		teamID := c.Locals("teamID").(string)
		deviceID, _ := c.Locals("deviceID").(string)

		var req struct {
			TagUUID string `json:"tagUuid"`
		}
		if err := c.BodyParser(&req); err != nil {
			return c.Status(400).JSON(fiber.Map{
				"error":   "invalid_request",
				"message": "Invalid request body",
			})
		}

		req.TagUUID = middleware.SanitizeStringWithLimit(req.TagUUID, 100)
		if req.TagUUID == "" {
			return c.Status(400).JSON(fiber.Map{
				"error":   "missing_tag_uuid",
				"message": "NFC tag UUID is required",
			})
		}

		// Use transaction for atomic completion
		err := db.WithTransaction(context.Background(), pool, func(tx pgx.Tx) error {
			// Validate NFC tag and get base info
			var gameID, baseID, baseName string
			var gameStatus string
			err := tx.QueryRow(context.Background(), `
				select nt.game_id::text, nt.base_id, g.status
				from nfc_tags nt
				join games g on nt.game_id = g.id
				join teams t on g.id = t.game_id
				where nt.tag_uuid = $1 and t.id = $2`, 
				req.TagUUID, teamID).Scan(&gameID, &baseID, &gameStatus)
			if err != nil {
				if err == pgx.ErrNoRows {
					return c.Status(404).JSON(fiber.Map{
						"error":   "invalid_nfc_tag",
						"message": "NFC tag not found or not accessible by your team",
					})
				}
				return err
			}

			// Check if game is live
			if gameStatus != "live" {
				return c.Status(400).JSON(fiber.Map{
					"error":   "game_not_live",
					"message": "Game is not currently live",
				})
			}

			// Check progress status
			var arrivedAt, solvedAt, completedAt *time.Time
			var score int
			err = tx.QueryRow(context.Background(), `
				select arrived_at, solved_at, completed_at, score
				from progress 
				where team_id = $1 and base_id = $2`,
				teamID, baseID).Scan(&arrivedAt, &solvedAt, &completedAt, &score)
			if err != nil {
				return c.Status(400).JSON(fiber.Map{
					"error":   "not_checked_in",
					"message": "You must check in to this base first",
				})
			}

			// Check if already completed
			if completedAt != nil {
				return c.Status(400).JSON(fiber.Map{
					"error":   "already_completed",
					"message": "This base is already completed",
					"completedAt": completedAt,
				})
			}

			// Check if enigma is solved (required for completion)
			if solvedAt == nil {
				return c.Status(400).JSON(fiber.Map{
					"error":   "enigma_not_solved",
					"message": "You must solve the enigma before completing this base",
				})
			}

			// Mark base as completed
			_, err = tx.Exec(context.Background(), `
				update progress 
				set completed_at = now()
				where team_id = $1 and base_id = $2`,
				teamID, baseID)
			if err != nil {
				return err
			}

			// Clear team's active base
			_, err = tx.Exec(context.Background(), `
				update teams set active_base_id = null where id = $1`,
				teamID)
			if err != nil {
				return err
			}

			// Get base name for logging
			var basesJSON string
			err = tx.QueryRow(context.Background(),
				`select bases::text from games where id = $1`, gameID).Scan(&basesJSON)
			if err == nil {
				var bases []map[string]interface{}
				if json.Unmarshal([]byte(basesJSON), &bases) == nil {
					for _, base := range bases {
						if base["id"] == baseID {
							baseName, _ = base["name"].(string)
							break
						}
					}
				}
			}

			// Log completion event
			_, _ = tx.Exec(context.Background(),
				`insert into events (type, team_id, message) values ($1, $2, $3)`,
				"base_completed", teamID, fmt.Sprintf("Team completed base: %s (Score: %d)", baseName, score))

			// Broadcast base completion via WebSocket (outside transaction)
			go func() {
				if wsHub, ok := c.Locals("wsHub").(*WSHub); ok {
					BroadcastBaseComplete(wsHub, gameID, teamID, baseID, baseName, score)
				}
			}()

			// Get team's total progress
			var totalBases, completedBases int
			tx.QueryRow(context.Background(), `select jsonb_array_length(bases) from games where id = $1`, gameID).Scan(&totalBases)
			tx.QueryRow(context.Background(), `
				select count(*) 
				from progress 
				where team_id = $1 and completed_at is not null`, teamID).Scan(&completedBases)

			return c.JSON(fiber.Map{
				"message":        "Base completed successfully!",
				"baseId":         baseID,
				"baseName":       baseName,
				"score":          score,
				"completedAt":    time.Now(),
				"progress":       fiber.Map{
					"completed": completedBases,
					"total":     totalBases,
					"percentage": int((float64(completedBases) / float64(totalBases)) * 100),
				},
			})
		})

		if err != nil {
			// Check if response was already sent
			if c.Response().StatusCode() != 200 {
				return nil
			}
			return c.Status(500).JSON(fiber.Map{
				"error":   "database_error",
				"message": "Failed to complete base",
			})
		}

		return nil
	})
}