# GitHub/Jam Triage — Phase 3 (Wiki Feedback Loop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the launch plan and its documentation in sync with reality WITHOUT losing the launch goal: record every in-scope change a triaged issue implies — a task that is now done, a newly-found bug that sets launch-readiness back (a new/raised blocker), or a structural plan change — while ignoring out-of-scope reports (they stay backlog and never touch the plan).

**Architecture:** A new module tree under `automation/worker/wiki/`. After a successful, non-rejected triage, a cheap keyword gate (`looksLikePlanImpact`) decides whether to spend an LLM call assessing the issue's effect on launch readiness. The assessment returns a structured delta oriented around the launch goal: `completed` (an in-scope plan task is done), `regression` (an in-scope bug/blocker moves readiness backward and must be recorded — the basis for a P0), `structural` (the plan's structure/direction changes — human decision), or `none` (no launch-relevant impact, e.g. an out-of-scope area). An engine (`applyPlanDelta`) routes it: only a high-confidence `completed` with a resolvable Base record is auto-applied (status → Zrobione + note); everything else that IS launch-relevant is RECORDED (a Wiki note and/or a draft proposal + a `triage:plan-change` label) for a human, and out-of-scope deltas change nothing. A `WIKI_FEEDBACK` env switch (off | dry | on) gates whether writes actually execute, so the loop can ship dormant and be turned on after the lark-cli write commands are verified live.

**Tech Stack:** Node ESM daemon, `better-sqlite3`, built-in `node:test` runner, `lark-cli` (Base + Drive) and `gh` via the worker's injected `exec` helper. Zero new npm dependencies.

## Global Constraints

- Zero new npm dependencies. Tests use the built-in `node:test` runner; run with `npm test` (which runs `node --test`) from `automation/worker/`.
- **Plan-direction safeguard (the core requirement).** The loop's job is to keep the plan/docs current WITHOUT drifting away from the launch goal. Concretely: (a) it only ever mutates the plan for LAUNCH-RELEVANT (in-scope) changes; an out-of-scope report (e.g. warehouse / "magazyn", which is outside the launch packages PK1–PK9) yields `kind:"none"` and changes nothing — it stays backlog. (b) It NEVER removes, deletes, or lowers the priority of anything; it only marks done, records a new blocker, or proposes a structural change for a human. (c) Every launch-relevant change IS recorded (a note and/or a persisted `plan_delta` row) — nothing in-scope is silently dropped.
- **Delta kinds** (assessment output `kind`): `completed` (an in-scope plan task is now done), `regression` (an in-scope bug/blocker that moves launch-readiness backward — e.g. a calendar bug in gabinet reported via GH that must be fixed before launch; the basis for adding/raising a P0), `structural` (a change to the plan's structure or direction — new package, invalidated closure condition), `none` (no launch-relevant plan impact, incl. anything out of launch scope).
- **Auto vs record vs draft:**
  - `completed` + `confidence >= FEEDBACK_CONFIDENCE_THRESHOLD` (default 0.8) + a resolvable `recordId` → AUTO: flip that record's `Status realizacji` → `Zrobione` (`base +record-batch-update`) + a Wiki note. This is the ONLY auto-write to Base.
  - `completed` without enough confidence or a resolvable record → DRAFT: Wiki proposal comment + `triage:plan-change` label. Recorded, not written to Base.
  - `regression` → RECORD: a Wiki note documenting the readiness regression + a `triage:plan-change` label so a human raises/adds the P0. Never a silent status write; always recorded.
  - `structural` → DRAFT only: Wiki proposal comment + label. The agent NEVER auto-applies a structural/direction change.
  - `none` → nothing.
- **Verified lark-cli commands** (confirmed available this session; both support `--dry-run`, which prints the request without executing — use it to verify wire shapes without mutating the shared plan):
  - Base status update: `lark-cli base +record-batch-update --base-token <T> --table-id <tbl> --json '{"update_records":{"<recId>":{"Status realizacji":["Zrobione"]}}}' --format json`. A single-select field value is an ARRAY (`["Zrobione"]`), per the command's help example `{"Status":["Done"]}`.
  - Wiki note: `lark-cli drive +add-comment --doc <wikiURLorToken> --type docx --full-comment --content '<reply_elements JSON>' --format json`. A comment is a NON-destructive note — do NOT use `docs +update` (which rewrites content). The exact `reply_elements` shape MUST be confirmed with `--dry-run` in Task 5 (like Phase 1 Task 5's sanctioned command verification).
  - Plan record fetch WITH ids: `lark-cli base +record-list` returns `data.data` (value arrays), `data.fields` (names), and `data.record_id_list` (ids) in parallel. Phase 1's `fetchPlanRecords` discarded ids; Phase 3 zips `record_id_list` back in.
- `BASE_TOKEN` and `TABLE_ID` are already exported from `automation/worker/triage/plan.mjs` — import them, do not redefine.
- **Trigger gate (cost control, but wide enough for regressions):** the assessment (one LLM call) runs only when the triage was NOT rejected (policy/pressure) AND `looksLikePlanImpact(issue)` is true (the issue text signals either a completion OR a bug/blocker). It runs for both `fits` and `backlog` verdicts, because a newly-found blocker often does NOT match an existing plan task (`fits=false`) yet is still launch-relevant — the assessment itself decides relevance and returns `none` for genuinely out-of-scope reports.
- **Safety — writes gated by `WIKI_FEEDBACK`** (env, default `"off"`): `off` = skip entirely (no LLM, no writes); `dry` = assess + persist the intended action to `plan_delta`, but no external writes; `on` = execute. Ships `off` so nothing mutates the shared plan until a human validates the lark-cli write commands live and sets the env. In every mode the intended action is persisted to `plan_delta` (the durable record). The user's intent is to run `on` after live verification.
- The agent NEVER deletes or rewrites plan content: `completed` is a status flip + additive comment; `regression`/`structural` are additive comments + a label. No `docs +update`, no record deletion, no priority lowering.
- Phase 3 must not regress Phase 1 or Phase 2: it ADDS a step after a successful triage and one additive SQLite column. `triageJob` already returns `{ verdict, recordId }` (or `{ verdict, rejected }`); the worker captures that to decide whether to run feedback. Existing tests must still pass.

---

## File Structure

- `automation/worker/wiki/schema.mjs` — `ensurePlanDeltaColumn(db)` (additive `plan_delta` column). (Task 1)
- `automation/worker/wiki/detect.mjs` — `looksLikePlanImpact(issue)` cheap gate (completion OR blocker language). (Task 1)
- `automation/worker/wiki/assess.mjs` — `buildDeltaPrompt`, `parsePlanDelta`, `assessPlanDelta`. (Task 2)
- `automation/worker/triage/evaluate.mjs` — MODIFY: export `extractJson` for reuse. (Task 2)
- `automation/worker/wiki/plan-index.mjs` — `fetchPlanRecordsWithIds`, `buildDeltaDigest`, `resolveRecordId`. (Task 3)
- `automation/worker/wiki/base-status.mjs` — `markRecordDone`. (Task 4)
- `automation/worker/wiki/wiki-note.mjs` — `buildCommentContent`, `postPlanNote`, `postPlanDraft`. (Task 5)
- `automation/worker/triage/github-writer.mjs` — MODIFY: add `labelIssue`. (Task 5)
- `automation/worker/wiki/feedback.mjs` — `applyPlanDelta` engine. (Task 6)
- `automation/worker/worker.mjs` — MODIFY: wire the feedback step + env + record cache. (Task 7)
- Tests co-located as `*.test.mjs` next to each module.

---

### Task 1: Plan-delta column + plan-impact gate

**Files:**
- Create: `automation/worker/wiki/schema.mjs`, `automation/worker/wiki/detect.mjs`
- Test: `automation/worker/wiki/schema.test.mjs`, `automation/worker/wiki/detect.test.mjs`

**Interfaces:**
- Consumes: a `better-sqlite3` `db` with the Phase 1 `jobs` table; an `issue` (`{title, body, ...}`).
- Produces:
  - `ensurePlanDeltaColumn(db): void` — additive `ALTER TABLE jobs ADD COLUMN plan_delta TEXT` when missing.
  - `COMPLETION_PHRASES: string[]`, `BLOCKER_PHRASES: string[]`, `looksLikePlanImpact(issue): boolean` — true if the text signals a completion OR a bug/blocker (either can change launch readiness).

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
import { looksLikePlanImpact } from "./detect.mjs";

test("fires on completion language", () => {
  assert.equal(looksLikePlanImpact({ title: "To już zrobione", body: "" }), true);
  assert.equal(looksLikePlanImpact({ title: "", body: "This is already done" }), true);
});

test("fires on bug / blocker language (a regression to readiness)", () => {
  assert.equal(looksLikePlanImpact({ title: "Błąd w kalendarzu gabinetu", body: "kalendarz nie działa i blokuje wizyty" }), true);
  assert.equal(looksLikePlanImpact({ title: "Crash on save", body: "this breaks the flow" }), true);
});

test("does not fire on a neutral feature ask", () => {
  assert.equal(looksLikePlanImpact({ title: "Dodać eksport CSV", body: "Przydałby się przycisk eksportu" }), false);
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
// Cheap gate: only spend an LLM assessment on issues whose text plausibly
// changes launch readiness — a completion OR a bug/blocker. Presence-only, like
// the pressure detector; the actual launch-relevance judgment is the assessment's.
export const COMPLETION_PHRASES = [
  "zrobione", "zrobiono", "gotowe", "ukończone", "ukonczone", "wdrożone", "wdrozone",
  "naprawione", "naprawiony", "naprawiłem", "naprawilem", "naprawili",
  "już działa", "juz dziala", "działa już", "dziala juz", "rozwiązane", "rozwiazane",
  "already done", "already fixed", "is fixed", "is done", "resolved",
];
export const BLOCKER_PHRASES = [
  "błąd", "blad", "bug", "nie działa", "nie dziala", "psuje", "blokuje", "blokad",
  "uniemożliwia", "uniemozliwia", "krytyczn", "regres", "cofa", "awaria",
  "broken", "breaks", "blocks", "blocker", "regression", "crash", "fails",
];

export function looksLikePlanImpact(issue) {
  const text = `${issue.title || ""}\n${issue.body || ""}`.toLowerCase();
  return [...COMPLETION_PHRASES, ...BLOCKER_PHRASES].some((p) => text.includes(p));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd automation/worker && node --test wiki/schema.test.mjs wiki/detect.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add automation/worker/wiki/schema.mjs automation/worker/wiki/detect.mjs \
        automation/worker/wiki/schema.test.mjs automation/worker/wiki/detect.test.mjs
git commit -m "feat(triage/wiki): plan_delta column + plan-impact gate"
```

---

### Task 2: Plan-delta assessment (LLM, launch-oriented)

**Files:**
- Create: `automation/worker/wiki/assess.mjs`
- Modify: `automation/worker/triage/evaluate.mjs` (export `extractJson`)
- Test: `automation/worker/wiki/assess.test.mjs`

**Interfaces:**
- Consumes: `extractJson` from `../triage/evaluate.mjs`; an injected `invokeLLM(prompt) -> string`.
- Produces:
  - `buildDeltaPrompt(issue, deltaDigest): string`
  - `parsePlanDelta(raw): { kind: "completed"|"regression"|"structural"|"none", recordId: string|null, package: string|null, note: string, confidence: number, rationale: string }`
  - `assessPlanDelta(issue, deltaDigest, { invokeLLM }): Promise<Delta>`

- [ ] **Step 1: Write the failing test**

```js
// automation/worker/wiki/assess.test.mjs
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd automation/worker && node --test wiki/assess.test.mjs`
Expected: FAIL — `Cannot find module './assess.mjs'`.

- [ ] **Step 3: Export `extractJson` from evaluate.mjs**

In `automation/worker/triage/evaluate.mjs`, change `function extractJson(text) {` to `export function extractJson(text) {`. Make NO other change.

Run the Phase 1 evaluator tests to confirm no regression:
Run: `cd automation/worker && node --test triage/evaluate.test.mjs`
Expected: PASS (unchanged).

- [ ] **Step 4: Write the assessment implementation**

```js
// automation/worker/wiki/assess.mjs
import { extractJson } from "../triage/evaluate.mjs";

const PACKAGES = ["PK1", "PK2", "PK3", "PK4", "PK5", "PK6", "PK7", "PK8", "PK9"];
const KINDS = ["completed", "regression", "structural", "none"];

export function buildDeltaPrompt(issue, deltaDigest) {
  return `Cel projektu: doprowadzić produkt do URUCHOMIENIA produkcyjnego. Poniżej plan startu (pakiety PK1–PK9) — to jest ZAKRES startu. Oceń, jak PONIŻSZE zgłoszenie wpływa na GOTOWOŚĆ do startu. Zwróć JEDEN obiekt JSON:

{
  "kind": "completed" | "regression" | "structural" | "none",
  // completed = zgłoszenie potwierdza, że KONKRETNE zadanie z planu jest już zrobione
  // regression = w zakresie startu znaleziono błąd/bloker, który COFA gotowość i trzeba go zrobić przed startem (podstawa do P0)
  // structural = plan wymaga zmiany struktury/kierunku (nowy pakiet, unieważniony warunek zamknięcia) — decyzja człowieka
  // none = brak wpływu na plan startu, w tym cokolwiek POZA zakresem startu (np. magazyn) — to zostaje w backlogu
  "recordId": "rec..."|null,   // tylko dla completed: id rekordu planu z tagów [recXXX] poniżej; inaczej null
  "package": "PK1".."PK9"|null,
  "note": string,              // 1 zdanie po polsku: co się zmienia w gotowości/planie
  "confidence": number,        // 0..1
  "rationale": string
}

Zasady kierunku (WAŻNE): NIGDY nie proponuj usunięcia zadania ani obniżenia priorytetu rzeczy krytycznych dla startu — możesz tylko oznaczyć jako zrobione, odnotować nowy bloker (regression) albo zaproponować zmianę strukturalną (structural). Jeśli zgłoszenie dotyczy obszaru POZA zakresem startu (nie mieści się w żadnym PK), ustaw kind="none". Przy niepewności obniż confidence. Zwróć wyłącznie JSON.

## Plan startu (zadania z identyfikatorami rekordów)
${deltaDigest}

## Zgłoszenie #${issue.number}
Tytuł: ${issue.title}
Treść:
${issue.body || "(brak treści)"}`;
}

export function parsePlanDelta(raw) {
  const empty = { kind: "none", recordId: null, package: null, note: "", confidence: 0, rationale: "" };
  let o = raw;
  if (typeof raw === "string") {
    try { o = JSON.parse(raw); } catch { return { ...empty }; }
  }
  if (!o || typeof o !== "object") return { ...empty };
  const kind = KINDS.includes(o.kind) ? o.kind : "none";
  const recordId = typeof o.recordId === "string" && o.recordId.startsWith("rec") ? o.recordId : null;
  const pkg = PACKAGES.includes(o.package) ? o.package : null;
  let confidence = Number(o.confidence);
  if (!Number.isFinite(confidence)) confidence = 0;
  confidence = Math.max(0, Math.min(1, confidence));
  return {
    kind,
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
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add automation/worker/wiki/assess.mjs automation/worker/wiki/assess.test.mjs automation/worker/triage/evaluate.mjs
git commit -m "feat(triage/wiki): launch-oriented plan-delta assessment (completed/regression/structural/none)"
```

---

### Task 3: Plan index — records with ids, delta digest, record resolution

**Files:**
- Create: `automation/worker/wiki/plan-index.mjs`
- Test: `automation/worker/wiki/plan-index.test.mjs`

**Interfaces:**
- Consumes: injected `exec(cmd, args) -> { stdout }`; `BASE_TOKEN`, `TABLE_ID` from `../triage/plan.mjs`.
- Produces:
  - `fetchPlanRecordsWithIds({ exec }): Array<{ record_id: string, fields: object }>` — zips `data.record_id_list` with `data.data` + `data.fields`.
  - `buildDeltaDigest(records): string` — PK-grouped digest, each line tagged with its `[record_id]`.
  - `resolveRecordId(records, delta): { record_id, fields } | null`.

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
  const recs = fetchPlanRecordsWithIds({ exec: () => ({ stdout: recordListJson }) });
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

test("resolveRecordId finds a known record and returns null for unknown/none", () => {
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

// Like triage/plan.mjs fetchPlanRecords, but keeps record_id (needed to target a
// status update). +record-list returns data.data (value arrays), data.fields
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

// PK-grouped digest with a [record_id] tag per line, so the assessment can name
// exactly which plan record a completion refers to.
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

Confirm the shape is accepted WITHOUT mutating the Base, using `--dry-run`:

Run: `lark-cli base +record-batch-update --base-token BEm9bfWsFa0dHasHlu6j5ynkpSd --table-id tbl61BNGL8JLsUpF --json '{"update_records":{"recTEST":{"Status realizacji":["Zrobione"]}}}' --dry-run --format json`
Expected: a printed request payload with no field/value shape error. If the CLI rejects the array-valued select or names a different field key, record the correct shape in the report and adjust `markRecordDone` (sanctioned wire-shape correction, like Phase 1 Task 5). If `--dry-run` errors for auth reasons unrelated to shape, note it and proceed — the unit test pins the intended shape.

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
  - `postPlanNote(doc, text, { exec }): void` — a `drive +add-comment` note (recording a fact: a completion or a readiness regression).
  - `postPlanDraft(doc, text, { exec }): void` — same, prefixed with a "PROPOZYCJA ZMIANY PLANU (do akceptacji człowieka)" marker (structural / low-confidence completion).
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
// rewrites doc content). NOTE: confirm the reply_elements shape for --content
// with `drive +add-comment ... --dry-run` before enabling writes.
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

Run: `lark-cli drive +add-comment --doc <a real plan Wiki doc URL> --type docx --full-comment --content '[{"type":"text","content":"test"}]' --dry-run --format json`
Expected: a printed request with no shape error. If the CLI expects a different `reply_elements` structure (e.g. `[{"type":"text_run","text_run":{"text":"..."}}]`), record it and update `buildCommentContent` (sanctioned wire-shape correction). If `--dry-run` errors for reasons unrelated to shape, note it and proceed — the unit test pins the call construction; only `buildCommentContent`'s inner shape may need the live fix.

- [ ] **Step 6: Commit**

```bash
git add automation/worker/wiki/wiki-note.mjs automation/worker/wiki/wiki-note.test.mjs \
        automation/worker/triage/github-writer.mjs automation/worker/triage/github-writer-label.test.mjs
git commit -m "feat(triage/wiki): Wiki note/draft comment writer + plan-change label"
```

---

### Task 6: Feedback engine (route the delta, direction-preserving)

**Files:**
- Create: `automation/worker/wiki/feedback.mjs`
- Test: `automation/worker/wiki/feedback.test.mjs`

**Interfaces:**
- Consumes: `resolveRecordId` from `./plan-index.mjs`.
- Produces: `applyPlanDelta(delta, issue, deps, { records, threshold }): { action, applied, recorded, recordId, kind }` where
  - `deps = { markDone(recordId), postNote(text), postDraft(text), labelIssue(label) }` (injected).
  - Routing (direction-preserving — only marks done, records a blocker, or drafts; never removes or lowers priority):
    - `none` → nothing. `{ action: "none" }`.
    - `completed` + `confidence >= threshold` + `resolveRecordId` hit → `markDone` + `postNote` (auto). `{ action: "completed-auto", applied: true }`.
    - `completed` otherwise → `postDraft` + `labelIssue("triage:plan-change")`. `{ action: "completed-draft", applied: false }`.
    - `regression` → `postNote` (record the readiness regression) + `labelIssue("triage:plan-change")` (flag for a human to raise/add P0). `{ action: "regression-recorded", applied: false, recorded: true }`.
    - `structural` → `postDraft` + `labelIssue("triage:plan-change")`. `{ action: "structural-draft", applied: false }`.

- [ ] **Step 1: Write the failing test**

```js
// automation/worker/wiki/feedback.test.mjs
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd automation/worker && node --test wiki/feedback.test.mjs`
Expected: FAIL — `Cannot find module './feedback.mjs'`.

- [ ] **Step 3: Write the implementation**

```js
// automation/worker/wiki/feedback.mjs
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd automation/worker && node --test wiki/feedback.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add automation/worker/wiki/feedback.mjs automation/worker/wiki/feedback.test.mjs
git commit -m "feat(triage/wiki): direction-preserving feedback engine (completed/regression/structural)"
```

---

### Task 7: Wire the feedback loop into the worker

**Files:**
- Modify: `automation/worker/worker.mjs`
- Test: `automation/worker/wiki/integration.test.mjs` (new)
- Docs: `automation/worker/README.md` (append a Phase 3 section)

**Interfaces:**
- Consumes: `ensurePlanDeltaColumn` (`./wiki/schema.mjs`), `looksLikePlanImpact` (`./wiki/detect.mjs`), `assessPlanDelta` (`./wiki/assess.mjs`), `fetchPlanRecordsWithIds`, `buildDeltaDigest` (`./wiki/plan-index.mjs`), `markRecordDone` (`./wiki/base-status.mjs`), `postPlanNote`, `postPlanDraft` (`./wiki/wiki-note.mjs`), `labelIssue` (`./triage/github-writer.mjs`), `applyPlanDelta` (`./wiki/feedback.mjs`), and the existing `exec`, `jlog`, `invokeLLM`, `triageJob`.
- Produces: after a successful, non-rejected triage, an optional feedback step gated by `WIKI_FEEDBACK` + `looksLikePlanImpact`.

- [ ] **Step 1: Write the integration test**

```js
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
```

- [ ] **Step 2: Run it to verify it passes**

Run: `cd automation/worker && node --test wiki/integration.test.mjs`
Expected: PASS (3 tests) once Tasks 2/3/6 are in (this test uses only their exports).

- [ ] **Step 3: Add imports to worker.mjs**

After the existing policy imports in `automation/worker/worker.mjs`, add:

```js
import { ensurePlanDeltaColumn } from "./wiki/schema.mjs";
import { looksLikePlanImpact } from "./wiki/detect.mjs";
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
// Wiki feedback loop: "off" (default, skip) | "dry" (assess + persist, no writes)
// | "on" (execute Base/Wiki/label writes). Ships off so nothing mutates the
// shared plan until the lark-cli write commands are verified live.
const WIKI_FEEDBACK = (process.env.WIKI_FEEDBACK ?? "off").trim();
const PLAN_WIKI_DOC = process.env.PLAN_WIKI_DOC ?? "";
const FEEDBACK_THRESHOLD = parseFloat(process.env.FEEDBACK_CONFIDENCE_THRESHOLD ?? "0.8");
```

- [ ] **Step 6: Add a cached records fetch + the feedback runner next to getPlanDigest**

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

// Run the plan-delta feedback for a non-rejected triage. Gated by WIKI_FEEDBACK
// + the cheap looksLikePlanImpact filter. Runs for both fits and backlog (a new
// blocker may not match an existing task); the assessment returns "none" for
// out-of-scope reports. In "dry" mode writers are no-ops (nothing mutates); the
// intended action is still persisted to plan_delta.
async function runFeedback(job, issue) {
  if (WIKI_FEEDBACK === "off") return;
  if (!looksLikePlanImpact(issue)) return;
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
      .run(JSON.stringify({ mode: WIKI_FEEDBACK, wrote: write, note: delta.note, ...outcome }), job.id);
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
        if (res && !res.rejected) await runFeedback(untriaged, gateIssue);
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

- Purpose: keep the plan/docs current WITHOUT losing the launch goal. Records every launch-relevant change a triaged issue implies; out-of-scope reports (e.g. magazyn) change nothing.
- Ships DORMANT: `WIKI_FEEDBACK` env defaults to `off`. Values: `off` (skip), `dry` (assess + persist to the `plan_delta` column, no external writes), `on` (execute). Turn on only after verifying the lark-cli write commands live (`--dry-run`) on the server. The intended action is persisted to `plan_delta` in every mode.
- Requires `PLAN_WIKI_DOC` (the plan Wiki doc URL/token) when `on`. `FEEDBACK_CONFIDENCE_THRESHOLD` defaults to 0.8.
- Delta kinds: `completed` (in-scope task done → AUTO status→Zrobione + note, only when confidence ≥ threshold AND the record resolves; else draft), `regression` (in-scope bug/blocker that sets readiness back → records a Wiki note + `triage:plan-change` label so a human raises/adds the P0; never a silent status write), `structural` (plan-direction change → draft proposal + label, never auto), `none` (out of launch scope → nothing).
- Direction safeguard: the loop only ever marks done, records a blocker, or proposes a change — it NEVER removes or lowers priority. Only fitting-and-confident completions auto-write.
- Trigger: any non-rejected triage whose text matches a completion OR bug/blocker keyword (runs for both fits and backlog — a new blocker often isn't an existing task). One extra LLM call, gated.
- New GitHub label required: `triage:plan-change`. New additive SQLite column `plan_delta` (`ensurePlanDeltaColumn` at startup, same `queue.db`).
- Deploy: copy `automation/worker/**` (incl. `wiki/`) to `/home/claude-bot/worker/` as `claude-bot`; `lark-cli` authenticated in the `claude-bot` context; set `WIKI_FEEDBACK`/`PLAN_WIKI_DOC`; restart `claude-worker`.
```

- [ ] **Step 10: Commit**

```bash
git add automation/worker/worker.mjs automation/worker/wiki/integration.test.mjs automation/worker/README.md
git commit -m "feat(triage): wire direction-preserving Wiki feedback loop into the worker"
```

---

## Self-Review

Spec coverage + the user's plan-direction ruling:
- Factual completion auto-applied to Base + Wiki note → Task 4 + Task 5 + Task 6 (`completed-auto`), gated confidence ≥ 0.8 + resolvable record. ✅
- **Regression (new/raised launch blocker found via GH) recorded** → Task 1 (blocker gate), Task 2 (`regression` kind, launch-oriented prompt), Task 6 (`regression-recorded`: Wiki note + `triage:plan-change` label). This is the user's primary example (a gabinet calendar bug that sets readiness back → basis for P0). ✅
- Structural changes → draft + human flag, never auto → Task 5 + Task 6 (`structural-draft`). ✅
- **Direction safeguard:** out-of-scope reports (magazyn) → `none` → plan untouched (Task 2 prompt rule + Task 6 routing); the engine only marks done / records / drafts, never removes or lowers priority (Global Constraints + Task 6). ✅
- Every launch-relevant change recorded (note and/or persisted `plan_delta`), nothing in-scope silently dropped → Task 7 persistence + Task 6 routing. ✅
- Auto only at confidence ≥ 0.8 + resolvable record (user's Q2 choice) → Task 6. ✅

Out of scope (spec §187–191), correctly NOT implemented: Jam polling, ML dedup, auto collaborator/account removal, `Task breakdown` table, rewriting Wiki doc content (comments only, never `docs +update`).

Placeholder scan: no TBD/TODO; every code/test step is complete. The two live wire-shape verifications (Tasks 4 & 5) use `--dry-run` and are explicit bounded steps, not placeholders.

Type consistency: `parsePlanDelta` → `{kind, recordId, package, note, confidence, rationale}` (Task 2) consumed by `applyPlanDelta` (Task 6) + worker (Task 7). `fetchPlanRecordsWithIds` → `{record_id, fields}` (Task 3) consumed by `buildDeltaDigest`/`resolveRecordId` (Task 3) + `runFeedback` (Task 7). `applyPlanDelta` deps `{markDone, postNote, postDraft, labelIssue}` match the worker wiring and the writer signatures (`markRecordDone(id,{exec})`, `postPlanNote(doc,text,{exec})`, `labelIssue(issue,label,{exec})`). Feedback is additive + gated, so Phase 1/2 behavior is unchanged when `WIKI_FEEDBACK=off` (default) and the Phase 1 runner/evaluate tests still pass.

Baked-in decisions (confirmed with the user): (1) writes ship dormant behind `WIKI_FEEDBACK=off` (deploy-safety; the intent is `on` after live verification); (2) auto status-write only for `completed` at confidence ≥ 0.8 + resolvable record — everything else in-scope is recorded/flagged for a human, preserving plan direction.
