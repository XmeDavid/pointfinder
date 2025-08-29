package config

import (
	"errors"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	Port        string
	DatabaseURL string
	JWTSecret   string
	CORSOrigins string
	AdminEmail  string
	AdminPassword string
	SMTPHost    string
	SMTPPort    string
	SMTPUser    string
	SMTPPass    string
}

func Load() (*Config, error) {
	_ = godotenv.Load()
	cfg := &Config{
		Port:        getenv("PORT", "4000"),
		DatabaseURL: os.Getenv("DATABASE_URL"),
		JWTSecret:   os.Getenv("JWT_SECRET"),
		CORSOrigins: getenv("CORS_ORIGINS", "http://localhost:3000"),
		AdminEmail:  os.Getenv("ADMIN_EMAIL"),
		AdminPassword: os.Getenv("ADMIN_PASSWORD"),
		SMTPHost:    getenv("SMTP_HOST", "smtp.gmail.com"),
		SMTPPort:    getenv("SMTP_PORT", "587"),
		SMTPUser:    os.Getenv("SMTP_USER"),
		SMTPPass:    os.Getenv("SMTP_PASS"),
	}
	if cfg.DatabaseURL == "" {
		return nil, errors.New("DATABASE_URL is required")
	}
	if cfg.JWTSecret == "" {
		return nil, errors.New("JWT_SECRET is required")
	}
	if cfg.AdminEmail == "" {
		return nil, errors.New("ADMIN_EMAIL is required")
	}
	if cfg.AdminPassword == "" {
		return nil, errors.New("ADMIN_PASSWORD is required")
	}
	return cfg, nil
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
