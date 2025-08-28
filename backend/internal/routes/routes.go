package routes

import (
	"backend/internal/config"
	"backend/internal/middleware"
	"backend/internal/transport/http"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

func Register(app *fiber.App, cfg *config.Config, pool *pgxpool.Pool) {
	api := app.Group("/api")

	// CSRF token endpoint
	api.Get("/csrf-token", middleware.CSRFToken())

	// Apply CSRF protection to all endpoints except auth
	api.Use(middleware.CSRF())

	http.RegisterAuth(api, pool, cfg)
	http.RegisterOperators(api, pool, cfg)
	http.RegisterGames(api, pool, cfg)
	http.RegisterTeams(api, pool, cfg)
	http.RegisterProgress(api, pool, cfg)
	http.RegisterTeamProgress(api, pool, cfg) // Team progress for mobile clients
	http.RegisterTeamGame(api, pool, cfg)     // Team game state and enigma solving
	http.RegisterMonitoring(api, pool, cfg)   // Real-time monitoring for operators
	http.RegisterEvents(api, pool, cfg)
}
