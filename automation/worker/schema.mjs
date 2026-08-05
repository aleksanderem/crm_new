// Shared jobs-table schema. Both the webhook (ingest) and the worker/triage
// (consume) call ensureSchema so the columns exist regardless of which process
// touches a fresh or already-migrated database first. Additive-only: never drops.
const BASE_TABLE = `
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_number INTEGER NOT NULL,
    repo TEXT NOT NULL,
    event_type TEXT NOT NULL,
    trigger_login TEXT,
    trigger_comment_id INTEGER,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    finished_at INTEGER,
    result TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_status_created ON jobs(status, created_at);
`;

// name -> column definition appended via ALTER TABLE when missing.
const TRIAGE_COLUMNS = {
  triage_status: "TEXT DEFAULT 'untriaged'",
  triage_package: "TEXT",
  triage_priority: "TEXT",
  triage_order: "INTEGER",
  triage_confidence: "REAL",
  triage_rationale: "TEXT",
  triage_base_record_id: "TEXT",
};

export function ensureSchema(db) {
  db.exec(BASE_TABLE);
  const existing = new Set(
    db.prepare("PRAGMA table_info(jobs)").all().map((c) => c.name),
  );
  for (const [name, def] of Object.entries(TRIAGE_COLUMNS)) {
    if (!existing.has(name)) {
      db.exec(`ALTER TABLE jobs ADD COLUMN ${name} ${def}`);
    }
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_triage_status ON jobs(triage_status)");
}
