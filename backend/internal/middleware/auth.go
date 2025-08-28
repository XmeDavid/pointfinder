package middleware

import (
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

type JWTConfig struct {
	Secret string
}

func GenerateToken(secret, adminID string) (string, error) {
	claims := jwt.MapClaims{
		"sub":  adminID,
		"role": "admin",
		"exp":  time.Now().Add(15 * time.Minute).Unix(), // Shortened to 15 minutes
		"iat":  time.Now().Unix(),
		"type": "access",
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

func GenerateRefreshToken(secret, adminID string) (string, error) {
	claims := jwt.MapClaims{
		"sub":  adminID,
		"role": "admin",
		"exp":  time.Now().Add(7 * 24 * time.Hour).Unix(), // 7 days
		"iat":  time.Now().Unix(),
		"type": "refresh",
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// GenerateTeamToken issues a short-lived access token for a team member device
func GenerateTeamToken(secret, teamID, deviceID string) (string, error) {
	claims := jwt.MapClaims{
		"sub":       teamID,
		"role":      "team",
		"device_id": deviceID,
		"exp":       time.Now().Add(60 * time.Minute).Unix(),
		"iat":       time.Now().Unix(),
		"type":      "access",
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

func RequireAdmin(cfg JWTConfig) fiber.Handler {
	return func(c *fiber.Ctx) error {
		h := c.Get("Authorization")
		if h == "" {
			return fiber.ErrUnauthorized
		}
		parts := strings.SplitN(h, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			return fiber.ErrUnauthorized
		}
		token, err := jwt.Parse(parts[1], func(t *jwt.Token) (interface{}, error) {
			return []byte(cfg.Secret), nil
		})
		if err != nil || !token.Valid {
			return fiber.ErrUnauthorized
		}
		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok || claims["role"] != "admin" {
			return fiber.ErrUnauthorized
		}
		c.Locals("adminID", claims["sub"])
		return c.Next()
	}
}

func RequireAuth(cfg JWTConfig) fiber.Handler {
	return func(c *fiber.Ctx) error {
		h := c.Get("Authorization")
		if h == "" {
			return fiber.ErrUnauthorized
		}
		parts := strings.SplitN(h, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			return fiber.ErrUnauthorized
		}
		token, err := jwt.Parse(parts[1], func(t *jwt.Token) (interface{}, error) {
			return []byte(cfg.Secret), nil
		})
		if err != nil || !token.Valid {
			return fiber.ErrUnauthorized
		}
		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			return fiber.ErrUnauthorized
		}
		c.Locals("userID", claims["sub"])
		c.Locals("role", claims["role"])
		if d, ok := claims["device_id"]; ok {
			c.Locals("device_id", d)
		}
		return c.Next()
	}
}
