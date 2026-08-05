# GitHub/Jam Triage — Phase 2 (Policy / Anti-Abuse) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an anti-abuse policy layer to the triage worker: a SQLite strike ledger, multi-account duplicate detection, a merit-independent pressure rejection, escalating public strike comments, automatic permanent ban at 5 strikes, and a human-only collaborator-removal recommendation at the 6th offense.

**Architecture:** A new pure-logic module tree under `automation/worker/policy/` (strike ledger, detectors, message templates, orchestrating engine). Multi-account duplicates and already-banned logins are blocked by a PRE-gate that runs before the Phase 1 plan evaluator (pure abuse, no LLM call needed). Pressure is handled AFTER the merit verdict: a pressure-laden issue that does NOT fit the plan is rejected with a stern comment, while a fitting issue is accepted regardless of tone — so pressure is never a decision factor. The queue orderer (`claimNextPlanned`) additionally excludes banned logins. Bans persist in the ledger (`banned_at`) and are unioned each loop with a static `BANNED_LOGINS` env seed — the same shape as the existing `PAUSED_LOGINS` mechanism.

**Tech Stack:** Node ESM daemon, `better-sqlite3`, built-in `node:test` runner, `gh` CLI via the worker's injected `exec` helper. Zero new npm dependencies.

## Global Constraints

- Zero new npm dependencies. Tests use the built-in `node:test` runner; run with `npm test` (which runs `node --test`) from `automation/worker/`.
- The strike ledger lives in the SAME SQLite database as the jobs queue (`queue.db`); `ensureStrikeSchema(db)` is called on that same `db` handle in `worker.mjs`. The webhook does NOT call it (the webhook does no policy work).
- Schema changes are additive-only, mirroring `schema.mjs` (never drop/alter existing columns).
- `STRIKE_BAN_THRESHOLD = 5`. The 5th strike bans; a strike counted at or beyond 6 emits the collaborator-removal recommendation. Strikes are accrued ONLY by multi-account duplicates (spec §140). Pressure does NOT increment the strike counter.
- `SIMILARITY_THRESHOLD = 0.8` (Jaccard over normalized ≥3-char tokens) for multi-account duplicate detection.
- **Pressure is NEVER a decision factor.** Whether an issue fits the plan and its priority are decided purely on merit by the Phase 1 evaluator (which derives priority from the matched package, not the issue's tone). Pressure only changes how a NON-fitting issue is answered.
- Pressure handling (per the user's ruling): pressure phrase present AND the issue does NOT fit the plan → REJECT (`triage_status='rejected'`) with a stern, reproachful comment that warns this violates repeatedly-established rules. Pressure phrase present AND the issue DOES fit → accept normally, pressure ignored entirely. No pressure phrase AND non-fit → ordinary polite backlog. This is why pressure is evaluated AFTER the merit verdict, not as a pre-gate.
- The pressure comment is stern/reproachful for ALL logins (not only `HARSH_LOGINS`); `HARSH_LOGINS` (`aslocka`, `aslocka2026`) get an additional harsher clause. HARD BOUNDARY: harsh copy targets the behavior/violation (junk report, gaming, pressure-as-argument), never the person — no insults, no harassment. Reviewers must reject any template that attacks the individual.
- Gate order is fixed: (1) PRE-gate = multi-account duplicate, then already-banned (multi-account first so an already-banned repeat offender still accrues the 6th strike + recommendation); (2) plan evaluation (LLM); (3) pressure override on the verdict. The PRE-gate runs before any LLM call.
- Banned logins are the UNION of the static `BANNED_LOGINS` env list (comma-separated, same parsing as `PAUSED_LOGINS`) and ledger rows where `banned_at IS NOT NULL`. The env var is for manual/seed bans; runtime auto-bans persist only in the ledger.
- The agent NEVER auto-removes a collaborator or a GitHub account. The 6th-offense output is a printed recommendation + the exact `gh api -X DELETE` command only; a human runs it.
- A blocked/rejected verdict sets `triage_status='rejected'`. Because Phase 1's `claimNextPlanned` only selects `triage_status IN ('triaged','backlog')`, rejected jobs are already unclaimable; the banned-login exclusion in the orderer is defense-in-depth and parity with `PAUSED_LOGINS`.
- Every blocked/rejected issue still gets a visible GitHub comment + a `triage:rejected` label (Phase 1 principle: the reporter always sees the verdict).

---

## File Structure

- `automation/worker/policy/strikes.mjs` — strike ledger: schema, read/increment/ban, banned-login listing. (Task 1)
- `automation/worker/policy/detect.mjs` — pure detectors: pressure presence, token similarity, related-login map, multi-account duplicate, harsh-login predicate. (Task 2)
- `automation/worker/policy/history.mjs` — DB read: recent issues by a set of logins, for duplicate comparison. (Task 3)
- `automation/worker/policy/tone.mjs` — Polish comment templates (pressure/strike/ban/recommendation). (Task 4)
- `automation/worker/policy/engine.mjs` — `evaluatePolicyPre` (multi-account + banned) and `pressureOverride` (post-verdict). (Task 5)
- `automation/worker/triage/evaluate.mjs` — MODIFY: prompt line making pressure explicitly irrelevant to fit/priority. (Task 5)
- `automation/worker/triage/claim.mjs` — MODIFY: add `bannedLogins` exclusion to `claimNextPlanned`. (Task 6)
- `automation/worker/triage/github-writer.mjs` — MODIFY: add `postRejection`. (Task 7)
- `automation/worker/triage/runner.mjs` — MODIFY: export `issueFromJob`; add pressure short-circuit to `triageJob`. (Task 7)
- `automation/worker/worker.mjs` — MODIFY: wire pre-gate + pressure + ban union into the loop. (Task 7)
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

### Task 2: Detectors (pressure presence, similarity, multi-account)

**Files:**
- Create: `automation/worker/policy/detect.mjs`
- Test: `automation/worker/policy/detect.test.mjs`

**Interfaces:**
- Consumes: an `issue` object of the Phase 1 shape from `issueFromJob`: `{ number, repo, title, body, login, url, jamLink }`.
- Produces:
  - `PRESSURE_PHRASES: string[]`, `SIMILARITY_THRESHOLD = 0.8`
  - `RELATED_LOGINS: Record<string,string[]>`, `relatedLoginsOf(login): string[]`
  - `HARSH_LOGINS: Set<string>`, `isHarshLogin(login): boolean`
  - `normalizeTokens(text): string[]`
  - `similarity(a, b): number` (0..1 Jaccard)
  - `detectPressure(issue): { hit: boolean, phrase: string|null }` — pure presence check (a pressure phrase appears in title/body). Deliberately does NOT weigh substance: whether pressure blocks is decided later, from the merit verdict, NOT here.
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

test("detectPressure fires when a pressure phrase is present", () => {
  assert.equal(detectPressure({ title: "PILNE", body: "zrób to teraz!!!" }).hit, true);
  assert.equal(detectPressure({ title: "Pilne: kalendarz gubi terminy", body: "Przy zmianie strefy znikają wizyty, odtworzenie: ..." }).hit, true);
});

test("detectPressure does not fire without a pressure phrase", () => {
  assert.equal(detectPressure({ title: "Literówka w nagłówku", body: "Drobna literówka na stronie ustawień." }).hit, false);
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

// Pure presence check. Whether pressure BLOCKS is decided later from the merit
// verdict (a fitting task passes even if worded urgently); this only reports
// that a pressure phrase is present.
export function detectPressure(issue) {
  const text = `${issue.title || ""}\n${issue.body || ""}`.toLowerCase();
  const phrase = PRESSURE_PHRASES.find((p) => text.includes(p));
  return { hit: !!phrase, phrase: phrase || null };
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
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add automation/worker/policy/detect.mjs automation/worker/policy/detect.test.mjs
git commit -m "feat(triage/policy): pressure-presence + multi-account duplicate detectors"
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
  - `pressureComment({ login }): string` — stern/reproachful for every login; warns that "presja nie jest argumentem" is a repeatedly-established rule and that ignoring it is a violation. `HARSH_LOGINS` get an extra harsher clause.
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

test("pressureComment is stern, rejects, and warns about the repeatedly-established rule", () => {
  const c = pressureComment({ login: "randomdev" });
  assert.match(c, /Odrzucone/);
  assert.match(c, /[Pp]resja/);
  // warns this rule has been established repeatedly / it is a violation
  assert.match(c, /wielokrotnie|nie po raz pierwszy|ustaleń|zasad/);
});

test("a harsh login gets an even harsher pressure comment than a neutral one", () => {
  const harsh = pressureComment({ login: "aslocka" });
  const neutral = pressureComment({ login: "randomdev" });
  assert.notEqual(harsh, neutral);
  assert.ok(harsh.length >= neutral.length);
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
// Pressure is rejected sternly for EVERYONE and always references that this is
// a repeatedly-established rule; harsh logins get an extra clause on top.
export function pressureComment({ login }) {
  const base =
    "⛔ **Odrzucone.** Presja nie jest argumentem — i nie mówimy tego po raz pierwszy. " +
    "To zasada ustalana wielokrotnie: priorytet wynika z planu, nie z tonu ani ponaglania. " +
    "To zgłoszenie nie realizuje żadnego zadania z planu, więc samym naciskiem nic nie wskórasz. " +
    "Opisz konkretny problem merytorycznie (co, gdzie, jak odtworzyć), a zostanie ocenione normalnie.";
  if (isHarshLogin(login)) {
    return base +
      "\n\nTo kolejne naruszenie tych samych, jasno zakomunikowanych ustaleń. " +
      "Ponaglanie zamiast treści to marnowanie kolejki — przestań tak zgłaszać.";
  }
  return base;
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

### Task 5: Policy engine (pre-gate + pressure override) and evaluator hardening

**Files:**
- Create: `automation/worker/policy/engine.mjs`
- Modify: `automation/worker/triage/evaluate.mjs` (one prompt line)
- Test: `automation/worker/policy/engine.test.mjs`

**Interfaces:**
- Consumes: `detectPressure`, `detectMultiAccount` (`./detect.mjs`); `addStrike`, `isBanned`, `STRIKE_BAN_THRESHOLD` (`./strikes.mjs`); `pressureComment`, `strikeComment`, `banComment`, `collaboratorRemovalRecommendation` (`./tone.mjs`).
- Produces:
  - `evaluatePolicyPre(db, issue, { priorIssues = [], now }): { blocked: boolean, flags: string[], comment: string|null, recordedStrike: boolean, banned: boolean }` — PRE-gate for merit-independent abuse (multi-account duplicate, then already-banned). Runs before the LLM. Order fixed: multi-account is checked BEFORE the banned short-circuit so an already-banned repeat offender still accrues the 6th strike + recommendation. `now` is a function returning ms (e.g. `Date.now`).
  - `pressureOverride(verdict, issue): { reject: boolean, comment: string|null }` — post-verdict pure function. `reject` is true iff `detectPressure(issue).hit && verdict.fits === false`. A fitting verdict never rejects (pressure ignored). `comment` is the stern `pressureComment` when rejecting.

- [ ] **Step 1: Write the failing test**

```js
// automation/worker/policy/engine.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { ensureStrikeSchema, isBanned, getStrike } from "./strikes.mjs";
import { evaluatePolicyPre, pressureOverride } from "./engine.mjs";

function db0() {
  const db = new Database(":memory:");
  ensureStrikeSchema(db);
  return db;
}
const clock = () => 1000;
const dup = { login: "aslocka", repo: "aleksanderem/crm_new", url: "u", title: "Dup", body: "identyczna treść zgłoszenia do porównania" };
const priorDup = [{ login: "aslocka2026", title: "Dup", body: "identyczna treść zgłoszenia do porównania" }];

test("evaluatePolicyPre passes a clean issue (no abuse signal)", () => {
  const db = db0();
  const issue = { login: "dev", repo: "o/r", url: "u", title: "Realne zadanie", body: "opis konkretnego zadania z planu, sporo szczegółów technicznych." };
  const r = evaluatePolicyPre(db, issue, { priorIssues: [], now: clock });
  assert.equal(r.blocked, false);
  assert.equal(r.recordedStrike, false);
});

test("evaluatePolicyPre strikes and blocks a multi-account duplicate", () => {
  const db = db0();
  const r = evaluatePolicyPre(db, dup, { priorIssues: priorDup, now: clock });
  assert.equal(r.blocked, true);
  assert.deepEqual(r.flags, ["multi-account"]);
  assert.equal(r.recordedStrike, true);
  assert.equal(getStrike(db, "aslocka").count, 1);
  assert.match(r.comment, /Strike 1\/5/);
});

test("evaluatePolicyPre bans on the fifth duplicate and includes the ban notice", () => {
  const db = db0();
  let r;
  for (let i = 0; i < 5; i++) r = evaluatePolicyPre(db, dup, { priorIssues: priorDup, now: clock });
  assert.equal(r.banned, true);
  assert.equal(isBanned(db, "aslocka"), true);
  assert.match(r.comment, /Permanentny ban/);
});

test("evaluatePolicyPre appends the collaborator-removal recommendation on the sixth offense", () => {
  const db = db0();
  let r;
  for (let i = 0; i < 6; i++) r = evaluatePolicyPre(db, dup, { priorIssues: priorDup, now: clock });
  assert.match(r.comment, /gh api -X DELETE repos\/aleksanderem\/crm_new\/collaborators\/aslocka/);
});

test("evaluatePolicyPre blocks an already-banned user without a new strike", () => {
  const db = db0();
  for (let i = 0; i < 5; i++) evaluatePolicyPre(db, dup, { priorIssues: priorDup, now: clock });
  const before = getStrike(db, "aslocka").count;
  const clean = { login: "aslocka", repo: "o/r", url: "u", title: "Coś nowego", body: "całkiem inny, merytoryczny opis problemu z detalami" };
  const r = evaluatePolicyPre(db, clean, { priorIssues: [], now: clock });
  assert.equal(r.blocked, true);
  assert.deepEqual(r.flags, ["banned"]);
  assert.equal(r.recordedStrike, false);
  assert.equal(getStrike(db, "aslocka").count, before);
});

test("pressureOverride rejects a non-fitting issue that carries pressure", () => {
  const verdict = { fits: false };
  const issue = { login: "dev", title: "PILNE", body: "zrób to teraz!!!" };
  const r = pressureOverride(verdict, issue);
  assert.equal(r.reject, true);
  assert.match(r.comment, /Presja|presja/);
});

test("pressureOverride never rejects a FITTING issue, even worded urgently", () => {
  const verdict = { fits: true, package: "PK1", priority: "P0" };
  const issue = { login: "dev", title: "PILNE: realny bug", body: "natychmiast, ale to konkretne zadanie z planu" };
  assert.deepEqual(pressureOverride(verdict, issue), { reject: false, comment: null });
});

test("pressureOverride does not reject a non-fitting issue WITHOUT pressure", () => {
  const verdict = { fits: false };
  const issue = { login: "dev", title: "Drobiazg", body: "kosmetyczna zmiana koloru" };
  assert.deepEqual(pressureOverride(verdict, issue), { reject: false, comment: null });
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

// PRE-gate: merit-independent abuse, checked before the LLM evaluator.
// Order is fixed — multi-account first so an already-banned repeat offender
// still accrues the 6th strike + collaborator-removal recommendation.
export function evaluatePolicyPre(db, issue, { priorIssues = [], now }) {
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

  return { blocked: false, flags: [], comment: null, recordedStrike: false, banned: false };
}

// Post-verdict override: pressure rejects ONLY a non-fitting issue. A fitting
// verdict is never touched, so pressure never influences the fit/priority
// decision — it only makes a junk (non-fit) submission a stern rejection
// instead of an ordinary polite backlog.
export function pressureOverride(verdict, issue) {
  if (verdict.fits === false && detectPressure(issue).hit) {
    return { reject: true, comment: pressureComment({ login: issue.login || "" }) };
  }
  return { reject: false, comment: null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd automation/worker && node --test policy/engine.test.mjs`
Expected: PASS (8 tests).

- [ ] **Step 5: Harden the evaluator prompt so pressure cannot inflate priority**

In `automation/worker/triage/evaluate.mjs`, inside `buildTriagePrompt`, the rules line currently reads:

```js
Zasady: jeśli zgłoszenie nie realizuje żadnego pakietu, ustaw fits=false i package/priority/order=null. Nie zgaduj — przy niepewności obniż confidence. Zwróć wyłącznie JSON, bez dodatkowego tekstu.
```

Change it to (add the pressure-neutrality sentence):

```js
Zasady: jeśli zgłoszenie nie realizuje żadnego pakietu, ustaw fits=false i package/priority/order=null. Priorytet dziedzicz WYŁĄCZNIE z dopasowanego pakietu — ignoruj presję, ponaglenia i ton zgłoszenia; nacisk nie podnosi priorytetu ani nie zmienia dopasowania. Nie zgaduj — przy niepewności obniż confidence. Zwróć wyłącznie JSON, bez dodatkowego tekstu.
```

Run the Phase 1 evaluator tests to confirm no regression:
Run: `cd automation/worker && node --test triage/evaluate.test.mjs`
Expected: PASS (unchanged).

- [ ] **Step 6: Commit**

```bash
git add automation/worker/policy/engine.mjs automation/worker/policy/engine.test.mjs automation/worker/triage/evaluate.mjs
git commit -m "feat(triage/policy): pre-gate engine + pressure override; harden evaluator prompt"
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

### Task 7: Wire the pre-gate + pressure override into the worker loop

**Files:**
- Modify: `automation/worker/triage/github-writer.mjs` (add `postRejection`)
- Modify: `automation/worker/triage/runner.mjs` (export `issueFromJob`; add pressure short-circuit to `triageJob`)
- Modify: `automation/worker/worker.mjs` (pre-gate + pressure + ban union + `BANNED_LOGINS` env + `ensureStrikeSchema`)
- Test: `automation/worker/triage/github-writer-reject.test.mjs` (new), `automation/worker/triage/runner-pressure.test.mjs` (new), `automation/worker/policy/integration.test.mjs` (new)
- Docs: `automation/worker/README.md` (deploy notes — create if absent)

**Interfaces:**
- Consumes: `evaluatePolicyPre`, `pressureOverride` (`./policy/engine.mjs`), `listBannedLogins`, `ensureStrikeSchema` (`./policy/strikes.mjs`), `relatedLoginsOf` (`./policy/detect.mjs`), `recentIssuesByLogins` (`./policy/history.mjs`), `issueFromJob`, `nextUntriagedJob`, `triageJob` (`./triage/runner.mjs`), `claimNextPlanned` (`./triage/claim.mjs`), and the existing `exec`, `jlog`, `getPlanDigest`, `invokeLLM`, `PAUSED_LOGINS`, `THROTTLED_LOGINS`, `THROTTLE_INTERVAL_MS`.
- Produces:
  - `postRejection(issue, body, { exec }): void` (gh comment + `--add-label triage:rejected`).
  - `issueFromJob` exported.
  - `triageJob(db, job, deps)` gains two OPTIONAL deps: `deps.pressureReject(verdict): { reject, comment }` and `deps.writeRejection(issue, comment)`. When `pressureReject` returns `reject:true`, `triageJob` sets `triage_status='rejected'`, skips the Base write, calls `writeRejection` instead of `writeGithub`, and returns `{ verdict, rejected: true }`. When absent or `reject:false`, behavior is exactly Phase 1.

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
// the policy gate blocks an issue (multi-account / banned / pressure) so the
// reporter still sees a verdict.
export function postRejection(issue, body, { exec }) {
  const repo = issue.repo;
  exec("gh", ["issue", "comment", String(issue.number), "--repo", repo, "--body", body]);
  exec("gh", ["issue", "edit", String(issue.number), "--repo", repo, "--add-label", "triage:rejected"]);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd automation/worker && node --test triage/github-writer-reject.test.mjs`
Expected: PASS (1 test).

- [ ] **Step 5: Write the failing test for the `triageJob` pressure short-circuit**

```js
// automation/worker/triage/runner-pressure.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { ensureSchema } from "../schema.mjs";
import { triageJob } from "./runner.mjs";

function seed(db) {
  db.prepare(
    `INSERT INTO jobs (id, issue_number, repo, event_type, trigger_login, payload_json, status, created_at)
     VALUES (1, 1, 'o/r', 'issues.opened', 'dev', ?, 'pending', 1)`,
  ).run(JSON.stringify({ title: "PILNE", body: "zrób to teraz" }));
  return db.prepare("SELECT * FROM jobs WHERE id = 1").get();
}

test("triageJob rejects on pressure: no Base write, writeRejection called, status rejected", async () => {
  const db = new Database(":memory:");
  ensureSchema(db);
  const job = seed(db);
  const verdict = { fits: false, package: null, priority: null, order: null, confidence: 0.9, rationale: "poza planem" };
  const calls = { base: 0, github: 0, rejection: null };
  await triageJob(db, job, {
    planDigest: "x",
    evaluate: async () => verdict,
    writeBase: () => { calls.base++; return "recX"; },
    writeGithub: () => { calls.github++; },
    writeRejection: (_issue, comment) => { calls.rejection = comment; },
    pressureReject: () => ({ reject: true, comment: "⛔ Presja nie jest argumentem." }),
    now: () => 1,
  });
  assert.equal(calls.base, 0);
  assert.equal(calls.github, 0);
  assert.equal(calls.rejection, "⛔ Presja nie jest argumentem.");
  assert.equal(db.prepare("SELECT triage_status FROM jobs WHERE id = 1").get().triage_status, "rejected");
});

test("triageJob without pressureReject behaves exactly like Phase 1 (Base + github)", async () => {
  const db = new Database(":memory:");
  ensureSchema(db);
  const job = seed(db);
  const verdict = { fits: true, package: "PK1", priority: "P0", order: 1, module: "DevOps", confidence: 0.9, rationale: "ok" };
  const calls = { base: 0, github: 0 };
  await triageJob(db, job, {
    planDigest: "x",
    evaluate: async () => verdict,
    writeBase: () => { calls.base++; return "recX"; },
    writeGithub: () => { calls.github++; },
    now: () => 1,
  });
  assert.equal(calls.base, 1);
  assert.equal(calls.github, 1);
  assert.equal(db.prepare("SELECT triage_status FROM jobs WHERE id = 1").get().triage_status, "triaged");
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd automation/worker && node --test triage/runner-pressure.test.mjs`
Expected: FAIL — the first test still writes Base / sets `triaged` (short-circuit not implemented).

- [ ] **Step 7: Add the pressure short-circuit to `triageJob` and export `issueFromJob`**

In `automation/worker/triage/runner.mjs`:

7a. Change the declaration `function issueFromJob(job) {` to `export function issueFromJob(job) {`.

7b. In `triageJob`, immediately AFTER the `const verdict = await deps.evaluate(issue, deps.planDigest);` line, insert the short-circuit:

```js
  const pr = deps.pressureReject ? deps.pressureReject(verdict) : { reject: false };
  if (pr.reject) {
    db.prepare(
      `UPDATE jobs SET triage_status = 'rejected', triage_package = NULL, triage_priority = NULL,
         triage_order = NULL, triage_confidence = ?, triage_rationale = ? WHERE id = ?`,
    ).run(verdict.confidence, String(pr.comment).slice(0, 1000), job.id);
    try { deps.writeRejection(issue, pr.comment); }
    catch (e) { deps.log?.({ level: "warn", msg: "triage-rejection-write-failed", id: job.id, err: String(e).slice(0, 300) }); }
    return { verdict, rejected: true };
  }
```

(The existing Base-write / persist / GitHub-write block stays unchanged after this insert.)

- [ ] **Step 8: Run the runner tests**

Run: `cd automation/worker && node --test triage/runner-pressure.test.mjs`
Expected: PASS (2 tests).

Run the Phase 1 runner tests to confirm no regression:
Run: `cd automation/worker && node --test triage/runner.test.mjs`
Expected: PASS (unchanged).

- [ ] **Step 9: Write the policy integration test**

```js
// automation/worker/policy/integration.test.mjs
// Exercises the worker's decision path (pre-gate → rejected → unclaimable)
// without importing worker.mjs (which starts the daemon on import).
import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { ensureSchema } from "../schema.mjs";
import { ensureStrikeSchema, listBannedLogins } from "./strikes.mjs";
import { relatedLoginsOf } from "./detect.mjs";
import { recentIssuesByLogins } from "./history.mjs";
import { evaluatePolicyPre } from "./engine.mjs";
import { issueFromJob } from "../triage/runner.mjs";
import { claimNextPlanned } from "../triage/claim.mjs";

function insertJob(db, { id, login, title, body, triage = "untriaged" }) {
  db.prepare(
    `INSERT INTO jobs (id, issue_number, repo, event_type, trigger_login, payload_json, status, created_at, triage_status, triage_priority, triage_order)
     VALUES (?, ?, 'aleksanderem/crm_new', 'issues.opened', ?, ?, 'pending', ?, ?, 'P0', 1)`,
  ).run(id, id, login, JSON.stringify({ title, body }), id, triage);
}

test("a duplicate from a related account is pre-gate blocked, marked rejected, and never claimed", () => {
  const db = new Database(":memory:");
  ensureSchema(db);
  ensureStrikeSchema(db);

  insertJob(db, { id: 1, login: "aslocka2026", title: "Kalendarz gubi terminy", body: "przy zmianie strefy czasowej znikają wizyty", triage: "triaged" });
  insertJob(db, { id: 2, login: "aslocka", title: "Kalendarz gubi terminy", body: "przy zmianie strefy czasowej znikają wizyty" });

  const job = db.prepare("SELECT * FROM jobs WHERE id = 2").get();
  const issue = issueFromJob(job);
  const pre = evaluatePolicyPre(db, issue, {
    priorIssues: recentIssuesByLogins(db, relatedLoginsOf(issue.login), { excludeId: job.id }),
    now: () => 5000,
  });
  assert.equal(pre.blocked, true);
  assert.deepEqual(pre.flags, ["multi-account"]);

  db.prepare("UPDATE jobs SET triage_status='rejected' WHERE id = ?").run(job.id);

  const claimed = claimNextPlanned(db, {
    throttledLogins: [], pausedLogins: [],
    bannedLogins: listBannedLogins(db),
    throttleIntervalMs: 3600000, now: () => 100000,
  });
  assert.notEqual(claimed?.id, 2);
});
```

- [ ] **Step 10: Run it to verify it passes**

Run: `cd automation/worker && node --test policy/integration.test.mjs`
Expected: PASS (1 test). (Uses only existing exports plus `issueFromJob`, exported in Step 7a.)

- [ ] **Step 11: Wire the gate into `worker.mjs`**

11a. Update the runner + github-writer imports and add the policy imports. In `automation/worker/worker.mjs`, change:

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
import { evaluatePolicyPre, pressureOverride } from "./policy/engine.mjs";
```

11b. Ensure the strike schema. Change:
```js
ensureSchema(db);
```
to:
```js
ensureSchema(db);
ensureStrikeSchema(db);
```

11c. Add the `BANNED_LOGINS` env seed. After the `PAUSED_LOGINS` block (its `.split(",")...filter(Boolean)`), add:

```js
// Statically-seeded permanent bans (comma-separated). Unioned each loop with
// the ledger's auto-banned logins. Same shape as PAUSED_LOGINS.
const BANNED_LOGINS = (process.env.BANNED_LOGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
```

11d. Insert the pre-gate + pressure wiring in the untriaged branch. Change:

```js
    const untriaged = nextUntriagedJob(db);
    if (untriaged) {
      try {
        await triageJob(db, untriaged, {
          planDigest: getPlanDigest(),
          evaluate: (issue, digest) => evaluateIssue(issue, digest, { invokeLLM }),
          writeBase: (verdict, issue) => createTriageRecord(verdict, issue, { exec }),
          writeGithub: (issue, verdict) => postVerdict(issue, verdict, { exec }),
          now: Date.now,
          log: (o) => jlog(o),
        });
        jlog({ level: "info", msg: "triaged", id: untriaged.id, issue: untriaged.issue_number });
      } catch (e) {
```
to:
```js
    const untriaged = nextUntriagedJob(db);
    if (untriaged) {
      // PRE-gate: block multi-account duplicates + banned logins before the LLM.
      const gateIssue = issueFromJob(untriaged);
      const pre = evaluatePolicyPre(db, gateIssue, {
        priorIssues: recentIssuesByLogins(db, relatedLoginsOf(gateIssue.login), { excludeId: untriaged.id }),
        now: Date.now,
      });
      if (pre.blocked) {
        try { postRejection(gateIssue, pre.comment, { exec }); }
        catch (e) { jlog({ level: "warn", msg: "policy-comment-failed", id: untriaged.id, err: String(e) }); }
        db.prepare("UPDATE jobs SET triage_status='rejected', triage_rationale=? WHERE id=?")
          .run(String(pre.comment).slice(0, 1000), untriaged.id);
        jlog({ level: "info", msg: "policy-blocked", id: untriaged.id, flags: pre.flags, banned: pre.banned });
        continue;
      }
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

(The `catch (e) { ... }` block and the `continue;` that follow are unchanged.)

11e. Union ledger bans into the claim call. Change:

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

- [ ] **Step 12: Verify the whole worker package**

Run: `cd automation/worker && node --check worker.mjs && node --check triage/runner.mjs && node --check triage/github-writer.mjs && node --check triage/claim.mjs && node --check triage/evaluate.mjs && echo SYNTAX_OK`
Expected: `SYNTAX_OK`.

Run the full suite:
Run: `cd automation/worker && npm test`
Expected: all tests pass (Phase 1 suite + the new policy suite), 0 failures.

- [ ] **Step 13: Deploy notes**

Create `automation/worker/README.md` if it does not exist, or append a section, documenting the Phase 2 operational surface:

```markdown
## Policy / anti-abuse (Phase 2)

- Strike ledger lives in the same `queue.db` (table `strikes`). No migration step — `ensureStrikeSchema(db)` runs at worker startup.
- `BANNED_LOGINS` (env, comma-separated) is the static ban seed. Runtime auto-bans (5 strikes) persist in the `strikes` ledger; the worker unions both each loop. Set on the server the same way as `PAUSED_LOGINS`/`THROTTLED_LOGINS` (systemd unit env / `.env`).
- Pressure is never a decision factor: a fitting issue is accepted even if worded urgently; only a NON-fitting issue that carries pressure is rejected (stern comment). Priority always comes from the matched plan package.
- GitHub labels required in the target repo: `triage:rejected` (in addition to Phase 1's `triage:PK1..PK9` and `triage:backlog`). Missing labels make `gh --add-label` fail, but that path is non-fatal (caught + logged).
- The 6th-offense output is a printed `gh api -X DELETE .../collaborators/<login>` recommendation only. A human runs it. The agent never removes a collaborator or account.
- Deploy is manual: copy `automation/worker/**` (including the new `policy/` dir) to `/home/claude-bot/worker/` as user `claude-bot` (respect RunCloud ownership), then restart `claude-worker` (the webhook is unchanged).
```

- [ ] **Step 14: Commit**

```bash
git add automation/worker/worker.mjs automation/worker/triage/github-writer.mjs \
        automation/worker/triage/runner.mjs \
        automation/worker/triage/github-writer-reject.test.mjs \
        automation/worker/triage/runner-pressure.test.mjs \
        automation/worker/policy/integration.test.mjs \
        automation/worker/README.md
git commit -m "feat(triage): wire policy pre-gate + pressure override into the worker loop"
```

---

## Self-Review

Spec coverage (spec §132–171, Faza 2 §179–181) + the user's pressure ruling:
- Strike ledger (SQLite `strikes`: login/count/reasons/banned_at/updated_at) → Task 1. ✅
- Multi-account gaming (aslocka/aslocka2026, similarity + related-login map) → Task 2 + Task 3 (history) + Task 5 (pre-gate). ✅
- Pressure never a decision factor; blocks only a non-fit, with a stern warning about repeatedly-established rules; fitting-but-urgent passes → Task 2 (presence), Task 4 (stern comment), Task 5 (`pressureOverride` + evaluator prompt hardening), Task 7 (`triageJob` short-circuit). ✅
- Public strike comment with `Strike X/5` + reason; harsh Anna Słocka tone bounded to behavior → Task 4. ✅
- Auto permanent ban at 5 strikes; banned excluded from the queue → Task 1 + Task 5 + Task 6 + Task 7 (env union). ✅
- 6th offense → collaborator-removal recommendation, human-only, exact `gh api` command → Task 4 + Task 5. ✅
- `BANNED_LOGINS` env, analogous to `PAUSED_LOGINS`, distinct permanent message → Task 7 + Task 4 (`banComment`). ✅
- Visible verdict always (rejected issues get a comment + `triage:rejected` label) → Task 7 (`postRejection`). ✅

Out of scope (spec §187–191), correctly NOT implemented: Jam polling, ML dedup, auto collaborator/account removal, `Task breakdown` table, and the Wiki feedback loop (Phase 3).

Placeholder scan: no TBD/TODO; every code and test step carries full content. ✅

Type consistency: `evaluatePolicyPre` return `{ blocked, flags, comment, recordedStrike, banned }` (Task 5) consumed identically in Task 7. `pressureOverride(verdict, issue) → { reject, comment }` (Task 5) consumed by `triageJob`'s `pressureReject` dep (Task 7). `addStrike → { count, banned }` (Task 1) destructured in Task 5. `issue` shape matches Phase 1 `issueFromJob`. `claimNextPlanned`'s new `bannedLogins` defaults `[]`, keeping Phase 1 callers valid. `triageJob`'s new `pressureReject`/`writeRejection` deps are optional, keeping Phase 1 runner tests valid. ✅

Pressure decision is fully resolved by the user's ruling (no open pre-flight items): pressure blocks only a non-fitting issue, is never a factor in the fit/priority decision, and always yields a stern comment warning about repeatedly-established rules.
