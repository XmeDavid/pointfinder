package http

import (
	"backend/internal/config"
	"backend/internal/middleware"
	"context"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
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
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := c.BodyParser(&req); err != nil {
			return fiber.ErrBadRequest
		}

		// Sanitize input
		req.Username = middleware.SanitizeString(req.Username)
		req.Password = middleware.SanitizeString(req.Password)

		// Validate input format
		if !middleware.ValidateEmail(req.Username) || !middleware.ValidatePassword(req.Password) {
			return fiber.ErrUnauthorized
		}

		// Validate credentials from environment variables
		if req.Username != cfg.AdminEmail || req.Password != cfg.AdminPassword {
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
	api.Post("/auth/team/join", func(c *fiber.Ctx) error {
		var req struct {
			Code     string `json:"code"`
			DeviceId string `json:"deviceId"`
		}
		if err := c.BodyParser(&req); err != nil {
			return fiber.ErrBadRequest
		}

		req.Code = middleware.SanitizeString(req.Code)
		req.DeviceId = middleware.SanitizeString(req.DeviceId)
		if req.Code == "" || req.DeviceId == "" {
			return c.Status(400).JSON(fiber.Map{"error": "Missing code or deviceId"})
		}

		// Lookup team by invite_code
		var teamID, teamName, leaderDeviceID string
		err := pool.QueryRow(context.Background(), `select id::text, name, coalesce(leader_device_id,'') from teams where invite_code = $1`, req.Code).Scan(&teamID, &teamName, &leaderDeviceID)
		if err != nil {
			return c.Status(404).JSON(fiber.Map{"error": "Invalid invite code"})
		}

		// Set leader if not set
		if leaderDeviceID == "" {
			_, _ = pool.Exec(context.Background(), `update teams set leader_device_id = $1 where id = $2`, req.DeviceId, teamID)
			leaderDeviceID = req.DeviceId
		}

		// Add member device to team's members JSON array if not already present
		_, _ = pool.Exec(context.Background(), `update teams set members = case when not members ? $1 then jsonb_set(members, '{-1}', to_jsonb($1::text), true) else members end where id = $2`, req.DeviceId, teamID)

		// Issue team-scoped token with device_id claim
		token, err := middleware.GenerateTeamToken(cfg.JWTSecret, teamID, req.DeviceId)
		if err != nil {
			return fiber.ErrInternalServerError
		}

		team := fiber.Map{
			"id":             teamID,
			"name":           teamName,
			"members":        []string{req.DeviceId},
			"leaderDeviceId": leaderDeviceID,
		}
		return c.JSON(fiber.Map{"token": token, "team": team})
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
}
