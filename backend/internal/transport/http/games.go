package http

import (
	"backend/internal/config"
	"backend/internal/middleware"
	"context"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

func RegisterGames(api fiber.Router, pool *pgxpool.Pool, cfg *config.Config) {
	// Admin endpoints (legacy)
	adminGrp := api.Group("/games")
	adminGrp.Use(middleware.RequireAdmin(middleware.JWTConfig{Secret: cfg.JWTSecret}))

	// List all games (admin)
	adminGrp.Get("/", func(c *fiber.Ctx) error {
		rows, err := pool.Query(context.Background(), `
			select g.id, g.name, g.status, g.bases_linked, g.created_at,
			       count(distinct t.id) as team_count,
			       count(distinct b.value->>'id') as base_count
			from games g
			left join teams t on t.game_id = g.id
			left join jsonb_array_elements(g.bases) as b on true
			group by g.id, g.name, g.status, g.bases_linked, g.created_at
			order by g.created_at desc`)
		if err != nil {
			return fiber.ErrInternalServerError
		}
		defer rows.Close()

		var games []fiber.Map
		for rows.Next() {
			var id, name, status, createdAt string
			var basesLinked bool
			var teamCount, baseCount int
			if err := rows.Scan(&id, &name, &status, &basesLinked, &createdAt, &teamCount, &baseCount); err != nil {
				return fiber.ErrInternalServerError
			}
			games = append(games, fiber.Map{
				"id": id, "name": name, "status": status,
				"basesLinked": basesLinked, "createdAt": createdAt,
				"teamCount": teamCount, "baseCount": baseCount,
			})
		}
		return c.JSON(games)
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

	// List operator's games
	operatorGrp.Get("/", func(c *fiber.Ctx) error {
		operatorID := c.Locals("operatorID").(string)
		rows, err := pool.Query(context.Background(), `
			select g.id, g.name, g.status, g.bases_linked, g.created_at, og.role
			from games g
			join operator_games og on g.id = og.game_id
			where og.operator_id = $1
			order by g.created_at desc`, operatorID)
		if err != nil {
			return fiber.ErrInternalServerError
		}
		defer rows.Close()

		var games []fiber.Map
		for rows.Next() {
			var id, name, status, role string
			var basesLinked bool
			var createdAt string
			if err := rows.Scan(&id, &name, &status, &basesLinked, &createdAt, &role); err != nil {
				return fiber.ErrInternalServerError
			}
			games = append(games, fiber.Map{
				"id": id, "name": name, "status": status,
				"basesLinked": basesLinked, "createdAt": createdAt, "role": role,
			})
		}
		return c.JSON(games)
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

		if body.Status != "setup" && body.Status != "live" && body.Status != "finished" {
			return c.Status(400).JSON(fiber.Map{"error": "Invalid status"})
		}

		// For going live, check that all bases are linked
		if body.Status == "live" {
			var basesLinked bool
			err := pool.QueryRow(context.Background(),
				`select bases_linked from games where id = $1`, gameID).Scan(&basesLinked)
			if err != nil {
				return fiber.ErrInternalServerError
			}
			if !basesLinked {
				return c.Status(400).JSON(fiber.Map{"error": "Cannot go live until all bases are linked"})
			}
		}

		_, err = pool.Exec(context.Background(),
			`update games set status = $1, updated_at = now() where id = $2`,
			body.Status, gameID)
		if err != nil {
			return fiber.ErrInternalServerError
		}

		// Log activity
		_, _ = pool.Exec(context.Background(),
			`insert into game_activities (game_id, operator_id, action, details) values ($1, $2, $3, $4)`,
			gameID, operatorID, "status_changed", fiber.Map{"new_status": body.Status})

		return c.JSON(fiber.Map{"message": "Game status updated"})
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

		// TODO: Update the base in the game's bases JSON array to include the tagUUID
		// For now, just log the link
		_, _ = pool.Exec(context.Background(),
			`insert into game_activities (game_id, operator_id, action, details) values ($1, $2, $3, $4)`,
			gameID, operatorID, "nfc_linked", fiber.Map{"base_id": baseID, "tag_uuid": body.TagUUID})

		return c.JSON(fiber.Map{"message": "NFC tag linked"})
	})
}
