package http

import (
	"backend/internal/config"
	"backend/internal/middleware"
	"context"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

func RegisterTeams(api fiber.Router, pool *pgxpool.Pool, cfg *config.Config) {
	grp := api.Group("/teams")
	grp.Use(middleware.RequireAdmin(middleware.JWTConfig{Secret: cfg.JWTSecret}))

	grp.Get("/", func(c *fiber.Ctx) error {
		rows, err := pool.Query(context.Background(), `select id, name from teams order by name`)
		if err != nil {
			return fiber.ErrInternalServerError
		}
		defer rows.Close()
		list := make([]fiber.Map, 0)
		for rows.Next() {
			var id, name string
			if err := rows.Scan(&id, &name); err != nil {
				return fiber.ErrInternalServerError
			}
			list = append(list, fiber.Map{"id": id, "name": name})
		}
		return c.JSON(list)
	})

	grp.Post("/", func(c *fiber.Ctx) error {
		var body struct {
			Name       string  `json:"name"`
			InviteCode *string `json:"invite_code"`
			GameID     *string `json:"game_id"`
		}
		if err := c.BodyParser(&body); err != nil {
			return fiber.ErrBadRequest
		}
		if body.Name == "" {
			return fiber.ErrBadRequest
		}
		if body.InviteCode == nil {
			// simple default code generation: use first 8 of uuid
			var code string
			if err := pool.QueryRow(context.Background(), `select substring(uuid_generate_v4()::text,1,8)`).Scan(&code); err == nil {
				body.InviteCode = &code
			}
		}
		if _, err := pool.Exec(context.Background(), `insert into teams (name, invite_code, game_id) values ($1,$2,$3)`, body.Name, body.InviteCode, body.GameID); err != nil {
			return fiber.ErrInternalServerError
		}
		return c.SendStatus(fiber.StatusCreated)
	})
}
