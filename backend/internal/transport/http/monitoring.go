package http

import (
	"backend/internal/config"
	"backend/internal/middleware"
	"context"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

func RegisterMonitoring(api fiber.Router, pool *pgxpool.Pool, cfg *config.Config) {
	// Operator monitoring endpoints
	monitorGrp := api.Group("/operator/monitor")
	monitorGrp.Use(middleware.RequireOperator(middleware.JWTConfig{Secret: cfg.JWTSecret}))

	// Get live team locations for a game
	monitorGrp.Get("/games/:id/locations", func(c *fiber.Ctx) error {
		operatorID := c.Locals("operatorID").(string)
		gameID := c.Params("id")

		// Check operator access to game
		var role string
		err := pool.QueryRow(context.Background(),
			`select role from operator_games where operator_id = $1 and game_id = $2`,
			operatorID, gameID).Scan(&role)
		if err != nil {
			return fiber.ErrNotFound
		}

		// Get recent team locations (last 24 hours)
		rows, err := pool.Query(context.Background(), `
			select t.id::text, t.name, tl.latitude, tl.longitude, tl.accuracy, tl.device_id, tl.created_at
			from team_locations tl
			join teams t on tl.team_id = t.id
			where t.game_id = $1 and tl.created_at > now() - interval '24 hours'
			order by tl.created_at desc`, gameID)
		if err != nil {
			return fiber.ErrInternalServerError
		}
		defer rows.Close()

		var locations []fiber.Map
		for rows.Next() {
			var teamID, teamName, deviceID string
			var lat, lng, accuracy float64
			var createdAt time.Time
			if err := rows.Scan(&teamID, &teamName, &lat, &lng, &accuracy, &deviceID, &createdAt); err != nil {
				return fiber.ErrInternalServerError
			}
			locations = append(locations, fiber.Map{
				"teamId": teamID, "teamName": teamName,
				"latitude": lat, "longitude": lng, "accuracy": accuracy,
				"deviceId": deviceID, "timestamp": createdAt,
			})
		}

		return c.JSON(locations)
	})

	// Get team progress summary for a game
	monitorGrp.Get("/games/:id/progress", func(c *fiber.Ctx) error {
		operatorID := c.Locals("operatorID").(string)
		gameID := c.Params("id")

		// Check operator access to game
		var role string
		err := pool.QueryRow(context.Background(),
			`select role from operator_games where operator_id = $1 and game_id = $2`,
			operatorID, gameID).Scan(&role)
		if err != nil {
			return fiber.ErrNotFound
		}

		// Get all teams and their progress
		rows, err := pool.Query(context.Background(), `
			select t.id::text, t.name,
				   coalesce(sum(case when p.completed_at is not null then 1 else 0 end), 0) as completed_bases,
				   coalesce(sum(p.score), 0) as total_score,
				   count(p.base_id) as total_progress_entries
			from teams t
			left join progress p on t.id = p.team_id
			where t.game_id = $1
			group by t.id, t.name
			order by total_score desc, completed_bases desc`, gameID)
		if err != nil {
			return fiber.ErrInternalServerError
		}
		defer rows.Close()

		var teams []fiber.Map
		for rows.Next() {
			var teamID, teamName string
			var completedBases, totalScore, totalEntries int
			if err := rows.Scan(&teamID, &teamName, &completedBases, &totalScore, &totalEntries); err != nil {
				return fiber.ErrInternalServerError
			}
			teams = append(teams, fiber.Map{
				"teamId": teamID, "teamName": teamName,
				"completedBases": completedBases, "totalScore": totalScore,
				"totalEntries": totalEntries,
			})
		}

		return c.JSON(teams)
	})

	// Get detailed progress for specific team
	monitorGrp.Get("/teams/:teamId/progress", func(c *fiber.Ctx) error {
		operatorID := c.Locals("operatorID").(string)
		teamID := c.Params("teamId")

		// Check operator access via team's game
		var gameID string
		err := pool.QueryRow(context.Background(), `
			select g.id::text 
			from games g 
			join teams t on g.id = t.game_id
			join operator_games og on g.id = og.game_id
			where t.id = $1 and og.operator_id = $2`, teamID, operatorID).Scan(&gameID)
		if err != nil {
			return fiber.ErrNotFound
		}

		// Get team progress detail
		rows, err := pool.Query(context.Background(), `
			select base_id, arrived_at, solved_at, completed_at, score, nfc_tag_uuid
			from progress 
			where team_id = $1
			order by arrived_at`, teamID)
		if err != nil {
			return fiber.ErrInternalServerError
		}
		defer rows.Close()

		var progress []fiber.Map
		for rows.Next() {
			var baseID, tagUUID string
			var arrived, solved, completed *time.Time
			var score int
			if err := rows.Scan(&baseID, &arrived, &solved, &completed, &score, &tagUUID); err != nil {
				return fiber.ErrInternalServerError
			}
			progress = append(progress, fiber.Map{
				"baseId": baseID, "arrivedAt": arrived, "solvedAt": solved,
				"completedAt": completed, "score": score, "nfcTagUUID": tagUUID,
			})
		}

		return c.JSON(progress)
	})

	// Get live events for a game
	monitorGrp.Get("/games/:id/events", func(c *fiber.Ctx) error {
		operatorID := c.Locals("operatorID").(string)
		gameID := c.Params("id")

		// Check operator access to game
		var role string
		err := pool.QueryRow(context.Background(),
			`select role from operator_games where operator_id = $1 and game_id = $2`,
			operatorID, gameID).Scan(&role)
		if err != nil {
			return fiber.ErrNotFound
		}

		limit := c.QueryInt("limit", 100)
		if limit > 500 {
			limit = 500
		}

		// Get events for teams in this game
		rows, err := pool.Query(context.Background(), `
			select e.id::text, e.type, e.team_id::text, t.name as team_name, e.message, e.created_at
			from events e
			left join teams t on e.team_id = t.id
			where t.game_id = $1 or e.team_id is null
			order by e.created_at desc
			limit $2`, gameID, limit)
		if err != nil {
			return fiber.ErrInternalServerError
		}
		defer rows.Close()

		var events []fiber.Map
		for rows.Next() {
			var eventID, eventType, teamID, teamName, message string
			var createdAt time.Time
			if err := rows.Scan(&eventID, &eventType, &teamID, &teamName, &message, &createdAt); err != nil {
				return fiber.ErrInternalServerError
			}
			events = append(events, fiber.Map{
				"id": eventID, "type": eventType, "teamId": teamID,
				"teamName": teamName, "message": message, "createdAt": createdAt,
			})
		}

		return c.JSON(events)
	})

	// Operator override: reset team progress at base
	monitorGrp.Post("/teams/:teamId/progress/:baseId/reset", func(c *fiber.Ctx) error {
		operatorID := c.Locals("operatorID").(string)
		teamID := c.Params("teamId")
		baseID := c.Params("baseId")

		// Check operator access via team's game
		var gameID string
		err := pool.QueryRow(context.Background(), `
			select g.id::text 
			from games g 
			join teams t on g.id = t.game_id
			join operator_games og on g.id = og.game_id
			where t.id = $1 and og.operator_id = $2`, teamID, operatorID).Scan(&gameID)
		if err != nil {
			return fiber.ErrNotFound
		}

		// Reset progress
		_, err = pool.Exec(context.Background(),
			`delete from progress where team_id = $1 and base_id = $2`,
			teamID, baseID)
		if err != nil {
			return fiber.ErrInternalServerError
		}

		// Log activity
		_, _ = pool.Exec(context.Background(),
			`insert into game_activities (game_id, operator_id, action, details) values ($1, $2, $3, $4)`,
			gameID, operatorID, "progress_reset", fiber.Map{"team_id": teamID, "base_id": baseID})

		// Log event
		_, _ = pool.Exec(context.Background(),
			`insert into events (type, team_id, message) values ($1, $2, $3)`,
			"operator_reset", teamID, "Progress reset by operator at base "+baseID)

		return c.JSON(fiber.Map{"message": "Progress reset"})
	})
}