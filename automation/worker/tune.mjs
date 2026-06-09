// tune.mjs — auto-tune worker config when same failure kind repeats
// Usage: node tune.mjs <current_error_kind>
// Reads /home/claude-bot/worker/tuning.json, queries last (N-1) failed jobs,
// if all match current kind → bump corresponding tunable.
import Database from "better-sqlite3";
import fs from "node:fs";

const TUNING_PATH = "/home/claude-bot/worker/tuning.json";
const DB_PATH = "/home/claude-bot/worker/queue.db";
const LOG_PATH = "/home/claude-bot/logs/tune.log";

const currentKind = (process.argv[2] || "").trim();
if (!currentKind || currentKind === "ok") process.exit(0);

function jlog(obj) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...obj }) + "\n";
  fs.appendFileSync(LOG_PATH, line);
}

function detectKind(resultStr) {
  if (!resultStr) return "unknown";
  try {
    const r = JSON.parse(resultStr);
    const blob = (r.stdout || "") + "\n" + (r.stderr || "");
    if (/Reached max turns/i.test(blob)) return "max-turns";
    if (r.exit === 124) return "wallclock-timeout";
    if (r.exit !== 0) return `exit-${r.exit}`;
    return "ok";
  } catch {
    return "unknown";
  }
}

const tuning = JSON.parse(fs.readFileSync(TUNING_PATH, "utf8"));
const cfg = tuning.auto_tune;
const N = cfg.consecutive_fails_to_bump;

const db = new Database(DB_PATH, { readonly: true });
const prior = db.prepare(
  "SELECT id, issue_number, status, result FROM jobs WHERE status IN ('failed','done') ORDER BY id DESC LIMIT ?"
).all(N - 1);

if (prior.length < N - 1) {
  jlog({ msg: "not-enough-history", have: prior.length, need: N - 1 });
  process.exit(0);
}

// Combine current (just failed, not yet in DB) + prior
const window = [{ id: "current", kind: currentKind }, ...prior.map((j) => ({ id: j.id, kind: detectKind(j.result) }))];
jlog({ msg: "window", entries: window });

const allSame = window.every((w) => w.kind === currentKind);
if (!allSame) {
  jlog({ msg: "no-pattern", current: currentKind });
  process.exit(0);
}

let bumped = false;
let detail = { kind: currentKind };

if (currentKind === "max-turns") {
  const cur = tuning.max_turns;
  const next = Math.min(cur + cfg.max_turns_step, cfg.max_turns_cap);
  if (next > cur) {
    tuning.max_turns = next;
    bumped = true;
    detail = { ...detail, field: "max_turns", from: cur, to: next };
  } else {
    detail = { ...detail, field: "max_turns", at_cap: cur };
  }
} else if (currentKind === "wallclock-timeout") {
  const cur = tuning.per_attempt_timeout;
  const next = Math.min(cur + cfg.per_attempt_timeout_step, cfg.per_attempt_timeout_cap);
  if (next > cur) {
    tuning.per_attempt_timeout = next;
    bumped = true;
    detail = { ...detail, field: "per_attempt_timeout", from: cur, to: next };
  } else {
    detail = { ...detail, field: "per_attempt_timeout", at_cap: cur };
  }
} else {
  jlog({ msg: "no-tunable", kind: currentKind });
  process.exit(0);
}

if (bumped) {
  tuning.history = tuning.history || [];
  tuning.history.push({
    ts: new Date().toISOString(),
    triggered_by: window.map((w) => w.id),
    ...detail,
  });
  // Cap history length
  if (tuning.history.length > 50) tuning.history = tuning.history.slice(-50);
  fs.writeFileSync(TUNING_PATH, JSON.stringify(tuning, null, 2));
  jlog({ msg: "BUMPED", ...detail });
} else {
  jlog({ msg: "AT-CAP", ...detail });
}
