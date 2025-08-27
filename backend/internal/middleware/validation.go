package middleware

import (
	"regexp"
	"strings"

	"github.com/gofiber/fiber/v2"
)

var (
	emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)
	uuidRegex  = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
)

func ValidateEmail(email string) bool {
	return emailRegex.MatchString(email) && len(email) <= 254
}

func ValidatePassword(password string) bool {
	return len(password) >= 8 && len(password) <= 128
}

func ValidateUUID(uuid string) bool {
	return uuidRegex.MatchString(uuid)
}

func SanitizeString(input string) string {
	// Remove null bytes and control characters
	sanitized := strings.ReplaceAll(input, "\x00", "")
	// Trim whitespace
	sanitized = strings.TrimSpace(sanitized)
	// Limit length to prevent DoS
	if len(sanitized) > 1000 {
		sanitized = sanitized[:1000]
	}
	return sanitized
}

func ValidateLoginRequest() fiber.Handler {
	return func(c *fiber.Ctx) error {
		contentType := c.Get("Content-Type")
		if !strings.Contains(contentType, "application/json") {
			return c.Status(400).JSON(fiber.Map{"error": "Content-Type must be application/json"})
		}
		
		body := c.Body()
		if len(body) > 1024 { // 1KB limit for login requests
			return c.Status(413).JSON(fiber.Map{"error": "Request body too large"})
		}
		
		return c.Next()
	}
}

func ValidateCreateRequest() fiber.Handler {
	return func(c *fiber.Ctx) error {
		contentType := c.Get("Content-Type")
		if !strings.Contains(contentType, "application/json") {
			return c.Status(400).JSON(fiber.Map{"error": "Content-Type must be application/json"})
		}
		
		body := c.Body()
		if len(body) > 10*1024*1024 { // 10MB limit for create requests
			return c.Status(413).JSON(fiber.Map{"error": "Request body too large"})
		}
		
		return c.Next()
	}
}