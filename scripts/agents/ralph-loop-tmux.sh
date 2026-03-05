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

# TDD + E2E guard is part of loop prompt prefix
# CRITICAL: Two-gate system - Ralph is Gate 1, Alfred is Gate 2
TDD_PREFIX='
## Two-Gate DONE System

You are GATE 1 (implementation). Alfred is GATE 2 (autonomous E2E verification).

### Gate 1 Requirements (YOUR job):
1. **ALL tests green** — Fix failing tests, never skip or mark "pre-existing"
2. **Build succeeds** — typecheck, lint, bundle all pass
3. **Code complete** — feature fully implemented per requirements

### Gate 2 (Alfred's job - do NOT attempt):
- Functional E2E testing (browser automation)
- Code quality review (unused vars, dead code, patterns)
- Architecture review (technical debt, conventions)
- Blast radius validation

### Your DONE Output:
When Gate 1 is complete, output:
```
GATE1_COMPLETE
Files changed: [list]
Tests: [X passed, 0 failed]
Build: PASS
Ready for: Alfred E2E verification
```

DO NOT output E2E_VERIFIED, DONE_SPRINT0, or any final completion marker.
Alfred will run Gate 2 autonomously and decide if the work is truly done.

---

Always write failing tests first for non-trivial logic, then implement to pass.
'

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
