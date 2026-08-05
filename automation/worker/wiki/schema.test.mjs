import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { ensureSchema } from "../schema.mjs";
import { ensurePlanDeltaColumn } from "./schema.mjs";

test("ensurePlanDeltaColumn adds plan_delta and is idempotent", () => {
  const db = new Database(":memory:");
  ensureSchema(db);
  ensurePlanDeltaColumn(db);
  ensurePlanDeltaColumn(db); // second call must not throw
  const cols = db.prepare("PRAGMA table_info(jobs)").all().map((c) => c.name);
  assert.ok(cols.includes("plan_delta"));
});
