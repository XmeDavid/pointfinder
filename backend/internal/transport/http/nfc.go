package http

import (
	"backend/internal/config"
	"backend/internal/db"
	"backend/internal/middleware"
	"context"
	"encoding/json"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func RegisterNFC(api fiber.Router, pool *pgxpool.Pool, cfg *config.Config) {
	nfcGrp := api.Group("/nfc")

	// Link NFC tag to base (operator only)
	nfcGrp.Post("/link", middleware.RequireOperator(middleware.JWTConfig{Secret: cfg.JWTSecret}), middleware.ValidateJSONRequest(2048), func(c *fiber.Ctx) error {
		operatorID := c.Locals("operatorID").(string)
		
		var req struct {
			GameID  string `json:"gameId"`
			BaseID  string `json:"baseId"`
			TagUUID string `json:"tagUuid"`
		}
		if err := c.BodyParser(&req); err != nil {
			return c.Status(400).JSON(fiber.Map{
				"error":   "invalid_request",
				"message": "Invalid request body",
			})
		}

		// Validate and sanitize input
		req.GameID = middleware.SanitizeStringWithLimit(req.GameID, 36)
		req.BaseID = middleware.SanitizeStringWithLimit(req.BaseID, 36)
		req.TagUUID = middleware.SanitizeStringWithLimit(req.TagUUID, 100)

		if !middleware.ValidateUUID(req.GameID) {
			return c.Status(400).JSON(fiber.Map{
				"error":   "invalid_game_id",
				"message": "Game ID is invalid",
			})
		}
		if !middleware.ValidateUUID(req.BaseID) {
			return c.Status(400).JSON(fiber.Map{
				"error":   "invalid_base_id", 
				"message": "Base ID is invalid",
			})
		}
		if req.TagUUID == "" {
			return c.Status(400).JSON(fiber.Map{
				"error":   "missing_tag_uuid",
				"message": "NFC tag UUID is required",
			})
		}

		// Use transaction for atomic operation
		err := db.WithTransaction(context.Background(), pool, func(tx pgx.Tx) error {
			// Verify operator has access to this game
			var exists bool
			err := tx.QueryRow(context.Background(), `
				select exists(
					select 1 from operator_games og 
					join games g on og.game_id = g.id 
					where og.operator_id = $1 and g.id = $2
				)`, operatorID, req.GameID).Scan(&exists)
			if err != nil {
				return err
			}
			if !exists {
				return c.Status(403).JSON(fiber.Map{
					"error":   "game_access_denied",
					"message": "You don't have access to this game",
				})
			}

			// Verify base exists in this game
			var basesJSON string
			err = tx.QueryRow(context.Background(), 
				`select bases::text from games where id = $1`, req.GameID).Scan(&basesJSON)
			if err != nil {
				return c.Status(404).JSON(fiber.Map{
					"error":   "game_not_found",
					"message": "Game not found",
				})
			}

			// Parse bases to verify base exists
			var bases []map[string]interface{}
			if err := json.Unmarshal([]byte(basesJSON), &bases); err != nil {
				return err
			}

			baseFound := false
			baseIndex := -1
			for i, base := range bases {
				if base["id"] == req.BaseID {
					baseFound = true
					baseIndex = i
					break
				}
			}
			if !baseFound {
				return c.Status(404).JSON(fiber.Map{
					"error":   "base_not_found",
					"message": "Base not found in this game",
				})
			}

			// Check if tag is already linked to a different base
			var existingGameID, existingBaseID string
			err = tx.QueryRow(context.Background(), `
				select game_id::text, base_id from nfc_tags where tag_uuid = $1`, 
				req.TagUUID).Scan(&existingGameID, &existingBaseID)
			if err == nil {
				// Tag exists - check if it's the same base
				if existingGameID == req.GameID && existingBaseID == req.BaseID {
					// Already linked to this base - return success
					return c.JSON(fiber.Map{
						"message": "NFC tag already linked to this base",
						"linked":  true,
					})
				}
				// Tag linked to different base - return error
				return c.Status(409).JSON(fiber.Map{
					"error":   "tag_already_linked",
					"message": "NFC tag is already linked to a different base",
				})
			}

			// Insert new NFC tag linkage
			_, err = tx.Exec(context.Background(), `
				insert into nfc_tags (game_id, base_id, tag_uuid, linked_by_operator_id, linked_at) 
				values ($1, $2, $3, $4, now())`,
				req.GameID, req.BaseID, req.TagUUID, operatorID)
			if err != nil {
				return err
			}

			// Update base in game JSON to mark as NFC linked
			bases[baseIndex]["nfcLinked"] = true
			bases[baseIndex]["nfcTagUuid"] = req.TagUUID
			updatedBasesJSON, _ := json.Marshal(bases)

			_, err = tx.Exec(context.Background(),
				`update games set bases = $1 where id = $2`,
				string(updatedBasesJSON), req.GameID)
			if err != nil {
				return err
			}

			// Log activity
			_, _ = tx.Exec(context.Background(),
				`insert into game_activities (game_id, operator_id, action, details) 
				 values ($1, $2, $3, $4)`,
				req.GameID, operatorID, "nfc_tag_linked", 
				map[string]interface{}{
					"baseId": req.BaseID,
					"tagUuid": req.TagUUID,
				})

			return c.JSON(fiber.Map{
				"message": "NFC tag linked successfully",
				"linked":  true,
			})
		})

		if err != nil {
			// Check if response was already sent
			if c.Response().StatusCode() != 200 {
				return nil
			}
			return c.Status(500).JSON(fiber.Map{
				"error":   "database_error",
				"message": "Failed to link NFC tag",
			})
		}

		return nil
	})

	// Get NFC tags for a game (frontend compatibility)
	nfcGrp.Get("/games/:gameId/tags", middleware.RequireOperator(middleware.JWTConfig{Secret: cfg.JWTSecret}), func(c *fiber.Ctx) error {
		operatorID := c.Locals("operatorID").(string)
		gameID := middleware.SanitizeStringWithLimit(c.Params("gameId"), 36)

		if !middleware.ValidateUUID(gameID) {
			return c.Status(400).JSON(fiber.Map{
				"error":   "invalid_game_id",
				"message": "Game ID is invalid",
			})
		}

		// Verify operator has access to this game
		var hasAccess bool
		err := db.QueryRowWithTimeout(context.Background(), pool, `
			select exists(
				select 1 from operator_games og 
				where og.operator_id = $1 and og.game_id = $2
			)`, operatorID, gameID).Scan(&hasAccess)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{
				"error":   "database_error",
				"message": "Failed to verify game access",
			})
		}
		if !hasAccess {
			return c.Status(403).JSON(fiber.Map{
				"error":   "game_access_denied",
				"message": "You don't have access to this game",
			})
		}

		// Get NFC tags for this game
		rows, err := db.QueryWithTimeout(context.Background(), pool, `
			select nt.id::text, nt.base_id, nt.tag_uuid, nt.linked_at, 
				   coalesce(o.name, 'Unknown') as linked_by_name
			from nfc_tags nt
			left join operators o on nt.linked_by_operator_id = o.id
			where nt.game_id = $1
			order by nt.linked_at desc`, gameID)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{
				"error":   "database_error",
				"message": "Failed to fetch NFC tags",
			})
		}
		defer rows.Close()

		var tags []fiber.Map
		for rows.Next() {
			var id, baseID, tagUUID, linkedByName string
			var linkedAt time.Time
			if err := rows.Scan(&id, &baseID, &tagUUID, &linkedAt, &linkedByName); err != nil {
				return c.Status(500).JSON(fiber.Map{
					"error":   "database_error",
					"message": "Failed to parse NFC tag data",
				})
			}
			tags = append(tags, fiber.Map{
				"id":         id,
				"baseId":     baseID,
				"tagUUID":    tagUUID,
				"linkedAt":   linkedAt,
				"linkedBy":   linkedByName,
			})
		}

		return c.JSON(tags)
	})

	// Get NFC setup status for a game
	nfcGrp.Get("/game/:gameId/status", middleware.RequireOperator(middleware.JWTConfig{Secret: cfg.JWTSecret}), func(c *fiber.Ctx) error {
		operatorID := c.Locals("operatorID").(string)
		gameID := middleware.SanitizeStringWithLimit(c.Params("gameId"), 36)

		if !middleware.ValidateUUID(gameID) {
			return c.Status(400).JSON(fiber.Map{
				"error":   "invalid_game_id",
				"message": "Game ID is invalid",
			})
		}

		// Verify operator has access to this game
		var hasAccess bool
		err := db.QueryRowWithTimeout(context.Background(), pool, `
			select exists(
				select 1 from operator_games og 
				where og.operator_id = $1 and og.game_id = $2
			)`, operatorID, gameID).Scan(&hasAccess)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{
				"error":   "database_error",
				"message": "Failed to verify game access",
			})
		}
		if !hasAccess {
			return c.Status(403).JSON(fiber.Map{
				"error":   "game_access_denied",
				"message": "You don't have access to this game",
			})
		}

		// Get game bases and NFC status
		var basesJSON string
		var basesLinked bool
		err = db.QueryRowWithTimeout(context.Background(), pool, `
			select bases::text, bases_linked from games where id = $1`, 
			gameID).Scan(&basesJSON, &basesLinked)
		if err != nil {
			return c.Status(404).JSON(fiber.Map{
				"error":   "game_not_found",
				"message": "Game not found",
			})
		}

		// Parse bases JSON
		var bases []map[string]interface{}
		if err := json.Unmarshal([]byte(basesJSON), &bases); err != nil {
			return c.Status(500).JSON(fiber.Map{
				"error":   "data_parsing_error",
				"message": "Failed to parse game bases",
			})
		}

		// Get NFC tag information
		rows, err := db.QueryWithTimeout(context.Background(), pool, `
			select base_id, tag_uuid, linked_at 
			from nfc_tags where game_id = $1`, gameID)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{
				"error":   "database_error",
				"message": "Failed to fetch NFC tags",
			})
		}
		defer rows.Close()

		nfcTags := make(map[string]map[string]interface{})
		for rows.Next() {
			var baseID, tagUUID string
			var linkedAt time.Time
			if err := rows.Scan(&baseID, &tagUUID, &linkedAt); err != nil {
				return c.Status(500).JSON(fiber.Map{
					"error":   "database_error",
					"message": "Failed to parse NFC tag data",
				})
			}
			nfcTags[baseID] = map[string]interface{}{
				"tagUuid":  tagUUID,
				"linkedAt": linkedAt,
			}
		}

		// Build response with base status
		baseStatuses := make([]fiber.Map, 0, len(bases))
		linkedCount := 0
		totalCount := len(bases)

		for _, base := range bases {
			baseID, _ := base["id"].(string)
			baseName, _ := base["name"].(string)
			isLinked := false
			var tagInfo map[string]interface{}

			if nfcInfo, exists := nfcTags[baseID]; exists {
				isLinked = true
				linkedCount++
				tagInfo = nfcInfo
			}

			baseStatuses = append(baseStatuses, fiber.Map{
				"id":        baseID,
				"name":      baseName,
				"nfcLinked": isLinked,
				"tagInfo":   tagInfo,
			})
		}

		allLinked := linkedCount == totalCount && totalCount > 0

		return c.JSON(fiber.Map{
			"gameId":      gameID,
			"totalBases":  totalCount,
			"linkedBases": linkedCount,
			"allLinked":   allLinked,
			"canGoLive":   allLinked,
			"bases":       baseStatuses,
		})
	})

	// Unlink NFC tag (operator only)
	nfcGrp.Delete("/unlink/:tagUuid", middleware.RequireOperator(middleware.JWTConfig{Secret: cfg.JWTSecret}), func(c *fiber.Ctx) error {
		operatorID := c.Locals("operatorID").(string)
		tagUUID := middleware.SanitizeStringWithLimit(c.Params("tagUuid"), 100)

		if tagUUID == "" {
			return c.Status(400).JSON(fiber.Map{
				"error":   "missing_tag_uuid",
				"message": "NFC tag UUID is required",
			})
		}

		// Use transaction for atomic operation
		err := db.WithTransaction(context.Background(), pool, func(tx pgx.Tx) error {
			// Get tag information and verify operator access
			var gameID, baseID string
			err := tx.QueryRow(context.Background(), `
				select nt.game_id::text, nt.base_id 
				from nfc_tags nt
				join operator_games og on nt.game_id = og.game_id
				where nt.tag_uuid = $1 and og.operator_id = $2`, 
				tagUUID, operatorID).Scan(&gameID, &baseID)
			if err != nil {
				return c.Status(404).JSON(fiber.Map{
					"error":   "tag_not_found",
					"message": "NFC tag not found or access denied",
				})
			}

			// Remove NFC tag
			result, err := tx.Exec(context.Background(),
				`delete from nfc_tags where tag_uuid = $1`, tagUUID)
			if err != nil {
				return err
			}

			if result.RowsAffected() == 0 {
				return c.Status(404).JSON(fiber.Map{
					"error":   "tag_not_found",
					"message": "NFC tag not found",
				})
			}

			// Update game bases JSON to mark as not linked
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

			// Find and update the base
			for i, base := range bases {
				if base["id"] == baseID {
					bases[i]["nfcLinked"] = false
					delete(bases[i], "nfcTagUuid")
					break
				}
			}

			updatedBasesJSON, _ := json.Marshal(bases)
			_, err = tx.Exec(context.Background(),
				`update games set bases = $1 where id = $2`,
				string(updatedBasesJSON), gameID)
			if err != nil {
				return err
			}

			// Log activity
			_, _ = tx.Exec(context.Background(),
				`insert into game_activities (game_id, operator_id, action, details) 
				 values ($1, $2, $3, $4)`,
				gameID, operatorID, "nfc_tag_unlinked", 
				map[string]interface{}{
					"baseId": baseID,
					"tagUuid": tagUUID,
				})

			return c.JSON(fiber.Map{
				"message": "NFC tag unlinked successfully",
			})
		})

		if err != nil {
			// Check if response was already sent
			if c.Response().StatusCode() != 200 {
				return nil
			}
			return c.Status(500).JSON(fiber.Map{
				"error":   "database_error",
				"message": "Failed to unlink NFC tag",
			})
		}

		return nil
	})

	// Validate NFC tag for base access (used during gameplay)
	nfcGrp.Post("/validate", middleware.RequireTeam(middleware.JWTConfig{Secret: cfg.JWTSecret}), middleware.ValidateJSONRequest(1024), func(c *fiber.Ctx) error {
		teamID := c.Locals("teamID").(string)
		
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

		// Get team's game and validate NFC tag
		var gameID, baseID, baseName string
		var gameStatus string
		err := db.QueryRowWithTimeout(context.Background(), pool, `
			select nt.game_id::text, nt.base_id, g.status
			from nfc_tags nt
			join games g on nt.game_id = g.id
			join teams t on g.id = t.game_id
			where nt.tag_uuid = $1 and t.id = $2`, 
			req.TagUUID, teamID).Scan(&gameID, &baseID, &gameStatus)
		if err != nil {
			return c.Status(404).JSON(fiber.Map{
				"error":   "invalid_nfc_tag",
				"message": "NFC tag not found or not accessible by your team",
			})
		}

		// Check if game is live
		if gameStatus != "live" {
			return c.Status(400).JSON(fiber.Map{
				"error":   "game_not_live",
				"message": "Game is not currently live",
			})
		}

		// Get base information from game
		var basesJSON string
		err = db.QueryRowWithTimeout(context.Background(), pool,
			`select bases::text from games where id = $1`, gameID).Scan(&basesJSON)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{
				"error":   "database_error",
				"message": "Failed to fetch game data",
			})
		}

		var bases []map[string]interface{}
		if err := json.Unmarshal([]byte(basesJSON), &bases); err != nil {
			return c.Status(500).JSON(fiber.Map{
				"error":   "data_parsing_error",
				"message": "Failed to parse game bases",
			})
		}

		// Find the base details
		var baseDetails map[string]interface{}
		for _, base := range bases {
			if base["id"] == baseID {
				baseName, _ = base["name"].(string)
				baseDetails = base
				break
			}
		}

		if baseDetails == nil {
			return c.Status(404).JSON(fiber.Map{
				"error":   "base_not_found",
				"message": "Base not found in game",
			})
		}

		return c.JSON(fiber.Map{
			"valid":   true,
			"gameId":  gameID,
			"baseId":  baseID,
			"name":    baseName,
			"base":    baseDetails,
			"message": "NFC tag validated successfully",
		})
	})
}