// Additive-only: records what the feedback step decided/did for a job.
export function ensurePlanDeltaColumn(db) {
  const cols = new Set(db.prepare("PRAGMA table_info(jobs)").all().map((c) => c.name));
  if (!cols.has("plan_delta")) {
    db.exec("ALTER TABLE jobs ADD COLUMN plan_delta TEXT");
  }
}
