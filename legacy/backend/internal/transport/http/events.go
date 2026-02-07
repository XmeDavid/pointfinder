package http

import (
	"backend/internal/config"
	"backend/internal/db"
	"backend/internal/middleware"
	"context"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

func RegisterEvents(api fiber.Router, pool *pgxpool.Pool, cfg *config.Config) {
	grp := api.Group("/events")
	grp.Use(middleware.RequireAdmin(middleware.JWTConfig{Secret: cfg.JWTSecret}))

	grp.Get("/", func(c *fiber.Ctx) error {
		// Parse pagination parameters
		params := &db.PaginationParams{
			Page:     1,
			PageSize: 50, // Higher default for events
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

		// Optional filters
		teamID := c.Query("teamId")
		eventType := c.Query("type")

		// Build query based on filters
		var countQuery, dataQuery string
		var countArgs, dataArgs []interface{}
		
		if teamID != "" && eventType != "" {
			countQuery = "select count(*) from events where team_id = $1 and type = $2"
			dataQuery = `select id, type, team_id, message, created_at 
					 from events 
					 where team_id = $1 and type = $2
					 order by created_at desc
					 limit $3 offset $4`
			countArgs = []interface{}{teamID, eventType}
			dataArgs = []interface{}{teamID, eventType, params.PageSize, params.GetOffset()}
		} else if teamID != "" {
			countQuery = "select count(*) from events where team_id = $1"
			dataQuery = `select id, type, team_id, message, created_at 
					 from events 
					 where team_id = $1
					 order by created_at desc
					 limit $2 offset $3`
			countArgs = []interface{}{teamID}
			dataArgs = []interface{}{teamID, params.PageSize, params.GetOffset()}
		} else if eventType != "" {
			countQuery = "select count(*) from events where type = $1"
			dataQuery = `select id, type, team_id, message, created_at 
					 from events 
					 where type = $1
					 order by created_at desc
					 limit $2 offset $3`
			countArgs = []interface{}{eventType}
			dataArgs = []interface{}{eventType, params.PageSize, params.GetOffset()}
		} else {
			countQuery = "select count(*) from events"
			dataQuery = `select id, type, team_id, message, created_at 
					 from events 
					 order by created_at desc
					 limit $1 offset $2`
			countArgs = []interface{}{}
			dataArgs = []interface{}{params.PageSize, params.GetOffset()}
		}

		// Get total count
		var total int
		err := pool.QueryRow(context.Background(), countQuery, countArgs...).Scan(&total)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{
				"error":   "database_error",
				"message": "Failed to count events",
			})
		}

		// Get paginated results
		rows, err := pool.Query(context.Background(), dataQuery, dataArgs...)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{
				"error":   "database_error",
				"message": "Failed to fetch events",
			})
		}
		defer rows.Close()
		
		list := make([]fiber.Map, 0)
		for rows.Next() {
			var id, typ, teamId, message string
			var createdAt time.Time
			if err := rows.Scan(&id, &typ, &teamId, &message, &createdAt); err != nil {
				return c.Status(500).JSON(fiber.Map{
					"error":   "database_error",
					"message": "Failed to parse event data",
				})
			}
			list = append(list, fiber.Map{
				"id": id, "type": typ, "teamId": teamId, 
				"message": message, "createdAt": createdAt,
			})
		}

		// Return paginated result
		result := db.NewPaginatedResult(list, total, params)
		return c.JSON(result)
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
