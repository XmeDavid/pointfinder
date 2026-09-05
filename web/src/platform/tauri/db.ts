import Database from '@tauri-apps/plugin-sql'

/** Matches the migration target in src-tauri/src/db.rs. */
export const DB_URL = 'sqlite:pointfinder.db'

let handle: Promise<Database> | null = null

/** One shared connection; the Rust side runs migrations on first load. */
export function db(): Promise<Database> {
  handle ??= Database.load(DB_URL)
  return handle
}
