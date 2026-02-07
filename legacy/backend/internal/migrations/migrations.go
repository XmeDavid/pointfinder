package migrations

import (
	"context"
	"embed"
	"io/fs"
	"log"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed *.sql
var files embed.FS

func Apply(ctx context.Context, pool *pgxpool.Pool) error {
	entries, err := fs.Glob(files, "*.sql")
	if err != nil {
		return err
	}
	sort.Strings(entries)
	for _, name := range entries {
		content, err := files.ReadFile(name)
		if err != nil {
			return err
		}
		stmts := strings.Split(string(content), ";")
		for _, s := range stmts {
			stmt := strings.TrimSpace(s)
			if stmt == "" {
				continue
			}
			if _, err := pool.Exec(ctx, stmt); err != nil {
				return err
			}
		}
		log.Printf("applied migration: %s", name)
	}
	return nil
}
