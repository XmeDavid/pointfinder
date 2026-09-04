//! Local SQLite schema. The JS side talks to it through the official sql plugin;
//! migrations live here so the schema is versioned with the binary.
use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "initial",
        sql: "
            -- Pending player actions (check-ins, submissions) waiting for the server.
            CREATE TABLE IF NOT EXISTS queue (
                id TEXT PRIMARY KEY,
                game_id TEXT NOT NULL,
                type TEXT NOT NULL,
                created_at TEXT NOT NULL,
                state TEXT NOT NULL,
                next_attempt_at INTEGER NOT NULL DEFAULT 0,
                payload TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS queue_game ON queue (game_id, state);

            -- Last known server snapshot per game, so the app opens instantly and works offline.
            CREATE TABLE IF NOT EXISTS game_cache (
                game_id TEXT PRIMARY KEY,
                state_version INTEGER NOT NULL DEFAULT 0,
                fetched_at TEXT NOT NULL,
                snapshot TEXT NOT NULL
            );

            -- Small non-secret settings (language, last game, UI flags).
            CREATE TABLE IF NOT EXISTS kv (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        ",
        kind: MigrationKind::Up,
    }]
}
