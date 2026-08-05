import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { ensureSchema } from "../schema.mjs";
import { nextUntriagedJob, triageJob } from "./runner.mjs";

function seed(db, overrides = {}) {
  ensureSchema(db);
  const payload = JSON.stringify({ title: "T", body: "B", issue_url: "https://github.com/o/r/issues/7" });
  db.prepare(`INSERT INTO jobs (issue_number, repo, event_type, trigger_login, payload_json, status, created_at)
              VALUES (?, ?, ?, ?, ?, 'pending', ?)`)
    .run(overrides.issue_number ?? 7, "o/r", "issue.opened", overrides.login ?? "someone", payload, Date.now());
  return db.prepare("SELECT * FROM jobs ORDER BY id DESC LIMIT 1").get();
}

test("nextUntriagedJob returns the oldest pending+untriaged job, null when none", () => {
  const db = new Database(":memory:");
  ensureSchema(db);
  assert.equal(nextUntriagedJob(db), null);
  seed(db);
  const j = nextUntriagedJob(db);
  assert.equal(j.issue_number, 7);
});

test("triageJob on a fitting verdict marks job 'triaged' and stores placement + record id", async () => {
  const db = new Database(":memory:");
  const job = seed(db);
  const verdict = { fits: true, package: "PK1", priority: "P0", order: 1, module: "DevOps", confidence: 0.9, rationale: "PK1." };
  const deps = {
    planDigest: "### PK1\n- x",
    evaluate: async () => verdict,
    writeBase: () => "recABC",
    writeGithub: () => {},
    now: () => 111,
  };
  await triageJob(db, job, deps);
  const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(job.id);
  assert.equal(row.triage_status, "triaged");
  assert.equal(row.triage_package, "PK1");
  assert.equal(row.triage_priority, "P0");
  assert.equal(row.triage_order, 1);
  assert.equal(row.triage_base_record_id, "recABC");
});

test("triageJob on a backlog verdict marks job 'backlog'", async () => {
  const db = new Database(":memory:");
  const job = seed(db);
  const verdict = { fits: false, package: null, priority: null, order: null, module: null, confidence: 0.5, rationale: "Poza planem." };
  await triageJob(db, job, { planDigest: "x", evaluate: async () => verdict, writeBase: () => "recBL", writeGithub: () => {}, now: () => 1 });
  assert.equal(db.prepare("SELECT triage_status FROM jobs WHERE id = ?").get(job.id).triage_status, "backlog");
});

test("triageJob still marks the job even if GitHub write throws (Base + status must persist)", async () => {
  const db = new Database(":memory:");
  const job = seed(db);
  const verdict = { fits: true, package: "PK2", priority: "P1", order: 2, module: "Gabinet", confidence: 0.8, rationale: "PK2." };
  let ghCalled = false;
  await triageJob(db, job, {
    planDigest: "x", evaluate: async () => verdict, writeBase: () => "recX",
    writeGithub: () => { ghCalled = true; throw new Error("gh down"); }, now: () => 1,
  });
  assert.ok(ghCalled);
  assert.equal(db.prepare("SELECT triage_status FROM jobs WHERE id = ?").get(job.id).triage_status, "triaged");
});
