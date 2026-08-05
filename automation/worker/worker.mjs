// Worker daemon — polls SQLite queue, runs run-claude.sh for each job
import Database from "better-sqlite3";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = process.env.DB_PATH || "/home/claude-bot/worker/queue.db";
const RUN_SCRIPT = "/home/claude-bot/worker/run-claude.sh";
const LOG_DIR = "/home/claude-bot/logs";
const POLL_INTERVAL_MS = 3000;
const JOB_TIMEOUT_MS = 60 * 60 * 1000; // 30 min hard cap

// Per-user pickup throttle. Issues filed by these GitHub logins are
// processed at most once per THROTTLE_INTERVAL_MS — i.e. after a job
// from a throttled user starts/finishes, the next one from the same
// user stays in `status = 'pending'` until the interval passes.
// Other users are unaffected. Configured via env (comma-separated) so
// the list can be tuned without redeploying the daemon.
const THROTTLED_LOGINS = (process.env.THROTTLED_LOGINS ??
  "aslocka,gabrysiaagleba-pixel")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const THROTTLE_INTERVAL_MS = parseInt(
  process.env.THROTTLE_INTERVAL_MS ?? String(60 * 60 * 1000),
  10,
);

// Full pickup pause. Jobs whose `trigger_login` is on this list are never
// claimed — they stay `pending` (and new webhook events still enqueue), so
// nothing is lost and unpausing is just removing the login from the env and
// restarting the daemon. Unlike THROTTLED_LOGINS this is a hard stop, not a
// rate limit. Configured via env (comma-separated), empty by default.
const PAUSED_LOGINS = (process.env.PAUSED_LOGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

fs.mkdirSync(LOG_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// Picks the oldest pending job whose `trigger_login` is either NOT in the
// throttled list, or is in the list but no other job from that same user
// has started or finished within THROTTLE_INTERVAL_MS. Skipped throttled
// jobs stay pending and are picked once the cooldown has elapsed.
const claimNextStmt = db.prepare(`
  SELECT * FROM jobs
  WHERE status = 'pending'
    AND (
      trigger_login IS NULL
      OR trigger_login NOT IN (${PAUSED_LOGINS.map(() => "?").join(",") || "''"})
    )
    AND (
      trigger_login IS NULL
      OR trigger_login NOT IN (${THROTTLED_LOGINS.map(() => "?").join(",") || "''"})
      OR NOT EXISTS (
        SELECT 1 FROM jobs busy
        WHERE busy.trigger_login = jobs.trigger_login
          AND busy.status IN ('running', 'done', 'failed')
          AND COALESCE(busy.finished_at, busy.started_at, 0) > ?
      )
    )
  ORDER BY created_at ASC
  LIMIT 1
`);
const claimNext = db.transaction(() => {
  const cutoff = Date.now() - THROTTLE_INTERVAL_MS;
  const job = claimNextStmt.get(...PAUSED_LOGINS, ...THROTTLED_LOGINS, cutoff);
  if (!job) return null;
  db.prepare(
    `UPDATE jobs SET status = 'running', started_at = ? WHERE id = ?`
  ).run(Date.now(), job.id);
  return job;
});

function finalizeJob(id, status, result) {
  db.prepare(
    `UPDATE jobs SET status = ?, finished_at = ?, result = ? WHERE id = ?`
  ).run(status, Date.now(), result, id);
}

function jlog(obj) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...obj }) + "\n";
  fs.appendFileSync(path.join(LOG_DIR, "worker.log"), line);
  console.log(line.trim());
}

async function runJob(job) {
  jlog({ level: "info", msg: "start", id: job.id, issue: job.issue_number, repo: job.repo });
  const env = {
    ...process.env,
    JOB_ID: String(job.id),
    ISSUE_NUMBER: String(job.issue_number),
    REPO: job.repo,
    EVENT_TYPE: job.event_type,
    TRIGGER_LOGIN: job.trigger_login || "",
    PAYLOAD_JSON: job.payload_json,
  };
  return await new Promise((resolve) => {
    const child = spawn("/bin/bash", [RUN_SCRIPT], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    const timer = setTimeout(() => {
      jlog({ level: "warn", msg: "timeout-killing", id: job.id });
      child.kill("SIGKILL");
    }, JOB_TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(timer);
      const result = JSON.stringify({ exit: code, stdout: stdout.slice(-4000), stderr: stderr.slice(-4000) });
      finalizeJob(job.id, code === 0 ? "done" : "failed", result);
      jlog({ level: code === 0 ? "info" : "error", msg: "finish", id: job.id, exit: code });
      resolve();
    });
  });
}

let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

async function loop() {
  while (!stopping) {
    const job = claimNext();
    if (!job) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      continue;
    }
    try {
      await runJob(job);
    } catch (e) {
      finalizeJob(job.id, "failed", JSON.stringify({ error: String(e) }));
      jlog({ level: "error", msg: "exception", id: job.id, err: String(e) });
    }
  }
  jlog({ level: "info", msg: "shutdown" });
}

loop();
