// A D1-shaped adapter over node:sqlite so the tests exercise the real
// schema.sql and the real SQL statements without Cloudflare. Implements the
// subset the Worker uses: prepare().bind().first()/run()/all() and batch().

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SCHEMA = readFileSync(fileURLToPath(new URL('../schema.sql', import.meta.url)), 'utf8');

// node:sqlite returns null-prototype rows; D1 returns plain objects.
const plain = (row) => ({ ...row });

class FakeStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.params = [];
  }

  bind(...params) {
    this.params = params;
    return this;
  }

  async first(column) {
    this.db.calls.push(this.sql);
    const raw = this.db.raw.prepare(this.sql).get(...this.params);
    const row = raw ? plain(raw) : null;
    if (column && row) return row[column];
    return row;
  }

  async all() {
    this.db.calls.push(this.sql);
    return { results: this.db.raw.prepare(this.sql).all(...this.params).map(plain), success: true };
  }

  async run() {
    this.db.calls.push(this.sql);
    const info = this.db.raw.prepare(this.sql).run(...this.params);
    return { success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
  }
}

export class FakeD1 {
  constructor() {
    this.raw = new DatabaseSync(':memory:');
    this.raw.exec(SCHEMA);
    this.calls = [];
    this.batches = 0;
    this.failNextBatch = false;
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }

  async batch(statements) {
    this.batches += 1;
    if (this.failNextBatch) {
      this.failNextBatch = false;
      throw new Error('simulated D1 batch failure');
    }
    this.raw.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.raw.exec('COMMIT');
      return results;
    } catch (error) {
      this.raw.exec('ROLLBACK');
      throw error;
    }
  }

  // Test helpers (not part of the D1 surface).
  rows(sql, ...params) {
    return this.raw.prepare(sql).all(...params).map(plain);
  }

  row(sql, ...params) {
    const raw = this.raw.prepare(sql).get(...params);
    return raw ? plain(raw) : null;
  }
}
