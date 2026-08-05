// automation/worker/policy/integration.test.mjs
// Exercises the worker's decision path (pre-gate → rejected → unclaimable)
// without importing worker.mjs (which starts the daemon on import).
import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { ensureSchema } from "../schema.mjs";
import { ensureStrikeSchema, listBannedLogins } from "./strikes.mjs";
import { relatedLoginsOf } from "./detect.mjs";
import { recentIssuesByLogins } from "./history.mjs";
import { evaluatePolicyPre } from "./engine.mjs";
import { issueFromJob } from "../triage/runner.mjs";
import { claimNextPlanned } from "../triage/claim.mjs";

function insertJob(db, { id, login, title, body, triage = "untriaged" }) {
  db.prepare(
    `INSERT INTO jobs (id, issue_number, repo, event_type, trigger_login, payload_json, status, created_at, triage_status, triage_priority, triage_order)
     VALUES (?, ?, 'aleksanderem/crm_new', 'issues.opened', ?, ?, 'pending', ?, ?, 'P0', 1)`,
  ).run(id, id, login, JSON.stringify({ title, body }), id, triage);
}

test("a duplicate from a related account is pre-gate blocked, marked rejected, and never claimed", () => {
  const db = new Database(":memory:");
  ensureSchema(db);
  ensureStrikeSchema(db);

  insertJob(db, { id: 1, login: "aslocka2026", title: "Kalendarz gubi terminy", body: "przy zmianie strefy czasowej znikają wizyty", triage: "triaged" });
  insertJob(db, { id: 2, login: "aslocka", title: "Kalendarz gubi terminy", body: "przy zmianie strefy czasowej znikają wizyty" });

  const job = db.prepare("SELECT * FROM jobs WHERE id = 2").get();
  const issue = issueFromJob(job);
  const pre = evaluatePolicyPre(db, issue, {
    priorIssues: recentIssuesByLogins(db, relatedLoginsOf(issue.login), { excludeId: job.id }),
    now: () => 5000,
  });
  assert.equal(pre.blocked, true);
  assert.deepEqual(pre.flags, ["multi-account"]);

  db.prepare("UPDATE jobs SET triage_status='rejected' WHERE id = ?").run(job.id);

  const claimed = claimNextPlanned(db, {
    throttledLogins: [], pausedLogins: [],
    bannedLogins: listBannedLogins(db),
    throttleIntervalMs: 3600000, now: () => 100000,
  });
  assert.notEqual(claimed?.id, 2);
});
