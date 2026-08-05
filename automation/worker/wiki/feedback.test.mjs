import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPlanDelta } from "./feedback.mjs";

const records = [{ record_id: "recAAA", fields: { Zadanie: "A" } }];
function spies() {
  const c = { done: [], note: [], draft: [], label: [] };
  return { deps: { markDone: (id) => c.done.push(id), postNote: (t) => c.note.push(t), postDraft: (t) => c.draft.push(t), labelIssue: (l) => c.label.push(l) }, c };
}
const issue = { number: 5, repo: "o/r" };

test("completed + high confidence + resolvable → auto status + note", () => {
  const { deps, c } = spies();
  const out = applyPlanDelta({ kind: "completed", recordId: "recAAA", confidence: 0.9, note: "A done" }, issue, deps, { records, threshold: 0.8 });
  assert.deepEqual(c.done, ["recAAA"]);
  assert.equal(c.note.length, 1);
  assert.equal(c.draft.length, 0);
  assert.equal(out.action, "completed-auto");
  assert.equal(out.applied, true);
});

test("completed but low confidence → draft + label, no status write", () => {
  const { deps, c } = spies();
  const out = applyPlanDelta({ kind: "completed", recordId: "recAAA", confidence: 0.4, note: "maybe" }, issue, deps, { records, threshold: 0.8 });
  assert.deepEqual(c.done, []);
  assert.equal(c.draft.length, 1);
  assert.deepEqual(c.label, ["triage:plan-change"]);
  assert.equal(out.action, "completed-draft");
});

test("completed with unresolvable record → draft, no status write", () => {
  const { deps, c } = spies();
  const out = applyPlanDelta({ kind: "completed", recordId: "recZZZ", confidence: 0.99, note: "x" }, issue, deps, { records, threshold: 0.8 });
  assert.deepEqual(c.done, []);
  assert.equal(c.draft.length, 1);
});

test("regression → records a note + flags label, never a status write", () => {
  const { deps, c } = spies();
  const out = applyPlanDelta({ kind: "regression", recordId: null, package: "PK1", confidence: 0.9, note: "kalendarz cofa gotowość" }, issue, deps, { records, threshold: 0.8 });
  assert.deepEqual(c.done, []);
  assert.equal(c.note.length, 1);
  assert.deepEqual(c.label, ["triage:plan-change"]);
  assert.equal(out.action, "regression-recorded");
  assert.equal(out.recorded, true);
});

test("structural → draft + label, never a status write", () => {
  const { deps, c } = spies();
  const out = applyPlanDelta({ kind: "structural", recordId: null, confidence: 0.95, note: "new PK" }, issue, deps, { records, threshold: 0.8 });
  assert.deepEqual(c.done, []);
  assert.equal(c.draft.length, 1);
  assert.deepEqual(c.label, ["triage:plan-change"]);
  assert.equal(out.action, "structural-draft");
});

test("none → does nothing", () => {
  const { deps, c } = spies();
  const out = applyPlanDelta({ kind: "none", recordId: null, confidence: 0, note: "" }, issue, deps, { records, threshold: 0.8 });
  assert.deepEqual([c.done, c.note, c.draft, c.label], [[], [], [], []]);
  assert.equal(out.action, "none");
});
