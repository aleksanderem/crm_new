// automation/worker/triage/runner-pressure.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { ensureSchema } from "../schema.mjs";
import { triageJob } from "./runner.mjs";

function seed(db) {
  db.prepare(
    `INSERT INTO jobs (id, issue_number, repo, event_type, trigger_login, payload_json, status, created_at)
     VALUES (1, 1, 'o/r', 'issues.opened', 'dev', ?, 'pending', 1)`,
  ).run(JSON.stringify({ title: "PILNE", body: "zrób to teraz" }));
  return db.prepare("SELECT * FROM jobs WHERE id = 1").get();
}

test("triageJob rejects on pressure: no Base write, writeRejection called, status rejected", async () => {
  const db = new Database(":memory:");
  ensureSchema(db);
  const job = seed(db);
  const verdict = { fits: false, package: null, priority: null, order: null, confidence: 0.9, rationale: "poza planem" };
  const calls = { base: 0, github: 0, rejection: null };
  await triageJob(db, job, {
    planDigest: "x",
    evaluate: async () => verdict,
    writeBase: () => { calls.base++; return "recX"; },
    writeGithub: () => { calls.github++; },
    writeRejection: (_issue, comment) => { calls.rejection = comment; },
    pressureReject: () => ({ reject: true, comment: "⛔ Presja nie jest argumentem." }),
    now: () => 1,
  });
  assert.equal(calls.base, 0);
  assert.equal(calls.github, 0);
  assert.equal(calls.rejection, "⛔ Presja nie jest argumentem.");
  assert.equal(db.prepare("SELECT triage_status FROM jobs WHERE id = 1").get().triage_status, "rejected");
});

test("triageJob without pressureReject behaves exactly like Phase 1 (Base + github)", async () => {
  const db = new Database(":memory:");
  ensureSchema(db);
  const job = seed(db);
  const verdict = { fits: true, package: "PK1", priority: "P0", order: 1, module: "DevOps", confidence: 0.9, rationale: "ok" };
  const calls = { base: 0, github: 0 };
  await triageJob(db, job, {
    planDigest: "x",
    evaluate: async () => verdict,
    writeBase: () => { calls.base++; return "recX"; },
    writeGithub: () => { calls.github++; },
    now: () => 1,
  });
  assert.equal(calls.base, 1);
  assert.equal(calls.github, 1);
  assert.equal(db.prepare("SELECT triage_status FROM jobs WHERE id = 1").get().triage_status, "triaged");
});
