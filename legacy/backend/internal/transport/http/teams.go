package http

import (
	"backend/internal/config"
	"backend/internal/db"
	"backend/internal/middleware"
	"context"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

func RegisterTeams(api fiber.Router, pool *pgxpool.Pool, cfg *config.Config) {
	grp := api.Group("/teams")
	grp.Use(middleware.RequireAdmin(middleware.JWTConfig{Secret: cfg.JWTSecret}))

	grp.Get("/", func(c *fiber.Ctx) error {
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

		// Optional game filter
		gameID := c.Query("gameId")
		
		// Build query based on filters
		var countQuery, dataQuery string
		var args []interface{}
		
		if gameID != "" {
			countQuery = "select count(*) from teams where game_id = $1"
			dataQuery = `select t.id, t.name, t.invite_code, coalesce(g.name, '') as game_name, 
						 count(distinct tl.device_id) as member_count
					 from teams t 
					 left join games g on t.game_id = g.id
					 left join team_locations tl on t.id = tl.team_id
					 where t.game_id = $1
					 group by t.id, t.name, t.invite_code, g.name
					 order by t.name
					 limit $2 offset $3`
			args = []interface{}{gameID, params.PageSize, params.GetOffset()}
		} else {
			countQuery = "select count(*) from teams"
			dataQuery = `select t.id, t.name, t.invite_code, coalesce(g.name, '') as game_name,
						 count(distinct tl.device_id) as member_count
					 from teams t 
					 left join games g on t.game_id = g.id
					 left join team_locations tl on t.id = tl.team_id
					 group by t.id, t.name, t.invite_code, g.name
					 order by t.name
					 limit $1 offset $2`
			args = []interface{}{params.PageSize, params.GetOffset()}
		}

		// Get total count
		var total int
		var countArgs []interface{}
		if gameID != "" {
			countArgs = []interface{}{gameID}
		}
		err := pool.QueryRow(context.Background(), countQuery, countArgs...).Scan(&total)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{
				"error":   "database_error",
				"message": "Failed to count teams",
			})
		}

		// Get paginated results
		rows, err := pool.Query(context.Background(), dataQuery, args...)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{
				"error":   "database_error",
				"message": "Failed to fetch teams",
			})
		}
		defer rows.Close()
		
		list := make([]fiber.Map, 0)
		for rows.Next() {
			var id, name, inviteCode, gameName string
			var memberCount int
			if err := rows.Scan(&id, &name, &inviteCode, &gameName, &memberCount); err != nil {
				return c.Status(500).JSON(fiber.Map{
					"error":   "database_error",
					"message": "Failed to parse team data",
				})
			}
			list = append(list, fiber.Map{
				"id":          id, 
				"name":        name, 
				"inviteCode":  inviteCode,
				"gameName":    gameName,
				"memberCount": memberCount,
			})
		}

		// Return paginated result
		result := db.NewPaginatedResult(list, total, params)
		return c.JSON(result)
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
