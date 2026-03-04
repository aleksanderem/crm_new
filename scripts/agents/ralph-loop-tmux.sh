#!/usr/bin/env bash
set -euo pipefail

# Usage:
# scripts/agents/ralph-loop-tmux.sh <session> <prompt_file>

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SESSION="${1:-}" 
PROMPT_FILE="${2:-}"

if [[ -z "$SESSION" || -z "$PROMPT_FILE" || ! -f "$PROMPT_FILE" ]]; then
  echo "Usage: $0 <session> <prompt_file>"
  exit 1
fi

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "session exists: $SESSION"
  exit 0
fi

LOG_DIR="$ROOT/.runtime/agents"
mkdir -p "$LOG_DIR"
TS="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="$LOG_DIR/${SESSION}-${TS}.log"
META_FILE="$LOG_DIR/${SESSION}-${TS}.json"
PROMPT="$(cat "$PROMPT_FILE")"

# TDD guard is part of loop prompt prefix
TDD_PREFIX='Always write failing tests first for non-trivial logic, then implement to pass. Run relevant test suite before marking done.'

CMD="cd '$ROOT' && claude -p --permission-mode bypassPermissions --output-format text \"$TDD_PREFIX\n\n$PROMPT\" 2>&1 | tee -a '$LOG_FILE'; EXIT=\$?; echo EXITED:\$EXIT | tee -a '$LOG_FILE'; openclaw system event --text 'Ralph loop finished: $SESSION (exit '\$EXIT')' --mode now >/dev/null 2>&1 || true; sleep 999999"

tmux new -d -s "$SESSION" "$CMD"
PID="$(tmux display-message -p -t "$SESSION" '#{pane_pid}')"

cat > "$META_FILE" <<JSON
{
  "agent": "$SESSION",
  "pid": $PID,
  "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "state": "running",
  "log_file": "$LOG_FILE",
  "meta_file": "$META_FILE",
  "mode": "tmux-ralph-loop"
}
JSON

echo "started $SESSION"
echo "log: $LOG_FILE"
