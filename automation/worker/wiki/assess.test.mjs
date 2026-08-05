import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDeltaPrompt, parsePlanDelta, assessPlanDelta } from "./assess.mjs";

test("buildDeltaPrompt frames the launch goal, the digest, the issue, and demands JSON", () => {
  const p = buildDeltaPrompt({ number: 7, title: "Błąd", body: "kalendarz nie działa", login: "dev" }, "### PK1\n[rec1] zadanie A");
  assert.match(p, /rec1/);
  assert.match(p, /#7/);
  assert.match(p, /JSON/);
  assert.match(p, /uruchomien|startu|gotowość|gotowosc/i); // launch orientation present
});

test("parsePlanDelta normalizes a completed delta", () => {
  const d = parsePlanDelta('{"kind":"completed","recordId":"recABC","package":"PK1","note":"Zadanie A domknięte","confidence":0.9,"rationale":"bo x"}');
  assert.equal(d.kind, "completed");
  assert.equal(d.recordId, "recABC");
  assert.equal(d.confidence, 0.9);
});

test("parsePlanDelta keeps a regression delta (no record needed)", () => {
  const d = parsePlanDelta('{"kind":"regression","package":"PK1","note":"bug w kalendarzu cofa gotowość","confidence":0.85,"rationale":"bloker"}');
  assert.equal(d.kind, "regression");
  assert.equal(d.recordId, null);
  assert.equal(d.package, "PK1");
});

test("parsePlanDelta coerces unknown kind to none and clamps confidence", () => {
  const d = parsePlanDelta('{"kind":"whatever","confidence":5}');
  assert.equal(d.kind, "none");
  assert.equal(d.confidence, 1);
});

test("parsePlanDelta drops a non-rec recordId and a bad package but keeps kind=completed (routes to draft later)", () => {
  const d = parsePlanDelta('{"kind":"completed","recordId":"xyz","package":"PK99","note":"n","confidence":0.5}');
  assert.equal(d.kind, "completed");
  assert.equal(d.recordId, null);
  assert.equal(d.package, null);
});

test("assessPlanDelta parses the model's JSON via injected invokeLLM", async () => {
  const invokeLLM = async () => 'przed {"kind":"structural","note":"nowy pakiet PK10","confidence":0.7,"rationale":"r"} po';
  const d = await assessPlanDelta({ number: 1, title: "t", body: "b" }, "digest", { invokeLLM });
  assert.equal(d.kind, "structural");
  assert.equal(d.note, "nowy pakiet PK10");
});
