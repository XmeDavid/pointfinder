package middleware

import (
	"fmt"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

// RequireTeam middleware for mobile team authentication
func RequireTeam(cfg JWTConfig) fiber.Handler {
	return func(c *fiber.Ctx) error {
		h := c.Get("Authorization")
		if h == "" {
			return c.Status(401).JSON(fiber.Map{
				"error":   "authentication_required",
				"message": "Authorization header is required",
			})
		}
		
		parts := strings.SplitN(h, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			return c.Status(401).JSON(fiber.Map{
				"error":   "invalid_token_format",
				"message": "Authorization must be Bearer token",
			})
		}
		
		token, err := jwt.Parse(parts[1], func(t *jwt.Token) (interface{}, error) {
			// Validate the signing method
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			return []byte(cfg.Secret), nil
		})
		
		if err != nil || !token.Valid {
			return c.Status(401).JSON(fiber.Map{
				"error":   "invalid_token",
				"message": "Token is invalid or expired",
			})
		}
		
		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			return c.Status(401).JSON(fiber.Map{
				"error":   "invalid_token",
				"message": "Token claims are invalid",
			})
		}
		
		// Check role
		role, ok := claims["role"].(string)
		if !ok || role != "team" {
			return c.Status(403).JSON(fiber.Map{
				"error":   "insufficient_permissions",
				"message": "Team access required",
			})
		}
		
		// Check subject exists
		sub, ok := claims["sub"].(string)
		if !ok || sub == "" {
			return c.Status(401).JSON(fiber.Map{
				"error":   "invalid_token",
				"message": "Token subject is invalid",
			})
		}
		
		// Extract device ID
		deviceID, _ := claims["device_id"].(string)
		
		c.Locals("teamID", sub)
		c.Locals("role", "team")
		c.Locals("deviceID", deviceID)
		return c.Next()
	}
}

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

// GenerateOperatorToken issues a token for an operator
func GenerateOperatorToken(secret, operatorID string) (string, error) {
	claims := jwt.MapClaims{
		"sub":  operatorID,
		"role": "operator",
		"exp":  time.Now().Add(24 * time.Hour).Unix(),
		"iat":  time.Now().Unix(),
		"type": "access",
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// GenerateOperatorRefreshToken issues a refresh token for an operator
func GenerateOperatorRefreshToken(secret, operatorID string) (string, error) {
	claims := jwt.MapClaims{
		"sub":  operatorID,
		"role": "operator",
		"exp":  time.Now().Add(7 * 24 * time.Hour).Unix(),
		"iat":  time.Now().Unix(),
		"type": "refresh",
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

func RequireAdmin(cfg JWTConfig) fiber.Handler {
	return func(c *fiber.Ctx) error {
		h := c.Get("Authorization")
		if h == "" {
			return c.Status(401).JSON(fiber.Map{
				"error":   "authentication_required",
				"message": "Authorization header is required",
			})
		}
		
		parts := strings.SplitN(h, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			return c.Status(401).JSON(fiber.Map{
				"error":   "invalid_token_format",
				"message": "Authorization must be Bearer token",
			})
		}
		
		token, err := jwt.Parse(parts[1], func(t *jwt.Token) (interface{}, error) {
			// Validate the signing method
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			return []byte(cfg.Secret), nil
		})
		
		if err != nil || !token.Valid {
			return c.Status(401).JSON(fiber.Map{
				"error":   "invalid_token",
				"message": "Token is invalid or expired",
			})
		}
		
		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok || claims["role"] != "admin" {
			return c.Status(403).JSON(fiber.Map{
				"error":   "insufficient_permissions",
				"message": "Admin access required",
			})
		}
		
		c.Locals("adminID", claims["sub"])
		return c.Next()
	}
}

func RequireAuth(cfg JWTConfig) fiber.Handler {
	return func(c *fiber.Ctx) error {
		h := c.Get("Authorization")
		if h == "" {
			return c.Status(401).JSON(fiber.Map{
				"error":   "authentication_required",
				"message": "Authorization header is required",
			})
		}
		
		parts := strings.SplitN(h, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			return c.Status(401).JSON(fiber.Map{
				"error":   "invalid_token_format",
				"message": "Authorization must be Bearer token",
			})
		}
		
		token, err := jwt.Parse(parts[1], func(t *jwt.Token) (interface{}, error) {
			// Validate the signing method
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			return []byte(cfg.Secret), nil
		})
		
		if err != nil || !token.Valid {
			return c.Status(401).JSON(fiber.Map{
				"error":   "invalid_token",
				"message": "Token is invalid or expired",
			})
		}
		
		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			return c.Status(401).JSON(fiber.Map{
				"error":   "invalid_token",
				"message": "Token claims are invalid",
			})
		}
		
		c.Locals("userID", claims["sub"])
		c.Locals("role", claims["role"])
		if d, ok := claims["device_id"]; ok {
			c.Locals("device_id", d)
		}
		return c.Next()
	}
}

func RequireOperator(cfg JWTConfig) fiber.Handler {
	return func(c *fiber.Ctx) error {
		h := c.Get("Authorization")
		if h == "" {
			return c.Status(401).JSON(fiber.Map{
				"error":   "authentication_required",
				"message": "Authorization header is required",
			})
		}
		
		parts := strings.SplitN(h, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			return c.Status(401).JSON(fiber.Map{
				"error":   "invalid_token_format",
				"message": "Authorization must be Bearer token",
			})
		}
		
		token, err := jwt.Parse(parts[1], func(t *jwt.Token) (interface{}, error) {
			// Validate the signing method
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			return []byte(cfg.Secret), nil
		})
		
		if err != nil || !token.Valid {
			return c.Status(401).JSON(fiber.Map{
				"error":   "invalid_token",
				"message": "Token is invalid or expired",
			})
		}
		
		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			return c.Status(401).JSON(fiber.Map{
				"error":   "invalid_token",
				"message": "Token claims are invalid",
			})
		}
		
		// Check role
		role, ok := claims["role"].(string)
		if !ok || role != "operator" {
			return c.Status(403).JSON(fiber.Map{
				"error":   "insufficient_permissions",
				"message": "Operator access required",
			})
		}
		
		// Check subject exists
		sub, ok := claims["sub"].(string)
		if !ok || sub == "" {
			return c.Status(401).JSON(fiber.Map{
				"error":   "invalid_token",
				"message": "Token subject is invalid",
			})
		}
		
		c.Locals("operatorID", sub)
		return c.Next()
	}
}
