#!/bin/bash
# auto-retry.sh — periodically re-trigger claude on failed issues, with budget cap
set -uo pipefail

REPO="${REPO:-OWNER/REPONAME}"
MAX_AUTO_RETRIES=2
DB=/home/claude-bot/worker/queue.db
LOG=/home/claude-bot/logs/auto-retry.log
mkdir -p "$(dirname $LOG)"
TS=$(date -Is)

# Init table (idempotent)
node -e "
const Database = require('/home/claude-bot/worker/node_modules/better-sqlite3');
const db = new Database('$DB');
db.exec(\`CREATE TABLE IF NOT EXISTS auto_retries (
  repo TEXT NOT NULL,
  issue_number INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  last_at INTEGER,
  PRIMARY KEY (repo, issue_number)
)\`);
"

# Find open issues with claude:failed label
ISSUES=$(gh issue list --repo "$REPO" --label "claude:failed" --state open --limit 100 --json number --jq '.[].number')

if [ -z "$ISSUES" ]; then
  echo "[$TS] no failed issues" >>"$LOG"
  exit 0
fi

for issue in $ISSUES; do
  # Read current auto-retry count
  count=$(node -e "
const Database = require('/home/claude-bot/worker/node_modules/better-sqlite3');
const db = new Database('$DB', { readonly: true });
const r = db.prepare('SELECT count FROM auto_retries WHERE repo=? AND issue_number=?').get('$REPO', $issue);
console.log(r ? r.count : 0);
")

  if [ "$count" -ge "$MAX_AUTO_RETRIES" ]; then
    echo "[$TS] skip #$issue (budget exhausted: $count/$MAX_AUTO_RETRIES)" >>"$LOG"
    continue
  fi

  echo "[$TS] retrying #$issue (count=$count)" >>"$LOG"
  if gh issue edit "$issue" --repo "$REPO" --add-label "claude:retry" 2>>"$LOG"; then
    node -e "
const Database = require('/home/claude-bot/worker/node_modules/better-sqlite3');
const db = new Database('$DB');
db.prepare('INSERT INTO auto_retries (repo, issue_number, count, last_at) VALUES (?, ?, 1, ?) ON CONFLICT(repo, issue_number) DO UPDATE SET count = count + 1, last_at = excluded.last_at').run('$REPO', $issue, Date.now());
"
    echo "[$TS] queued retry for #$issue" >>"$LOG"
  else
    echo "[$TS] FAILED to add label on #$issue" >>"$LOG"
  fi
done
