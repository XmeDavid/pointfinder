package main

import (
	"context"
	"log"
	"os"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/helmet"

	"backend/internal/config"
	"backend/internal/db"
	"backend/internal/middleware"
	"backend/internal/routes"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	pool, err := db.Connect(cfg)
	if err != nil {
		log.Fatalf("failed to connect db: %v", err)
	}
	defer pool.Close()

	if err := db.Migrate(context.Background(), pool); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}

	app := fiber.New(fiber.Config{
		DisableStartupMessage: false,
		ServerHeader:          "dbvnfc-api",
		AppName:               "DBVNFC API v1.0",
	})
	
	// Security middleware
	app.Use(helmet.New())
	app.Use(middleware.GeneralRateLimit())
	app.Use(logger.New())
	
	// CORS configuration
	corsOrigins := strings.Split(cfg.CORSOrigins, ",")
	app.Use(cors.New(cors.Config{
		AllowOrigins: strings.Join(corsOrigins, ","),
		AllowMethods: "GET,POST,HEAD,PUT,DELETE,PATCH,OPTIONS",
		AllowHeaders: "Origin,Content-Type,Accept,Authorization,X-Requested-With",
		AllowCredentials: false, // Changed to false for security
		MaxAge: 86400, // 24 hours
	}))

	routes.Register(app, cfg, pool)

	addr := ":" + cfg.Port
	if envPort := os.Getenv("PORT"); envPort != "" {
		addr = ":" + envPort
	}
	log.Printf("listening on %s", addr)
	if err := app.Listen(addr); err != nil {
		log.Fatal(err)
	}
}
