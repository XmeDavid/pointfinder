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
	return len(password) >= 8 && len(password) <= MaxPasswordLength
}

func ValidateName(name string) bool {
	name = strings.TrimSpace(name)
	return len(name) > 0 && len(name) <= MaxNameLength
}

func ValidateDescription(desc string) bool {
	return len(desc) <= MaxDescriptionLength
}

func ValidateCoordinates(lat, lng float64) bool {
	return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

func ValidateAccuracy(accuracy float64) bool {
	return accuracy >= 0 && accuracy <= 10000 // 10km max accuracy
}

func ValidateScore(score int) bool {
	return score >= 0 && score <= 1000000 // Max reasonable score
}

func ValidateDeviceID(deviceID string) bool {
	deviceID = strings.TrimSpace(deviceID)
	return len(deviceID) > 0 && len(deviceID) <= MaxDeviceIDLength
}

func ValidateInviteCode(code string) bool {
	code = strings.TrimSpace(code)
	return len(code) >= 4 && len(code) <= MaxInviteCodeLength
}

func ValidateUUID(uuid string) bool {
	return uuidRegex.MatchString(uuid)
}

// Field-specific length limits
const (
	MaxNameLength        = 100
	MaxEmailLength       = 254
	MaxPasswordLength    = 128
	MaxDescriptionLength = 1000
	MaxAnswerLength      = 500
	MaxMessageLength     = 2000
	MaxDeviceIDLength    = 100
	MaxInviteCodeLength  = 20
)

func SanitizeString(input string) string {
	return SanitizeStringWithLimit(input, 1000)
}

func SanitizeStringWithLimit(input string, maxLength int) string {
	// Remove null bytes and control characters
	sanitized := strings.ReplaceAll(input, "\x00", "")
	// Remove other dangerous characters
	sanitized = strings.ReplaceAll(sanitized, "\r\n", "\n")
	sanitized = strings.ReplaceAll(sanitized, "\r", "\n")
	// Trim whitespace
	sanitized = strings.TrimSpace(sanitized)
	// Limit length to prevent DoS
	if len(sanitized) > maxLength {
		sanitized = sanitized[:maxLength]
	}
	return sanitized
}

func ValidateLoginRequest() fiber.Handler {
	return ValidateJSONRequest(1024) // 1KB limit for login requests
}

func ValidateCreateRequest() fiber.Handler {
	return func(c *fiber.Ctx) error {
		contentType := c.Get("Content-Type")
		if !strings.Contains(contentType, "application/json") {
			return c.Status(400).JSON(fiber.Map{
				"error":   "validation_failed",
				"message": "Content-Type must be application/json",
			})
		}
		
		body := c.Body()
		if len(body) > 10*1024*1024 { // 10MB limit for create requests
			return c.Status(413).JSON(fiber.Map{
				"error":   "request_too_large",
				"message": "Request body exceeds maximum size limit",
			})
		}
		
		return c.Next()
	}
}

func ValidateJSONRequest(maxSize int) fiber.Handler {
	return func(c *fiber.Ctx) error {
		contentType := c.Get("Content-Type")
		if !strings.Contains(contentType, "application/json") {
			return c.Status(400).JSON(fiber.Map{
				"error":   "validation_failed",
				"message": "Content-Type must be application/json",
			})
		}
		
		body := c.Body()
		if len(body) > maxSize {
			return c.Status(413).JSON(fiber.Map{
				"error":   "request_too_large",
				"message": "Request body exceeds maximum size limit",
			})
		}
		
		return c.Next()
	}
}