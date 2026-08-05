import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { ensureSchema } from "../schema.mjs";

function columns(db) {
  return db.prepare("PRAGMA table_info(jobs)").all().map((c) => c.name);
}

test("ensureSchema creates jobs table with base + triage columns on a fresh db", () => {
  const db = new Database(":memory:");
  ensureSchema(db);
  const cols = columns(db);
  for (const c of ["id", "issue_number", "repo", "trigger_login", "status", "created_at",
                   "triage_status", "triage_package", "triage_priority", "triage_order",
                   "triage_confidence", "triage_rationale", "triage_base_record_id"]) {
    assert.ok(cols.includes(c), `missing column ${c}`);
  }
});

test("ensureSchema adds triage columns to a pre-existing jobs table (migration)", () => {
  const db = new Database(":memory:");
  // simulate the OLD schema (pre-triage) exactly as webhook.mjs created it
  db.exec(`CREATE TABLE jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, issue_number INTEGER NOT NULL, repo TEXT NOT NULL,
    event_type TEXT NOT NULL, trigger_login TEXT, trigger_comment_id INTEGER,
    payload_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL, started_at INTEGER, finished_at INTEGER, result TEXT);`);
  ensureSchema(db);
  const cols = columns(db);
  assert.ok(cols.includes("triage_status"));
  assert.equal(db.prepare("PRAGMA table_info(jobs)").all().find((c) => c.name === "triage_status").dflt_value, "'untriaged'");
});

test("ensureSchema is idempotent (second call does not throw)", () => {
  const db = new Database(":memory:");
  ensureSchema(db);
  ensureSchema(db);
  assert.ok(columns(db).includes("triage_package"));
});
