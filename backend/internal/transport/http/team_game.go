package http

import (
	"backend/internal/config"
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
	teamGrp.Get("/me/state", middleware.RequireAuth(middleware.JWTConfig{Secret: cfg.JWTSecret}), func(c *fiber.Ctx) error {
		role := c.Locals("role").(string)
		if role != "team" {
			return fiber.ErrForbidden
		}

		teamID := c.Locals("userID").(string)
		deviceID, _ := c.Locals("device_id").(string)

		// Get team info with game
		var team struct {
			ID             string `json:"id"`
			Name           string `json:"name"`
			LeaderDeviceID string `json:"leaderDeviceId"`
			GameID         string `json:"gameId"`
			GameName       string `json:"gameName"`
			GameStatus     string `json:"gameStatus"`
		}
		
		err := pool.QueryRow(context.Background(), `
			select t.id::text, t.name, coalesce(t.leader_device_id,''), coalesce(t.game_id::text,''), coalesce(g.name,''), coalesce(g.status,'setup')
			from teams t
			left join games g on t.game_id = g.id
			where t.id = $1`, teamID).Scan(&team.ID, &team.Name, &team.LeaderDeviceID, &team.GameID, &team.GameName, &team.GameStatus)
		if err != nil {
			return fiber.ErrNotFound
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
		err = pool.QueryRow(context.Background(), `
			select jsonb_build_object(
				'id', g.id,
				'name', g.name,
				'rulesHtml', g.rules_html,
				'bases', g.bases,
				'enigmas', g.enigmas
			) from games g where g.id = $1`, team.GameID).Scan(&gameJSON)
		if err != nil {
			return fiber.ErrInternalServerError
		}

		// Get team progress
		rows, err := pool.Query(context.Background(), `
			select base_id, arrived_at, solved_at, completed_at, score
			from progress where team_id = $1`, teamID)
		if err != nil {
			return fiber.ErrInternalServerError
		}
		defer rows.Close()

		progress := make([]fiber.Map, 0)
		for rows.Next() {
			var baseID string
			var arrived, solved, completed *time.Time
			var score int
			if err := rows.Scan(&baseID, &arrived, &solved, &completed, &score); err != nil {
				return fiber.ErrInternalServerError
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

	// Solve enigma at base - requires team token
	teamGrp.Post("/enigma/solve", middleware.RequireAuth(middleware.JWTConfig{Secret: cfg.JWTSecret}), func(c *fiber.Ctx) error {
		role := c.Locals("role").(string)
		if role != "team" {
			return fiber.ErrForbidden
		}

		teamID := c.Locals("userID").(string)
		deviceID, _ := c.Locals("device_id").(string)

		var req struct {
			BaseID   string `json:"baseId"`
			EnigmaID string `json:"enigmaId"`
			Answer   string `json:"answer"`
		}
		if err := c.BodyParser(&req); err != nil {
			return fiber.ErrBadRequest
		}

		req.BaseID = middleware.SanitizeString(req.BaseID)
		req.EnigmaID = middleware.SanitizeString(req.EnigmaID)
		req.Answer = middleware.SanitizeString(req.Answer)
		
		if req.BaseID == "" || req.EnigmaID == "" || req.Answer == "" {
			return c.Status(400).JSON(fiber.Map{"error": "Missing required fields"})
		}

		// Check that team is at this base (arrived but not completed)
		var arrivedAt, completedAt *time.Time
		err := pool.QueryRow(context.Background(),
			`select arrived_at, completed_at from progress where team_id = $1 and base_id = $2`,
			teamID, req.BaseID).Scan(&arrivedAt, &completedAt)
		if err != nil || arrivedAt == nil {
			return c.Status(400).JSON(fiber.Map{"error": "Team must arrive at base first"})
		}
		if completedAt != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Base already completed"})
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
		_, err = pool.Exec(context.Background(),
			`insert into enigma_solutions (team_id, base_id, enigma_id, answer_given, is_correct, device_id) 
			 values ($1, $2, $3, $4, $5, $6)`,
			teamID, req.BaseID, req.EnigmaID, req.Answer, isCorrect, deviceID)
		if err != nil {
			return fiber.ErrInternalServerError
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
	teamGrp.Post("/location", middleware.RequireAuth(middleware.JWTConfig{Secret: cfg.JWTSecret}), func(c *fiber.Ctx) error {
		role := c.Locals("role").(string)
		if role != "team" {
			return fiber.ErrForbidden
		}

		teamID := c.Locals("userID").(string)
		deviceID, _ := c.Locals("device_id").(string)

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

		return c.SendStatus(fiber.StatusCreated)
	})
}