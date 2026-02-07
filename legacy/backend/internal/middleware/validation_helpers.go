package middleware

import (
	"context"
	"fmt"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ValidateTeamLeadership validates that the device ID belongs to the team leader
func ValidateTeamLeadership(pool *pgxpool.Pool, teamID, deviceID string) error {
	var leaderDeviceID string
	err := pool.QueryRow(context.Background(), 
		`select coalesce(leader_device_id, '') from teams where id = $1`, teamID).Scan(&leaderDeviceID)
	if err != nil {
		return fmt.Errorf("failed to fetch team leader: %w", err)
	}
	
	if leaderDeviceID == "" {
		return fmt.Errorf("team has no assigned leader")
	}
	
	if leaderDeviceID != deviceID {
		return fmt.Errorf("only team leader can perform this action")
	}
	
	return nil
}

// RequireTeamLeader middleware ensures only team leaders can access NFC-related endpoints
func RequireTeamLeader(pool *pgxpool.Pool, cfg JWTConfig) fiber.Handler {
	return func(c *fiber.Ctx) error {
		// First, validate team authentication
		teamAuthHandler := RequireTeam(cfg)
		if err := teamAuthHandler(c); err != nil {
			return err
		}
		
		// Get team and device info from locals (set by RequireTeam)
		teamID, ok := c.Locals("teamID").(string)
		if !ok || teamID == "" {
			return c.Status(401).JSON(fiber.Map{
				"error":   "invalid_team_id",
				"message": "Team ID not found in token",
			})
		}
		
		deviceID, ok := c.Locals("deviceID").(string)
		if !ok || deviceID == "" {
			return c.Status(401).JSON(fiber.Map{
				"error":   "invalid_device_id",
				"message": "Device ID not found in token",
			})
		}
		
		// Validate leadership
		if err := ValidateTeamLeadership(pool, teamID, deviceID); err != nil {
			return c.Status(403).JSON(fiber.Map{
				"error":   "leadership_required",
				"message": "Only team leaders can perform NFC-related actions",
			})
		}
		
		c.Locals("isLeader", true)
		return c.Next()
	}
}

// CheckTeamLeadership is a helper function to check leadership without middleware
func CheckTeamLeadership(c *fiber.Ctx, pool *pgxpool.Pool) error {
	teamID, ok := c.Locals("teamID").(string)
	if !ok || teamID == "" {
		return fmt.Errorf("team ID not available")
	}
	
	deviceID, ok := c.Locals("deviceID").(string)
	if !ok || deviceID == "" {
		return fmt.Errorf("device ID not available")
	}
	
	return ValidateTeamLeadership(pool, teamID, deviceID)
}