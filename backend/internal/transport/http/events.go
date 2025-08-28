package http

import (
	"backend/internal/config"
	"backend/internal/middleware"
	"context"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

func RegisterEvents(api fiber.Router, pool *pgxpool.Pool, cfg *config.Config) {
	grp := api.Group("/events")
	grp.Use(middleware.RequireAdmin(middleware.JWTConfig{Secret: cfg.JWTSecret}))

	grp.Get("/", func(c *fiber.Ctx) error {
		rows, err := pool.Query(context.Background(), `select id, type, team_id, message, created_at from events order by created_at desc limit 200`)
		if err != nil {
			return fiber.ErrInternalServerError
		}
		defer rows.Close()
		list := make([]fiber.Map, 0)
		for rows.Next() {
			var id, typ, teamId, message string
			var createdAt time.Time
			if err := rows.Scan(&id, &typ, &teamId, &message, &createdAt); err != nil {
				return fiber.ErrInternalServerError
			}
			list = append(list, fiber.Map{"id": id, "type": typ, "teamId": teamId, "message": message, "createdAt": createdAt})
		}
		return c.JSON(list)
	})

	grp.Post("/", func(c *fiber.Ctx) error {
		var body struct {
			Type    string  `json:"type"`
			TeamId  *string `json:"teamId"`
			Message string  `json:"message"`
		}
		if err := c.BodyParser(&body); err != nil {
			return fiber.ErrBadRequest
		}
		if body.Type == "" {
			return fiber.ErrBadRequest
		}
		if _, err := pool.Exec(context.Background(), `insert into events (type, team_id, message) values ($1,$2,$3)`, body.Type, body.TeamId, body.Message); err != nil {
			return fiber.ErrInternalServerError
		}
		return c.SendStatus(fiber.StatusCreated)
	})

	// Authenticated event posting (e.g., locationPing) for team/admin tokens
	api.Post("/events", middleware.RequireAuth(middleware.JWTConfig{Secret: cfg.JWTSecret}), func(c *fiber.Ctx) error {
		var body struct {
			Type    string  `json:"type"`
			TeamId  *string `json:"teamId"`
			Message string  `json:"message"`
		}
		if err := c.BodyParser(&body); err != nil {
			return fiber.ErrBadRequest
		}
		if body.Type == "" {
			return fiber.ErrBadRequest
		}
		// Derive teamId for team tokens
		if role, _ := c.Locals("role").(string); role == "team" {
			if teamSub, _ := c.Locals("userID").(string); teamSub != "" {
				body.TeamId = &teamSub
			}
		}
		if _, err := pool.Exec(context.Background(), `insert into events (type, team_id, message) values ($1,$2,$3)`, body.Type, body.TeamId, body.Message); err != nil {
			return fiber.ErrInternalServerError
		}
		return c.SendStatus(fiber.StatusCreated)
	})
}
