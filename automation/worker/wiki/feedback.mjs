import { resolveRecordId } from "./plan-index.mjs";

// Route a plan delta, direction-preserving: only mark done, record a blocker,
// or propose a change — never remove or lower priority. Only a confident,
// resolvable `completed` is auto-written to Base; everything else launch-relevant
// is recorded and/or flagged for a human. deps are injected so the worker can
// pass no-op writers in "dry" mode.
export function applyPlanDelta(delta, issue, deps, { records, threshold }) {
  const base = { applied: false, recorded: false, recordId: null, kind: delta ? delta.kind : "none" };
  if (!delta || delta.kind === "none") return { ...base, action: "none", kind: "none" };

  if (delta.kind === "completed") {
    const rec = resolveRecordId(records, delta);
    if (rec && delta.confidence >= threshold) {
      deps.markDone(rec.record_id);
      deps.postNote(`${delta.note} (auto, na podstawie #${issue.number})`);
      return { ...base, action: "completed-auto", applied: true, recorded: true, recordId: rec.record_id };
    }
    deps.postDraft(`Możliwe domknięcie zadania${delta.package ? " (" + delta.package + ")" : ""}: ${delta.note}. Źródło: #${issue.number}. Do ręcznego potwierdzenia (niska pewność lub nierozpoznany rekord).`);
    deps.labelIssue("triage:plan-change");
    return { ...base, action: "completed-draft", recordId: delta.recordId };
  }

  if (delta.kind === "regression") {
    deps.postNote(`⚠️ Regresja gotowości${delta.package ? " (" + delta.package + ")" : ""}: ${delta.note}. Źródło: #${issue.number}. Do dodania/podniesienia jako bloker startu (P0).`);
    deps.labelIssue("triage:plan-change");
    return { ...base, action: "regression-recorded", recorded: true };
  }

  // structural
  deps.postDraft(`Propozycja zmiany strukturalnej planu: ${delta.note}. Źródło: #${issue.number}.`);
  deps.labelIssue("triage:plan-change");
  return { ...base, action: "structural-draft" };
}
