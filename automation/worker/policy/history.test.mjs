// automation/worker/policy/history.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { ensureSchema } from "../schema.mjs";
import { recentIssuesByLogins } from "./history.mjs";

function seed(db, { login, title, body, id }) {
  db.prepare(
    `INSERT INTO jobs (id, issue_number, repo, event_type, trigger_login, payload_json, created_at)
     VALUES (?, ?, 'o/r', 'issues.opened', ?, ?, ?)`,
  ).run(id, id, login, JSON.stringify({ title, body }), id);
}

test("recentIssuesByLogins returns only the given logins, parsed", () => {
  const db = new Database(":memory:");
  ensureSchema(db);
  seed(db, { id: 1, login: "aslocka2026", title: "Dup", body: "treść duplikatu" });
  seed(db, { id: 2, login: "someoneelse", title: "Inne", body: "co innego" });
  const rows = recentIssuesByLogins(db, ["aslocka2026"]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].login, "aslocka2026");
  assert.equal(rows[0].title, "Dup");
  assert.equal(rows[0].body, "treść duplikatu");
});

test("excludeId omits the current job", () => {
  const db = new Database(":memory:");
  ensureSchema(db);
  seed(db, { id: 10, login: "aslocka", title: "A", body: "a" });
  seed(db, { id: 11, login: "aslocka", title: "B", body: "b" });
  const rows = recentIssuesByLogins(db, ["aslocka"], { excludeId: 11 });
  assert.deepEqual(rows.map((r) => r.title), ["A"]);
});

test("empty login list returns empty array", () => {
  const db = new Database(":memory:");
  ensureSchema(db);
  assert.deepEqual(recentIssuesByLogins(db, []), []);
});
