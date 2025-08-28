package http

import (
	"backend/internal/config"
	"backend/internal/middleware"
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

func RegisterOperators(api fiber.Router, pool *pgxpool.Pool, cfg *config.Config) {
	// Admin-only endpoints for operator management
	adminGrp := api.Group("/admin/operators")
	adminGrp.Use(middleware.RequireAdmin(middleware.JWTConfig{Secret: cfg.JWTSecret}))

	// Create operator invite (admin only)
	adminGrp.Post("/invite", func(c *fiber.Ctx) error {
		var req struct {
			Email string `json:"email"`
			Name  string `json:"name"`
		}
		if err := c.BodyParser(&req); err != nil {
			return fiber.ErrBadRequest
		}

		req.Email = middleware.SanitizeString(req.Email)
		req.Name = middleware.SanitizeString(req.Name)
		
		if !middleware.ValidateEmail(req.Email) || req.Name == "" {
			return c.Status(400).JSON(fiber.Map{"error": "Invalid email or name"})
		}

		// Generate secure token
		tokenBytes := make([]byte, 32)
		rand.Read(tokenBytes)
		token := hex.EncodeToString(tokenBytes)

		// Insert invite
		_, err := pool.Exec(context.Background(),
			`insert into operator_invites (email, token, expires_at) values ($1, $2, $3)`,
			req.Email, token, time.Now().Add(48*time.Hour))
		if err != nil {
			return fiber.ErrInternalServerError
		}

		// Generate invitation link for manual distribution
		inviteLink := fmt.Sprintf("https://dbvnfc-api.davidsbatista.com/register?token=%s", token)
		
		return c.JSON(fiber.Map{
			"message": "Invitation sent",
			"invite_link": inviteLink,
		})
	})

	// List operators (admin only)
	adminGrp.Get("/", func(c *fiber.Ctx) error {
		rows, err := pool.Query(context.Background(),
			`select id, email, name, created_at from operators order by created_at desc`)
		if err != nil {
			return fiber.ErrInternalServerError
		}
		defer rows.Close()

		var operators []fiber.Map
		for rows.Next() {
			var id, email, name string
			var createdAt time.Time
			if err := rows.Scan(&id, &email, &name, &createdAt); err != nil {
				return fiber.ErrInternalServerError
			}
			operators = append(operators, fiber.Map{
				"id": id, "email": email, "name": name, "createdAt": createdAt,
			})
		}
		return c.JSON(operators)
	})

	// Operator registration endpoint (public, token-protected)
	api.Post("/operators/register", func(c *fiber.Ctx) error {
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

	// Operator login endpoint
	api.Post("/operators/login", func(c *fiber.Ctx) error {
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