// automation/worker/wiki/integration.test.mjs
// Drives assess (mock LLM) → applyPlanDelta with real resolveRecordId over
// sample records, proving completed-auto writes Base, regression records a note
// without a status write, and out-of-scope (none) does nothing — without
// importing worker.mjs (which starts the daemon).
import { test } from "node:test";
import assert from "node:assert/strict";
import { assessPlanDelta } from "./assess.mjs";
import { buildDeltaDigest } from "./plan-index.mjs";
import { applyPlanDelta } from "./feedback.mjs";

const records = [
  { record_id: "recAAA", fields: { Pakiet: { text: "PK1" }, Zadanie: "Zielona bramka CI", "Kolejność": 1, "Status realizacji": "Do zrobienia" } },
];
function spies() {
  const c = { done: [], note: [], draft: [], label: [] };
  return { deps: { markDone: (id) => c.done.push(id), postNote: (t) => c.note.push(t), postDraft: (t) => c.draft.push(t), labelIssue: (l) => c.label.push(l) }, c };
}

test("completed for a known record auto-flips status", async () => {
  const invokeLLM = async () => `{"kind":"completed","recordId":"recAAA","package":"PK1","note":"Zielona bramka gotowa","confidence":0.95,"rationale":"ukończono"}`;
  const delta = await assessPlanDelta({ number: 12, title: "Zrobione", body: "zielona bramka działa" }, buildDeltaDigest(records), { invokeLLM });
  const { deps, c } = spies();
  const out = applyPlanDelta(delta, { number: 12, repo: "o/r" }, deps, { records, threshold: 0.8 });
  assert.equal(out.action, "completed-auto");
  assert.deepEqual(c.done, ["recAAA"]);
});

test("regression records a note + label, never a status write", async () => {
  const invokeLLM = async () => `{"kind":"regression","package":"PK1","note":"bug w kalendarzu cofa gotowość","confidence":0.9,"rationale":"bloker"}`;
  const delta = await assessPlanDelta({ number: 13, title: "Błąd", body: "kalendarz nie działa, blokuje wizyty" }, buildDeltaDigest(records), { invokeLLM });
  const { deps, c } = spies();
  const out = applyPlanDelta(delta, { number: 13, repo: "o/r" }, deps, { records, threshold: 0.8 });
  assert.equal(out.action, "regression-recorded");
  assert.deepEqual(c.done, []);
  assert.equal(c.note.length, 1);
  assert.deepEqual(c.label, ["triage:plan-change"]);
});

test("out-of-scope report (none) changes nothing", async () => {
  const invokeLLM = async () => `{"kind":"none","note":"magazyn poza zakresem startu","confidence":0.9,"rationale":"poza PK"}`;
  const delta = await assessPlanDelta({ number: 14, title: "Magazyn", body: "błąd w module magazynu" }, buildDeltaDigest(records), { invokeLLM });
  const { deps, c } = spies();
  const out = applyPlanDelta(delta, { number: 14, repo: "o/r" }, deps, { records, threshold: 0.8 });
  assert.equal(out.action, "none");
  assert.deepEqual([c.done, c.note, c.draft, c.label], [[], [], [], []]);
});
