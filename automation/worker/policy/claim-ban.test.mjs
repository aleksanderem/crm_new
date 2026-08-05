import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { ensureSchema } from "../schema.mjs";
import { claimNextPlanned } from "../triage/claim.mjs";

function seedTriaged(db, { id, login }) {
  db.prepare(
    `INSERT INTO jobs (id, issue_number, repo, event_type, trigger_login, payload_json, status, created_at, triage_status, triage_priority, triage_order)
     VALUES (?, ?, 'o/r', 'issues.opened', ?, '{}', 'pending', ?, 'triaged', 'P0', 1)`,
  ).run(id, id, login, id);
}
const opts = (extra) => ({ throttledLogins: [], pausedLogins: [], throttleIntervalMs: 3600000, now: () => 10_000, ...extra });

test("a banned login's triaged job is not claimed", () => {
  const db = new Database(":memory:");
  ensureSchema(db);
  seedTriaged(db, { id: 1, login: "aslocka" });
  const job = claimNextPlanned(db, opts({ bannedLogins: ["aslocka"] }));
  assert.equal(job, null);
});

test("a non-banned login's job is still claimed when others are banned", () => {
  const db = new Database(":memory:");
  ensureSchema(db);
  seedTriaged(db, { id: 1, login: "aslocka" });
  seedTriaged(db, { id: 2, login: "gooddev" });
  const job = claimNextPlanned(db, opts({ bannedLogins: ["aslocka"] }));
  assert.equal(job.trigger_login, "gooddev");
});

test("omitting bannedLogins preserves Phase 1 behavior", () => {
  const db = new Database(":memory:");
  ensureSchema(db);
  seedTriaged(db, { id: 1, login: "anyone" });
  const job = claimNextPlanned(db, opts());
  assert.equal(job.trigger_login, "anyone");
});
