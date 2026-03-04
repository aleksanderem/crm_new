#!/usr/bin/env bash
set -euo pipefail

# Usage:
# scripts/agents/spawn-claude-headless.sh <agent-name> <prompt-file>

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RUNTIME_DIR="$ROOT/.runtime/agents"
mkdir -p "$RUNTIME_DIR"

AGENT_NAME="${1:-claude}"
PROMPT_FILE="${2:-}"

if [[ -z "$PROMPT_FILE" || ! -f "$PROMPT_FILE" ]]; then
  echo "Usage: $0 <agent-name> <prompt-file>"
  exit 1
fi

TS="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="$RUNTIME_DIR/${AGENT_NAME}-${TS}.log"
META_FILE="$RUNTIME_DIR/${AGENT_NAME}-${TS}.json"
PROMPT="$(cat "$PROMPT_FILE")"

echo "[spawn] starting $AGENT_NAME"
echo "[spawn] log: $LOG_FILE"

cd "$ROOT"
nohup bash -lc '
  AGENT_NAME="$1"
  PROMPT="$2"
  LOG_FILE="$3"
  META_FILE="$4"

  claude -p --permission-mode bypassPermissions --output-format text "$PROMPT" 2>&1 | tee -a "$LOG_FILE"
  EXIT_CODE=${PIPESTATUS[0]}

  LAST_LINE=$(tail -n 1 "$LOG_FILE" | tr -d "\r" | cut -c1-180)

  python3 - <<PY
import json
from pathlib import Path
p = Path("$META_FILE")
try:
    d = json.loads(p.read_text())
except Exception:
    d = {}
d["state"] = "finished"
d["exit_code"] = int("$EXIT_CODE")
d["finished_at"] = __import__("datetime").datetime.utcnow().isoformat() + "Z"
d["last_output"] = """$LAST_LINE"""
p.write_text(json.dumps(d, indent=2) + "\n")
PY

  openclaw system event --text "Worker finished: ${AGENT_NAME} (exit ${EXIT_CODE}) | ${LAST_LINE}" --mode now >/dev/null 2>&1 || true
' _ "$AGENT_NAME" "$PROMPT" "$LOG_FILE" "$META_FILE" >/dev/null 2>&1 &
PID=$!

cat > "$META_FILE" <<JSON
{
  "agent": "$AGENT_NAME",
  "pid": $PID,
  "started_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "log_file": "$LOG_FILE",
  "meta_file": "$META_FILE",
  "state": "running"
}
JSON

echo "[spawn] pid=$PID"
echo "[spawn] meta=$META_FILE"
