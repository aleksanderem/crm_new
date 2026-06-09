// GitHub webhook listener for Claude Code worker
// Listens on 127.0.0.1:9090, verifies HMAC, enqueues triggers
// Triggers: @claude mention in issue body / comment, OR label "claude:retry" added
import express from "express";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const PORT = parseInt(process.env.PORT || "9090", 10);
const HOST = process.env.HOST || "127.0.0.1";
const SECRET = process.env.WEBHOOK_SECRET;
const BOT_GH_LOGIN = process.env.BOT_GH_LOGIN;
const RETRY_LABEL = "claude:retry";
const DB_PATH = process.env.DB_PATH || "/home/claude-bot/worker/queue.db";
const LOG_DIR = "/home/claude-bot/logs";
fs.mkdirSync(LOG_DIR, { recursive: true });

if (!SECRET) {
  console.error("FATAL: WEBHOOK_SECRET not set");
  process.exit(1);
}
if (!BOT_GH_LOGIN) {
  console.error("FATAL: BOT_GH_LOGIN not set — webhook would loop on bot's own events");
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
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
`);
const insertJob = db.prepare(`
  INSERT INTO jobs (issue_number, repo, event_type, trigger_login, trigger_comment_id, payload_json, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

function verifySig(rawBody, header) {
  if (!header || !header.startsWith("sha256=")) return false;
  if (!rawBody || rawBody.length === 0) return false;
  const sig = header.slice(7);
  const mac = crypto.createHmac("sha256", SECRET).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(mac, "hex"));
  } catch {
    return false;
  }
}

function logEvent(obj) {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...obj }) + "\n";
  fs.appendFileSync(path.join(LOG_DIR, "webhook.log"), line);
}

const app = express();
app.use(express.json({
  limit: "5mb",
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/github", (req, res) => {
  const sig = req.get("x-hub-signature-256");
  if (!verifySig(req.rawBody, sig)) {
    logEvent({ level: "warn", msg: "bad signature", ip: req.ip });
    return res.status(401).send("invalid signature");
  }
  const event = req.get("x-github-event");
  const payload = req.body;

  let issue, comment, action, isLabelTrigger = false;
  if (event === "issue_comment" && payload.action === "created") {
    issue = payload.issue;
    comment = payload.comment;
    action = "comment";
  } else if (event === "issues" && payload.action === "labeled" && payload.label?.name === RETRY_LABEL) {
    issue = payload.issue;
    action = "issue.retry-label";
    isLabelTrigger = true;
  } else if (event === "issues" && (payload.action === "opened" || payload.action === "edited" || payload.action === "reopened")) {
    issue = payload.issue;
    action = `issue.${payload.action}`;
  } else {
    return res.status(200).send("ignored event");
  }

  if (!issue || issue.pull_request) {
    return res.status(200).send("ignored (PR or no issue)");
  }

  const triggerBody = comment ? comment.body : issue.body;
  const triggerLogin = isLabelTrigger
    ? payload.sender?.login
    : (comment ? comment.user.login : issue.user.login);

  // Skip our own bot comments (but never skip the bot adding labels — labels can't loop)
  if (!isLabelTrigger && triggerLogin === BOT_GH_LOGIN && comment) {
    logEvent({ level: "info", msg: "skip own comment", issue: issue.number });
    return res.status(200).send("skip own");
  }

  // For non-label triggers, require @claude mention
  if (!isLabelTrigger && (!triggerBody || !/@claude\b/i.test(triggerBody))) {
    return res.status(200).send("no @claude mention");
  }

  const repo = payload.repository.full_name;
  const info = insertJob.run(
    issue.number,
    repo,
    `${event}.${payload.action}`,
    triggerLogin,
    comment ? comment.id : null,
    JSON.stringify({
      title: issue.title,
      issue_url: issue.html_url,
      body: issue.body,
      comment_body: comment ? comment.body : null,
      label_trigger: isLabelTrigger ? RETRY_LABEL : null,
    }),
    Date.now(),
  );

  logEvent({ level: "info", msg: "queued", id: info.lastInsertRowid, issue: issue.number, repo, action, by: triggerLogin });
  res.status(200).json({ queued: info.lastInsertRowid, issue: issue.number });
});

app.listen(PORT, HOST, () => {
  console.log(`webhook listening on ${HOST}:${PORT}`);
});
