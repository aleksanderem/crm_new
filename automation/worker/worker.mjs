// Worker daemon — polls SQLite queue, runs run-claude.sh for each job
import Database from "better-sqlite3";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ensureSchema } from "./schema.mjs";
import { claimNextPlanned } from "./triage/claim.mjs";
import { nextUntriagedJob, triageJob, issueFromJob } from "./triage/runner.mjs";
import { evaluateIssue } from "./triage/evaluate.mjs";
import { buildPlanDigest, fetchPlanRecords } from "./triage/plan.mjs";
import { createTriageRecord } from "./triage/base-writer.mjs";
import { postVerdict, postRejection } from "./triage/github-writer.mjs";
import { ensureStrikeSchema, listBannedLogins } from "./policy/strikes.mjs";
import { relatedLoginsOf } from "./policy/detect.mjs";
import { recentIssuesByLogins } from "./policy/history.mjs";
import { evaluatePolicyPre, pressureOverride } from "./policy/engine.mjs";

const DB_PATH = process.env.DB_PATH || "/home/claude-bot/worker/queue.db";
const RUN_SCRIPT = "/home/claude-bot/worker/run-claude.sh";
const LOG_DIR = "/home/claude-bot/logs";
const POLL_INTERVAL_MS = 3000;
const JOB_TIMEOUT_MS = 60 * 60 * 1000; // 60 min hard cap

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

// Logins whose jobs are hard-paused (never claimed, regardless of triage status).
// Configured via env (comma-separated). Empty by default.
const PAUSED_LOGINS = (process.env.PAUSED_LOGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Statically-seeded permanent bans (comma-separated). Unioned each loop with
// the ledger's auto-banned logins. Same shape as PAUSED_LOGINS.
const BANNED_LOGINS = (process.env.BANNED_LOGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

fs.mkdirSync(LOG_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
ensureSchema(db);
ensureStrikeSchema(db);

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

// Execute a subprocess synchronously; throws if it exits non-zero.
function exec(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${cmd} failed (${r.status}): ${(r.stderr || "").slice(0, 500)}`);
  return { stdout: r.stdout || "" };
}

// Triage classifier LLM: reuse run-claude.sh in a one-shot, headless mode.
// The script already knows how to invoke Claude; we pass the prompt via env
// as TRIAGE_PROMPT and read its stdout. Uses the same RUN_SCRIPT the worker
// runs. run-claude.sh handles TRIAGE_MODE=1 by running: claude -p "$TRIAGE_PROMPT" --output-format text
// which is the same `claude` binary/HOME the normal path uses, in print mode.
function invokeLLM(prompt) {
  const r = spawnSync("/bin/bash", [RUN_SCRIPT], {
    encoding: "utf8", maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, TRIAGE_MODE: "1", TRIAGE_PROMPT: prompt },
  });
  if (r.status !== 0) {
    throw new Error(`triage LLM failed (exit ${r.status}): ${(r.stderr || "").slice(0, 500)}`);
  }
  return r.stdout || "";
}

// Plan digest cache — refreshed at most once per TTL to avoid hammering Base
// on every loop iteration (typical loop cadence: 3 s).
let planCache = { digest: "", at: 0 };
function getPlanDigest() {
  const TTL = 5 * 60 * 1000;
  if (Date.now() - planCache.at < TTL && planCache.digest) return planCache.digest;
  try {
    planCache = { digest: buildPlanDigest(fetchPlanRecords({ exec })), at: Date.now() };
  } catch (e) { jlog({ level: "warn", msg: "plan-fetch-failed", err: String(e) }); }
  return planCache.digest;
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
    // 1) triage: evaluate one untriaged job if available (triage has priority)
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
        // Don't spin on a broken job: mark as backlog so it can still be claimed later
        db.prepare("UPDATE jobs SET triage_status='backlog', triage_rationale=? WHERE id=?")
          .run("Triage nieudany: " + String(e).slice(0, 300), untriaged.id);
        jlog({ level: "error", msg: "triage-failed", id: untriaged.id, err: String(e) });
      }
      continue; // triage takes priority — loop back before claiming
    }

    // 2) claim next planned job (priority-ordered, excludes paused + throttled)
    const job = claimNextPlanned(db, {
      throttledLogins: THROTTLED_LOGINS,
      pausedLogins: PAUSED_LOGINS,
      bannedLogins: [...BANNED_LOGINS, ...listBannedLogins(db)],
      throttleIntervalMs: THROTTLE_INTERVAL_MS,
      now: Date.now,
    });
    if (!job) { await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS)); continue; }
    try { await runJob(job); }
    catch (e) { finalizeJob(job.id, "failed", JSON.stringify({ error: String(e) })); jlog({ level: "error", msg: "exception", id: job.id, err: String(e) }); }
  }
  jlog({ level: "info", msg: "shutdown" });
}

loop();
