# GitHub/Jam Triage — Phase 2 (Policy / Anti-Abuse) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an anti-abuse policy layer to the triage worker: a SQLite strike ledger, pressure and multi-account detectors, escalating public strike comments, automatic permanent ban at 5 strikes, and a human-only collaborator-removal recommendation at the 6th offense.

**Architecture:** A new pure-logic module tree under `automation/worker/policy/` (strike ledger, detectors, message templates, orchestrating engine). The worker loop runs `evaluatePolicy` as a gate BEFORE the Phase 1 triage evaluator: a blocked verdict short-circuits to `triage_status='rejected'` with a visible GitHub comment and never reaches the plan evaluator or Base writer. The queue orderer (`claimNextPlanned`) additionally excludes banned logins. Bans are persisted in the ledger (`banned_at`) and unioned each loop with a static `BANNED_LOGINS` env seed — the same shape as the existing `PAUSED_LOGINS` mechanism.

**Tech Stack:** Node ESM daemon, `better-sqlite3`, built-in `node:test` runner, `gh` CLI via the worker's injected `exec` helper. Zero new npm dependencies.

## Global Constraints

- Zero new npm dependencies. Tests use the built-in `node:test` runner; run with `npm test` (which runs `node --test`) from `automation/worker/`.
- The strike ledger lives in the SAME SQLite database as the jobs queue (`queue.db`); `ensureStrikeSchema(db)` is called on that same `db` handle in `worker.mjs`. The webhook does NOT call it (the webhook does no policy work).
- Schema changes are additive-only, mirroring `schema.mjs` (never drop/alter existing columns).
- `STRIKE_BAN_THRESHOLD = 5`. The 5th strike bans; a strike counted at or beyond 6 emits the collaborator-removal recommendation.
- `SIMILARITY_THRESHOLD = 0.8` (Jaccard over normalized ≥3-char tokens) for multi-account duplicate detection.
- `MIN_SUBSTANCE_TOKENS = 12`: pressure only blocks when a pressure phrase is present AND the remaining substantive content is below this token count (pure-pressure junk). A real task worded urgently must still pass.
- Banned logins are the UNION of the static `BANNED_LOGINS` env list (comma-separated, same parsing as `PAUSED_LOGINS`) and ledger rows where `banned_at IS NOT NULL`. The env var is for manual/seed bans; runtime auto-bans persist only in the ledger.
- Detection order in the engine is fixed: multi-account duplicate is checked BEFORE the already-banned short-circuit, so an already-banned user who files a NEW duplicate still accrues the 6th strike and triggers the recommendation.
- Message tone: default terse Polish. For logins in `HARSH_LOGINS` (`aslocka`, `aslocka2026`) the comments are harsher and more critical. HARD BOUNDARY: harsh copy targets the behavior/violation (junk report, gaming, pressure), never the person — no insults, no harassment. Reviewers must reject any template that attacks the individual.
- The agent NEVER auto-removes a collaborator or a GitHub account. The 6th-offense output is a printed recommendation + the exact `gh api -X DELETE` command only; a human runs it.
- A blocked policy verdict sets `triage_status='rejected'`. Because Phase 1's `claimNextPlanned` only selects `triage_status IN ('triaged','backlog')`, rejected jobs are already unclaimable; the banned-login exclusion in the orderer is defense-in-depth and parity with `PAUSED_LOGINS`.
- DECYZJA DO POTWIERDZENIA (pre-flight): the spec lists pressure under "Kategoryczne no-go (odrzucenie, nie backlog)" but also says pressure merely "nie podnosi priorytetu". This plan resolves the ambiguity as: pressure blocks (→ rejected) ONLY when the issue is pure-pressure junk (thin substance, see `MIN_SUBSTANCE_TOKENS`); substantive-but-urgent issues proceed to normal triage. Confirm this reading before Task 5.

---

## File Structure

- `automation/worker/policy/strikes.mjs` — strike ledger: schema, read/increment/ban, banned-login listing. (Task 1)
- `automation/worker/policy/detect.mjs` — pure detectors: pressure, token similarity, related-login map, multi-account duplicate, harsh-login predicate. (Task 2)
- `automation/worker/policy/history.mjs` — DB read: recent issues by a set of logins, for duplicate comparison. (Task 3)
- `automation/worker/policy/tone.mjs` — Polish comment templates (pressure/strike/ban/recommendation) with harsh variants. (Task 4)
- `automation/worker/policy/engine.mjs` — `evaluatePolicy` orchestration wiring detectors + ledger + tone. (Task 5)
- `automation/worker/triage/claim.mjs` — MODIFY: add `bannedLogins` exclusion to `claimNextPlanned`. (Task 6)
- `automation/worker/triage/github-writer.mjs` — MODIFY: add `postRejection`. (Task 7)
- `automation/worker/triage/runner.mjs` — MODIFY: export `issueFromJob`. (Task 7)
- `automation/worker/worker.mjs` — MODIFY: wire policy gate + ban union into the loop. (Task 7)
- Tests co-located as `*.test.mjs` next to each module (matching Phase 1, e.g. `triage/runner.test.mjs`).

---

### Task 1: Strike ledger (SQLite)

**Files:**
- Create: `automation/worker/policy/strikes.mjs`
- Test: `automation/worker/policy/strikes.test.mjs`

**Interfaces:**
- Consumes: a `better-sqlite3` `db` handle.
- Produces:
  - `STRIKE_BAN_THRESHOLD` (number = 5)
  - `ensureStrikeSchema(db): void` — creates the `strikes` table if absent.
  - `getStrike(db, login): { login, count, reasons: Array<{ts,reason,issue}>, banned_at: number|null, updated_at } | null` (login lowercased).
  - `addStrike(db, login, { reason, issue, ts }): { count: number, banned: boolean }` — upsert; increments count, appends `{ts,reason,issue}` to reasons, sets `banned_at` once count ≥ threshold.
  - `isBanned(db, login): boolean`
  - `listBannedLogins(db): string[]`

- [ ] **Step 1: Write the failing test**

```js
// automation/worker/policy/strikes.test.mjs
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd automation/worker && node --test policy/strikes.test.mjs`
Expected: FAIL — `Cannot find module './strikes.mjs'`.

- [ ] **Step 3: Write minimal implementation**

```js
// automation/worker/policy/strikes.mjs
export const STRIKE_BAN_THRESHOLD = 5;

export function ensureStrikeSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS strikes (
      login TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      reasons TEXT NOT NULL DEFAULT '[]',
      banned_at INTEGER,
      updated_at INTEGER NOT NULL
    );
  `);
}

export function getStrike(db, login) {
  const key = (login || "").toLowerCase();
  const row = db.prepare("SELECT * FROM strikes WHERE login = ?").get(key);
  if (!row) return null;
  let reasons = [];
  try { reasons = JSON.parse(row.reasons || "[]"); } catch { reasons = []; }
  return { ...row, reasons };
}

export function addStrike(db, login, { reason, issue, ts }) {
  const key = (login || "").toLowerCase();
  const existing = getStrike(db, key);
  const reasons = existing ? existing.reasons : [];
  reasons.push({ ts, reason, issue: issue ?? null });
  const count = (existing ? existing.count : 0) + 1;
  const banned = count >= STRIKE_BAN_THRESHOLD;
  const bannedAt = banned ? (existing?.banned_at ?? ts) : null;
  db.prepare(`
    INSERT INTO strikes (login, count, reasons, banned_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(login) DO UPDATE SET
      count = excluded.count, reasons = excluded.reasons,
      banned_at = excluded.banned_at, updated_at = excluded.updated_at
  `).run(key, count, JSON.stringify(reasons), bannedAt, ts);
  return { count, banned };
}

export function isBanned(db, login) {
  const key = (login || "").toLowerCase();
  const row = db.prepare("SELECT banned_at FROM strikes WHERE login = ?").get(key);
  return !!(row && row.banned_at !== null && row.banned_at !== undefined);
}

export function listBannedLogins(db) {
  return db.prepare("SELECT login FROM strikes WHERE banned_at IS NOT NULL")
    .all().map((r) => r.login);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd automation/worker && node --test policy/strikes.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add automation/worker/policy/strikes.mjs automation/worker/policy/strikes.test.mjs
git commit -m "feat(triage/policy): strike ledger (SQLite) with auto-ban threshold"
```

---

### Task 2: Detectors (pressure, similarity, multi-account)

**Files:**
- Create: `automation/worker/policy/detect.mjs`
- Test: `automation/worker/policy/detect.test.mjs`

**Interfaces:**
- Consumes: an `issue` object of the Phase 1 shape from `issueFromJob`: `{ number, repo, title, body, login, url, jamLink }`.
- Produces:
  - `PRESSURE_PHRASES: string[]`, `MIN_SUBSTANCE_TOKENS = 12`, `SIMILARITY_THRESHOLD = 0.8`
  - `RELATED_LOGINS: Record<string,string[]>`, `relatedLoginsOf(login): string[]`
  - `HARSH_LOGINS: Set<string>`, `isHarshLogin(login): boolean`
  - `normalizeTokens(text): string[]`
  - `similarity(a, b): number` (0..1 Jaccard)
  - `detectPressure(issue): { hit: boolean, phrase: string|null }`
  - `detectMultiAccount(issue, { priorIssues }): { hit, relatedLogin, matchTitle, similarity }` where `priorIssues: Array<{login,title,body}>`

- [ ] **Step 1: Write the failing test**

```js
// automation/worker/policy/detect.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectPressure, detectMultiAccount, similarity, normalizeTokens,
  relatedLoginsOf, isHarshLogin,
} from "./detect.mjs";

test("detectPressure fires on thin pressure-only content", () => {
  const issue = { title: "PILNE", body: "Zrób to teraz, to krytyczne!!!" };
  assert.equal(detectPressure(issue).hit, true);
});

test("detectPressure does NOT fire on a substantive issue worded urgently", () => {
  const issue = {
    title: "Pilne: kalendarz gubi terminy przy zmianie strefy",
    body: "Przy zmianie strefy czasowej z Europe/Warsaw na UTC widok tygodnia przesuwa wizyty o godzinę i znika prepayment badge. Odtworzenie: otwórz gabinet, zmień strefę w ustawieniach organizacji, odśwież kalendarz tygodniowy.",
  };
  assert.equal(detectPressure(issue).hit, false);
});

test("detectPressure misses when there is no pressure phrase", () => {
  const issue = { title: "Literówka w nagłówku", body: "Drobna literówka na stronie ustawień." };
  assert.equal(detectPressure(issue).hit, false);
});

test("similarity is ~1 for identical text and low for different", () => {
  const a = "kalendarz gubi terminy przy zmianie strefy czasowej";
  assert.ok(similarity(a, a) > 0.99);
  assert.ok(similarity(a, "zupełnie inny problem dotyczący faktur vat") < 0.2);
});

test("normalizeTokens drops short tokens and punctuation", () => {
  assert.deepEqual(normalizeTokens("Ala ma 2 koty!!!"), ["ala", "koty"]);
});

test("detectMultiAccount flags a near-duplicate from a related account", () => {
  const issue = { title: "Kalendarz gubi terminy", body: "przy zmianie strefy czasowej znikają wizyty" };
  const priorIssues = [
    { login: "aslocka2026", title: "Kalendarz gubi terminy", body: "przy zmianie strefy czasowej znikają wizyty" },
  ];
  const r = detectMultiAccount(issue, { priorIssues });
  assert.equal(r.hit, true);
  assert.equal(r.relatedLogin, "aslocka2026");
});

test("detectMultiAccount ignores unrelated prior issues", () => {
  const issue = { title: "Kalendarz gubi terminy", body: "przy zmianie strefy" };
  const priorIssues = [{ login: "aslocka2026", title: "Faktury VAT", body: "błędna stawka" }];
  assert.equal(detectMultiAccount(issue, { priorIssues }).hit, false);
});

test("relatedLoginsOf and isHarshLogin know the known alt pair", () => {
  assert.deepEqual(relatedLoginsOf("aslocka"), ["aslocka2026"]);
  assert.deepEqual(relatedLoginsOf("ASlocka2026"), ["aslocka"]);
  assert.deepEqual(relatedLoginsOf("randomdev"), []);
  assert.equal(isHarshLogin("aslocka"), true);
  assert.equal(isHarshLogin("randomdev"), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd automation/worker && node --test policy/detect.test.mjs`
Expected: FAIL — `Cannot find module './detect.mjs'`.

- [ ] **Step 3: Write minimal implementation**

```js
// automation/worker/policy/detect.mjs
export const PRESSURE_PHRASES = [
  "zrób to teraz", "zrob to teraz", "zróbcie to teraz", "natychmiast",
  "to krytyczne", "to jest krytyczne", "pilne", "bardzo pilne", "asap",
  "od razu", "już teraz", "juz teraz", "wykonaj to", "musisz to zrobić",
  "musisz to zrobic", "musicie to zrobić", "bo inaczej",
  "do it now", "right now", "urgent", "immediately", "or else", "drop everything",
];
export const MIN_SUBSTANCE_TOKENS = 12;
export const SIMILARITY_THRESHOLD = 0.8;

export const RELATED_LOGINS = {
  aslocka: ["aslocka2026"],
  aslocka2026: ["aslocka"],
};
export function relatedLoginsOf(login) {
  return RELATED_LOGINS[(login || "").toLowerCase()] || [];
}

export const HARSH_LOGINS = new Set(["aslocka", "aslocka2026"]);
export function isHarshLogin(login) {
  return HARSH_LOGINS.has((login || "").toLowerCase());
}

export function normalizeTokens(text) {
  return (text || "")
    .toLowerCase()
    .split(/[^a-ząćęłńóśźż0-9]+/i)
    .filter((t) => t.length >= 3);
}

export function similarity(a, b) {
  const sa = new Set(normalizeTokens(a));
  const sb = new Set(normalizeTokens(b));
  if (sa.size === 0 && sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Pressure blocks only when a pressure phrase is present AND the remaining
// substantive content is thin (pure-pressure junk). Substantive-but-urgent
// issues pass through to normal triage.
export function detectPressure(issue) {
  const text = `${issue.title || ""}\n${issue.body || ""}`.toLowerCase();
  const phrase = PRESSURE_PHRASES.find((p) => text.includes(p));
  if (!phrase) return { hit: false, phrase: null };
  let rest = text;
  for (const p of PRESSURE_PHRASES) rest = rest.split(p).join(" ");
  const tokens = rest.split(/[^a-ząćęłńóśźż0-9]+/i).filter((t) => t.length >= 3);
  const thin = tokens.length < MIN_SUBSTANCE_TOKENS;
  return { hit: thin, phrase: thin ? phrase : null };
}

// priorIssues are already restricted to related logins by the caller.
export function detectMultiAccount(issue, { priorIssues }) {
  const mine = `${issue.title || ""} ${issue.body || ""}`;
  for (const prior of priorIssues || []) {
    const sim = similarity(mine, `${prior.title || ""} ${prior.body || ""}`);
    if (sim >= SIMILARITY_THRESHOLD) {
      return { hit: true, relatedLogin: prior.login, matchTitle: prior.title || "", similarity: sim };
    }
  }
  return { hit: false, relatedLogin: null, matchTitle: "", similarity: 0 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd automation/worker && node --test policy/detect.test.mjs`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add automation/worker/policy/detect.mjs automation/worker/policy/detect.test.mjs
git commit -m "feat(triage/policy): pressure + multi-account duplicate detectors"
```

---

### Task 3: History reader (recent issues by login)

**Files:**
- Create: `automation/worker/policy/history.mjs`
- Test: `automation/worker/policy/history.test.mjs`

**Interfaces:**
- Consumes: the `jobs` table (Phase 1 `schema.mjs` shape: `id, trigger_login, payload_json, created_at, ...`). Payload JSON has `{ title, body, comment_body }`.
- Produces: `recentIssuesByLogins(db, logins, { excludeId = null, limit = 20 } = {}): Array<{ login, title, body }>` ordered newest-first.

- [ ] **Step 1: Write the failing test**

```js
// automation/worker/policy/history.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { ensureSchema } from "../schema.mjs";
import { recentIssuesByLogins } from "./history.mjs";

function seed(db, { login, title, body, id }) {
  db.prepare(
    `INSERT INTO jobs (id, issue_number, repo, event_type, trigger_login, payload_json, created_at)
     VALUES (?, ?, 'o/r', 'issues.opened', ?, ?, ?)`,
  ).run(id, id, login, JSON.stringify({ title, body }), id);
}

test("recentIssuesByLogins returns only the given logins, parsed", () => {
  const db = new Database(":memory:");
  ensureSchema(db);
  seed(db, { id: 1, login: "aslocka2026", title: "Dup", body: "treść duplikatu" });
  seed(db, { id: 2, login: "someoneelse", title: "Inne", body: "co innego" });
  const rows = recentIssuesByLogins(db, ["aslocka2026"]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].login, "aslocka2026");
  assert.equal(rows[0].title, "Dup");
  assert.equal(rows[0].body, "treść duplikatu");
});

test("excludeId omits the current job", () => {
  const db = new Database(":memory:");
  ensureSchema(db);
  seed(db, { id: 10, login: "aslocka", title: "A", body: "a" });
  seed(db, { id: 11, login: "aslocka", title: "B", body: "b" });
  const rows = recentIssuesByLogins(db, ["aslocka"], { excludeId: 11 });
  assert.deepEqual(rows.map((r) => r.title), ["A"]);
});

test("empty login list returns empty array", () => {
  const db = new Database(":memory:");
  ensureSchema(db);
  assert.deepEqual(recentIssuesByLogins(db, []), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd automation/worker && node --test policy/history.test.mjs`
Expected: FAIL — `Cannot find module './history.mjs'`.

- [ ] **Step 3: Write minimal implementation**

```js
// automation/worker/policy/history.mjs
// Recent issues filed by a set of logins, used to compare a new issue against
// prior submissions from related accounts (multi-account duplicate detection).
export function recentIssuesByLogins(db, logins, { excludeId = null, limit = 20 } = {}) {
  if (!logins || logins.length === 0) return [];
  const placeholders = logins.map(() => "?").join(",");
  const rows = db.prepare(
    `SELECT id, trigger_login, payload_json FROM jobs
     WHERE trigger_login IN (${placeholders}) AND (? IS NULL OR id != ?)
     ORDER BY created_at DESC LIMIT ?`,
  ).all(...logins, excludeId, excludeId, limit);
  return rows.map((r) => {
    let p = {};
    try { p = JSON.parse(r.payload_json || "{}"); } catch { /* ignore */ }
    return { login: r.trigger_login, title: p.title || "", body: p.comment_body || p.body || "" };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd automation/worker && node --test policy/history.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add automation/worker/policy/history.mjs automation/worker/policy/history.test.mjs
git commit -m "feat(triage/policy): recent-issues-by-login reader for dup detection"
```

---

### Task 4: Message templates (tone)

**Files:**
- Create: `automation/worker/policy/tone.mjs`
- Test: `automation/worker/policy/tone.test.mjs`

**Interfaces:**
- Consumes: `isHarshLogin` from `./detect.mjs`.
- Produces (all return Polish strings):
  - `pressureComment({ login }): string`
  - `strikeComment({ login, count, threshold, reason }): string`
  - `banComment({ login, reason, threshold }): string`
  - `collaboratorRemovalRecommendation({ login, repo }): string`

- [ ] **Step 1: Write the failing test**

```js
// automation/worker/policy/tone.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pressureComment, strikeComment, banComment, collaboratorRemovalRecommendation,
} from "./tone.mjs";

test("pressureComment rejects and states pressure is not an argument", () => {
  const c = pressureComment({ login: "randomdev" });
  assert.match(c, /Odrzucone/);
  assert.match(c, /[Pp]resja/);
});

test("harsh login gets a harsher pressure comment than a neutral one", () => {
  const harsh = pressureComment({ login: "aslocka" });
  const neutral = pressureComment({ login: "randomdev" });
  assert.notEqual(harsh, neutral);
});

test("strikeComment shows the counter and threshold", () => {
  const c = strikeComment({ login: "aslocka", count: 3, threshold: 5, reason: "duplikat" });
  assert.match(c, /Strike 3\/5/);
  assert.match(c, /duplikat/);
});

test("banComment names the login and the permanent ban", () => {
  const c = banComment({ login: "aslocka", reason: "5 strike'ów", threshold: 5 });
  assert.match(c, /aslocka/);
  assert.match(c, /[Bb]an/);
});

test("collaboratorRemovalRecommendation prints the exact gh command, human-only", () => {
  const c = collaboratorRemovalRecommendation({ login: "aslocka", repo: "aleksanderem/crm_new" });
  assert.match(c, /gh api -X DELETE repos\/aleksanderem\/crm_new\/collaborators\/aslocka/);
  assert.match(c, /człowieka/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd automation/worker && node --test policy/tone.test.mjs`
Expected: FAIL — `Cannot find module './tone.mjs'`.

- [ ] **Step 3: Write minimal implementation**

```js
// automation/worker/policy/tone.mjs
import { isHarshLogin } from "./detect.mjs";

// HARD BOUNDARY: harsh copy targets the behavior/violation, never the person.
export function pressureComment({ login }) {
  if (isHarshLogin(login)) {
    return "⛔ **Odrzucone.** Presja i ponaglenia to nie jest zgłoszenie. Nie ma tu treści merytorycznej — sam nacisk. Tak to nie działa: opisz konkretny problem (co, gdzie, jak odtworzyć) albo nie zajmuj kolejki. Priorytet ustala plan, nie ton wiadomości.";
  }
  return "⛔ **Odrzucone.** Presja nie jest argumentem za priorytetem. To zgłoszenie nie opisuje konkretnego zadania z planu — samo ponaglenie nie wystarcza. Opisz problem merytorycznie (co, gdzie, jak odtworzyć), a wróci do oceny.";
}

export function strikeComment({ login, count, threshold, reason }) {
  const emph = isHarshLogin(login) ? " To celowe obchodzenie zasad. " : " ";
  return `⚠️ **Strike ${count}/${threshold}** — ${reason}.${emph}Przy ${threshold} strike'ach następuje permanentny ban i żadne Twoje zgłoszenie nie będzie rozpatrywane.`;
}

export function banComment({ login, reason, threshold }) {
  return `⛔ **Permanentny ban (${login}).** ${reason}. Osiągnięto próg ${threshold} strike'ów — od tej chwili Twoje zgłoszenia nie są przetwarzane. Kolejne naruszenie = wniosek o odebranie dostępu do repozytorium.`;
}

export function collaboratorRemovalRecommendation({ login, repo }) {
  return `\n\n---\n**REKOMENDACJA (do wykonania przez człowieka):** usuń współpracownika \`${login}\` z repo:\n\n\`\`\`\ngh api -X DELETE repos/${repo}/collaborators/${login}\n\`\`\`\n\n(Agent nie wykonuje tej operacji automatycznie — konta GitHub nie da się usunąć.)`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd automation/worker && node --test policy/tone.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add automation/worker/policy/tone.mjs automation/worker/policy/tone.test.mjs
git commit -m "feat(triage/policy): Polish strike/ban/pressure comment templates"
```

---

### Task 5: Policy engine (orchestration)

**Files:**
- Create: `automation/worker/policy/engine.mjs`
- Test: `automation/worker/policy/engine.test.mjs`

**Interfaces:**
- Consumes: `detectPressure`, `detectMultiAccount` (`./detect.mjs`); `addStrike`, `isBanned`, `STRIKE_BAN_THRESHOLD` (`./strikes.mjs`); `pressureComment`, `strikeComment`, `banComment`, `collaboratorRemovalRecommendation` (`./tone.mjs`).
- Produces: `evaluatePolicy(db, issue, { priorIssues = [], now }): { blocked: boolean, flags: string[], comment: string|null, recordedStrike: boolean, banned: boolean }`. `now` is a function returning ms (e.g. `Date.now`).
- Order (fixed): multi-account → already-banned → pressure → clean. Multi-account is checked first so an already-banned repeat offender still accrues the 6th strike + recommendation.

- [ ] **Step 1: Write the failing test**

```js
// automation/worker/policy/engine.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { ensureStrikeSchema, isBanned, getStrike } from "./strikes.mjs";
import { evaluatePolicy } from "./engine.mjs";

function db0() {
  const db = new Database(":memory:");
  ensureStrikeSchema(db);
  return db;
}
const clock = () => 1000;

test("clean issue is not blocked", () => {
  const db = db0();
  const issue = { login: "dev", repo: "o/r", title: "Realne zadanie", body: "opis konkretnego zadania z planu, wiele szczegółów technicznych tutaj." };
  const r = evaluatePolicy(db, issue, { priorIssues: [], now: clock });
  assert.equal(r.blocked, false);
  assert.equal(r.recordedStrike, false);
});

test("pure-pressure junk is blocked without a strike", () => {
  const db = db0();
  const issue = { login: "dev", repo: "o/r", title: "PILNE", body: "zrób to teraz!!!" };
  const r = evaluatePolicy(db, issue, { priorIssues: [], now: clock });
  assert.equal(r.blocked, true);
  assert.deepEqual(r.flags, ["pressure"]);
  assert.equal(r.recordedStrike, false);
  assert.match(r.comment, /Presja|presja/);
});

test("multi-account duplicate records a strike and blocks", () => {
  const db = db0();
  const issue = { login: "aslocka", repo: "o/r", title: "Kalendarz gubi terminy", body: "przy zmianie strefy czasowej znikają wizyty" };
  const priorIssues = [{ login: "aslocka2026", title: "Kalendarz gubi terminy", body: "przy zmianie strefy czasowej znikają wizyty" }];
  const r = evaluatePolicy(db, issue, { priorIssues, now: clock });
  assert.equal(r.blocked, true);
  assert.deepEqual(r.flags, ["multi-account"]);
  assert.equal(r.recordedStrike, true);
  assert.equal(getStrike(db, "aslocka").count, 1);
  assert.match(r.comment, /Strike 1\/5/);
});

test("fifth duplicate strike bans and includes the ban notice", () => {
  const db = db0();
  const issue = { login: "aslocka", repo: "o/r", title: "Dup", body: "identyczna treść zgłoszenia do porównania" };
  const priorIssues = [{ login: "aslocka2026", title: "Dup", body: "identyczna treść zgłoszenia do porównania" }];
  let r;
  for (let i = 0; i < 5; i++) r = evaluatePolicy(db, issue, { priorIssues, now: clock });
  assert.equal(r.banned, true);
  assert.equal(isBanned(db, "aslocka"), true);
  assert.match(r.comment, /Permanentny ban/);
});

test("sixth offense appends the collaborator-removal recommendation", () => {
  const db = db0();
  const issue = { login: "aslocka", repo: "aleksanderem/crm_new", title: "Dup", body: "identyczna treść zgłoszenia do porównania" };
  const priorIssues = [{ login: "aslocka2026", title: "Dup", body: "identyczna treść zgłoszenia do porównania" }];
  let r;
  for (let i = 0; i < 6; i++) r = evaluatePolicy(db, issue, { priorIssues, now: clock });
  assert.match(r.comment, /gh api -X DELETE repos\/aleksanderem\/crm_new\/collaborators\/aslocka/);
});

test("already-banned user filing a clean issue is blocked without a new strike", () => {
  const db = db0();
  const dup = { login: "aslocka", repo: "o/r", title: "Dup", body: "identyczna treść zgłoszenia do porównania" };
  const priorIssues = [{ login: "aslocka2026", title: "Dup", body: "identyczna treść zgłoszenia do porównania" }];
  for (let i = 0; i < 5; i++) evaluatePolicy(db, dup, { priorIssues, now: clock });
  const before = getStrike(db, "aslocka").count;
  const clean = { login: "aslocka", repo: "o/r", title: "Coś nowego", body: "całkiem inny, merytoryczny opis problemu z wieloma detalami technicznymi" };
  const r = evaluatePolicy(db, clean, { priorIssues: [], now: clock });
  assert.equal(r.blocked, true);
  assert.deepEqual(r.flags, ["banned"]);
  assert.equal(r.recordedStrike, false);
  assert.equal(getStrike(db, "aslocka").count, before);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd automation/worker && node --test policy/engine.test.mjs`
Expected: FAIL — `Cannot find module './engine.mjs'`.

- [ ] **Step 3: Write minimal implementation**

```js
// automation/worker/policy/engine.mjs
import { detectPressure, detectMultiAccount } from "./detect.mjs";
import { addStrike, isBanned, STRIKE_BAN_THRESHOLD } from "./strikes.mjs";
import {
  pressureComment, strikeComment, banComment, collaboratorRemovalRecommendation,
} from "./tone.mjs";

// Decide whether an issue is blocked by policy before it reaches the plan
// evaluator. Returns a structured outcome; the caller posts the comment and
// sets triage_status='rejected' when blocked. Detection order is fixed:
// multi-account first so an already-banned repeat offender still accrues the
// 6th strike + collaborator-removal recommendation.
export function evaluatePolicy(db, issue, { priorIssues = [], now }) {
  const login = issue.login || "";
  const ts = now();

  const multi = detectMultiAccount(issue, { priorIssues });
  if (multi.hit) {
    const reason = `duplikat zadania zgłoszony z powiązanego konta (${multi.relatedLogin})`;
    const strike = addStrike(db, login, { reason, issue: issue.url, ts });
    let comment = strikeComment({ login, count: strike.count, threshold: STRIKE_BAN_THRESHOLD, reason });
    if (strike.count >= STRIKE_BAN_THRESHOLD) {
      comment += "\n\n" + banComment({ login, reason, threshold: STRIKE_BAN_THRESHOLD });
    }
    if (strike.count > STRIKE_BAN_THRESHOLD) {
      comment += collaboratorRemovalRecommendation({ login, repo: issue.repo });
    }
    return { blocked: true, flags: ["multi-account"], comment, recordedStrike: true, banned: strike.count >= STRIKE_BAN_THRESHOLD };
  }

  if (isBanned(db, login)) {
    return {
      blocked: true, flags: ["banned"],
      comment: banComment({ login, reason: "konto jest permanentnie zbanowane", threshold: STRIKE_BAN_THRESHOLD }),
      recordedStrike: false, banned: true,
    };
  }

  const pressure = detectPressure(issue);
  if (pressure.hit) {
    return { blocked: true, flags: ["pressure"], comment: pressureComment({ login }), recordedStrike: false, banned: false };
  }

  return { blocked: false, flags: [], comment: null, recordedStrike: false, banned: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd automation/worker && node --test policy/engine.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add automation/worker/policy/engine.mjs automation/worker/policy/engine.test.mjs
git commit -m "feat(triage/policy): evaluatePolicy engine (pressure/multi-account/ban)"
```

---

### Task 6: Ban exclusion in the queue orderer

**Files:**
- Modify: `automation/worker/triage/claim.mjs`
- Test: `automation/worker/policy/claim-ban.test.mjs`

**Interfaces:**
- Consumes: existing `claimNextPlanned(db, opts)` from Phase 1.
- Produces: `claimNextPlanned` now accepts `bannedLogins: string[]` (default `[]`) and excludes those logins exactly like `pausedLogins` (hard stop). Existing callers that omit `bannedLogins` are unaffected.

- [ ] **Step 1: Write the failing test**

```js
// automation/worker/policy/claim-ban.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { ensureSchema } from "../schema.mjs";
import { claimNextPlanned } from "../triage/claim.mjs";

function seedTriaged(db, { id, login }) {
  db.prepare(
    `INSERT INTO jobs (id, issue_number, repo, event_type, trigger_login, payload_json, status, created_at, triage_status, triage_priority, triage_order)
     VALUES (?, ?, 'o/r', 'issues.opened', ?, '{}', 'pending', ?, 'triaged', 'P0', 1)`,
  ).run(id, id, login, id);
}
const opts = (extra) => ({ throttledLogins: [], pausedLogins: [], throttleIntervalMs: 3600000, now: () => 10_000, ...extra });

test("a banned login's triaged job is not claimed", () => {
  const db = new Database(":memory:");
  ensureSchema(db);
  seedTriaged(db, { id: 1, login: "aslocka" });
  const job = claimNextPlanned(db, opts({ bannedLogins: ["aslocka"] }));
  assert.equal(job, null);
});

test("a non-banned login's job is still claimed when others are banned", () => {
  const db = new Database(":memory:");
  ensureSchema(db);
  seedTriaged(db, { id: 1, login: "aslocka" });
  seedTriaged(db, { id: 2, login: "gooddev" });
  const job = claimNextPlanned(db, opts({ bannedLogins: ["aslocka"] }));
  assert.equal(job.trigger_login, "gooddev");
});

test("omitting bannedLogins preserves Phase 1 behavior", () => {
  const db = new Database(":memory:");
  ensureSchema(db);
  seedTriaged(db, { id: 1, login: "anyone" });
  const job = claimNextPlanned(db, opts());
  assert.equal(job.trigger_login, "anyone");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd automation/worker && node --test policy/claim-ban.test.mjs`
Expected: FAIL — the first test claims the job (banned login not excluded yet).

- [ ] **Step 3: Modify the implementation**

Replace the body of `automation/worker/triage/claim.mjs` with:

```js
import { priorityRank } from "./verdict.mjs";

// Claim the next runnable job by PLAN order (not FIFO). Runnable = triaged or
// backlog. Ordering: priority rank (P0<P1<P2<backlog) -> plan Kolejność -> age.
// Hard-excludes paused AND banned logins; preserves the per-login throttle.
// Sets status='running' atomically.
export function claimNextPlanned(db, { throttledLogins, pausedLogins, bannedLogins = [], throttleIntervalMs, now }) {
  const cutoff = now() - throttleIntervalMs;
  const hardStop = [...pausedLogins, ...bannedLogins];
  const throttleIn = throttledLogins.map(() => "?").join(",") || "''";
  const hardIn = hardStop.map(() => "?").join(",") || "''";
  const rows = db.prepare(
    `SELECT * FROM jobs
     WHERE status = 'pending' AND triage_status IN ('triaged','backlog')
       AND (trigger_login IS NULL OR trigger_login NOT IN (${hardIn}))
       AND (
         trigger_login IS NULL
         OR trigger_login NOT IN (${throttleIn})
         OR NOT EXISTS (
           SELECT 1 FROM jobs busy WHERE busy.trigger_login = jobs.trigger_login
             AND busy.status IN ('running','done','failed')
             AND COALESCE(busy.finished_at, busy.started_at, 0) > ?
         )
       )`,
  ).all(...hardStop, ...throttledLogins, cutoff);

  if (rows.length === 0) return null;
  rows.sort((a, b) =>
    (priorityRank(a.triage_priority) - priorityRank(b.triage_priority)) ||
    ((a.triage_order ?? Number.MAX_SAFE_INTEGER) - (b.triage_order ?? Number.MAX_SAFE_INTEGER)) ||
    (a.created_at - b.created_at),
  );
  const job = rows[0];
  db.prepare("UPDATE jobs SET status = 'running', started_at = ? WHERE id = ?").run(Date.now(), job.id);
  return { ...job, status: "running" };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd automation/worker && node --test policy/claim-ban.test.mjs`
Expected: PASS (3 tests).

Run the Phase 1 claim tests to confirm no regression:
Run: `cd automation/worker && node --test triage/claim.test.mjs`
Expected: PASS (unchanged).

- [ ] **Step 5: Commit**

```bash
git add automation/worker/triage/claim.mjs automation/worker/policy/claim-ban.test.mjs
git commit -m "feat(triage): exclude banned logins from the queue orderer"
```

---

### Task 7: Wire the policy gate into the worker loop

**Files:**
- Modify: `automation/worker/triage/github-writer.mjs` (add `postRejection`)
- Modify: `automation/worker/triage/runner.mjs` (export `issueFromJob`)
- Modify: `automation/worker/worker.mjs` (policy gate + ban union + `BANNED_LOGINS` env + `ensureStrikeSchema`)
- Test: `automation/worker/triage/github-writer-reject.test.mjs` (new), `automation/worker/policy/integration.test.mjs` (new)
- Docs: `automation/worker/README.md` (deploy notes — create if absent)

**Interfaces:**
- Consumes: `evaluatePolicy` (`./policy/engine.mjs`), `listBannedLogins`, `ensureStrikeSchema` (`./policy/strikes.mjs`), `relatedLoginsOf` (`./policy/detect.mjs`), `recentIssuesByLogins` (`./policy/history.mjs`), `issueFromJob`, `nextUntriagedJob`, `triageJob` (`./triage/runner.mjs`), `claimNextPlanned` (`./triage/claim.mjs`), the existing `exec`, `jlog`, `getPlanDigest`, `invokeLLM`, `PAUSED_LOGINS`, `THROTTLED_LOGINS`, `THROTTLE_INTERVAL_MS`.
- Produces: `postRejection(issue, body, { exec }): void` (gh comment + `--add-label triage:rejected`); `issueFromJob` exported.

- [ ] **Step 1: Write the failing test for `postRejection`**

```js
// automation/worker/triage/github-writer-reject.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { postRejection } from "./github-writer.mjs";

test("postRejection comments and adds the triage:rejected label", () => {
  const calls = [];
  const exec = (cmd, args) => { calls.push([cmd, args]); return { stdout: "" }; };
  const issue = { number: 42, repo: "o/r" };
  postRejection(issue, "⛔ Odrzucone.", { exec });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], ["gh", ["issue", "comment", "42", "--repo", "o/r", "--body", "⛔ Odrzucone."]]);
  assert.deepEqual(calls[1], ["gh", ["issue", "edit", "42", "--repo", "o/r", "--add-label", "triage:rejected"]]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd automation/worker && node --test triage/github-writer-reject.test.mjs`
Expected: FAIL — `postRejection is not a function` / not exported.

- [ ] **Step 3: Add `postRejection` to `github-writer.mjs`**

Append to `automation/worker/triage/github-writer.mjs` (after the existing `postVerdict`):

```js
// Policy rejection: a visible comment plus the triage:rejected label. Used when
// the policy gate blocks an issue (pressure / multi-account / banned) before it
// reaches the plan evaluator.
export function postRejection(issue, body, { exec }) {
  const repo = issue.repo;
  exec("gh", ["issue", "comment", String(issue.number), "--repo", repo, "--body", body]);
  exec("gh", ["issue", "edit", String(issue.number), "--repo", repo, "--add-label", "triage:rejected"]);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd automation/worker && node --test triage/github-writer-reject.test.mjs`
Expected: PASS (1 test).

- [ ] **Step 5: Export `issueFromJob` from `runner.mjs`**

In `automation/worker/triage/runner.mjs`, change the declaration:

```js
function issueFromJob(job) {
```

to:

```js
export function issueFromJob(job) {
```

Run the Phase 1 runner tests to confirm no regression:
Run: `cd automation/worker && node --test triage/runner.test.mjs`
Expected: PASS (unchanged).

- [ ] **Step 6: Write the policy integration test**

```js
// automation/worker/policy/integration.test.mjs
// Exercises the worker's decision path (policy gate → rejected → unclaimable)
// without importing worker.mjs (which starts the daemon on import).
import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { ensureSchema } from "../schema.mjs";
import { ensureStrikeSchema, listBannedLogins } from "./strikes.mjs";
import { relatedLoginsOf } from "./detect.mjs";
import { recentIssuesByLogins } from "./history.mjs";
import { evaluatePolicy } from "./engine.mjs";
import { issueFromJob } from "../triage/runner.mjs";
import { claimNextPlanned } from "../triage/claim.mjs";

function insertJob(db, { id, login, title, body, triage = "untriaged" }) {
  db.prepare(
    `INSERT INTO jobs (id, issue_number, repo, event_type, trigger_login, payload_json, status, created_at, triage_status, triage_priority, triage_order)
     VALUES (?, ?, 'aleksanderem/crm_new', 'issues.opened', ?, ?, 'pending', ?, ?, 'P0', 1)`,
  ).run(id, id, login, JSON.stringify({ title, body }), id, triage);
}

test("a duplicate from a related account is blocked, marked rejected, and never claimed", () => {
  const db = new Database(":memory:");
  ensureSchema(db);
  ensureStrikeSchema(db);

  // prior issue from the alt account (already triaged, not relevant to claim here)
  insertJob(db, { id: 1, login: "aslocka2026", title: "Kalendarz gubi terminy", body: "przy zmianie strefy czasowej znikają wizyty", triage: "triaged" });
  // the new untriaged duplicate from the main account
  insertJob(db, { id: 2, login: "aslocka", title: "Kalendarz gubi terminy", body: "przy zmianie strefy czasowej znikają wizyty" });

  const job = db.prepare("SELECT * FROM jobs WHERE id = 2").get();
  const issue = issueFromJob(job);
  const policy = evaluatePolicy(db, issue, {
    priorIssues: recentIssuesByLogins(db, relatedLoginsOf(issue.login), { excludeId: job.id }),
    now: () => 5000,
  });
  assert.equal(policy.blocked, true);
  assert.deepEqual(policy.flags, ["multi-account"]);

  // worker would set this on block:
  db.prepare("UPDATE jobs SET triage_status='rejected' WHERE id = ?").run(job.id);

  // the rejected duplicate is not claimable
  const claimed = claimNextPlanned(db, {
    throttledLogins: [], pausedLogins: [],
    bannedLogins: listBannedLogins(db),
    throttleIntervalMs: 3600000, now: () => 100000,
  });
  assert.notEqual(claimed?.id, 2);
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `cd automation/worker && node --test policy/integration.test.mjs`
Expected: PASS already IF Tasks 1–6 are in and `issueFromJob` is exported (this test uses only existing exports). If `issueFromJob` is not yet exported it FAILS with an import error — confirms Step 5 landed.

- [ ] **Step 8: Wire the gate into `worker.mjs`**

8a. Update the runner + github-writer imports and add the policy imports. In `automation/worker/worker.mjs`, change:

```js
import { nextUntriagedJob, triageJob } from "./triage/runner.mjs";
```
to:
```js
import { nextUntriagedJob, triageJob, issueFromJob } from "./triage/runner.mjs";
```

and change:
```js
import { postVerdict } from "./triage/github-writer.mjs";
```
to:
```js
import { postVerdict, postRejection } from "./triage/github-writer.mjs";
import { ensureStrikeSchema, listBannedLogins } from "./policy/strikes.mjs";
import { relatedLoginsOf } from "./policy/detect.mjs";
import { recentIssuesByLogins } from "./policy/history.mjs";
import { evaluatePolicy } from "./policy/engine.mjs";
```

8b. Ensure the strike schema. Change:
```js
ensureSchema(db);
```
to:
```js
ensureSchema(db);
ensureStrikeSchema(db);
```

8c. Add the `BANNED_LOGINS` env seed. After the `PAUSED_LOGINS` block (the `.split(",")...filter(Boolean)` for paused), add:

```js
// Statically-seeded permanent bans (comma-separated). Unioned each loop with
// the ledger's auto-banned logins. Same shape as PAUSED_LOGINS.
const BANNED_LOGINS = (process.env.BANNED_LOGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
```

8d. Insert the policy gate at the top of the untriaged branch. Change:

```js
    const untriaged = nextUntriagedJob(db);
    if (untriaged) {
      try {
        await triageJob(db, untriaged, {
```

to:

```js
    const untriaged = nextUntriagedJob(db);
    if (untriaged) {
      // policy gate: block pressure / multi-account / banned before plan eval
      const gateIssue = issueFromJob(untriaged);
      const policy = evaluatePolicy(db, gateIssue, {
        priorIssues: recentIssuesByLogins(db, relatedLoginsOf(gateIssue.login), { excludeId: untriaged.id }),
        now: Date.now,
      });
      if (policy.blocked) {
        try { postRejection(gateIssue, policy.comment, { exec }); }
        catch (e) { jlog({ level: "warn", msg: "policy-comment-failed", id: untriaged.id, err: String(e) }); }
        db.prepare("UPDATE jobs SET triage_status='rejected', triage_rationale=? WHERE id=?")
          .run(String(policy.comment).slice(0, 1000), untriaged.id);
        jlog({ level: "info", msg: "policy-blocked", id: untriaged.id, flags: policy.flags, banned: policy.banned });
        continue;
      }
      try {
        await triageJob(db, untriaged, {
```

(The rest of the `try { await triageJob(...) ...} catch ... continue;` block is unchanged.)

8e. Union ledger bans into the claim call. Change:

```js
    const job = claimNextPlanned(db, {
      throttledLogins: THROTTLED_LOGINS,
      pausedLogins: PAUSED_LOGINS,
      throttleIntervalMs: THROTTLE_INTERVAL_MS,
      now: Date.now,
    });
```
to:
```js
    const job = claimNextPlanned(db, {
      throttledLogins: THROTTLED_LOGINS,
      pausedLogins: PAUSED_LOGINS,
      bannedLogins: [...BANNED_LOGINS, ...listBannedLogins(db)],
      throttleIntervalMs: THROTTLE_INTERVAL_MS,
      now: Date.now,
    });
```

- [ ] **Step 9: Verify the whole worker package**

Run: `cd automation/worker && node --check worker.mjs && node --check triage/runner.mjs && node --check triage/github-writer.mjs && node --check triage/claim.mjs && echo SYNTAX_OK`
Expected: `SYNTAX_OK`.

Run the full suite:
Run: `cd automation/worker && npm test`
Expected: all tests pass (Phase 1 suite + the new policy suite), 0 failures.

- [ ] **Step 10: Deploy notes**

Create `automation/worker/README.md` if it does not exist, or append a section, documenting the Phase 2 operational surface:

```markdown
## Policy / anti-abuse (Phase 2)

- Strike ledger lives in the same `queue.db` (table `strikes`). No migration step — `ensureStrikeSchema(db)` runs at worker startup.
- `BANNED_LOGINS` (env, comma-separated) is the static ban seed. Runtime auto-bans (5 strikes) persist in the `strikes` ledger; the worker unions both each loop. Set on the server the same way as `PAUSED_LOGINS`/`THROTTLED_LOGINS` (systemd unit env / `.env`).
- GitHub labels required in the target repo: `triage:rejected` (in addition to Phase 1's `triage:PK1..PK9` and `triage:backlog`). Missing labels make `gh --add-label` fail, but that path is non-fatal (caught + logged).
- The 6th-offense output is a printed `gh api -X DELETE .../collaborators/<login>` recommendation only. A human runs it. The agent never removes a collaborator or account.
- Deploy is manual: copy `automation/worker/**` (including the new `policy/` dir) to `/home/claude-bot/worker/` as user `claude-bot` (respect RunCloud ownership), then restart `claude-worker` (the webhook is unchanged).
```

- [ ] **Step 11: Commit**

```bash
git add automation/worker/worker.mjs automation/worker/triage/github-writer.mjs \
        automation/worker/triage/runner.mjs \
        automation/worker/triage/github-writer-reject.test.mjs \
        automation/worker/policy/integration.test.mjs \
        automation/worker/README.md
git commit -m "feat(triage): wire policy gate + ban union into the worker loop"
```

---

## Self-Review

Spec coverage (spec §132–171, Faza 2 §179–181):
- Strike ledger (SQLite `strikes`: login/count/reasons/banned_at/updated_at) → Task 1. ✅
- Pressure no-go + multi-account gaming (aslocka/aslocka2026, similarity + related-login map) → Task 2. ✅
- Duplicate comparison against prior submissions from related accounts → Task 3 (history) + Task 5 (engine). ✅
- Public strike comment with `Strike X/5` counter + reason; harsh Anna Słocka tone bounded to behavior → Task 4. ✅
- Auto permanent ban at 5 strikes; banned excluded from the queue → Task 1 (ban flag) + Task 5 (engine) + Task 6 (orderer) + Task 7 (env union). ✅
- 6th offense → collaborator-removal recommendation, human-only, exact `gh api` command → Task 4 + Task 5. ✅
- `BANNED_LOGINS` env, analogous to `PAUSED_LOGINS`, distinct permanent message → Task 7 + Task 4 (`banComment`). ✅
- Visible verdict always (rejected issues get a comment + `triage:rejected` label) → Task 7 (`postRejection`). ✅

Out of scope (spec §187–191), correctly NOT implemented here: Jam polling, ML dedup, auto collaborator/account removal, `Task breakdown` table, and the Wiki feedback loop (that is Phase 3).

Placeholder scan: no TBD/TODO; every code and test step carries full content. ✅

Type consistency: `evaluatePolicy` return shape `{ blocked, flags, comment, recordedStrike, banned }` is produced in Task 5 and consumed in Task 7 identically. `addStrike` returns `{ count, banned }` (Task 1) and is destructured as such in Task 5. `issue` shape matches Phase 1 `issueFromJob` output. `claimNextPlanned`'s new `bannedLogins` default `[]` keeps Phase 1 callers valid. ✅

One open confirmation for pre-flight: the pressure-blocking heuristic (see Global Constraints "DECYZJA DO POTWIERDZENIA"). Everything else follows the spec directly.
