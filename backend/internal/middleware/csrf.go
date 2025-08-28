package middleware

import (
	"crypto/rand"
	"encoding/hex"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
)

type CSRFStore struct {
	tokens map[string]time.Time
	mutex  sync.RWMutex
}

func NewCSRFStore() *CSRFStore {
	store := &CSRFStore{
		tokens: make(map[string]time.Time),
	}

	// Cleanup expired tokens every hour
	go func() {
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			store.cleanup()
		}
	}()

	return store
}

func (s *CSRFStore) cleanup() {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	cutoff := time.Now().Add(-24 * time.Hour) // 24 hour expiry
	for token, created := range s.tokens {
		if created.Before(cutoff) {
			delete(s.tokens, token)
		}
	}
}

func (s *CSRFStore) Generate() string {
	bytes := make([]byte, 32)
	rand.Read(bytes)
	token := hex.EncodeToString(bytes)

	s.mutex.Lock()
	s.tokens[token] = time.Now()
	s.mutex.Unlock()

	return token
}

func (s *CSRFStore) Validate(token string) bool {
	if token == "" {
		return false
	}

	s.mutex.RLock()
	created, exists := s.tokens[token]
	s.mutex.RUnlock()

	if !exists {
		return false
	}

	// Check if token is expired (24 hours)
	if time.Since(created) > 24*time.Hour {
		s.mutex.Lock()
		delete(s.tokens, token)
		s.mutex.Unlock()
		return false
	}

	return true
}

var csrfStore = NewCSRFStore()

// CSRF provides CSRF protection middleware
func CSRF() fiber.Handler {
	return func(c *fiber.Ctx) error {
		method := strings.ToUpper(c.Method())

		// Skip CSRF for safe methods and auth endpoints
		if method == "GET" || method == "HEAD" || method == "OPTIONS" {
			return c.Next()
		}

		// Skip CSRF for auth endpoints (they use rate limiting instead)
		path := c.Path()
		if strings.Contains(path, "/auth/") {
			return c.Next()
		}

		// Skip CSRF if Bearer token is present (API clients)
		if h := c.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
			return c.Next()
		}

		// Check for CSRF token
		token := c.Get("X-CSRF-Token")
		if token == "" {
			token = c.FormValue("csrf_token")
		}

		if !csrfStore.Validate(token) {
			return c.Status(403).JSON(fiber.Map{
				"error": "Invalid CSRF token",
			})
		}

		return c.Next()
	}
}

// CSRFToken endpoint to get a new CSRF token
func CSRFToken() fiber.Handler {
	return func(c *fiber.Ctx) error {
		token := csrfStore.Generate()
		return c.JSON(fiber.Map{
			"csrf_token": token,
		})
	}
}
