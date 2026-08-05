import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import {
  ensureStrikeSchema, getStrike, addStrike, isBanned, listBannedLogins,
  STRIKE_BAN_THRESHOLD,
} from "./strikes.mjs";

function freshDb() {
  const db = new Database(":memory:");
  ensureStrikeSchema(db);
  return db;
}

test("addStrike increments count and accumulates reasons", () => {
  const db = freshDb();
  const r1 = addStrike(db, "aslocka", { reason: "dup", issue: "u1", ts: 100 });
  assert.equal(r1.count, 1);
  assert.equal(r1.banned, false);
  const r2 = addStrike(db, "aslocka", { reason: "dup2", issue: "u2", ts: 200 });
  assert.equal(r2.count, 2);
  const row = getStrike(db, "aslocka");
  assert.equal(row.count, 2);
  assert.equal(row.reasons.length, 2);
  assert.equal(row.reasons[0].reason, "dup");
});

test("login is matched case-insensitively", () => {
  const db = freshDb();
  addStrike(db, "ASlocka", { reason: "x", issue: null, ts: 1 });
  assert.equal(getStrike(db, "aslocka").count, 1);
});

test("reaching the threshold sets banned + banned_at", () => {
  const db = freshDb();
  let res;
  for (let i = 1; i <= STRIKE_BAN_THRESHOLD; i++) {
    res = addStrike(db, "cheater", { reason: `s${i}`, issue: null, ts: i });
  }
  assert.equal(res.count, STRIKE_BAN_THRESHOLD);
  assert.equal(res.banned, true);
  assert.equal(isBanned(db, "cheater"), true);
  assert.equal(getStrike(db, "cheater").banned_at, STRIKE_BAN_THRESHOLD);
  assert.deepEqual(listBannedLogins(db), ["cheater"]);
});

test("below threshold is not banned", () => {
  const db = freshDb();
  addStrike(db, "mild", { reason: "s", issue: null, ts: 1 });
  assert.equal(isBanned(db, "mild"), false);
  assert.deepEqual(listBannedLogins(db), []);
});

test("getStrike returns null for unknown login", () => {
  const db = freshDb();
  assert.equal(getStrike(db, "nobody"), null);
});
