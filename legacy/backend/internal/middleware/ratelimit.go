package middleware

import (
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
)

type RateLimiter struct {
	requests map[string][]time.Time
	mutex    sync.RWMutex
	limit    int
	window   time.Duration
}

func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	rl := &RateLimiter{
		requests: make(map[string][]time.Time),
		limit:    limit,
		window:   window,
	}
	
	// Cleanup goroutine to prevent memory leaks
	go func() {
		ticker := time.NewTicker(window)
		defer ticker.Stop()
		for range ticker.C {
			rl.cleanup()
		}
	}()
	
	return rl
}

func (rl *RateLimiter) cleanup() {
	rl.mutex.Lock()
	defer rl.mutex.Unlock()
	
	cutoff := time.Now().Add(-rl.window)
	for ip, requests := range rl.requests {
		// Filter out expired requests
		validRequests := make([]time.Time, 0, len(requests))
		for _, req := range requests {
			if req.After(cutoff) {
				validRequests = append(validRequests, req)
			}
		}
		
		if len(validRequests) == 0 {
			delete(rl.requests, ip)
		} else {
			rl.requests[ip] = validRequests
		}
	}
}

func (rl *RateLimiter) Allow(ip string) bool {
	rl.mutex.Lock()
	defer rl.mutex.Unlock()
	
	now := time.Now()
	cutoff := now.Add(-rl.window)
	
	// Get existing requests for this IP
	requests, exists := rl.requests[ip]
	if !exists {
		requests = make([]time.Time, 0)
	}
	
	// Filter out expired requests
	validRequests := make([]time.Time, 0, len(requests))
	for _, req := range requests {
		if req.After(cutoff) {
			validRequests = append(validRequests, req)
		}
	}
	
	// Check if under limit
	if len(validRequests) >= rl.limit {
		return false
	}
	
	// Add current request
	validRequests = append(validRequests, now)
	rl.requests[ip] = validRequests
	
	return true
}

// AuthRateLimit creates a rate limiter middleware for auth endpoints
func AuthRateLimit() fiber.Handler {
	// Allow 5 login attempts per minute per IP
	limiter := NewRateLimiter(5, time.Minute)
	
	return func(c *fiber.Ctx) error {
		ip := c.IP()
		
		if !limiter.Allow(ip) {
			return c.Status(429).JSON(fiber.Map{
				"error": "Too many requests. Please try again later.",
			})
		}
		
		return c.Next()
	}
}

// GeneralRateLimit creates a general rate limiter for API endpoints
func GeneralRateLimit() fiber.Handler {
	// Allow 100 requests per minute per IP
	limiter := NewRateLimiter(100, time.Minute)
	
	return func(c *fiber.Ctx) error {
		ip := c.IP()
		
		if !limiter.Allow(ip) {
			return c.Status(429).JSON(fiber.Map{
				"error": "Rate limit exceeded. Please slow down.",
			})
		}
		
		return c.Next()
	}
}