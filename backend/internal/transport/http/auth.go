package http

import (
	"backend/internal/config"
	"backend/internal/middleware"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func RegisterAuth(api fiber.Router, cfg *config.Config) {
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
			"token": accessToken,
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
			"token": accessToken,
			"refresh_token": refreshToken,
			"user": fiber.Map{"id": "admin-1", "email": req.Email, "role": "admin"},
		})
	})

	// Team join endpoint for mobile clients
	api.Post("/auth/team/join", func(c *fiber.Ctx) error {
		var req struct {
			Code     string `json:"code"`
			DeviceId string `json:"deviceId"`
		}
		if err := c.BodyParser(&req); err != nil {
			return fiber.ErrBadRequest
		}
		
		// TODO: Implement proper team join code validation
		// For now, accept any 6-digit code and return mock team data
		if len(req.Code) != 6 {
			return c.Status(400).JSON(fiber.Map{"error": "Invalid join code"})
		}
		
		// Generate team token
		token, err := middleware.GenerateToken(cfg.JWTSecret, "team-"+req.Code)
		if err != nil {
			return fiber.ErrInternalServerError
		}
		
		// Mock team data - TODO: fetch from database
		team := fiber.Map{
			"id": "team-" + req.Code,
			"name": "Team " + req.Code,
			"members": []string{req.DeviceId},
			"leaderDeviceId": req.DeviceId,
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
}
