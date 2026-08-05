import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { ensureSchema } from "../schema.mjs";
import { claimNextPlanned } from "./claim.mjs";

function add(db, { n, login = "u", tstatus = "triaged", prio = null, ord = null, created }) {
  db.prepare(`INSERT INTO jobs (issue_number, repo, event_type, trigger_login, payload_json, status, created_at, triage_status, triage_priority, triage_order)
              VALUES (?, 'o/r', 'issue.opened', ?, '{}', 'pending', ?, ?, ?, ?)`)
    .run(n, login, created, tstatus, prio, ord);
}
const DEPS = { throttledLogins: [], pausedLogins: [], throttleIntervalMs: 3600000, now: () => 10_000_000 };

test("claimNextPlanned skips untriaged jobs entirely", () => {
  const db = new Database(":memory:"); ensureSchema(db);
  add(db, { n: 1, tstatus: "untriaged", created: 1 });
  assert.equal(claimNextPlanned(db, DEPS), null);
});

test("claimNextPlanned orders by priority then order, backlog last", () => {
  const db = new Database(":memory:"); ensureSchema(db);
  add(db, { n: 1, tstatus: "backlog", prio: null, ord: null, created: 1 });   // rank 9
  add(db, { n: 2, tstatus: "triaged", prio: "P1", ord: 5, created: 2 });       // rank 1
  add(db, { n: 3, tstatus: "triaged", prio: "P0", ord: 9, created: 3 });       // rank 0
  add(db, { n: 4, tstatus: "triaged", prio: "P0", ord: 2, created: 4 });       // rank 0, lower order
  const first = claimNextPlanned(db, DEPS);
  assert.equal(first.issue_number, 4); // P0 + kol 2 wins over P0 + kol 9
  assert.equal(first.status, "running");
});

test("claimNextPlanned falls back to created_at when priority+order tie", () => {
  const db = new Database(":memory:"); ensureSchema(db);
  add(db, { n: 10, tstatus: "triaged", prio: "P0", ord: 1, created: 200 });
  add(db, { n: 11, tstatus: "triaged", prio: "P0", ord: 1, created: 100 });
  assert.equal(claimNextPlanned(db, DEPS).issue_number, 11);
});

test("claimNextPlanned respects the throttle for listed logins", () => {
  const db = new Database(":memory:"); ensureSchema(db);
  add(db, { n: 20, login: "slow", tstatus: "triaged", prio: "P0", ord: 1, created: 1 });
  // a recent finished job from same login within the window
  db.prepare(`INSERT INTO jobs (issue_number, repo, event_type, trigger_login, payload_json, status, created_at, finished_at, triage_status)
              VALUES (21,'o/r','x','slow','{}','done', 1, 9_990_000, 'triaged')`).run();
  const deps = { throttledLogins: ["slow"], pausedLogins: [], throttleIntervalMs: 3600000, now: () => 10_000_000 };
  assert.equal(claimNextPlanned(db, deps), null); // throttled: within cooldown
});

test("claimNextPlanned never returns a paused login's job", () => {
  const db = new Database(":memory:"); ensureSchema(db);
  add(db, { n: 30, login: "banned", tstatus: "triaged", prio: "P0", ord: 1, created: 1 });
  const deps = { throttledLogins: [], pausedLogins: ["banned"], throttleIntervalMs: 3600000, now: () => 10_000_000 };
  assert.equal(claimNextPlanned(db, deps), null);
});
