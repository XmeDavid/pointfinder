package db

import (
	"context"
	"fmt"
	"log"
	"time"

	"backend/internal/config"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PaginationParams holds parameters for paginated queries
type PaginationParams struct {
	Page     int `json:"page"`     // 1-based page number
	PageSize int `json:"pageSize"` // Number of items per page
}

// Validate and set defaults for pagination parameters
func (p *PaginationParams) Validate() {
	if p.Page < 1 {
		p.Page = 1
	}
	if p.PageSize < 1 {
		p.PageSize = 20 // Default page size
	}
	if p.PageSize > 100 {
		p.PageSize = 100 // Max page size to prevent abuse
	}
}

// GetOffset calculates the SQL OFFSET value
func (p *PaginationParams) GetOffset() int {
	return (p.Page - 1) * p.PageSize
}

// PaginatedResult holds the result of a paginated query
type PaginatedResult struct {
	Data       interface{} `json:"data"`
	Total      int         `json:"total"`
	Page       int         `json:"page"`
	PageSize   int         `json:"pageSize"`
	TotalPages int         `json:"totalPages"`
	HasNext    bool        `json:"hasNext"`
	HasPrev    bool        `json:"hasPrev"`
}

// NewPaginatedResult creates a paginated result
func NewPaginatedResult(data interface{}, total int, params *PaginationParams) *PaginatedResult {
	params.Validate()
	totalPages := (total + params.PageSize - 1) / params.PageSize // Ceiling division

	return &PaginatedResult{
		Data:       data,
		Total:      total,
		Page:       params.Page,
		PageSize:   params.PageSize,
		TotalPages: totalPages,
		HasNext:    params.Page < totalPages,
		HasPrev:    params.Page > 1,
	}
}

func Connect(cfg *config.Config) (*pgxpool.Pool, error) {
	// Parse the database URL to get a config we can modify
	poolConfig, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse database URL: %w", err)
	}

	// Configure connection pool settings
	poolConfig.MaxConns = 30                          // Maximum connections in pool
	poolConfig.MinConns = 5                           // Minimum connections to maintain
	poolConfig.MaxConnLifetime = time.Hour            // Close connections after 1 hour
	poolConfig.MaxConnIdleTime = time.Minute * 30     // Close idle connections after 30 min
	poolConfig.HealthCheckPeriod = time.Minute * 1    // Health check every minute

	// Configure connection timeouts
	poolConfig.ConnConfig.ConnectTimeout = time.Second * 30
	poolConfig.ConnConfig.CommandTimeout = time.Second * 60

	// Configure logging level (only errors in production)
	poolConfig.ConnConfig.LogLevel = pgx.LogLevelError

	// Create the pool with our configuration
	pool, err := pgxpool.NewWithConfig(context.Background(), poolConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create connection pool: %w", err)
	}

	// Test the connection with timeout
	ctx, cancel := context.WithTimeout(context.Background(), time.Second*10)
	defer cancel()

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	// Log successful connection
	stats := pool.Stat()
	log.Printf("Database connection pool established - Max: %d, Current: %d", stats.MaxConns(), stats.TotalConns())

	return pool, nil
}

// QueryWithTimeout executes a query with a default timeout
func QueryWithTimeout(ctx context.Context, pool *pgxpool.Pool, query string, args ...interface{}) (pgx.Rows, error) {
	ctx, cancel := context.WithTimeout(ctx, time.Second*30)
	defer cancel()
	return pool.Query(ctx, query, args...)
}

// QueryRowWithTimeout executes a single-row query with a default timeout
func QueryRowWithTimeout(ctx context.Context, pool *pgxpool.Pool, query string, args ...interface{}) pgx.Row {
	ctx, cancel := context.WithTimeout(ctx, time.Second*30)
	defer cancel()
	return pool.QueryRow(ctx, query, args...)
}

// ExecWithTimeout executes a query with a default timeout
func ExecWithTimeout(ctx context.Context, pool *pgxpool.Pool, query string, args ...interface{}) (pgx.CommandTag, error) {
	ctx, cancel := context.WithTimeout(ctx, time.Second*30)
	defer cancel()
	return pool.Exec(ctx, query, args...)
}

// WithTransaction runs a function within a database transaction
func WithTransaction(ctx context.Context, pool *pgxpool.Pool, fn func(pgx.Tx) error) error {
	ctx, cancel := context.WithTimeout(ctx, time.Minute*5)
	defer cancel()

	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}

	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback(ctx)
			panic(p)
		}
	}()

	if err := fn(tx); err != nil {
		if rbErr := tx.Rollback(ctx); rbErr != nil {
			log.Printf("failed to rollback transaction: %v", rbErr)
		}
		return fmt.Errorf("transaction failed: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

// HealthCheck performs a comprehensive database health check
func HealthCheck(ctx context.Context, pool *pgxpool.Pool) error {
	ctx, cancel := context.WithTimeout(ctx, time.Second*5)
	defer cancel()

	// Test basic connectivity
	if err := pool.Ping(ctx); err != nil {
		return fmt.Errorf("ping failed: %w", err)
	}

	// Test query execution
	var result int
	if err := pool.QueryRow(ctx, "SELECT 1").Scan(&result); err != nil {
		return fmt.Errorf("test query failed: %w", err)
	}

	if result != 1 {
		return fmt.Errorf("unexpected test query result: %d", result)
	}

	return nil
}
