package http

import (
	"backend/internal/config"
	"backend/internal/db"
	"backend/internal/middleware"
	"context"
	"encoding/json"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func RegisterAuth(api fiber.Router, pool *pgxpool.Pool, cfg *config.Config) {
	// Admin login endpoint (matches iOS client expectation)
	api.Post("/auth/admin/login", middleware.AuthRateLimit(), middleware.ValidateLoginRequest(), func(c *fiber.Ctx) error {
		var req struct {
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		if err := c.BodyParser(&req); err != nil {
			return fiber.ErrBadRequest
		}

		// Sanitize input
		req.Email = middleware.SanitizeString(req.Email)
		req.Password = middleware.SanitizeString(req.Password)

		// Validate input format
		if !middleware.ValidateEmail(req.Email) || !middleware.ValidatePassword(req.Password) {
			return fiber.ErrUnauthorized
		}

		// Validate credentials from environment variables
		if req.Email != cfg.AdminEmail || req.Password != cfg.AdminPassword {
			return fiber.ErrUnauthorized
		}

		accessToken, err := middleware.GenerateToken(cfg.JWTSecret, "admin-1")
		if err != nil {
			return fiber.ErrInternalServerError
		}

		refreshToken, err := middleware.GenerateRefreshToken(cfg.JWTSecret, "admin-1")
		if err != nil {
			return fiber.ErrInternalServerError
		}

		return c.JSON(fiber.Map{
			"token":         accessToken,
			"refresh_token": refreshToken,
		})
	})

	// Keep legacy endpoint for web admin compatibility
	api.Post("/auth/login", middleware.AuthRateLimit(), middleware.ValidateLoginRequest(), func(c *fiber.Ctx) error {
		var req loginRequest
		if err := c.BodyParser(&req); err != nil {
			return fiber.ErrBadRequest
		}

		// Sanitize input
		req.Email = middleware.SanitizeString(req.Email)
		req.Password = middleware.SanitizeString(req.Password)

		// Validate input format
		if !middleware.ValidateEmail(req.Email) || !middleware.ValidatePassword(req.Password) {
			return fiber.ErrUnauthorized
		}

		// Validate credentials from environment variables
		if req.Email != cfg.AdminEmail || req.Password != cfg.AdminPassword {
			return fiber.ErrUnauthorized
		}

		accessToken, err := middleware.GenerateToken(cfg.JWTSecret, "admin-1")
		if err != nil {
			return fiber.ErrInternalServerError
		}

		refreshToken, err := middleware.GenerateRefreshToken(cfg.JWTSecret, "admin-1")
		if err != nil {
			return fiber.ErrInternalServerError
		}

		return c.JSON(fiber.Map{
			"token":         accessToken,
			"refresh_token": refreshToken,
			"user":          fiber.Map{"id": "admin-1", "email": req.Email, "role": "admin"},
		})
	})

	// Team join endpoint for mobile clients (invite_code-based)
	api.Post("/auth/team/join", middleware.ValidateJSONRequest(1024), func(c *fiber.Ctx) error {
		var req struct {
			Code     string `json:"code"`
			DeviceId string `json:"deviceId"`
			Name     string `json:"name"` // Optional player name
		}
		if err := c.BodyParser(&req); err != nil {
			return c.Status(400).JSON(fiber.Map{
				"error":   "invalid_request",
				"message": "Invalid request body",
			})
		}

		// Validate and sanitize input
		req.Code = middleware.SanitizeStringWithLimit(req.Code, middleware.MaxInviteCodeLength)
		req.DeviceId = middleware.SanitizeStringWithLimit(req.DeviceId, middleware.MaxDeviceIDLength) 
		req.Name = middleware.SanitizeStringWithLimit(req.Name, middleware.MaxNameLength)
		
		if !middleware.ValidateInviteCode(req.Code) {
			return c.Status(400).JSON(fiber.Map{
				"error":   "invalid_invite_code",
				"message": "Invite code is invalid or too short",
			})
		}
		
		if !middleware.ValidateDeviceID(req.DeviceId) {
			return c.Status(400).JSON(fiber.Map{
				"error":   "invalid_device_id",
				"message": "Device ID is invalid",
			})
		}

		// Use transaction for atomic operation
		err := db.WithTransaction(context.Background(), pool, func(tx pgx.Tx) error {
			// Lookup team and game information
			var teamID, teamName, gameID, gameName, gameStatus string
			var leaderDeviceID *string
			var membersJSON string
			
			err := tx.QueryRow(context.Background(), `
				select t.id::text, t.name, t.game_id::text, g.name, g.status,
				       t.leader_device_id, t.members::text
				from teams t
				join games g on t.game_id = g.id
				where t.invite_code = $1`, req.Code).Scan(
				&teamID, &teamName, &gameID, &gameName, &gameStatus,
				&leaderDeviceID, &membersJSON)
			
			if err != nil {
				if err == pgx.ErrNoRows {
					return c.Status(404).JSON(fiber.Map{
						"error":   "invalid_invite_code",
						"message": "Team not found with this invite code",
					})
				}
				return err
			}

			// Check if device is already a member
			var existingMembers []string
			if membersJSON != "" && membersJSON != "[]" {
				if err := json.Unmarshal([]byte(membersJSON), &existingMembers); err == nil {
					for _, member := range existingMembers {
						if member == req.DeviceId {
							// Device already joined - just issue new token
							token, err := middleware.GenerateTeamToken(cfg.JWTSecret, teamID, req.DeviceId)
							if err != nil {
								return c.Status(500).JSON(fiber.Map{
									"error":   "token_generation_failed",
									"message": "Failed to generate authentication token",
								})
							}
							
							isLeader := (leaderDeviceID != nil && *leaderDeviceID == req.DeviceId)
							
							return c.JSON(fiber.Map{
								"token":   token,
								"team":    fiber.Map{
									"id":             teamID,
									"name":           teamName,
									"memberCount":    len(existingMembers),
									"leaderDeviceId": leaderDeviceID,
									"isLeader":       isLeader,
								},
								"game":    fiber.Map{
									"id":     gameID,
									"name":   gameName,
									"status": gameStatus,
								},
								"message": "Welcome back to the team!",
							})
						}
					}
				}
			}

			// Set leader if not set (first joiner becomes leader)
			if leaderDeviceID == nil || *leaderDeviceID == "" {
				_, err = tx.Exec(context.Background(), 
					`update teams set leader_device_id = $1 where id = $2`, 
					req.DeviceId, teamID)
				if err != nil {
					return err
				}
				leaderDeviceID = &req.DeviceId
			}

			// Add device to members array
			existingMembers = append(existingMembers, req.DeviceId)
			newMembersJSON, _ := json.Marshal(existingMembers)
			
			_, err = tx.Exec(context.Background(), 
				`update teams set members = $1 where id = $2`,
				string(newMembersJSON), teamID)
			if err != nil {
				return err
			}

			// Log join event
			message := "Player joined team"
			if req.Name != "" {
				message = "Player " + req.Name + " joined team"
			}
			_, _ = tx.Exec(context.Background(),
				`insert into events (type, team_id, message) values ($1, $2, $3)`,
				"team_joined", teamID, message)

			// Generate team token
			token, err := middleware.GenerateTeamToken(cfg.JWTSecret, teamID, req.DeviceId)
			if err != nil {
				return err
			}

			isLeader := (leaderDeviceID != nil && *leaderDeviceID == req.DeviceId)
			
			return c.JSON(fiber.Map{
				"token":   token,
				"team":    fiber.Map{
					"id":             teamID,
					"name":           teamName,
					"memberCount":    len(existingMembers),
					"leaderDeviceId": leaderDeviceID,
					"isLeader":       isLeader,
				},
				"game":    fiber.Map{
					"id":     gameID,
					"name":   gameName,
					"status": gameStatus,
				},
				"message": "Successfully joined team!",
			})
		})

		if err != nil {
			// Check if this is already a response (status was set)
			if c.Response().StatusCode() != 200 {
				return nil // Response was already sent
			}
			return c.Status(500).JSON(fiber.Map{
				"error":   "database_error",
				"message": "Failed to join team",
			})
		}

		return nil // Success response already sent in transaction
	})

	// Token refresh endpoint
	api.Post("/auth/refresh", middleware.ValidateLoginRequest(), func(c *fiber.Ctx) error {
		var req struct {
			RefreshToken string `json:"refresh_token"`
		}
		if err := c.BodyParser(&req); err != nil {
			return fiber.ErrBadRequest
		}

		// Validate refresh token
		token, err := jwt.Parse(req.RefreshToken, func(t *jwt.Token) (interface{}, error) {
			return []byte(cfg.JWTSecret), nil
		})
		if err != nil || !token.Valid {
			return fiber.ErrUnauthorized
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok || claims["type"] != "refresh" {
			return fiber.ErrUnauthorized
		}

		// Generate new access token
		userID := claims["sub"].(string)
		newAccessToken, err := middleware.GenerateToken(cfg.JWTSecret, userID)
		if err != nil {
			return fiber.ErrInternalServerError
		}

		return c.JSON(fiber.Map{"token": newAccessToken})
	})

	// Operator login endpoint (no CSRF protection)
	api.Post("/auth/operators/login", middleware.AuthRateLimit(), middleware.ValidateLoginRequest(), func(c *fiber.Ctx) error {
		var req struct {
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		if err := c.BodyParser(&req); err != nil {
			return fiber.ErrBadRequest
		}

		req.Email = middleware.SanitizeString(req.Email)
		req.Password = middleware.SanitizeString(req.Password)
		
		if !middleware.ValidateEmail(req.Email) || !middleware.ValidatePassword(req.Password) {
			return fiber.ErrUnauthorized
		}

		// Get operator
		var operatorID, name, hashedPassword string
		err := pool.QueryRow(context.Background(),
			`select id, name, password_hash from operators where email = $1`,
			req.Email).Scan(&operatorID, &name, &hashedPassword)
		if err != nil {
			return fiber.ErrUnauthorized
		}

		// Verify password
		if err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(req.Password)); err != nil {
			return fiber.ErrUnauthorized
		}

		// Generate tokens
		accessToken, err := middleware.GenerateOperatorToken(cfg.JWTSecret, operatorID)
		if err != nil {
			return fiber.ErrInternalServerError
		}

		refreshToken, err := middleware.GenerateOperatorRefreshToken(cfg.JWTSecret, operatorID)
		if err != nil {
			return fiber.ErrInternalServerError
		}

		return c.JSON(fiber.Map{
			"token":         accessToken,
			"refresh_token": refreshToken,
			"operator":      fiber.Map{"id": operatorID, "email": req.Email, "name": name},
		})
	})

	// Operator registration endpoint (no CSRF protection)
	api.Post("/auth/operators/register", middleware.AuthRateLimit(), func(c *fiber.Ctx) error {
		var req struct {
			Token    string `json:"token"`
			Email    string `json:"email"`
			Password string `json:"password"`
			Name     string `json:"name"`
		}
		if err := c.BodyParser(&req); err != nil {
			return fiber.ErrBadRequest
		}

		req.Token = middleware.SanitizeString(req.Token)
		req.Email = middleware.SanitizeString(req.Email)
		req.Name = middleware.SanitizeString(req.Name)

		if !middleware.ValidateEmail(req.Email) || !middleware.ValidatePassword(req.Password) || req.Name == "" {
			return c.Status(400).JSON(fiber.Map{"error": "Invalid input"})
		}

		// Validate invite token
		var inviteEmail string
		var expiresAt time.Time
		err := pool.QueryRow(context.Background(),
			`select email, expires_at from operator_invites where token = $1 and used_at is null`,
			req.Token).Scan(&inviteEmail, &expiresAt)
		if err != nil {
			return c.Status(400).JSON(fiber.Map{"error": "Invalid or expired token"})
		}

		if time.Now().After(expiresAt) {
			return c.Status(400).JSON(fiber.Map{"error": "Token expired"})
		}

		if inviteEmail != req.Email {
			return c.Status(400).JSON(fiber.Map{"error": "Email mismatch"})
		}

		// Hash password
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			return fiber.ErrInternalServerError
		}

		// Create operator
		var operatorID string
		err = pool.QueryRow(context.Background(),
			`insert into operators (email, password_hash, name) values ($1, $2, $3) returning id`,
			req.Email, string(hashedPassword), req.Name).Scan(&operatorID)
		if err != nil {
			return fiber.ErrInternalServerError
		}

		// Mark invite as used
		_, _ = pool.Exec(context.Background(),
			`update operator_invites set used_at = now() where token = $1`, req.Token)

		// Generate tokens
		accessToken, err := middleware.GenerateOperatorToken(cfg.JWTSecret, operatorID)
		if err != nil {
			return fiber.ErrInternalServerError
		}

		refreshToken, err := middleware.GenerateOperatorRefreshToken(cfg.JWTSecret, operatorID)
		if err != nil {
			return fiber.ErrInternalServerError
		}

		return c.JSON(fiber.Map{
			"token":         accessToken,
			"refresh_token": refreshToken,
			"operator":      fiber.Map{"id": operatorID, "email": req.Email, "name": req.Name},
		})
	})
}
