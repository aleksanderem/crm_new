# GitHub/Jam Triage — Phase 3 (Wiki Feedback Loop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the triage plan current: when a triaged issue confirms a plan task is already done ("factual" change), auto-flip that task's Base status to "Zrobione" and leave a note on the plan's Wiki doc; when an issue implies a structural plan change (new package, invalidated closure condition), leave a DRAFT proposal + human-review label instead of applying anything.

**Architecture:** A new module tree under `automation/worker/wiki/`. After a successful, fitting triage, a cheap keyword gate (`looksLikeStateChange`) decides whether to spend an LLM call assessing a plan delta. The assessment returns a structured delta; an engine (`applyPlanDelta`) routes it: factual + high-confidence + a resolvable Base record → auto (Base `+record-batch-update` status → Zrobione + a `drive +add-comment` note on the Wiki doc); factual-but-uncertain or structural → a draft comment + a `triage:plan-change` GitHub label, applied by no one. A `WIKI_FEEDBACK` env switch (off | dry | on) gates whether writes actually execute, so the loop ships dormant and is turned on after the lark-cli write commands are verified live on the server.

**Tech Stack:** Node ESM daemon, `better-sqlite3`, built-in `node:test` runner, `lark-cli` (Base + Drive) and `gh` via the worker's injected `exec` helper. Zero new npm dependencies.

## Global Constraints

- Zero new npm dependencies. Tests use the built-in `node:test` runner; run with `npm test` (which runs `node --test`) from `automation/worker/`.
- **Verified lark-cli commands** (confirmed available this session; both support `--dry-run` which prints the request without executing — use it to verify wire shapes without mutating the shared plan):
  - Base status update: `lark-cli base +record-batch-update --base-token <T> --table-id <tbl> --json '{"update_records":{"<recId>":{"Status realizacji":["Zrobione"]}}}' --format json`. NOTE: a single-select field value is an ARRAY (`["Zrobione"]`), per the command's own help example `{"Status":["Done"]}`.
  - Wiki note: `lark-cli drive +add-comment --doc <wikiURLorToken> --type docx --full-comment --content '<reply_elements JSON>' --format json`. A comment is a NON-destructive note on the doc — do NOT use `docs +update` (which rewrites doc content). The exact `reply_elements` JSON shape for `--content` MUST be confirmed with `--dry-run` against the real doc during Task 5 (treated like Phase 1 Task 5's sanctioned command verification).
  - Plan record fetch WITH ids: `lark-cli base +record-list` returns `data.data` (value arrays), `data.fields` (names), and `data.record_id_list` (ids) in parallel. Phase 1's `fetchPlanRecords` discarded ids; Phase 3 needs them, so it has its own `fetchPlanRecordsWithIds` that zips `record_id_list` alongside.
- `BASE_TOKEN` and `TABLE_ID` are already exported from `automation/worker/triage/plan.mjs` — import them, do not redefine.
- **Trigger gate (cost control):** the plan-delta assessment (an LLM call) runs ONLY when the triage verdict has `fits === true` AND `looksLikeStateChange(issue)` is true AND `WIKI_FEEDBACK !== "off"`. A rejected (pressure/policy) or non-fitting issue never triggers it.
- **Safety — writes are gated by `WIKI_FEEDBACK`** (env, default `"off"`): `off` = skip the whole step (no LLM, no writes); `dry` = assess + log + persist the intended action, but pass no-op writers (no Base/Wiki/label mutation); `on` = execute writes. The loop ships with `off` so nothing mutates the shared plan until a human validates the lark-cli write commands live on the server and sets the env.
- **Auto vs draft (never corrupt the plan):** a factual delta is auto-applied ONLY when confidence ≥ `FEEDBACK_CONFIDENCE_THRESHOLD` (default 0.8) AND the returned `recordId` resolves to an existing plan record. Otherwise it is downgraded to a DRAFT (Wiki proposal comment + `triage:plan-change` GitHub label), never written to Base. Structural deltas are ALWAYS draft-only — the agent never applies a structural plan change. This honors spec §57–59 / §104–106 (factual auto, structural → human flag).
- The agent NEVER deletes or rewrites plan content: factual = a status field flip + an additive comment; structural/draft = an additive comment + a label. No `docs +update`, no record deletion.
- Phase 3 must not regress Phase 1 or Phase 2: it only ADDS a step after a successful triage and one additive SQLite column. `triageJob` already returns `{ verdict, recordId }` (or `{ verdict, rejected }`) — the worker captures that return to decide whether to run feedback. Existing tests must still pass.

---

## File Structure

- `automation/worker/wiki/schema.mjs` — `ensurePlanDeltaColumn(db)` (additive `plan_delta` column). (Task 1)
- `automation/worker/wiki/detect.mjs` — `looksLikeStateChange(issue)` cheap keyword gate. (Task 1)
- `automation/worker/wiki/assess.mjs` — `buildDeltaPrompt`, `parsePlanDelta`, `assessPlanDelta` (LLM delta assessment). (Task 2)
- `automation/worker/triage/evaluate.mjs` — MODIFY: export `extractJson` for reuse. (Task 2)
- `automation/worker/wiki/plan-index.mjs` — `fetchPlanRecordsWithIds`, `buildDeltaDigest`, `resolveRecordId`. (Task 3)
- `automation/worker/wiki/base-status.mjs` — `markRecordDone`. (Task 4)
- `automation/worker/wiki/wiki-note.mjs` — `buildCommentContent`, `postPlanNote`, `postPlanDraft`. (Task 5)
- `automation/worker/triage/github-writer.mjs` — MODIFY: add `labelIssue`. (Task 5)
- `automation/worker/wiki/feedback.mjs` — `applyPlanDelta` engine. (Task 6)
- `automation/worker/worker.mjs` — MODIFY: wire the feedback step + env + record cache. (Task 7)
- Tests co-located as `*.test.mjs` next to each module.

---

### Task 1: Plan-delta column + cheap state-change gate

**Files:**
- Create: `automation/worker/wiki/schema.mjs`, `automation/worker/wiki/detect.mjs`
- Test: `automation/worker/wiki/schema.test.mjs`, `automation/worker/wiki/detect.test.mjs`

**Interfaces:**
- Consumes: a `better-sqlite3` `db` with the Phase 1 `jobs` table; an `issue` (`{title, body, ...}`).
- Produces:
  - `ensurePlanDeltaColumn(db): void` — additive `ALTER TABLE jobs ADD COLUMN plan_delta TEXT` when missing.
  - `STATE_CHANGE_PHRASES: string[]`, `looksLikeStateChange(issue): boolean`.

- [ ] **Step 1: Write the failing tests**

```js
// automation/worker/wiki/schema.test.mjs
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
```

```js
// automation/worker/wiki/detect.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeStateChange } from "./detect.mjs";

test("fires on completion / fix language", () => {
  assert.equal(looksLikeStateChange({ title: "To już zrobione", body: "" }).valueOf?.() ?? looksLikeStateChange({ title: "To już zrobione", body: "" }), true);
  assert.equal(looksLikeStateChange({ title: "", body: "Ten problem jest już naprawiony i działa" }), true);
  assert.equal(looksLikeStateChange({ title: "This is already done", body: "" }), true);
});

test("does not fire on an ordinary feature/bug report", () => {
  assert.equal(looksLikeStateChange({ title: "Dodać eksport CSV", body: "Potrzebujemy przycisku eksportu" }), false);
  assert.equal(looksLikeStateChange({ title: "Kalendarz gubi terminy", body: "przy zmianie strefy" }), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd automation/worker && node --test wiki/schema.test.mjs wiki/detect.test.mjs`
Expected: FAIL — `Cannot find module './schema.mjs'` / `./detect.mjs`.

- [ ] **Step 3: Write the implementations**

```js
// automation/worker/wiki/schema.mjs
// Additive-only: records what the feedback step decided/did for a job.
export function ensurePlanDeltaColumn(db) {
  const cols = new Set(db.prepare("PRAGMA table_info(jobs)").all().map((c) => c.name));
  if (!cols.has("plan_delta")) {
    db.exec("ALTER TABLE jobs ADD COLUMN plan_delta TEXT");
  }
}
```

```js
// automation/worker/wiki/detect.mjs
// Cheap gate: only spend an LLM plan-delta assessment on issues whose text
// plausibly claims a task is already done / a problem is fixed. Presence-only,
// like the pressure detector — the actual decision is made by the assessment.
export const STATE_CHANGE_PHRASES = [
  "zrobione", "zrobiono", "gotowe", "ukończone", "ukonczone", "wdrożone", "wdrozone",
  "naprawione", "naprawiony", "naprawiłem", "naprawilem", "naprawili",
  "już działa", "juz dziala", "działa już", "dziala juz", "rozwiązane", "rozwiazane",
  "already done", "already fixed", "is fixed", "is done", "resolved", "closed as done",
];

export function looksLikeStateChange(issue) {
  const text = `${issue.title || ""}\n${issue.body || ""}`.toLowerCase();
  return STATE_CHANGE_PHRASES.some((p) => text.includes(p));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd automation/worker && node --test wiki/schema.test.mjs wiki/detect.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add automation/worker/wiki/schema.mjs automation/worker/wiki/detect.mjs \
        automation/worker/wiki/schema.test.mjs automation/worker/wiki/detect.test.mjs
git commit -m "feat(triage/wiki): plan_delta column + state-change gate"
```

---

### Task 2: Plan-delta assessment (LLM)

**Files:**
- Create: `automation/worker/wiki/assess.mjs`
- Modify: `automation/worker/triage/evaluate.mjs` (export `extractJson`)
- Test: `automation/worker/wiki/assess.test.mjs`

**Interfaces:**
- Consumes: `extractJson` from `../triage/evaluate.mjs`; an injected `invokeLLM(prompt) -> string`.
- Produces:
  - `buildDeltaPrompt(issue, deltaDigest): string`
  - `parsePlanDelta(raw): { kind: "factual"|"structural"|"none", recordId: string|null, package: string|null, note: string, confidence: number, rationale: string }`
  - `assessPlanDelta(issue, deltaDigest, { invokeLLM }): Promise<Delta>`

- [ ] **Step 1: Write the failing test**

```js
// automation/worker/wiki/assess.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDeltaPrompt, parsePlanDelta, assessPlanDelta } from "./assess.mjs";

test("buildDeltaPrompt includes the issue, the digest, and demands JSON", () => {
  const p = buildDeltaPrompt({ number: 7, title: "Gotowe", body: "zrobione", login: "dev" }, "### PK1\n[rec1] zadanie A");
  assert.match(p, /rec1/);
  assert.match(p, /#7/);
  assert.match(p, /JSON/);
});

test("parsePlanDelta normalizes a factual delta", () => {
  const d = parsePlanDelta('{"kind":"factual","recordId":"recABC","package":"PK1","note":"Zadanie A domknięte","confidence":0.9,"rationale":"bo x"}');
  assert.equal(d.kind, "factual");
  assert.equal(d.recordId, "recABC");
  assert.equal(d.package, "PK1");
  assert.equal(d.confidence, 0.9);
});

test("parsePlanDelta coerces unknown kind to none and clamps confidence", () => {
  const d = parsePlanDelta('{"kind":"whatever","confidence":5}');
  assert.equal(d.kind, "none");
  assert.equal(d.recordId, null);
  assert.equal(d.confidence, 1);
});

test("parsePlanDelta drops a non-rec recordId and a bad package", () => {
  const d = parsePlanDelta('{"kind":"factual","recordId":"xyz","package":"PK99","note":"n","confidence":0.5}');
  assert.equal(d.recordId, null);
  assert.equal(d.package, null);
});

test("assessPlanDelta parses the model's JSON via injected invokeLLM", async () => {
  const invokeLLM = async () => 'tekst przed {"kind":"structural","note":"nowy pakiet PK10","confidence":0.7,"rationale":"r"} tekst po';
  const d = await assessPlanDelta({ number: 1, title: "t", body: "b" }, "digest", { invokeLLM });
  assert.equal(d.kind, "structural");
  assert.equal(d.note, "nowy pakiet PK10");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd automation/worker && node --test wiki/assess.test.mjs`
Expected: FAIL — `Cannot find module './assess.mjs'`.

- [ ] **Step 3: Export `extractJson` from evaluate.mjs**

In `automation/worker/triage/evaluate.mjs`, change the declaration `function extractJson(text) {` to `export function extractJson(text) {`. Make NO other change.

Run the Phase 1 evaluator tests to confirm no regression:
Run: `cd automation/worker && node --test triage/evaluate.test.mjs`
Expected: PASS (unchanged).

- [ ] **Step 4: Write the assessment implementation**

```js
// automation/worker/wiki/assess.mjs
import { extractJson } from "../triage/evaluate.mjs";

const PACKAGES = ["PK1", "PK2", "PK3", "PK4", "PK5", "PK6", "PK7", "PK8", "PK9"];
const KINDS = ["factual", "structural", "none"];

export function buildDeltaPrompt(issue, deltaDigest) {
  return `Oceniasz, czy PONIŻSZE zgłoszenie zmienia STAN planu uruchomienia. Zwróć JEDEN obiekt JSON:

{
  "kind": "factual" | "structural" | "none",
  // factual = zgłoszenie potwierdza, że konkretne zadanie z planu jest JUŻ ZROBIONE / problem naprawiony
  // structural = plan wymaga zmiany struktury (nowy pakiet, unieważniony warunek zamknięcia) — do decyzji człowieka
  // none = nic nie zmienia w planie
  "recordId": "rec..."|null,   // dla factual: id rekordu planu, którego dotyczy (z tagów [recXXX] poniżej); inaczej null
  "package": "PK1".."PK9"|null,
  "note": string,              // 1 zdanie po polsku: co się zmienia
  "confidence": number,        // 0..1
  "rationale": string
}

Zasady: wybieraj "factual" TYLKO gdy zgłoszenie jednoznacznie wskazuje ukończenie konkretnego zadania z listy poniżej i podaj jego [recXXX]. Przy niepewności obniż confidence. Zwróć wyłącznie JSON.

## Plan (zadania z identyfikatorami rekordów)
${deltaDigest}

## Zgłoszenie #${issue.number}
Tytuł: ${issue.title}
Treść:
${issue.body || "(brak treści)"}`;
}

export function parsePlanDelta(raw) {
  let o = raw;
  if (typeof raw === "string") {
    try { o = JSON.parse(raw); } catch { return { kind: "none", recordId: null, package: null, note: "", confidence: 0, rationale: "" }; }
  }
  if (!o || typeof o !== "object") return { kind: "none", recordId: null, package: null, note: "", confidence: 0, rationale: "" };
  const kind = KINDS.includes(o.kind) ? o.kind : "none";
  const recordId = typeof o.recordId === "string" && o.recordId.startsWith("rec") ? o.recordId : null;
  const pkg = PACKAGES.includes(o.package) ? o.package : null;
  let confidence = Number(o.confidence);
  if (!Number.isFinite(confidence)) confidence = 0;
  confidence = Math.max(0, Math.min(1, confidence));
  return {
    kind: kind === "factual" && !recordId ? "none" : kind, // a factual delta without a target record is unusable → none
    recordId,
    package: pkg,
    note: typeof o.note === "string" ? o.note.slice(0, 500) : "",
    confidence,
    rationale: typeof o.rationale === "string" ? o.rationale.slice(0, 500) : "",
  };
}

export async function assessPlanDelta(issue, deltaDigest, { invokeLLM }) {
  const raw = await invokeLLM(buildDeltaPrompt(issue, deltaDigest));
  const json = extractJson(String(raw));
  if (!json) return { kind: "none", recordId: null, package: null, note: "", confidence: 0, rationale: "" };
  return parsePlanDelta(json);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd automation/worker && node --test wiki/assess.test.mjs`
Expected: PASS (5 tests).

Note: the third test (`kind:"whatever"` → `none`) and the fourth (`recordId:"xyz"` dropped) both pass because a factual delta without a valid `recordId` is coerced to `none`; a `structural` delta keeps its kind with `recordId: null`.

- [ ] **Step 6: Commit**

```bash
git add automation/worker/wiki/assess.mjs automation/worker/wiki/assess.test.mjs automation/worker/triage/evaluate.mjs
git commit -m "feat(triage/wiki): plan-delta LLM assessment (factual/structural/none)"
```

---

### Task 3: Plan index — records with ids, delta digest, record resolution

**Files:**
- Create: `automation/worker/wiki/plan-index.mjs`
- Test: `automation/worker/wiki/plan-index.test.mjs`

**Interfaces:**
- Consumes: injected `exec(cmd, args) -> { stdout }`; `BASE_TOKEN`, `TABLE_ID` from `../triage/plan.mjs`.
- Produces:
  - `fetchPlanRecordsWithIds({ exec }): Array<{ record_id: string, fields: object }>` — zips `data.record_id_list` with `data.data` + `data.fields` from `+record-list`.
  - `buildDeltaDigest(records): string` — PK-grouped digest where each line is tagged with its `[record_id]`.
  - `resolveRecordId(records, delta): { record_id, fields } | null` — returns the record whose `record_id` equals `delta.recordId`, else null.

- [ ] **Step 1: Write the failing test**

```js
// automation/worker/wiki/plan-index.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchPlanRecordsWithIds, buildDeltaDigest, resolveRecordId } from "./plan-index.mjs";

const recordListJson = JSON.stringify({
  data: {
    fields: [{ name: "Pakiet" }, { name: "Zadanie" }, { name: "Kolejność" }, { name: "Status realizacji" }],
    data: [
      [{ text: "PK1" }, "Zielona bramka CI", 1, "Do zrobienia"],
      [{ text: "PK2" }, "Uprawnienia backend", 2, "Do zrobienia"],
    ],
    record_id_list: ["recAAA", "recBBB"],
  },
});

test("fetchPlanRecordsWithIds zips record_id_list with fields", () => {
  const exec = () => ({ stdout: recordListJson });
  const recs = fetchPlanRecordsWithIds({ exec });
  assert.equal(recs.length, 2);
  assert.equal(recs[0].record_id, "recAAA");
  assert.equal(recs[0].fields["Zadanie"], "Zielona bramka CI");
  assert.equal(recs[1].record_id, "recBBB");
});

test("buildDeltaDigest tags each line with its record id", () => {
  const recs = fetchPlanRecordsWithIds({ exec: () => ({ stdout: recordListJson }) });
  const digest = buildDeltaDigest(recs);
  assert.match(digest, /\[recAAA\]/);
  assert.match(digest, /Zielona bramka CI/);
  assert.match(digest, /### PK1/);
});

test("resolveRecordId finds a known record and returns null for unknown", () => {
  const recs = fetchPlanRecordsWithIds({ exec: () => ({ stdout: recordListJson }) });
  assert.equal(resolveRecordId(recs, { recordId: "recBBB" }).fields["Zadanie"], "Uprawnienia backend");
  assert.equal(resolveRecordId(recs, { recordId: "recZZZ" }), null);
  assert.equal(resolveRecordId(recs, { recordId: null }), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd automation/worker && node --test wiki/plan-index.test.mjs`
Expected: FAIL — `Cannot find module './plan-index.mjs'`.

- [ ] **Step 3: Write the implementation**

```js
// automation/worker/wiki/plan-index.mjs
import { BASE_TOKEN, TABLE_ID } from "../triage/plan.mjs";

function cell(v) {
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === "object" ? (x.text || x.name || "") : String(x))).join(", ");
  if (v && typeof v === "object") return v.text || v.name || "";
  return v === null || v === undefined ? "" : String(v);
}

// Like triage/plan.mjs fetchPlanRecords, but keeps record_id (needed to target
// a status update). +record-list returns data.data (value arrays), data.fields
// (names) and data.record_id_list (ids) in parallel.
export function fetchPlanRecordsWithIds({ exec }) {
  const args = ["base", "+record-list", "--base-token", BASE_TOKEN,
                "--table-id", TABLE_ID, "--limit", "200", "--format", "json"];
  const { stdout } = exec("lark-cli", args);
  const parsed = JSON.parse(stdout);
  const names = (parsed.data?.fields || []).map((f) => (typeof f === "object" ? f.name : f));
  const rows = parsed.data?.data || [];
  const ids = parsed.data?.record_id_list || [];
  return rows.map((row, i) => {
    const fields = {};
    names.forEach((n, j) => { fields[n] = row[j]; });
    return { record_id: ids[i], fields };
  });
}

// PK-grouped digest with a [record_id] tag on every line, so the assessment LLM
// can name exactly which plan record a factual completion refers to.
export function buildDeltaDigest(records) {
  const byPk = new Map();
  for (const r of records) {
    const f = r.fields || {};
    const pk = cell(f["Pakiet"]) || "(brak)";
    if (!byPk.has(pk)) byPk.set(pk, []);
    byPk.get(pk).push({
      id: r.record_id,
      ord: cell(f["Kolejność"]),
      status: cell(f["Status realizacji"]),
      task: cell(f["Zadanie"]),
    });
  }
  const parts = [];
  for (const [pk, list] of [...byPk.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    parts.push(`### ${pk}`);
    for (const r of list) {
      parts.push(`- [${r.id}] (kol ${r.ord}, ${r.status}) ${r.task}`);
    }
  }
  return parts.join("\n");
}

export function resolveRecordId(records, delta) {
  if (!delta || !delta.recordId) return null;
  return records.find((r) => r.record_id === delta.recordId) || null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd automation/worker && node --test wiki/plan-index.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add automation/worker/wiki/plan-index.mjs automation/worker/wiki/plan-index.test.mjs
git commit -m "feat(triage/wiki): plan records-with-ids, delta digest, record resolver"
```

---

### Task 4: Base status writer

**Files:**
- Create: `automation/worker/wiki/base-status.mjs`
- Test: `automation/worker/wiki/base-status.test.mjs`

**Interfaces:**
- Consumes: injected `exec`; `BASE_TOKEN`, `TABLE_ID` from `../triage/plan.mjs`.
- Produces: `markRecordDone(recordId, { exec }): void` — sets that plan record's `Status realizacji` to `Zrobione` via `base +record-batch-update`.

- [ ] **Step 1: Write the failing test**

```js
// automation/worker/wiki/base-status.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { markRecordDone } from "./base-status.mjs";
import { BASE_TOKEN, TABLE_ID } from "../triage/plan.mjs";

test("markRecordDone issues a record-batch-update with the Zrobione status as an array", () => {
  const calls = [];
  const exec = (cmd, args) => { calls.push([cmd, args]); return { stdout: "{}" }; };
  markRecordDone("recABC", { exec });
  assert.equal(calls.length, 1);
  const [cmd, args] = calls[0];
  assert.equal(cmd, "lark-cli");
  assert.ok(args.includes("+record-batch-update"));
  assert.ok(args.includes("--base-token") && args.includes(BASE_TOKEN));
  assert.ok(args.includes("--table-id") && args.includes(TABLE_ID));
  const json = JSON.parse(args[args.indexOf("--json") + 1]);
  assert.deepEqual(json, { update_records: { recABC: { "Status realizacji": ["Zrobione"] } } });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd automation/worker && node --test wiki/base-status.test.mjs`
Expected: FAIL — `Cannot find module './base-status.mjs'`.

- [ ] **Step 3: Write the implementation**

```js
// automation/worker/wiki/base-status.mjs
import { BASE_TOKEN, TABLE_ID } from "../triage/plan.mjs";

// Flip a plan record's status to Zrobione. Single-select value is an ARRAY per
// +record-batch-update's contract ({"Status":["Done"]}). NOTE: verify live with
// `lark-cli base +record-batch-update ... --dry-run` before enabling writes.
export function markRecordDone(recordId, { exec }) {
  const json = JSON.stringify({ update_records: { [recordId]: { "Status realizacji": ["Zrobione"] } } });
  exec("lark-cli", ["base", "+record-batch-update", "--base-token", BASE_TOKEN,
                    "--table-id", TABLE_ID, "--json", json, "--format", "json"]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd automation/worker && node --test wiki/base-status.test.mjs`
Expected: PASS (1 test).

- [ ] **Step 5: Live wire-shape verification (read-only, no mutation)**

Confirm the command shape is accepted WITHOUT mutating the Base, using `--dry-run` (it prints the request and does not execute). Pick any real record id from the plan (or a throwaway `recTEST`):

Run: `lark-cli base +record-batch-update --base-token BEm9bfWsFa0dHasHlu6j5ynkpSd --table-id tbl61BNGL8JLsUpF --json '{"update_records":{"recTEST":{"Status realizacji":["Zrobione"]}}}' --dry-run --format json`
Expected: a printed request payload with no error about the field/value shape. If the CLI rejects the array-valued select (or names a different field key), record the correct shape in the report and adjust `markRecordDone` accordingly (this is a sanctioned wire-shape correction, like Phase 1 Task 5). If `--dry-run` is unavailable or errors for auth reasons unrelated to shape, note it in the report and proceed — the unit test already pins the intended shape.

- [ ] **Step 6: Commit**

```bash
git add automation/worker/wiki/base-status.mjs automation/worker/wiki/base-status.test.mjs
git commit -m "feat(triage/wiki): Base status writer (record -> Zrobione)"
```

---

### Task 5: Wiki note writer + GitHub plan-change label

**Files:**
- Create: `automation/worker/wiki/wiki-note.mjs`
- Modify: `automation/worker/triage/github-writer.mjs` (add `labelIssue`)
- Test: `automation/worker/wiki/wiki-note.test.mjs`, `automation/worker/triage/github-writer-label.test.mjs`

**Interfaces:**
- Consumes: injected `exec`.
- Produces:
  - `buildCommentContent(text): string` — the `reply_elements` JSON string for `--content`.
  - `postPlanNote(doc, text, { exec }): void` — a `drive +add-comment` note (factual auto-note) on the plan Wiki doc.
  - `postPlanDraft(doc, text, { exec }): void` — same, but prefixes a "PROPOZYCJA ZMIANY PLANU (do akceptacji człowieka)" marker (structural / downgraded factual).
  - `labelIssue(issue, label, { exec }): void` (in github-writer.mjs) — `gh issue edit --add-label <label>`.

- [ ] **Step 1: Write the failing tests**

```js
// automation/worker/wiki/wiki-note.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCommentContent, postPlanNote, postPlanDraft } from "./wiki-note.mjs";

test("postPlanNote adds a full-document docx comment to the given doc", () => {
  const calls = [];
  const exec = (cmd, args) => { calls.push([cmd, args]); return { stdout: "{}" }; };
  postPlanNote("https://wiki/doc-08", "Zadanie A domknięte", { exec });
  const [cmd, args] = calls[0];
  assert.equal(cmd, "lark-cli");
  assert.ok(args.includes("+add-comment"));
  assert.ok(args.includes("--doc") && args.includes("https://wiki/doc-08"));
  assert.ok(args.includes("--type") && args.includes("docx"));
  assert.ok(args.includes("--full-comment"));
  const content = args[args.indexOf("--content") + 1];
  assert.match(content, /Zadanie A domknięte/);
});

test("postPlanDraft marks the note as a human-approval proposal", () => {
  const calls = [];
  const exec = (cmd, args) => { calls.push([cmd, args]); return { stdout: "{}" }; };
  postPlanDraft("doc", "nowy pakiet PK10", { exec });
  const content = calls[0][1][calls[0][1].indexOf("--content") + 1];
  assert.match(content, /PROPOZYCJA ZMIANY PLANU/);
  assert.match(content, /nowy pakiet PK10/);
});

test("buildCommentContent embeds the text", () => {
  assert.match(buildCommentContent("abc"), /abc/);
});
```

```js
// automation/worker/triage/github-writer-label.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { labelIssue } from "./github-writer.mjs";

test("labelIssue adds the given label to the issue", () => {
  const calls = [];
  const exec = (cmd, args) => { calls.push([cmd, args]); return { stdout: "" }; };
  labelIssue({ number: 9, repo: "o/r" }, "triage:plan-change", { exec });
  assert.deepEqual(calls[0], ["gh", ["issue", "edit", "9", "--repo", "o/r", "--add-label", "triage:plan-change"]]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd automation/worker && node --test wiki/wiki-note.test.mjs triage/github-writer-label.test.mjs`
Expected: FAIL — modules/exports missing.

- [ ] **Step 3: Write the implementations**

```js
// automation/worker/wiki/wiki-note.mjs
// A note on the plan Wiki doc via drive +add-comment (NON-destructive — never
// rewrites doc content). NOTE: the exact reply_elements shape for --content must
// be confirmed with `drive +add-comment ... --dry-run` before enabling writes.
export function buildCommentContent(text) {
  return JSON.stringify([{ type: "text", content: text }]);
}

function addComment(doc, text, { exec }) {
  exec("lark-cli", ["drive", "+add-comment", "--doc", doc, "--type", "docx",
                    "--full-comment", "--content", buildCommentContent(text), "--format", "json"]);
}

export function postPlanNote(doc, text, { exec }) {
  addComment(doc, `✅ [triage] ${text}`, { exec });
}

export function postPlanDraft(doc, text, { exec }) {
  addComment(doc, `📝 PROPOZYCJA ZMIANY PLANU (do akceptacji człowieka): ${text}`, { exec });
}
```

```js
// Append to automation/worker/triage/github-writer.mjs (after postRejection):

// Add a label to an issue (used to flag plan-change proposals for human review).
export function labelIssue(issue, label, { exec }) {
  exec("gh", ["issue", "edit", String(issue.number), "--repo", issue.repo, "--add-label", label]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd automation/worker && node --test wiki/wiki-note.test.mjs triage/github-writer-label.test.mjs`
Expected: PASS (3 + 1).

- [ ] **Step 5: Live wire-shape verification (read-only, no mutation)**

Confirm `--content`'s `reply_elements` shape is accepted without posting, using `--dry-run`:

Run: `lark-cli drive +add-comment --doc <a real plan Wiki doc URL> --type docx --full-comment --content '[{"type":"text","content":"test"}]' --dry-run --format json`
Expected: a printed request with no shape error. If the CLI expects a different `reply_elements` structure (e.g. `[{"type":"text_run","text_run":{"text":"..."}}]`), record the correct shape and update `buildCommentContent` (sanctioned wire-shape correction). If `--dry-run` errors for reasons unrelated to shape, note it and proceed — the unit test pins the call construction; only `buildCommentContent`'s inner shape may need the live fix.

- [ ] **Step 6: Commit**

```bash
git add automation/worker/wiki/wiki-note.mjs automation/worker/wiki/wiki-note.test.mjs \
        automation/worker/triage/github-writer.mjs automation/worker/triage/github-writer-label.test.mjs
git commit -m "feat(triage/wiki): Wiki note/draft comment writer + plan-change label"
```

---

### Task 6: Feedback engine (route the delta)

**Files:**
- Create: `automation/worker/wiki/feedback.mjs`
- Test: `automation/worker/wiki/feedback.test.mjs`

**Interfaces:**
- Consumes: `resolveRecordId` from `./plan-index.mjs`.
- Produces: `applyPlanDelta(delta, issue, deps, { records, threshold }): { action, applied, recordId, kind }` where
  - `deps = { markDone(recordId), postNote(text), postDraft(text), labelIssue(label) }` (all side-effecting, injected).
  - Routing: `none` → nothing. `factual` + `confidence >= threshold` + `resolveRecordId` hit → `markDone` + `postNote` (auto), `applied:true`. `factual` otherwise → `postDraft` + `labelIssue("triage:plan-change")` (downgrade), `applied:false`. `structural` → `postDraft` + `labelIssue("triage:plan-change")`, `applied:false`.

- [ ] **Step 1: Write the failing test**

```js
// automation/worker/wiki/feedback.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPlanDelta } from "./feedback.mjs";

const records = [{ record_id: "recAAA", fields: { Zadanie: "A" } }];
function spies() {
  const c = { done: [], note: [], draft: [], label: [] };
  return {
    deps: {
      markDone: (id) => c.done.push(id),
      postNote: (t) => c.note.push(t),
      postDraft: (t) => c.draft.push(t),
      labelIssue: (l) => c.label.push(l),
    },
    c,
  };
}
const issue = { number: 5, repo: "o/r" };

test("factual + high confidence + resolvable record → auto-applies status + note", () => {
  const { deps, c } = spies();
  const out = applyPlanDelta({ kind: "factual", recordId: "recAAA", confidence: 0.9, note: "A done" }, issue, deps, { records, threshold: 0.8 });
  assert.deepEqual(c.done, ["recAAA"]);
  assert.equal(c.note.length, 1);
  assert.equal(c.draft.length, 0);
  assert.equal(out.applied, true);
  assert.equal(out.action, "factual-auto");
});

test("factual but low confidence → draft + label, no status write", () => {
  const { deps, c } = spies();
  const out = applyPlanDelta({ kind: "factual", recordId: "recAAA", confidence: 0.4, note: "maybe" }, issue, deps, { records, threshold: 0.8 });
  assert.deepEqual(c.done, []);
  assert.equal(c.draft.length, 1);
  assert.deepEqual(c.label, ["triage:plan-change"]);
  assert.equal(out.applied, false);
  assert.equal(out.action, "factual-draft");
});

test("factual with an unresolvable record → draft, no status write", () => {
  const { deps, c } = spies();
  const out = applyPlanDelta({ kind: "factual", recordId: "recZZZ", confidence: 0.99, note: "x" }, issue, deps, { records, threshold: 0.8 });
  assert.deepEqual(c.done, []);
  assert.equal(c.draft.length, 1);
  assert.equal(out.applied, false);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd automation/worker && node --test wiki/feedback.test.mjs`
Expected: FAIL — `Cannot find module './feedback.mjs'`.

- [ ] **Step 3: Write the implementation**

```js
// automation/worker/wiki/feedback.mjs
import { resolveRecordId } from "./plan-index.mjs";

// Route a plan delta. Factual + confident + resolvable → auto (status flip +
// note). Anything less certain, and every structural change → a draft proposal
// for a human, never a Base write. deps are injected so the worker can pass
// no-op writers in "dry" mode.
export function applyPlanDelta(delta, issue, deps, { records, threshold }) {
  if (!delta || delta.kind === "none") return { action: "none", applied: false, recordId: null, kind: "none" };

  if (delta.kind === "factual") {
    const rec = resolveRecordId(records, delta);
    if (rec && delta.confidence >= threshold) {
      deps.markDone(rec.record_id);
      deps.postNote(`${delta.note} (auto, na podstawie #${issue.number})`);
      return { action: "factual-auto", applied: true, recordId: rec.record_id, kind: "factual" };
    }
    deps.postDraft(`Możliwe domknięcie zadania${delta.package ? " (" + delta.package + ")" : ""}: ${delta.note}. Źródło: #${issue.number}. Do ręcznego potwierdzenia (niska pewność lub nierozpoznany rekord).`);
    deps.labelIssue("triage:plan-change");
    return { action: "factual-draft", applied: false, recordId: delta.recordId, kind: "factual" };
  }

  // structural
  deps.postDraft(`Propozycja zmiany strukturalnej planu: ${delta.note}. Źródło: #${issue.number}.`);
  deps.labelIssue("triage:plan-change");
  return { action: "structural-draft", applied: false, recordId: null, kind: "structural" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd automation/worker && node --test wiki/feedback.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add automation/worker/wiki/feedback.mjs automation/worker/wiki/feedback.test.mjs
git commit -m "feat(triage/wiki): feedback engine routing factual-auto vs draft"
```

---

### Task 7: Wire the feedback loop into the worker

**Files:**
- Modify: `automation/worker/worker.mjs`
- Test: `automation/worker/wiki/integration.test.mjs` (new)
- Docs: `automation/worker/README.md` (append a Phase 3 section)

**Interfaces:**
- Consumes: `ensurePlanDeltaColumn` (`./wiki/schema.mjs`), `looksLikeStateChange` (`./wiki/detect.mjs`), `assessPlanDelta` (`./wiki/assess.mjs`), `fetchPlanRecordsWithIds`, `buildDeltaDigest` (`./wiki/plan-index.mjs`), `markRecordDone` (`./wiki/base-status.mjs`), `postPlanNote`, `postPlanDraft` (`./wiki/wiki-note.mjs`), `labelIssue` (`./triage/github-writer.mjs`), `applyPlanDelta` (`./wiki/feedback.mjs`), and the existing `exec`, `jlog`, `invokeLLM`, `triageJob`.
- Produces: after a successful, fitting, non-rejected triage, an optional feedback step gated by `WIKI_FEEDBACK` (off | dry | on).

- [ ] **Step 1: Write the integration test**

```js
// automation/worker/wiki/integration.test.mjs
// Drives assess (mock LLM) → applyPlanDelta with real resolveRecordId over
// sample records, proving the factual-auto path calls the Base writer and the
// structural path never does — without importing worker.mjs (which starts the daemon).
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

test("factual completion for a known record auto-flips status", async () => {
  const digest = buildDeltaDigest(records);
  const invokeLLM = async () => `{"kind":"factual","recordId":"recAAA","package":"PK1","note":"Zielona bramka CI gotowa","confidence":0.95,"rationale":"zgłoszono ukończenie"}`;
  const delta = await assessPlanDelta({ number: 12, title: "Zrobione", body: "zielona bramka działa" }, digest, { invokeLLM });
  const { deps, c } = spies();
  const out = applyPlanDelta(delta, { number: 12, repo: "o/r" }, deps, { records, threshold: 0.8 });
  assert.equal(out.action, "factual-auto");
  assert.deepEqual(c.done, ["recAAA"]);
  assert.equal(c.note.length, 1);
});

test("structural proposal never writes Base status", async () => {
  const digest = buildDeltaDigest(records);
  const invokeLLM = async () => `{"kind":"structural","recordId":null,"note":"potrzebny nowy pakiet PK10","confidence":0.9,"rationale":"nowy obszar"}`;
  const delta = await assessPlanDelta({ number: 13, title: "Nowy obszar", body: "to nie mieści się w PK1-PK9" }, digest, { invokeLLM });
  const { deps, c } = spies();
  const out = applyPlanDelta(delta, { number: 13, repo: "o/r" }, deps, { records, threshold: 0.8 });
  assert.equal(out.action, "structural-draft");
  assert.deepEqual(c.done, []);
  assert.deepEqual(c.label, ["triage:plan-change"]);
});
```

- [ ] **Step 2: Run it to verify it passes**

Run: `cd automation/worker && node --test wiki/integration.test.mjs`
Expected: PASS (2 tests) once Tasks 2/3/6 are in (this test uses only their exports).

- [ ] **Step 3: Add imports to worker.mjs**

After the existing policy imports in `automation/worker/worker.mjs`, add:

```js
import { ensurePlanDeltaColumn } from "./wiki/schema.mjs";
import { looksLikeStateChange } from "./wiki/detect.mjs";
import { assessPlanDelta } from "./wiki/assess.mjs";
import { fetchPlanRecordsWithIds, buildDeltaDigest } from "./wiki/plan-index.mjs";
import { markRecordDone } from "./wiki/base-status.mjs";
import { postPlanNote, postPlanDraft } from "./wiki/wiki-note.mjs";
import { labelIssue } from "./triage/github-writer.mjs";
import { applyPlanDelta } from "./wiki/feedback.mjs";
```

- [ ] **Step 4: Ensure the column at startup**

Change:
```js
ensureSchema(db);
ensureStrikeSchema(db);
```
to:
```js
ensureSchema(db);
ensureStrikeSchema(db);
ensurePlanDeltaColumn(db);
```

- [ ] **Step 5: Add the Phase 3 config near the other env reads**

After the `BANNED_LOGINS` block, add:

```js
// Wiki feedback loop: "off" (default, skip entirely) | "dry" (assess + log,
// no writes) | "on" (execute Base/Wiki/label writes). Ships off so nothing
// mutates the shared plan until the lark-cli write commands are verified live.
const WIKI_FEEDBACK = (process.env.WIKI_FEEDBACK ?? "off").trim();
const PLAN_WIKI_DOC = process.env.PLAN_WIKI_DOC ?? "";
const FEEDBACK_THRESHOLD = parseFloat(process.env.FEEDBACK_CONFIDENCE_THRESHOLD ?? "0.8");
```

- [ ] **Step 6: Add a cached records fetch next to getPlanDigest**

After the `getPlanDigest` definition, add:

```js
// Plan records WITH ids, cached like the digest, for the feedback assessment.
let recordsCache = { records: null, at: 0 };
function getPlanRecords() {
  const TTL = 5 * 60 * 1000;
  if (recordsCache.records && Date.now() - recordsCache.at < TTL) return recordsCache.records;
  try {
    recordsCache = { records: fetchPlanRecordsWithIds({ exec }), at: Date.now() };
  } catch (e) { jlog({ level: "warn", msg: "plan-records-fetch-failed", err: String(e) }); }
  return recordsCache.records || [];
}

// Run the plan-delta feedback for a fitting, non-rejected triage. Gated by
// WIKI_FEEDBACK + the cheap looksLikeStateChange filter. In "dry" mode the
// writers are no-ops so nothing mutates; the intended action is still persisted.
async function runFeedback(job, issue, verdict) {
  if (WIKI_FEEDBACK === "off") return;
  if (!verdict || !verdict.fits || !looksLikeStateChange(issue)) return;
  try {
    const records = getPlanRecords();
    const delta = await assessPlanDelta(issue, buildDeltaDigest(records), { invokeLLM });
    const write = WIKI_FEEDBACK === "on" && PLAN_WIKI_DOC !== "";
    const outcome = applyPlanDelta(delta, issue, {
      markDone: (id) => { if (write) markRecordDone(id, { exec }); },
      postNote: (t) => { if (write) postPlanNote(PLAN_WIKI_DOC, t, { exec }); },
      postDraft: (t) => { if (write) postPlanDraft(PLAN_WIKI_DOC, t, { exec }); },
      labelIssue: (l) => { if (write) labelIssue(issue, l, { exec }); },
    }, { records, threshold: FEEDBACK_THRESHOLD });
    db.prepare("UPDATE jobs SET plan_delta = ? WHERE id = ?")
      .run(JSON.stringify({ mode: WIKI_FEEDBACK, wrote: write, kind: delta.kind, ...outcome }), job.id);
    jlog({ level: "info", msg: "plan-delta", id: job.id, mode: WIKI_FEEDBACK, action: outcome.action, wrote: write });
  } catch (e) {
    jlog({ level: "warn", msg: "plan-delta-failed", id: job.id, err: String(e) });
  }
}
```

- [ ] **Step 7: Capture the triage result and invoke feedback**

In the untriaged branch, change:
```js
      try {
        await triageJob(db, untriaged, {
          planDigest: getPlanDigest(),
          evaluate: (issue, digest) => evaluateIssue(issue, digest, { invokeLLM }),
          writeBase: (verdict, issue) => createTriageRecord(verdict, issue, { exec }),
          writeGithub: (issue, verdict) => postVerdict(issue, verdict, { exec }),
          writeRejection: (issue, comment) => postRejection(issue, comment, { exec }),
          pressureReject: (verdict) => pressureOverride(verdict, gateIssue),
          now: Date.now,
          log: (o) => jlog(o),
        });
        jlog({ level: "info", msg: "triaged", id: untriaged.id, issue: untriaged.issue_number });
      } catch (e) {
```
to:
```js
      try {
        const res = await triageJob(db, untriaged, {
          planDigest: getPlanDigest(),
          evaluate: (issue, digest) => evaluateIssue(issue, digest, { invokeLLM }),
          writeBase: (verdict, issue) => createTriageRecord(verdict, issue, { exec }),
          writeGithub: (issue, verdict) => postVerdict(issue, verdict, { exec }),
          writeRejection: (issue, comment) => postRejection(issue, comment, { exec }),
          pressureReject: (verdict) => pressureOverride(verdict, gateIssue),
          now: Date.now,
          log: (o) => jlog(o),
        });
        jlog({ level: "info", msg: "triaged", id: untriaged.id, issue: untriaged.issue_number });
        if (res && !res.rejected) await runFeedback(untriaged, gateIssue, res.verdict);
      } catch (e) {
```

- [ ] **Step 8: Verify the worker package**

Run: `cd automation/worker && node --check worker.mjs && node --check triage/github-writer.mjs && node --check triage/evaluate.mjs && echo SYNTAX_OK`
Expected: `SYNTAX_OK`.

Run the full suite:
Run: `cd automation/worker && npm test`
Expected: all tests pass (Phase 1 + Phase 2 + Phase 3), 0 failures.

- [ ] **Step 9: Deploy notes**

Append to `automation/worker/README.md`:

```markdown
## Wiki feedback loop (Phase 3)

- Ships DORMANT: `WIKI_FEEDBACK` env defaults to `off`. Values: `off` (skip), `dry` (assess + persist intended action to the `plan_delta` column, no writes), `on` (execute Base/Wiki/label writes). Turn on only after verifying the lark-cli write commands live (`--dry-run`) on the server.
- Requires `PLAN_WIKI_DOC` (the plan Wiki doc URL/token) when `on`; without it the loop stays in dry behavior (assess/log, no note). `FEEDBACK_CONFIDENCE_THRESHOLD` defaults to 0.8.
- Only fitting, non-rejected triages whose text matches a completion/fix keyword trigger an assessment (one extra LLM call, gated for cost).
- Auto path (factual + confidence ≥ threshold + resolvable record): flips that plan record's `Status realizacji` → `Zrobione` (`base +record-batch-update`) and adds a note comment on the Wiki doc (`drive +add-comment`). Everything less certain, and ALL structural changes, become a draft proposal comment + a `triage:plan-change` GitHub label — applied by a human, never auto-written to Base.
- New GitHub label required in the repo: `triage:plan-change`. New SQLite column `plan_delta` (additive, `ensurePlanDeltaColumn` at startup, same `queue.db`).
- Deploy: copy `automation/worker/**` (incl. `wiki/`) to `/home/claude-bot/worker/` as `claude-bot`; `lark-cli` must be authenticated in the `claude-bot` context; set `WIKI_FEEDBACK`/`PLAN_WIKI_DOC`; restart `claude-worker`.
```

- [ ] **Step 10: Commit**

```bash
git add automation/worker/worker.mjs automation/worker/wiki/integration.test.mjs automation/worker/README.md
git commit -m "feat(triage): wire Wiki feedback loop into the worker (gated by WIKI_FEEDBACK)"
```

---

## Self-Review

Spec coverage (spec §104–106 Wiki feedback, §57–59 decisions, §182–183 Phase 3, success criterion §199–200):
- Factual corrections auto-applied to Base (`Status realizacji` → Zrobione) + a Wiki note → Task 4 (`markRecordDone`) + Task 5 (`postPlanNote`) + Task 6 (auto route). ✅
- Structural changes → draft + human flag, never auto-applied → Task 5 (`postPlanDraft`) + Task 6 (structural route) + `triage:plan-change` label. ✅
- Confirmed plan-state changes keep Base/Wiki current so the triage basis doesn't go stale → the loop runs on every fitting, completion-signalling triage. ✅
- Never corrupts the plan: factual is a status flip + additive comment gated on high confidence + a resolvable record; uncertainty downgrades to draft → Task 6 routing + Global Constraints. ✅

Out of scope (spec §187–191), correctly NOT implemented: Jam polling, ML dedup, auto collaborator/account removal, `Task breakdown` table, and rewriting Wiki doc content (we only add comments, never `docs +update`).

Placeholder scan: no TBD/TODO; every code and test step carries full content. The two live wire-shape verifications (Tasks 4 & 5) use `--dry-run` and are explicit, bounded verification steps, not placeholders.

Type consistency: `parsePlanDelta` returns `{kind, recordId, package, note, confidence, rationale}` (Task 2), consumed by `applyPlanDelta` (Task 6) and the worker (Task 7). `fetchPlanRecordsWithIds` returns `{record_id, fields}` (Task 3), consumed by `buildDeltaDigest`/`resolveRecordId` (Task 3) and `runFeedback` (Task 7). `applyPlanDelta`'s `deps` shape `{markDone, postNote, postDraft, labelIssue}` matches the worker's wiring. `markRecordDone(recordId,{exec})`, `postPlanNote(doc,text,{exec})`, `labelIssue(issue,label,{exec})` signatures match their call sites. The feedback step is additive and gated, so Phase 1/2 behavior is unchanged when `WIKI_FEEDBACK=off` (the default).

Decisions baked in (flagged for the executor's pre-flight): (1) writes ship dormant behind `WIKI_FEEDBACK=off` — a deploy-safety default, not a change to the spec's "auto factual" decision; the user can set `on` immediately. (2) factual auto requires confidence ≥ 0.8 AND a resolvable record, else it downgrades to a human draft — a guard against corrupting the shared plan on an LLM misread. Both are surfaced here so the executor confirms them before Task 1.
