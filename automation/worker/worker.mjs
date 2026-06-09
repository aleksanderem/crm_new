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

fs.mkdirSync(LOG_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

const claimNext = db.transaction(() => {
  const job = db.prepare(
    `SELECT * FROM jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1`
  ).get();
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
