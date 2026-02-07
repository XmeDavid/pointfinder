package http

import (
	"backend/internal/config"
	"backend/internal/middleware"
	"context"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

func RegisterProgress(api fiber.Router, pool *pgxpool.Pool, cfg *config.Config) {
	grp := api.Group("/progress")
	grp.Use(middleware.RequireAdmin(middleware.JWTConfig{Secret: cfg.JWTSecret}))

	grp.Get("/teams/:id", func(c *fiber.Ctx) error {
		id := c.Params("id")
		rows, err := pool.Query(context.Background(), `select base_id, arrived_at, solved_at, completed_at, score from progress where team_id=$1`, id)
		if err != nil {
			return fiber.ErrInternalServerError
		}
		defer rows.Close()
		list := make([]fiber.Map, 0)
		for rows.Next() {
			var baseId string
			var arrived, solved, completed *time.Time
			var score int
			if err := rows.Scan(&baseId, &arrived, &solved, &completed, &score); err != nil {
				return fiber.ErrInternalServerError
			}
			list = append(list, fiber.Map{"baseId": baseId, "arrivedAt": arrived, "solvedAt": solved, "completedAt": completed, "score": score})
		}
		return c.JSON(list)
	})
}

// RegisterTeamProgress handles team progress endpoints (for mobile clients)
func RegisterTeamProgress(api fiber.Router, pool *pgxpool.Pool, cfg *config.Config) {
	// Team progress posting endpoint (matches iOS client expectation)
	// Note: This endpoint accepts any valid JWT token (admin or team)
	api.Post("/teams/:id/progress", middleware.RequireAuth(middleware.JWTConfig{Secret: cfg.JWTSecret}), func(c *fiber.Ctx) error {
		teamId := c.Params("id")
		
		var req struct {
			BaseId    string    `json:"baseId"`
			TagUUID   string    `json:"tagUUID"`
			Action    string    `json:"action"`
			Timestamp time.Time `json:"timestamp"`
		}
		if err := c.BodyParser(&req); err != nil {
			return fiber.ErrBadRequest
		}

		// Validate required fields
		if req.BaseId == "" || req.Action == "" {
			return fiber.ErrBadRequest
		}

		// Handle different action types
		switch req.Action {
		case "arrived":
			_, err := pool.Exec(context.Background(), 
				`insert into progress (team_id, base_id, arrived_at) values ($1, $2, $3) 
				 on conflict (team_id, base_id) do update set arrived_at = $3`,
				teamId, req.BaseId, req.Timestamp)
			if err != nil {
				return fiber.ErrInternalServerError
			}
		case "completed":
			_, err := pool.Exec(context.Background(),
				`insert into progress (team_id, base_id, completed_at, score) values ($1, $2, $3, 10)
				 on conflict (team_id, base_id) do update set completed_at = $3, score = 10`,
				teamId, req.BaseId, req.Timestamp)
			if err != nil {
				return fiber.ErrInternalServerError
			}
		default:
			return c.Status(400).JSON(fiber.Map{"error": "Invalid action. Must be 'arrived' or 'completed'"})
		}

		// Log event
		_, _ = pool.Exec(context.Background(), 
			`insert into events (type, team_id, message) values ($1, $2, $3)`,
			"progress", teamId, req.Action+" at base "+req.BaseId)

		return c.SendStatus(fiber.StatusCreated)
	})
}
