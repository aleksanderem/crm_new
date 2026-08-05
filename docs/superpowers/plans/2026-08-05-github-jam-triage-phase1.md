# GitHub/Jam Triage — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wstawić do workera automatyzacji bramkę triage przed poborem zadania: nowe issue zostaje ocenione względem planu (Base „Team OKR Tasks"), werdykt zapisany podwójnie (rekord Base + komentarz/etykieta GitHub), a `claimNext` bierze zadania wg planu (Priorytet/Kolejność) zamiast FIFO.

**Architecture:** Nowe moduły w `automation/worker/triage/` (czyste, testowalne funkcje: parsowanie werdyktu, digest planu, budowanie komend lark-cli/gh, orkiestracja) + rozszerzenie `jobs` (SQLite) o kolumny triage + reorder `claimNext`. Ocena issue→PK to wywołanie LLM (reużycie wzorca `run-claude.sh`), wstrzykiwane jako zależność, więc w testach zamockowane. Faza 1 NIE obejmuje policy/anti-abuse (Faza 2) ani pętli Wiki (Faza 3). Spec: `docs/superpowers/specs/2026-08-05-github-jam-triage-design.md`.

**Tech Stack:** Node.js ESM, `better-sqlite3` (istniejąca zależność workera), wbudowany test runner `node --test` (zero nowych zależności), `lark-cli` (Base), `gh` (GitHub). Worker to osobny pakiet `automation/worker/` (bez builda, uruchamiany jako demon systemd na Hetznerze).

## Global Constraints

- Gałąź robocza: `feat/github-jam-triage` (istnieje; spec już zacommitowany).
- Worker to NIE repo git na serwerze — pliki są kopiowane do `/home/claude-bot/worker/`. Plan NIE wdraża automatycznie na serwer; deploy to osobny, ręczny krok (Task 9), własność `claude-bot` (RunCloud).
- Zero nowych zależności npm w workerze — testy przez wbudowany `node --test`, baza testowa `better-sqlite3` w trybie `:memory:`.
- Komendy testów uruchamiane z `automation/worker/`: `node --test` (cały suite) lub `node --test triage/<plik>.test.mjs` (pojedynczy).
- Wszystkie stringi komunikatów do użytkownika po polsku (Faza 1: przyjęte / backlog / wstępny). Ton neutralny-rzeczowy; ostre tony i policy dochodzą w Fazie 2.
- Werdykt ma stały kształt (używany przez wszystkie moduły):
  ```js
  // Verdict
  {
    fits: boolean,                       // true = należy do PK; false = backlog
    package: "PK1"|...|"PK9"|null,       // dopasowany pakiet
    priority: "P0"|"P1"|"P2"|null,       // dziedziczony z pakietu
    order: number|null,                  // Kolejność z planu
    module: string|null,                 // Moduł
    confidence: number,                  // 0..1
    rationale: string,                   // PL, jedno-dwa zdania
  }
  ```
- Ranga priorytetu (do sortowania kolejki): `P0→0, P1→1, P2→2, backlog→9`.
- Base „Team OKR Tasks": app_token `BEm9bfWsFa0dHasHlu6j5ynkpSd`, table_id `tbl61BNGL8JLsUpF`. Pola: `Pakiet`, `Priorytet`, `Kolejność`, `Moduł`, `Obszar`, `Status realizacji`, `Zadanie`, `Opis`, `Zależności`, `Estymacja`. Wartości `Priorytet`: „P0 – blokuje start", „P1 – przed pierwszym klientem", „P2 – po starcie". Wartości `Pakiet`: „PK1 · Zielona bramka i jedno źródło terminów" … „PK9 · Sprzedaż i rozliczenia platformy".

---

### Task 1: Wspólny schemat bazy + kolumny triage

**Files:**
- Create: `automation/worker/schema.mjs`
- Create: `automation/worker/triage/schema.test.mjs`
- Modify: `automation/worker/webhook.mjs:28-46` (użycie wspólnego `ensureSchema`)
- Modify: `automation/worker/worker.mjs:31-32` (użycie wspólnego `ensureSchema`)

**Interfaces:**
- Produces:
  ```js
  // automation/worker/schema.mjs
  export function ensureSchema(db); // idempotent: CREATE TABLE jobs (jeśli brak) + additive ALTER dla kolumn triage
  ```
  Kolumny triage dodawane do `jobs`: `triage_status TEXT DEFAULT 'untriaged'`,
  `triage_package TEXT`, `triage_priority TEXT`, `triage_order INTEGER`,
  `triage_confidence REAL`, `triage_rationale TEXT`, `triage_base_record_id TEXT`.

- [ ] **Step 1: Napisz failing test**

`automation/worker/triage/schema.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { ensureSchema } from "../schema.mjs";

function columns(db) {
  return db.prepare("PRAGMA table_info(jobs)").all().map((c) => c.name);
}

test("ensureSchema creates jobs table with base + triage columns on a fresh db", () => {
  const db = new Database(":memory:");
  ensureSchema(db);
  const cols = columns(db);
  for (const c of ["id", "issue_number", "repo", "trigger_login", "status", "created_at",
                   "triage_status", "triage_package", "triage_priority", "triage_order",
                   "triage_confidence", "triage_rationale", "triage_base_record_id"]) {
    assert.ok(cols.includes(c), `missing column ${c}`);
  }
});

test("ensureSchema adds triage columns to a pre-existing jobs table (migration)", () => {
  const db = new Database(":memory:");
  // simulate the OLD schema (pre-triage) exactly as webhook.mjs created it
  db.exec(`CREATE TABLE jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, issue_number INTEGER NOT NULL, repo TEXT NOT NULL,
    event_type TEXT NOT NULL, trigger_login TEXT, trigger_comment_id INTEGER,
    payload_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL, started_at INTEGER, finished_at INTEGER, result TEXT);`);
  ensureSchema(db);
  const cols = columns(db);
  assert.ok(cols.includes("triage_status"));
  assert.equal(db.prepare("PRAGMA table_info(jobs)").all().find((c) => c.name === "triage_status").dflt_value, "'untriaged'");
});

test("ensureSchema is idempotent (second call does not throw)", () => {
  const db = new Database(":memory:");
  ensureSchema(db);
  ensureSchema(db);
  assert.ok(columns(db).includes("triage_package"));
});
```

- [ ] **Step 2: Uruchom — FAIL** (brak modułu)

Run: `cd automation/worker && node --test triage/schema.test.mjs`
Expected: FAIL — `Cannot find module '../schema.mjs'`.

- [ ] **Step 3: Utwórz `automation/worker/schema.mjs`**

```js
// Shared jobs-table schema. Both the webhook (ingest) and the worker/triage
// (consume) call ensureSchema so the columns exist regardless of which process
// touches a fresh or already-migrated database first. Additive-only: never drops.
const BASE_TABLE = `
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    issue_number INTEGER NOT NULL,
    repo TEXT NOT NULL,
    event_type TEXT NOT NULL,
    trigger_login TEXT,
    trigger_comment_id INTEGER,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    finished_at INTEGER,
    result TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_status_created ON jobs(status, created_at);
`;

// name -> column definition appended via ALTER TABLE when missing.
const TRIAGE_COLUMNS = {
  triage_status: "TEXT DEFAULT 'untriaged'",
  triage_package: "TEXT",
  triage_priority: "TEXT",
  triage_order: "INTEGER",
  triage_confidence: "REAL",
  triage_rationale: "TEXT",
  triage_base_record_id: "TEXT",
};

export function ensureSchema(db) {
  db.exec(BASE_TABLE);
  const existing = new Set(
    db.prepare("PRAGMA table_info(jobs)").all().map((c) => c.name),
  );
  for (const [name, def] of Object.entries(TRIAGE_COLUMNS)) {
    if (!existing.has(name)) {
      db.exec(`ALTER TABLE jobs ADD COLUMN ${name} ${def}`);
    }
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_triage_status ON jobs(triage_status)");
}
```

- [ ] **Step 4: Uruchom — PASS**

Run: `cd automation/worker && node --test triage/schema.test.mjs`
Expected: PASS (3 testy).

- [ ] **Step 5: Podłącz wspólny schemat w webhook.mjs i worker.mjs**

W `automation/worker/webhook.mjs`: dodaj u góry `import { ensureSchema } from "./schema.mjs";`, i ZASTĄP blok `db.exec(\`CREATE TABLE ... idx_status_created ...\`);` (linie ~30-46) jednym wywołaniem:
```js
ensureSchema(db);
```
(Reszta pliku — `insertJob`, handler — bez zmian; kolumny triage mają defaulty, więc `insertJob` nie musi ich podawać.)

W `automation/worker/worker.mjs`: po `const db = new Database(DB_PATH); db.pragma("journal_mode = WAL");` dodaj `import { ensureSchema } from "./schema.mjs";` (na górze pliku) i `ensureSchema(db);` (po utworzeniu `db`). To gwarantuje kolumny triage nawet gdy worker wystartuje przed webhookiem.

- [ ] **Step 6: Sanity — składnia obu plików**

Run: `cd automation/worker && node --check webhook.mjs && node --check worker.mjs && echo OK`
Expected: `OK`.

- [ ] **Step 7: Commit**

```bash
git add automation/worker/schema.mjs automation/worker/triage/schema.test.mjs automation/worker/webhook.mjs automation/worker/worker.mjs
git commit -m "feat(triage): shared jobs schema + additive triage columns"
```

---

### Task 2: Parsowanie i walidacja werdyktu

**Files:**
- Create: `automation/worker/triage/verdict.mjs`
- Create: `automation/worker/triage/verdict.test.mjs`

**Interfaces:**
- Produces:
  ```js
  // automation/worker/triage/verdict.mjs
  export function parseVerdict(raw);      // raw: string|object -> validated Verdict (throws na złym kształcie)
  export function priorityRank(priority); // "P0"|"P1"|"P2"|null -> 0|1|2|9
  export const PACKAGES;                  // ["PK1",...,"PK9"]
  ```

- [ ] **Step 1: Failing test**

`automation/worker/triage/verdict.test.mjs`:

```js
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
```

- [ ] **Step 2: Run — FAIL**

Run: `cd automation/worker && node --test triage/verdict.test.mjs`
Expected: FAIL — `Cannot find module './verdict.mjs'`.

- [ ] **Step 3: Implementacja `automation/worker/triage/verdict.mjs`**

```js
export const PACKAGES = ["PK1", "PK2", "PK3", "PK4", "PK5", "PK6", "PK7", "PK8", "PK9"];
const PRIORITIES = ["P0", "P1", "P2"];

export function priorityRank(priority) {
  const i = PRIORITIES.indexOf(priority);
  return i === -1 ? 9 : i;
}

function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Parse + validate an LLM triage verdict into the canonical Verdict shape.
// Accepts a JSON string or a plain object. A backlog verdict (fits=false)
// always nulls package/priority/order so downstream code never mixes signals.
export function parseVerdict(raw) {
  let o = raw;
  if (typeof raw === "string") {
    try { o = JSON.parse(raw); }
    catch { throw new Error("Verdict is not valid JSON"); }
  }
  if (!o || typeof o !== "object") throw new Error("Verdict must be an object");

  const fits = o.fits === true;
  if (fits) {
    if (!PACKAGES.includes(o.package)) throw new Error(`Unknown package: ${o.package}`);
    if (!PRIORITIES.includes(o.priority)) throw new Error(`Unknown priority: ${o.priority}`);
  }
  const confidence = num(o.confidence);
  return {
    fits,
    package: fits ? o.package : null,
    priority: fits ? o.priority : null,
    order: fits ? num(o.order) : null,
    module: fits && typeof o.module === "string" && o.module ? o.module : null,
    confidence: confidence === null ? 0 : Math.max(0, Math.min(1, confidence)),
    rationale: typeof o.rationale === "string" ? o.rationale.slice(0, 1000) : "",
  };
}
```

- [ ] **Step 4: Run — PASS**

Run: `cd automation/worker && node --test triage/verdict.test.mjs`
Expected: PASS (7 testów).

- [ ] **Step 5: Commit**

```bash
git add automation/worker/triage/verdict.mjs automation/worker/triage/verdict.test.mjs
git commit -m "feat(triage): verdict parse/validate + priority ranking"
```

---

### Task 3: Digest planu z Base „Team OKR Tasks"

**Files:**
- Create: `automation/worker/triage/plan.mjs`
- Create: `automation/worker/triage/plan.test.mjs`

**Interfaces:**
- Produces:
  ```js
  // automation/worker/triage/plan.mjs
  export function buildPlanDigest(records);   // records: [{fields:{Pakiet,Priorytet,Moduł,Kolejność,Zadanie,...}}] -> zwięzły tekst (kontekst do promptu)
  export function fetchPlanRecords({ exec }); // exec: (cmd, args)->{stdout} ; woła lark-cli base +record-list -> [record...]
  export const BASE_TOKEN, TABLE_ID;
  ```

- [ ] **Step 1: Failing test**

`automation/worker/triage/plan.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlanDigest, fetchPlanRecords, BASE_TOKEN, TABLE_ID } from "./plan.mjs";

const RECS = [
  { fields: { Pakiet: [{ text: "PK1 · Zielona bramka i jedno źródło terminów" }], Priorytet: [{ text: "P0 – blokuje start" }], "Moduł": [{ text: "DevOps" }], "Kolejność": 1, Zadanie: "Przywrócić sekret SUPABASE_DB_URL" } },
  { fields: { Pakiet: [{ text: "PK4 · Domknięty CRUD i przepływ danych" }], Priorytet: [{ text: "P1 – przed pierwszym klientem" }], "Moduł": [{ text: "Gabinet" }], "Kolejność": 2, Zadanie: "Zweryfikować pełny CRUD" } },
];

test("buildPlanDigest produces compact PK-grouped text with tasks", () => {
  const d = buildPlanDigest(RECS);
  assert.match(d, /PK1/);
  assert.match(d, /SUPABASE_DB_URL/);
  assert.match(d, /PK4/);
  assert.match(d, /CRUD/);
  // zwięzłość: nie dłuższe niż ~6k znaków dla 2 rekordów
  assert.ok(d.length < 6000);
});

test("buildPlanDigest tolerates missing/plain fields", () => {
  const d = buildPlanDigest([{ fields: { Zadanie: "Bez pakietu" } }]);
  assert.match(d, /Bez pakietu/);
});

test("fetchPlanRecords builds the correct lark-cli command and parses data.data", () => {
  const calls = [];
  const fakeExec = (cmd, args) => {
    calls.push({ cmd, args });
    return { stdout: JSON.stringify({ ok: true, data: {
      fields: [{ name: "Zadanie" }],
      data: [["Rekord A"]],
    } }) };
  };
  const recs = fetchPlanRecords({ exec: fakeExec });
  assert.equal(calls[0].cmd, "lark-cli");
  assert.ok(calls[0].args.includes("+record-list"));
  assert.ok(calls[0].args.includes(BASE_TOKEN));
  assert.ok(calls[0].args.includes(TABLE_ID));
  assert.equal(recs[0].fields.Zadanie, "Rekord A");
});
```

- [ ] **Step 2: Run — FAIL**

Run: `cd automation/worker && node --test triage/plan.test.mjs`
Expected: FAIL — `Cannot find module './plan.mjs'`.

- [ ] **Step 3: Implementacja `automation/worker/triage/plan.mjs`**

```js
export const BASE_TOKEN = "BEm9bfWsFa0dHasHlu6j5ynkpSd";
export const TABLE_ID = "tbl61BNGL8JLsUpF";

function cell(v) {
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === "object" ? (x.text || x.name || "") : String(x))).join(", ");
  if (v && typeof v === "object") return v.text || v.name || "";
  return v === null || v === undefined ? "" : String(v);
}

// Compact, PK-grouped digest of the plan for the triage prompt. Keeps only the
// fields the classifier needs (package, priority, module, order, task title).
export function buildPlanDigest(records) {
  const rows = records.map((r) => {
    const f = r.fields || {};
    return {
      pk: cell(f["Pakiet"]) || "(brak)",
      pr: cell(f["Priorytet"]),
      mod: cell(f["Moduł"]),
      ord: cell(f["Kolejność"]),
      task: cell(f["Zadanie"]),
    };
  });
  const byPk = new Map();
  for (const r of rows) {
    if (!byPk.has(r.pk)) byPk.set(r.pk, []);
    byPk.get(r.pk).push(r);
  }
  const parts = [];
  for (const [pk, list] of [...byPk.entries()].sort()) {
    parts.push(`### ${pk}`);
    for (const r of list) {
      parts.push(`- [${r.pr}|${r.mod}|kol ${r.ord}] ${r.task}`);
    }
  }
  return parts.join("\n");
}

// Fetch the plan records via lark-cli. `exec(cmd, args) -> { stdout }` is
// injected so callers/tests control process execution. Base returns rows as
// `data.data` (arrays aligned with `data.fields`); we zip them into {fields}.
export function fetchPlanRecords({ exec }) {
  const args = ["base", "+record-list", "--base-token", BASE_TOKEN,
                "--table-id", TABLE_ID, "--limit", "200", "--format", "json"];
  const { stdout } = exec("lark-cli", args);
  const parsed = JSON.parse(stdout);
  const names = (parsed.data?.fields || []).map((f) => (typeof f === "object" ? f.name : f));
  const rows = parsed.data?.data || [];
  return rows.map((row) => {
    const fields = {};
    names.forEach((n, i) => { fields[n] = row[i]; });
    return { fields };
  });
}
```

- [ ] **Step 4: Run — PASS**

Run: `cd automation/worker && node --test triage/plan.test.mjs`
Expected: PASS (3 testy).

- [ ] **Step 5: Commit**

```bash
git add automation/worker/triage/plan.mjs automation/worker/triage/plan.test.mjs
git commit -m "feat(triage): plan digest + Base record fetch (lark-cli)"
```

---

### Task 4: Ewaluator issue → werdykt (LLM wstrzykiwany)

**Files:**
- Create: `automation/worker/triage/evaluate.mjs`
- Create: `automation/worker/triage/evaluate.test.mjs`

**Interfaces:**
- Consumes: `parseVerdict` (Task 2), `buildPlanDigest` (Task 3).
- Produces:
  ```js
  // automation/worker/triage/evaluate.mjs
  export function buildTriagePrompt(issue, planDigest);   // -> string (prompt PL, wymusza JSON verdict)
  export async function evaluateIssue(issue, planDigest, { invokeLLM }); // invokeLLM: (prompt)->Promise<string>; -> Verdict
  ```
  `issue` = `{ number, title, body, login, jamLink?: string }`.

- [ ] **Step 1: Failing test**

`automation/worker/triage/evaluate.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTriagePrompt, evaluateIssue } from "./evaluate.mjs";

const ISSUE = { number: 42, title: "Sekret SUPABASE_DB_URL pusty", body: "CI pada na migracjach", login: "someone" };
const DIGEST = "### PK1\n- [P0|DevOps|kol 1] Przywrócić sekret SUPABASE_DB_URL";

test("buildTriagePrompt includes the issue and the plan digest and demands JSON", () => {
  const p = buildTriagePrompt(ISSUE, DIGEST);
  assert.match(p, /SUPABASE_DB_URL/);
  assert.match(p, /PK1/);
  assert.match(p, /JSON/i);
  assert.match(p, /fits/);
});

test("evaluateIssue returns a parsed verdict from the LLM output", async () => {
  const fakeLLM = async () => JSON.stringify({
    fits: true, package: "PK1", priority: "P0", order: 1, module: "DevOps",
    confidence: 0.95, rationale: "Dokładnie zadanie PK1.",
  });
  const v = await evaluateIssue(ISSUE, DIGEST, { invokeLLM: fakeLLM });
  assert.equal(v.package, "PK1");
  assert.equal(v.fits, true);
});

test("evaluateIssue extracts JSON when the LLM wraps it in prose/fences", async () => {
  const fakeLLM = async () => "Oto werdykt:\n```json\n{\"fits\":false,\"confidence\":0.3,\"rationale\":\"Poza planem\"}\n```\nkoniec";
  const v = await evaluateIssue(ISSUE, DIGEST, { invokeLLM: fakeLLM });
  assert.equal(v.fits, false);
  assert.equal(v.package, null);
});

test("evaluateIssue throws when the LLM output has no JSON object", async () => {
  const fakeLLM = async () => "nie wiem";
  await assert.rejects(() => evaluateIssue(ISSUE, DIGEST, { invokeLLM: fakeLLM }), /verdict/i);
});
```

- [ ] **Step 2: Run — FAIL**

Run: `cd automation/worker && node --test triage/evaluate.test.mjs`
Expected: FAIL — `Cannot find module './evaluate.mjs'`.

- [ ] **Step 3: Implementacja `automation/worker/triage/evaluate.mjs`**

```js
import { parseVerdict } from "./verdict.mjs";

export function buildTriagePrompt(issue, planDigest) {
  const jam = issue.jamLink ? `\nNagranie Jam: ${issue.jamLink} (przeanalizuj konsolę/network/repro, jeśli dostępne).` : "";
  return `Jesteś triagerem zgłoszeń dla projektu w fazie przeduruchomieniowej. Oceń, czy PONIŻSZE zgłoszenie mieści się w planie uruchomienia (pakiety PK1–PK9). Zwróć JEDEN obiekt JSON o dokładnie takim kształcie:

{
  "fits": boolean,            // true = realizuje któryś warunek/zadanie pakietu; false = poza planem (backlog)
  "package": "PK1".."PK9"|null,
  "priority": "P0"|"P1"|"P2"|null,   // dziedzicz z dopasowanego pakietu
  "order": number|null,              // Kolejność zadania z planu, jeśli pasuje do konkretnego
  "module": string|null,
  "confidence": number,      // 0..1, jak pewne jest dopasowanie
  "rationale": string        // 1–2 zdania po polsku, dlaczego pasuje / nie pasuje
}

Zasady: jeśli zgłoszenie nie realizuje żadnego pakietu, ustaw fits=false i package/priority/order=null. Nie zgaduj — przy niepewności obniż confidence. Zwróć wyłącznie JSON, bez dodatkowego tekstu.

## Plan (zadania wg pakietów)
${planDigest}

## Zgłoszenie #${issue.number}
Tytuł: ${issue.title}
Autor: ${issue.login}
Treść:
${issue.body || "(brak treści)"}${jam}`;
}

// Extract the first balanced JSON object from arbitrary LLM text.
function extractJson(text) {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}

export async function evaluateIssue(issue, planDigest, { invokeLLM }) {
  const raw = await invokeLLM(buildTriagePrompt(issue, planDigest));
  const json = extractJson(String(raw));
  if (!json) throw new Error("LLM returned no JSON verdict");
  return parseVerdict(json);
}
```

- [ ] **Step 4: Run — PASS**

Run: `cd automation/worker && node --test triage/evaluate.test.mjs`
Expected: PASS (4 testy).

- [ ] **Step 5: Commit**

```bash
git add automation/worker/triage/evaluate.mjs automation/worker/triage/evaluate.test.mjs
git commit -m "feat(triage): issue->verdict evaluator with injectable LLM"
```

---

### Task 5: Zapis rekordu do Base (dual writer — część 1)

**Files:**
- Create: `automation/worker/triage/base-writer.mjs`
- Create: `automation/worker/triage/base-writer.test.mjs`

**Interfaces:**
- Consumes: Verdict (Global Constraints), `BASE_TOKEN`/`TABLE_ID` (Task 3).
- Produces:
  ```js
  // automation/worker/triage/base-writer.mjs
  export function buildRecordFields(verdict, issue); // -> obiekt fields dla Base (mapuje priorytet/pakiet na etykiety Base)
  export function createTriageRecord(verdict, issue, { exec }); // woła lark-cli base +record-create -> record_id
  ```

- [ ] **Step 1: Failing test**

`automation/worker/triage/base-writer.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRecordFields, createTriageRecord } from "./base-writer.mjs";

const ISSUE = { number: 42, title: "Sekret pusty", url: "https://github.com/o/r/issues/42" };
const FITS = { fits: true, package: "PK1", priority: "P0", order: 1, module: "DevOps", confidence: 0.9, rationale: "PK1." };
const BACKLOG = { fits: false, package: null, priority: null, order: null, module: null, confidence: 0.3, rationale: "Poza planem." };

test("buildRecordFields maps a fitting verdict to Base labels", () => {
  const f = buildRecordFields(FITS, ISSUE);
  assert.match(f["Pakiet"], /^PK1 ·/);
  assert.match(f["Priorytet"], /^P0 –/);
  assert.equal(f["Kolejność"], 1);
  assert.equal(f["Moduł"], "DevOps");
  assert.match(f["Źródło"], /issues\/42/);
  assert.equal(f["Status realizacji"], "Do zrobienia");
  assert.equal(f["Triage"], true);
});

test("buildRecordFields maps a backlog verdict with no package", () => {
  const f = buildRecordFields(BACKLOG, ISSUE);
  assert.equal(f["Pakiet"], undefined);
  assert.equal(f["Priorytet"], undefined);
  assert.match(f["Źródło"], /issues\/42/);
});

test("createTriageRecord builds a record-create command and returns the new id", () => {
  const calls = [];
  const exec = (cmd, args) => { calls.push({ cmd, args }); return { stdout: JSON.stringify({ ok: true, data: { record: { record_id: "recNEW123" } } }) }; };
  const id = createTriageRecord(FITS, ISSUE, { exec });
  assert.equal(calls[0].cmd, "lark-cli");
  assert.ok(calls[0].args.includes("+record-create"));
  assert.ok(calls[0].args.includes("--base-token"));
  assert.equal(id, "recNEW123");
});
```

- [ ] **Step 2: Run — FAIL**

Run: `cd automation/worker && node --test triage/base-writer.test.mjs`
Expected: FAIL — `Cannot find module './base-writer.mjs'`.

- [ ] **Step 3: Sprawdź dokładną składnię `base +record-create`**

Run: `lark-cli base +record-create --help 2>&1 | grep -iE "base-token|table-id|fields|record" | grep -viE "skills|MUST" | head`
Zanotuj nazwę flagi dla pól (spodziewane `--fields` z JSON-em). Jeśli różni się od `--fields`, użyj faktycznej w Step 4 (i w teście jeśli asercja to sprawdza).

- [ ] **Step 4: Implementacja `automation/worker/triage/base-writer.mjs`**

```js
import { BASE_TOKEN, TABLE_ID } from "./plan.mjs";

const PK_LABEL = {
  PK1: "PK1 · Zielona bramka i jedno źródło terminów",
  PK2: "PK2 · Uprawnienia spięte backend i UI",
  PK3: "PK3 · Ustawienia z realnym efektem",
  PK4: "PK4 · Domknięty CRUD i przepływ danych",
  PK5: "PK5 · Rozliczenia do zamknięcia dnia",
  PK6: "PK6 · Dane bezpieczne i odtwarzalne",
  PK7: "PK7 · Widoczność produkcji",
  PK8: "PK8 · Wdrożenie u pierwszej placówki",
  PK9: "PK9 · Sprzedaż i rozliczenia platformy",
};
const PR_LABEL = {
  P0: "P0 – blokuje start",
  P1: "P1 – przed pierwszym klientem",
  P2: "P2 – po starcie",
};

// Map a Verdict + issue into a Base "Team OKR Tasks" fields object. Fitting
// verdicts get package/priority/order/module; backlog verdicts carry only the
// source + description so nothing is lost. `Triage: true` distinguishes these
// records from native plan rows.
export function buildRecordFields(verdict, issue) {
  const fields = {
    "Zadanie": issue.title,
    "Opis": (verdict.rationale || "") + `\n\nŹródło: ${issue.url}`,
    "Źródło": issue.url,
    "Status realizacji": "Do zrobienia",
    "Triage": true,
  };
  if (verdict.fits) {
    fields["Pakiet"] = PK_LABEL[verdict.package];
    fields["Priorytet"] = PR_LABEL[verdict.priority];
    if (verdict.order !== null) fields["Kolejność"] = verdict.order;
    if (verdict.module) fields["Moduł"] = verdict.module;
  }
  return fields;
}

export function createTriageRecord(verdict, issue, { exec }) {
  const fields = buildRecordFields(verdict, issue);
  const args = ["base", "+record-create", "--base-token", BASE_TOKEN,
                "--table-id", TABLE_ID, "--fields", JSON.stringify(fields),
                "--format", "json"];
  const { stdout } = exec("lark-cli", args);
  const parsed = JSON.parse(stdout);
  return parsed.data?.record?.record_id || parsed.data?.record_id || null;
}
```

- [ ] **Step 5: Run — PASS**

Run: `cd automation/worker && node --test triage/base-writer.test.mjs`
Expected: PASS (3 testy).

- [ ] **Step 6: Commit**

```bash
git add automation/worker/triage/base-writer.mjs automation/worker/triage/base-writer.test.mjs
git commit -m "feat(triage): Base record writer for triaged issues"
```

---

### Task 6: Komentarz + etykieta na GitHubie (dual writer — część 2)

**Files:**
- Create: `automation/worker/triage/github-writer.mjs`
- Create: `automation/worker/triage/github-writer.test.mjs`

**Interfaces:**
- Consumes: Verdict.
- Produces:
  ```js
  // automation/worker/triage/github-writer.mjs
  export function verdictComment(verdict);  // -> string (PL): przyjęte / backlog, + dopisek "wstępny" gdy confidence < 0.5
  export function verdictLabel(verdict);    // -> "triage:PK1".."triage:PK9" | "triage:backlog"
  export function postVerdict(issue, verdict, { exec }); // gh issue comment + gh issue edit --add-label
  ```

- [ ] **Step 1: Failing test**

`automation/worker/triage/github-writer.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { verdictComment, verdictLabel, postVerdict } from "./github-writer.mjs";

const FITS = { fits: true, package: "PK1", priority: "P0", order: 1, module: "DevOps", confidence: 0.9, rationale: "Zadanie PK1." };
const LOWCONF = { ...FITS, confidence: 0.4 };
const BACKLOG = { fits: false, package: null, priority: null, order: null, module: null, confidence: 0.6, rationale: "Poza planem uruchomienia." };

test("verdictComment for a fitting verdict names the package and priority in Polish", () => {
  const c = verdictComment(FITS);
  assert.match(c, /Przyjęte do planu/);
  assert.match(c, /PK1/);
  assert.match(c, /P0/);
});

test("verdictComment for backlog explains it goes to backlog", () => {
  const c = verdictComment(BACKLOG);
  assert.match(c, /backlog/i);
  assert.match(c, /Poza planem/);
});

test("verdictComment appends a 'wstępny' notice below confidence threshold", () => {
  assert.match(verdictComment(LOWCONF), /wstępny/i);
  assert.doesNotMatch(verdictComment(FITS), /wstępny/i);
});

test("verdictLabel maps package or backlog", () => {
  assert.equal(verdictLabel(FITS), "triage:PK1");
  assert.equal(verdictLabel(BACKLOG), "triage:backlog");
});

test("postVerdict runs a gh comment and a gh label command against the issue", () => {
  const calls = [];
  const exec = (cmd, args) => { calls.push(args.join(" ")); return { stdout: "" }; };
  postVerdict({ number: 42, repo: "o/r" }, FITS, { exec });
  const joined = calls.join("\n");
  assert.match(joined, /issue comment 42/);
  assert.match(joined, /--repo o\/r/);
  assert.match(joined, /issue edit 42/);
  assert.match(joined, /--add-label triage:PK1/);
});
```

- [ ] **Step 2: Run — FAIL**

Run: `cd automation/worker && node --test triage/github-writer.test.mjs`
Expected: FAIL — `Cannot find module './github-writer.mjs'`.

- [ ] **Step 3: Implementacja `automation/worker/triage/github-writer.mjs`**

```js
const LOW_CONFIDENCE = 0.5;

export function verdictLabel(verdict) {
  return verdict.fits ? `triage:${verdict.package}` : "triage:backlog";
}

// Reporter-facing Polish verdict comment. Fitting -> accepted + placement;
// backlog -> explained deferral. Low-confidence verdicts are flagged "wstępny"
// so a wrong auto-decision is visibly provisional.
export function verdictComment(verdict) {
  const provisional = verdict.confidence < LOW_CONFIDENCE
    ? "\n\n_(werdykt wstępny — do weryfikacji przez człowieka)_" : "";
  if (verdict.fits) {
    const ord = verdict.order !== null ? `, pozycja ${verdict.order}` : "";
    return `✅ **Przyjęte do planu** — pakiet ${verdict.package}, priorytet ${verdict.priority}${ord}.\n\n${verdict.rationale}${provisional}`;
  }
  return `⏸️ **Poza bieżącym planem uruchomienia.** ${verdict.rationale}\n\nTrafia do backlogu — wrócimy po starcie.${provisional}`;
}

export function postVerdict(issue, verdict, { exec }) {
  const repo = issue.repo;
  exec("gh", ["issue", "comment", String(issue.number), "--repo", repo, "--body", verdictComment(verdict)]);
  exec("gh", ["issue", "edit", String(issue.number), "--repo", repo, "--add-label", verdictLabel(verdict)]);
}
```

- [ ] **Step 4: Run — PASS**

Run: `cd automation/worker && node --test triage/github-writer.test.mjs`
Expected: PASS (5 testów).

- [ ] **Step 5: Commit**

```bash
git add automation/worker/triage/github-writer.mjs automation/worker/triage/github-writer.test.mjs
git commit -m "feat(triage): GitHub verdict comment + label writer (PL)"
```

---

### Task 7: Runner triage — orkiestracja jednego joba

**Files:**
- Create: `automation/worker/triage/runner.mjs`
- Create: `automation/worker/triage/runner.test.mjs`

**Interfaces:**
- Consumes: `ensureSchema` (Task 1), `evaluateIssue` (Task 4), `createTriageRecord` (Task 5), `postVerdict` (Task 6), Verdict.
- Produces:
  ```js
  // automation/worker/triage/runner.mjs
  export function nextUntriagedJob(db);   // -> job | null (najstarszy status='pending' AND triage_status='untriaged')
  export async function triageJob(db, job, deps);  // deps: { planDigest, evaluate, writeBase, writeGithub, now }
      // deps.evaluate(issue, planDigest) -> Verdict ; deps.writeBase(verdict, issue) -> recordId
      // deps.writeGithub(issue, verdict) -> void
      // efekt: aktualizuje kolumny triage joba (triage_status 'triaged'|'backlog', package/priority/order/confidence/rationale/base_record_id)
  ```

- [ ] **Step 1: Failing test**

`automation/worker/triage/runner.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { ensureSchema } from "../schema.mjs";
import { nextUntriagedJob, triageJob } from "./runner.mjs";

function seed(db, overrides = {}) {
  ensureSchema(db);
  const payload = JSON.stringify({ title: "T", body: "B", issue_url: "https://github.com/o/r/issues/7" });
  db.prepare(`INSERT INTO jobs (issue_number, repo, event_type, trigger_login, payload_json, status, created_at)
              VALUES (?, ?, ?, ?, ?, 'pending', ?)`)
    .run(overrides.issue_number ?? 7, "o/r", "issue.opened", overrides.login ?? "someone", payload, Date.now());
  return db.prepare("SELECT * FROM jobs ORDER BY id DESC LIMIT 1").get();
}

test("nextUntriagedJob returns the oldest pending+untriaged job, null when none", () => {
  const db = new Database(":memory:");
  assert.equal(nextUntriagedJob(db), null);
  seed(db);
  const j = nextUntriagedJob(db);
  assert.equal(j.issue_number, 7);
});

test("triageJob on a fitting verdict marks job 'triaged' and stores placement + record id", async () => {
  const db = new Database(":memory:");
  const job = seed(db);
  const verdict = { fits: true, package: "PK1", priority: "P0", order: 1, module: "DevOps", confidence: 0.9, rationale: "PK1." };
  const deps = {
    planDigest: "### PK1\n- x",
    evaluate: async () => verdict,
    writeBase: () => "recABC",
    writeGithub: () => {},
    now: () => 111,
  };
  await triageJob(db, job, deps);
  const row = db.prepare("SELECT * FROM jobs WHERE id = ?").get(job.id);
  assert.equal(row.triage_status, "triaged");
  assert.equal(row.triage_package, "PK1");
  assert.equal(row.triage_priority, "P0");
  assert.equal(row.triage_order, 1);
  assert.equal(row.triage_base_record_id, "recABC");
});

test("triageJob on a backlog verdict marks job 'backlog'", async () => {
  const db = new Database(":memory:");
  const job = seed(db);
  const verdict = { fits: false, package: null, priority: null, order: null, module: null, confidence: 0.5, rationale: "Poza planem." };
  await triageJob(db, job, { planDigest: "x", evaluate: async () => verdict, writeBase: () => "recBL", writeGithub: () => {}, now: () => 1 });
  assert.equal(db.prepare("SELECT triage_status FROM jobs WHERE id = ?").get(job.id).triage_status, "backlog");
});

test("triageJob still marks the job even if GitHub write throws (Base + status must persist)", async () => {
  const db = new Database(":memory:");
  const job = seed(db);
  const verdict = { fits: true, package: "PK2", priority: "P1", order: 2, module: "Gabinet", confidence: 0.8, rationale: "PK2." };
  let ghCalled = false;
  await triageJob(db, job, {
    planDigest: "x", evaluate: async () => verdict, writeBase: () => "recX",
    writeGithub: () => { ghCalled = true; throw new Error("gh down"); }, now: () => 1,
  });
  assert.ok(ghCalled);
  assert.equal(db.prepare("SELECT triage_status FROM jobs WHERE id = ?").get(job.id).triage_status, "triaged");
});
```

- [ ] **Step 2: Run — FAIL**

Run: `cd automation/worker && node --test triage/runner.test.mjs`
Expected: FAIL — `Cannot find module './runner.mjs'`.

- [ ] **Step 3: Implementacja `automation/worker/triage/runner.mjs`**

```js
export function nextUntriagedJob(db) {
  return db.prepare(
    `SELECT * FROM jobs WHERE status = 'pending' AND triage_status = 'untriaged'
     ORDER BY created_at ASC LIMIT 1`,
  ).get() || null;
}

function issueFromJob(job) {
  let p = {};
  try { p = JSON.parse(job.payload_json || "{}"); } catch { /* ignore */ }
  const jamLink = typeof p.body === "string" ? (p.body.match(/https?:\/\/[^\s)]*jam\.dev[^\s)]*/i)?.[0] : undefined);
  return {
    number: job.issue_number,
    repo: job.repo,
    title: p.title || "",
    body: p.comment_body || p.body || "",
    login: job.trigger_login || "",
    url: p.issue_url || `https://github.com/${job.repo}/issues/${job.issue_number}`,
    jamLink,
  };
}

// Triage a single job: evaluate -> write Base record -> write GitHub verdict ->
// persist triage columns. The Base write + status update are the load-bearing
// results; a GitHub failure is logged but must not undo them (reporter comment
// can be retried, the queue decision must stick).
export async function triageJob(db, job, deps) {
  const issue = issueFromJob(job);
  const verdict = await deps.evaluate(issue, deps.planDigest);

  let recordId = null;
  try { recordId = deps.writeBase(verdict, issue); }
  catch (e) { recordId = null; /* Base failure: still record the decision below */ }

  db.prepare(
    `UPDATE jobs SET triage_status = ?, triage_package = ?, triage_priority = ?,
       triage_order = ?, triage_confidence = ?, triage_rationale = ?, triage_base_record_id = ?
     WHERE id = ?`,
  ).run(
    verdict.fits ? "triaged" : "backlog",
    verdict.package, verdict.priority, verdict.order,
    verdict.confidence, verdict.rationale, recordId, job.id,
  );

  try { deps.writeGithub(issue, verdict); }
  catch (e) { /* comment can be retried; decision already persisted */ }

  return { verdict, recordId };
}
```

- [ ] **Step 4: Run — PASS**

Run: `cd automation/worker && node --test triage/runner.test.mjs`
Expected: PASS (4 testy).

- [ ] **Step 5: Commit**

```bash
git add automation/worker/triage/runner.mjs automation/worker/triage/runner.test.mjs
git commit -m "feat(triage): single-job triage orchestrator"
```

---

### Task 8: Reorder claimNext wg planu + wpięcie triage w pętlę workera

**Files:**
- Modify: `automation/worker/worker.mjs` (claimNext ordering + loop: triage untriaged przed poborem)
- Create: `automation/worker/triage/claim.mjs` (wyodrębniona, testowalna funkcja kolejności)
- Create: `automation/worker/triage/claim.test.mjs`

**Interfaces:**
- Consumes: `priorityRank` (Task 2), `ensureSchema` (Task 1), `nextUntriagedJob`/`triageJob` (Task 7).
- Produces:
  ```js
  // automation/worker/triage/claim.mjs
  export function claimNextPlanned(db, { throttledLogins, pausedLogins, throttleIntervalMs, now });
      // bierze najstarszy claimowalny job (triage_status IN ('triaged','backlog'))
      // kolejność: priorityRank(triage_priority) ASC, triage_order ASC NULLS LAST, created_at ASC
      // pomija throttled (jak dziś) ORAZ paused (twardy stop); ustawia status='running'; zwraca job|null
  ```

- [ ] **Step 1: Failing test**

`automation/worker/triage/claim.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { ensureSchema } from "../schema.mjs";
import { claimNextPlanned } from "./claim.mjs";

function add(db, { n, login = "u", tstatus = "triaged", prio = null, ord = null, created }) {
  db.prepare(`INSERT INTO jobs (issue_number, repo, event_type, trigger_login, payload_json, status, created_at, triage_status, triage_priority, triage_order)
              VALUES (?, 'o/r', 'issue.opened', ?, '{}', 'pending', ?, ?, ?, ?)`)
    .run(n, login, created, tstatus, prio, ord);
}
const DEPS = { throttledLogins: [], pausedLogins: [], throttleIntervalMs: 3600000, now: () => 10_000_000 };

test("claimNextPlanned skips untriaged jobs entirely", () => {
  const db = new Database(":memory:"); ensureSchema(db);
  add(db, { n: 1, tstatus: "untriaged", created: 1 });
  assert.equal(claimNextPlanned(db, DEPS), null);
});

test("claimNextPlanned orders by priority then order, backlog last", () => {
  const db = new Database(":memory:"); ensureSchema(db);
  add(db, { n: 1, tstatus: "backlog", prio: null, ord: null, created: 1 });   // rank 9
  add(db, { n: 2, tstatus: "triaged", prio: "P1", ord: 5, created: 2 });       // rank 1
  add(db, { n: 3, tstatus: "triaged", prio: "P0", ord: 9, created: 3 });       // rank 0
  add(db, { n: 4, tstatus: "triaged", prio: "P0", ord: 2, created: 4 });       // rank 0, lower order
  const first = claimNextPlanned(db, DEPS);
  assert.equal(first.issue_number, 4); // P0 + kol 2 wins over P0 + kol 9
  assert.equal(first.status, "running");
});

test("claimNextPlanned falls back to created_at when priority+order tie", () => {
  const db = new Database(":memory:"); ensureSchema(db);
  add(db, { n: 10, tstatus: "triaged", prio: "P0", ord: 1, created: 200 });
  add(db, { n: 11, tstatus: "triaged", prio: "P0", ord: 1, created: 100 });
  assert.equal(claimNextPlanned(db, DEPS).issue_number, 11);
});

test("claimNextPlanned respects the throttle for listed logins", () => {
  const db = new Database(":memory:"); ensureSchema(db);
  add(db, { n: 20, login: "slow", tstatus: "triaged", prio: "P0", ord: 1, created: 1 });
  // a recent finished job from same login within the window
  db.prepare(`INSERT INTO jobs (issue_number, repo, event_type, trigger_login, payload_json, status, created_at, finished_at, triage_status)
              VALUES (21,'o/r','x','slow','{}','done', 1, 9_990_000, 'triaged')`).run();
  const deps = { throttledLogins: ["slow"], pausedLogins: [], throttleIntervalMs: 3600000, now: () => 10_000_000 };
  assert.equal(claimNextPlanned(db, deps), null); // throttled: within cooldown
});

test("claimNextPlanned never returns a paused login's job", () => {
  const db = new Database(":memory:"); ensureSchema(db);
  add(db, { n: 30, login: "banned", tstatus: "triaged", prio: "P0", ord: 1, created: 1 });
  const deps = { throttledLogins: [], pausedLogins: ["banned"], throttleIntervalMs: 3600000, now: () => 10_000_000 };
  assert.equal(claimNextPlanned(db, deps), null);
});
```

- [ ] **Step 2: Run — FAIL**

Run: `cd automation/worker && node --test triage/claim.test.mjs`
Expected: FAIL — `Cannot find module './claim.mjs'`.

- [ ] **Step 3: Implementacja `automation/worker/triage/claim.mjs`**

```js
import { priorityRank } from "./verdict.mjs";

// Claim the next runnable job by PLAN order (not FIFO). Runnable = triaged or
// backlog. Ordering: priority rank (P0<P1<P2<backlog) -> plan Kolejność -> age.
// Excludes paused logins (hard stop) and preserves the per-login throttle.
// Sets status='running' atomically.
export function claimNextPlanned(db, { throttledLogins, pausedLogins, throttleIntervalMs, now }) {
  const cutoff = now() - throttleIntervalMs;
  const throttleIn = throttledLogins.map(() => "?").join(",") || "''";
  const pausedIn = pausedLogins.map(() => "?").join(",") || "''";
  const rows = db.prepare(
    `SELECT * FROM jobs
     WHERE status = 'pending' AND triage_status IN ('triaged','backlog')
       AND (trigger_login IS NULL OR trigger_login NOT IN (${pausedIn}))
       AND (
         trigger_login IS NULL
         OR trigger_login NOT IN (${throttleIn})
         OR NOT EXISTS (
           SELECT 1 FROM jobs busy WHERE busy.trigger_login = jobs.trigger_login
             AND busy.status IN ('running','done','failed')
             AND COALESCE(busy.finished_at, busy.started_at, 0) > ?
         )
       )`,
  ).all(...pausedLogins, ...throttledLogins, cutoff);

  if (rows.length === 0) return null;
  rows.sort((a, b) =>
    (priorityRank(a.triage_priority) - priorityRank(b.triage_priority)) ||
    ((a.triage_order ?? Number.MAX_SAFE_INTEGER) - (b.triage_order ?? Number.MAX_SAFE_INTEGER)) ||
    (a.created_at - b.created_at),
  );
  const job = rows[0];
  db.prepare("UPDATE jobs SET status = 'running', started_at = ? WHERE id = ?").run(Date.now(), job.id);
  return job;
}
```

- [ ] **Step 4: Run — PASS**

Run: `cd automation/worker && node --test triage/claim.test.mjs`
Expected: PASS (4 testy).

- [ ] **Step 5: Wepnij triage + nowy claim w `worker.mjs`**

W `automation/worker/worker.mjs`:
1. Dodaj importy u góry: `import { claimNextPlanned } from "./triage/claim.mjs";`, `import { nextUntriagedJob, triageJob } from "./triage/runner.mjs";`, `import { evaluateIssue } from "./triage/evaluate.mjs";`, `import { buildPlanDigest, fetchPlanRecords } from "./triage/plan.mjs";`, `import { createTriageRecord } from "./triage/base-writer.mjs";`, `import { postVerdict } from "./triage/github-writer.mjs";`, `import { spawnSync } from "node:child_process";`.
2. Dodaj helper wykonania podprocesów i LLM (po `jlog`):
```js
function exec(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${cmd} failed (${r.status}): ${(r.stderr || "").slice(0, 500)}`);
  return { stdout: r.stdout || "" };
}
// Triage classifier LLM: reuse run-claude.sh in a one-shot, headless mode.
// The script already knows how to invoke Claude; we pass the prompt on stdin
// via env and read its stdout. Uses the same RUN_SCRIPT the worker runs.
function invokeLLM(prompt) {
  const r = spawnSync("/bin/bash", [RUN_SCRIPT], {
    encoding: "utf8", maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, TRIAGE_MODE: "1", TRIAGE_PROMPT: prompt },
  });
  return r.stdout || "";
}
```
   NOTE: `run-claude.sh` musi obsłużyć `TRIAGE_MODE=1` — w tym trybie odpala Claude z `TRIAGE_PROMPT` w trybie jednorazowym (print) i wypisuje surową odpowiedź na stdout, BEZ normalnej ścieżki „pracuj nad issue". To osobna, mała zmiana w `run-claude.sh` (Step 6).
3. Odśwież digest planu raz na iterację pętli (cache z TTL, żeby nie odpytywać Base co 3s):
```js
let planCache = { digest: "", at: 0 };
function getPlanDigest() {
  const TTL = 5 * 60 * 1000;
  if (Date.now() - planCache.at < TTL && planCache.digest) return planCache.digest;
  try {
    planCache = { digest: buildPlanDigest(fetchPlanRecords({ exec })), at: Date.now() };
  } catch (e) { jlog({ level: "warn", msg: "plan-fetch-failed", err: String(e) }); }
  return planCache.digest;
}
```
4. Zamień ciało `loop()` tak, by najpierw domykał triage, potem brał zaplanowany job:
```js
async function loop() {
  while (!stopping) {
    // 1) triage: oceń jeden nieotriage'owany job, jeśli jest
    const untriaged = nextUntriagedJob(db);
    if (untriaged) {
      try {
        await triageJob(db, untriaged, {
          planDigest: getPlanDigest(),
          evaluate: (issue, digest) => evaluateIssue(issue, digest, { invokeLLM }),
          writeBase: (verdict, issue) => createTriageRecord(verdict, issue, { exec }),
          writeGithub: (issue, verdict) => postVerdict(issue, verdict, { exec }),
          now: Date.now,
        });
        jlog({ level: "info", msg: "triaged", id: untriaged.id, issue: untriaged.issue_number });
      } catch (e) {
        // nie zapętlaj się na wadliwym jobie: oznacz jako backlog z notą
        db.prepare("UPDATE jobs SET triage_status='backlog', triage_rationale=? WHERE id=?")
          .run("Triage nieudany: " + String(e).slice(0, 300), untriaged.id);
        jlog({ level: "error", msg: "triage-failed", id: untriaged.id, err: String(e) });
      }
      continue; // wróć do pętli — triage ma priorytet
    }
    // 2) pobór wg planu
    const job = claimNextPlanned(db, { throttledLogins: THROTTLED_LOGINS, throttleIntervalMs: THROTTLE_INTERVAL_MS, now: Date.now });
    if (!job) { await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS)); continue; }
    try { await runJob(job); }
    catch (e) { finalizeJob(job.id, "failed", JSON.stringify({ error: String(e) })); jlog({ level: "error", msg: "exception", id: job.id, err: String(e) }); }
  }
  jlog({ level: "info", msg: "shutdown" });
}
```
5. USUŃ stary `claimNextStmt` i `claimNext` (zastąpione przez `claimNextPlanned`). Zostaw `THROTTLED_LOGINS`/`THROTTLE_INTERVAL_MS` — są teraz przekazywane do `claimNextPlanned`. PAUSED_LOGINS: zachowaj obecne wykluczenie — dodaj do `claimNextPlanned` analogiczny filtr LUB (prościej) zostaw je w `nextUntriagedJob`/claim jako dodatkowy `NOT IN` — patrz Step 5a.

- [ ] **Step 5a: Zachowaj wykluczenie PAUSED_LOGINS**

`claimNextPlanned` w Task 8 nie zna PAUSED_LOGINS. Rozszerz sygnaturę o `pausedLogins` i dodaj `AND (trigger_login IS NULL OR trigger_login NOT IN (paused...))` w zapytaniu — analogicznie do throttle. Zaktualizuj wywołanie w `worker.mjs` o `pausedLogins: PAUSED_LOGINS`. (PAUSED_LOGINS to istniejąca stała z worker.mjs — patrz PR #3633.) Dopisz test w `claim.test.mjs`: paused login nie jest nigdy brany.

- [ ] **Step 6: `run-claude.sh` — tryb TRIAGE_MODE**

Odczytaj `automation/worker/run-claude.sh`. Na początku (po nagłówku, przed normalną logiką issue) dodaj:
```bash
if [ "${TRIAGE_MODE:-}" = "1" ]; then
  # One-shot classifier: send TRIAGE_PROMPT to Claude headless, print raw stdout.
  printf '%s' "$TRIAGE_PROMPT" | claude -p --output-format text 2>/dev/null
  exit 0
fi
```
(Dostosuj wywołanie `claude` do tego, jak reszta skryptu uruchamia Claude — użyj tej samej binarki/flag co istniejąca ścieżka, tylko w trybie `-p`/print z promptem na stdin. Jeśli skrypt używa innego polecenia, zachowaj spójność.)

- [ ] **Step 7: Sanity + pełny suite**

Run: `cd automation/worker && node --check worker.mjs && node --test`
Expected: `node --check` cicho; `node --test` — wszystkie pliki testów PASS.

- [ ] **Step 8: Commit**

```bash
git add automation/worker/triage/claim.mjs automation/worker/triage/claim.test.mjs automation/worker/worker.mjs automation/worker/run-claude.sh
git commit -m "feat(triage): plan-ordered claimNext + triage stage wired into worker loop"
```

---

### Task 9: Test skryptowy, pełna weryfikacja, deploy (ręczny) + PR

**Files:**
- Modify: `automation/worker/package.json` (skrypt `test`)

- [ ] **Step 1: Dodaj skrypt testowy**

W `automation/worker/package.json` dodaj do (lub utwórz) `"scripts"`:
```json
  "scripts": {
    "test": "node --test"
  },
```

- [ ] **Step 2: Pełny suite + składnia wszystkich plików**

Run:
```bash
cd automation/worker && npm test
node --check webhook.mjs && node --check worker.mjs && node --check schema.mjs
for f in triage/*.mjs; do node --check "$f"; done && echo "SYNTAX OK"
```
Expected: wszystkie testy PASS; `SYNTAX OK`.

- [ ] **Step 3: Push + PR**

```bash
git push -u origin feat/github-jam-triage
gh pr create --base main --head feat/github-jam-triage \
  --title "feat(automation): GitHub/Jam triage gate — Phase 1" \
  --body "Implements Phase 1 of docs/superpowers/specs/2026-08-05-github-jam-triage-design.md.

Triage gate before the worker claims a job: new issues are classified against the plan (Base 'Team OKR Tasks'), the verdict is written to the plan Base AND back to the GitHub issue (comment + label), and claimNext now orders by plan priority/position instead of FIFO.

- Shared jobs schema + additive triage columns (schema.mjs)
- Verdict parse/validate + priority ranking
- Plan digest + Base record fetch (lark-cli)
- Issue->verdict evaluator (LLM injected; reuses run-claude.sh in TRIAGE_MODE)
- Dual writer: Base record (lark-cli) + GitHub comment/label (gh), Polish, provisional flag on low confidence
- Plan-ordered claimNext (P0<P1<P2, Kolejność), backlog last, throttle+paused preserved

Out of scope (later phases): anti-abuse/strikes (Phase 2), Wiki feedback loop (Phase 3).

Tests: node --test (pure functions + in-memory sqlite ordering + mocked LLM/exec). No new npm deps.

NOT auto-deployed: the worker on the server is copied files, not a git checkout. Deploy is a deliberate manual step (see below), owned by claude-bot (RunCloud)."
```

- [ ] **Step 4: Deploy ręczny (po zmergowaniu PR) — udokumentowany, nie auto**

Po merge do main, wdrożenie na serwer workera (`root@138.201.133.106`, pliki jako `claude-bot`):
```bash
# skopiuj nowe/zmienione pliki jako claude-bot (własność RunCloud)
scp automation/worker/schema.mjs automation/worker/worker.mjs automation/worker/webhook.mjs automation/worker/run-claude.sh root@138.201.133.106:/tmp/
ssh root@138.201.133.106 'sudo -u claude-bot mkdir -p /home/claude-bot/worker/triage'
scp automation/worker/triage/*.mjs root@138.201.133.106:/tmp/triage/
ssh root@138.201.133.106 'for f in schema.mjs worker.mjs webhook.mjs run-claude.sh; do sudo -u claude-bot cp /tmp/$f /home/claude-bot/worker/$f; done; sudo -u claude-bot cp /tmp/triage/*.mjs /home/claude-bot/worker/triage/; systemctl restart claude-worker claude-webhook; systemctl is-active claude-worker claude-webhook'
```
Weryfikacja: `ssh root@138.201.133.106 'journalctl -u claude-worker -n 20 --no-pager'` — brak błędów startu; przy nowym issue log pokazuje `triaged` i pojawia się komentarz na issue.
UWAGA: `lark-cli` i `gh` muszą być dostępne dla usera `claude-bot` na serwerze — sprawdź `sudo -u claude-bot which lark-cli gh` przed restartem; jeśli brak, zainstaluj/zaloguj w kontekście claude-bot (osobny krok, poza tym planem).
```

- [ ] **Step 5: Checklist manualny (wpisz wyniki do PR)**

1. Nowe testowe issue z jasnym dopasowaniem do PK → komentarz „✅ Przyjęte do planu — PKx" + etykieta + nowy rekord w „Team OKR Tasks".
2. Issue ewidentnie poza planem → „⏸️ backlog" + etykieta `triage:backlog`.
3. Worker bierze P0 przed P1/P2 (dwa otriage'owane joby, kolejność pobrania zgodna z priorytetem).
