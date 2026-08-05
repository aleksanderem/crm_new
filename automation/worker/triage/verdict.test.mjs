import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVerdict, priorityRank, PACKAGES } from "./verdict.mjs";

const OK = {
  fits: true, package: "PK1", priority: "P0", order: 3,
  module: "DevOps", confidence: 0.9, rationale: "Dotyczy zielonej bramki CI.",
};

test("parseVerdict accepts a valid object verdict", () => {
  const v = parseVerdict(OK);
  assert.equal(v.package, "PK1");
  assert.equal(v.priority, "P0");
  assert.equal(v.order, 3);
  assert.equal(v.fits, true);
});

test("parseVerdict accepts a JSON string and coerces types", () => {
  const v = parseVerdict(JSON.stringify({ ...OK, order: "3", confidence: "0.5" }));
  assert.equal(v.order, 3);
  assert.equal(v.confidence, 0.5);
});

test("parseVerdict normalizes a backlog verdict (fits=false -> null package/priority)", () => {
  const v = parseVerdict({ fits: false, package: "PK3", priority: "P1", order: 2, module: null, confidence: 0.4, rationale: "Poza planem." });
  assert.equal(v.fits, false);
  assert.equal(v.package, null);
  assert.equal(v.priority, null);
  assert.equal(v.order, null);
});

test("parseVerdict rejects unknown package", () => {
  assert.throws(() => parseVerdict({ ...OK, package: "PK99" }), /package/i);
});

test("parseVerdict rejects non-JSON string", () => {
  assert.throws(() => parseVerdict("not json"), /JSON/i);
});

test("priorityRank maps priorities and backlog", () => {
  assert.equal(priorityRank("P0"), 0);
  assert.equal(priorityRank("P1"), 1);
  assert.equal(priorityRank("P2"), 2);
  assert.equal(priorityRank(null), 9);
});

test("PACKAGES lists PK1..PK9", () => {
  assert.deepEqual(PACKAGES, ["PK1","PK2","PK3","PK4","PK5","PK6","PK7","PK8","PK9"]);
});
