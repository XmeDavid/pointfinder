package http

import (
	"backend/internal/config"
	"backend/internal/middleware"
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

func RegisterMonitoring(api fiber.Router, pool *pgxpool.Pool, cfg *config.Config) {
	// Operator monitoring endpoints
	monitorGrp := api.Group("/operator/monitor")
	monitorGrp.Use(middleware.RequireOperator(middleware.JWTConfig{Secret: cfg.JWTSecret}))

	// Get latest team locations for a game (for live map)
	monitorGrp.Get("/games/:id/locations/latest", func(c *fiber.Ctx) error {
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

		// Get latest location for each team
		rows, err := pool.Query(context.Background(), `
			select distinct on (t.id) t.id::text, t.name, tl.latitude, tl.longitude, 
				   tl.accuracy, tl.device_id, tl.created_at,
				   t.active_base_id, t.leader_device_id
			from teams t
			left join team_locations tl on t.id = tl.team_id
			where t.game_id = $1
			order by t.id, tl.created_at desc`, gameID)
		if err != nil {
			return fiber.ErrInternalServerError
		}
		defer rows.Close()

		var teamLocations []fiber.Map
		for rows.Next() {
			var teamID, teamName, deviceID, activeBaseID, leaderDeviceID string
			var lat, lng, accuracy *float64
			var createdAt *time.Time
			if err := rows.Scan(&teamID, &teamName, &lat, &lng, &accuracy, &deviceID, &createdAt, &activeBaseID, &leaderDeviceID); err != nil {
				return fiber.ErrInternalServerError
			}
			
			location := fiber.Map{
				"teamId":          teamID,
				"teamName":        teamName,
				"activeBaseId":    activeBaseID,
				"leaderDeviceId":  leaderDeviceID,
			}
			
			if lat != nil && lng != nil {
				location["latitude"] = *lat
				location["longitude"] = *lng
				location["accuracy"] = accuracy
				location["deviceId"] = deviceID
				location["timestamp"] = *createdAt
			}
			
			teamLocations = append(teamLocations, location)
		}

		return c.JSON(teamLocations)
	})

	// Get all team location history for a game
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

	// Reassign team leader - allows operators to change team leadership
	monitorGrp.Post("/teams/:teamId/leader", func(c *fiber.Ctx) error {
		operatorID := c.Locals("operatorID").(string)
		teamID := c.Params("teamId")

		var req struct {
			NewLeaderDeviceID string `json:"newLeaderDeviceId"`
		}
		if err := c.BodyParser(&req); err != nil {
			return c.Status(400).JSON(fiber.Map{
				"error":   "invalid_request",
				"message": "Invalid request body",
			})
		}

		req.NewLeaderDeviceID = middleware.SanitizeStringWithLimit(req.NewLeaderDeviceID, 100)
		if req.NewLeaderDeviceID == "" {
			return c.Status(400).JSON(fiber.Map{
				"error":   "missing_device_id",
				"message": "New leader device ID is required",
			})
		}

		// Check operator access via team's game
		var gameID, currentLeaderDeviceID string
		var teamName string
		err := pool.QueryRow(context.Background(), `
			select g.id::text, t.leader_device_id, t.name
			from games g 
			join teams t on g.id = t.game_id
			join operator_games og on g.id = og.game_id
			where t.id = $1 and og.operator_id = $2`, teamID, operatorID).Scan(&gameID, &currentLeaderDeviceID, &teamName)
		if err != nil {
			return c.Status(404).JSON(fiber.Map{
				"error":   "team_not_found",
				"message": "Team not found or access denied",
			})
		}

		// Check if the new device is actually a member of this team
		var teamMembers []string
		var membersJSON string
		err = pool.QueryRow(context.Background(), `
			select members from teams where id = $1`, teamID).Scan(&membersJSON)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{
				"error":   "database_error",
				"message": "Failed to fetch team members",
			})
		}

		if membersJSON != "" && membersJSON != "[]" {
			if err := json.Unmarshal([]byte(membersJSON), &teamMembers); err != nil {
				return c.Status(500).JSON(fiber.Map{
					"error":   "data_parsing_error",
					"message": "Failed to parse team members",
				})
			}
		}

		// Verify new leader device is a team member
		deviceIsMember := false
		for _, member := range teamMembers {
			if member == req.NewLeaderDeviceID {
				deviceIsMember = true
				break
			}
		}

		if !deviceIsMember {
			return c.Status(400).JSON(fiber.Map{
				"error":   "device_not_member",
				"message": "Device is not a member of this team",
			})
		}

		// Update team leader
		_, err = pool.Exec(context.Background(),
			`update teams set leader_device_id = $1, updated_at = now() where id = $2`,
			req.NewLeaderDeviceID, teamID)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{
				"error":   "database_error",
				"message": "Failed to update team leader",
			})
		}

		// Log activity
		_, _ = pool.Exec(context.Background(),
			`insert into game_activities (game_id, operator_id, action, details) values ($1, $2, $3, $4)`,
			gameID, operatorID, "team_leader_changed", fiber.Map{
				"team_id": teamID,
				"team_name": teamName,
				"old_leader_device_id": currentLeaderDeviceID,
				"new_leader_device_id": req.NewLeaderDeviceID,
			})

		// Log event
		_, _ = pool.Exec(context.Background(),
			`insert into events (type, team_id, message) values ($1, $2, $3)`,
			"team_leader_changed", teamID, 
			fmt.Sprintf("Team leader changed by operator from %s to %s", currentLeaderDeviceID, req.NewLeaderDeviceID))

		return c.JSON(fiber.Map{
			"message":          "Team leader updated successfully",
			"teamId":           teamID,
			"newLeaderDeviceId": req.NewLeaderDeviceID,
		})
	})

	// Get team member details - helps operators see who can be made leader
	monitorGrp.Get("/teams/:teamId/members", func(c *fiber.Ctx) error {
		operatorID := c.Locals("operatorID").(string)
		teamID := c.Params("teamId")

		// Check operator access via team's game
		var gameID string
		var teamName, leaderDeviceID string
		var membersJSON string
		err := pool.QueryRow(context.Background(), `
			select g.id::text, t.name, t.leader_device_id, t.members
			from games g 
			join teams t on g.id = t.game_id
			join operator_games og on g.id = og.game_id
			where t.id = $1 and og.operator_id = $2`, teamID, operatorID).Scan(&gameID, &teamName, &leaderDeviceID, &membersJSON)
		if err != nil {
			return c.Status(404).JSON(fiber.Map{
				"error":   "team_not_found",
				"message": "Team not found or access denied",
			})
		}

		// Parse team members
		var members []string
		if membersJSON != "" && membersJSON != "[]" {
			if err := json.Unmarshal([]byte(membersJSON), &members); err != nil {
				return c.Status(500).JSON(fiber.Map{
					"error":   "data_parsing_error",
					"message": "Failed to parse team members",
				})
			}
		}

		// Build member details with leadership status
		var memberDetails []fiber.Map
		for _, deviceID := range members {
			memberDetails = append(memberDetails, fiber.Map{
				"deviceId": deviceID,
				"isLeader": deviceID == leaderDeviceID,
			})
		}

		return c.JSON(fiber.Map{
			"teamId":           teamID,
			"teamName":         teamName,
			"leaderDeviceId":   leaderDeviceID,
			"members":          memberDetails,
			"totalMembers":     len(members),
		})
	})
}