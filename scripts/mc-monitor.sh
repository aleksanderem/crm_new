#!/bin/bash
# Mission Control & Ralph monitor
# Checks every 10 minutes for issues and attempts auto-recovery

MC_API="http://localhost:8000"
AUTH="Authorization: Bearer 2b49c374f421921d03fb50878b051c10af38ef4d9ab7d7ba0d31cf0701caa7b8"
BOARD_ID="83acf7e1-a849-461c-afc6-4b917ad49eca"
RALPH_ID="1a5775a5-ff58-486f-93fd-84858e7e7028"
LOG="/tmp/mc-monitor.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG"
}

check_mc_backend() {
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" "$MC_API/docs" 2>/dev/null)
  if [ "$status" != "200" ]; then
    log "ALERT: MC backend down (HTTP $status). Attempting restart..."
    cd /Users/alfred/.openclaw/workspace/mission-control && bash start-local.sh &
    sleep 10
    status=$(curl -s -o /dev/null -w "%{http_code}" "$MC_API/docs" 2>/dev/null)
    if [ "$status" = "200" ]; then
      log "RECOVERED: MC backend restarted successfully"
    else
      log "CRITICAL: MC backend restart failed (HTTP $status)"
      echo "MC_BACKEND_DOWN"
    fi
  else
    echo "OK"
  fi
}

check_agents() {
  local agents_json
  agents_json=$(curl -s "$MC_API/api/v1/agents" -H "$AUTH" 2>/dev/null)
  if [ $? -ne 0 ] || [ -z "$agents_json" ]; then
    log "ALERT: Cannot reach agents API"
    echo "API_UNREACHABLE"
    return
  fi

  # Check Ralph specifically
  local ralph_status ralph_last_seen
  ralph_status=$(echo "$agents_json" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for a in data.get('items', []):
    if a['id'] == '$RALPH_ID':
        print(a.get('status', 'unknown'))
        break
" 2>/dev/null)

  ralph_last_seen=$(echo "$agents_json" | python3 -c "
import sys, json
from datetime import datetime, timezone
data = json.load(sys.stdin)
for a in data.get('items', []):
    if a['id'] == '$RALPH_ID':
        last = a.get('last_seen_at', '')
        if last:
            dt = datetime.fromisoformat(last.replace('Z', '+00:00'))
            diff = (datetime.now(timezone.utc) - dt).total_seconds()
            print(f'{diff:.0f}')
        break
" 2>/dev/null)

  if [ "$ralph_status" = "offline" ]; then
    log "ALERT: Ralph is OFFLINE. Attempting wake..."
    # Try to wake Ralph via gateway
    curl -s -X POST "$MC_API/api/v1/agents/$RALPH_ID/wake" -H "$AUTH" 2>/dev/null
    echo "RALPH_OFFLINE"
    return
  fi

  if [ -n "$ralph_last_seen" ] && [ "$ralph_last_seen" -gt 1800 ]; then
    log "WARNING: Ralph last seen ${ralph_last_seen}s ago (>30min). May be stuck."
    echo "RALPH_STALE"
    return
  fi

  echo "OK"
}

check_tasks() {
  local tasks_json
  tasks_json=$(curl -s "$MC_API/api/v1/boards/$BOARD_ID/tasks?limit=50" -H "$AUTH" 2>/dev/null)
  if [ $? -ne 0 ] || [ -z "$tasks_json" ]; then
    log "ALERT: Cannot reach tasks API"
    return
  fi

  # Check for stuck in_progress tasks (assigned to Ralph, in_progress for >2h)
  python3 -c "
import sys, json
from datetime import datetime, timezone

data = json.load(sys.stdin)
now = datetime.now(timezone.utc)
issues = []

for t in data.get('items', []):
    tid = t['id'][:8]
    title = t['title'][:50]
    status = t['status']
    agent = t.get('assigned_agent_id', '')

    # Check for tasks stuck in_progress
    if status == 'in_progress' and agent == '$RALPH_ID':
        updated = t.get('updated_at', t.get('created_at', ''))
        if updated:
            try:
                dt = datetime.fromisoformat(updated.replace('Z', '+00:00'))
                hours = (now - dt).total_seconds() / 3600
                if hours > 4:
                    issues.append(f'STUCK: {tid}... \"{title}\" in_progress for {hours:.1f}h')
            except:
                pass

    # Check for tasks that should have been picked up
    if status == 'inbox' and agent == '$RALPH_ID':
        created = t.get('created_at', '')
        if created:
            try:
                dt = datetime.fromisoformat(created.replace('Z', '+00:00'))
                hours = (now - dt).total_seconds() / 3600
                if hours > 2:
                    issues.append(f'STALE_INBOX: {tid}... \"{title}\" in inbox for {hours:.1f}h')
            except:
                pass

if issues:
    for i in issues:
        print(i)
else:
    print('OK')
" <<< "$tasks_json" 2>/dev/null
}

check_rate_limits() {
  # Check OpenClaw gateway health
  local gw_health
  gw_health=$(curl -s "http://localhost:18789/health" 2>/dev/null)
  if [ $? -ne 0 ]; then
    log "WARNING: OpenClaw gateway health check failed"
    echo "GW_UNREACHABLE"
    return
  fi

  # Check Claude usage via codexbar
  local claude_usage
  claude_usage=$(codexbar usage --provider claude --json 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    for p in data:
        u = p.get('usage', {})
        pri = u.get('primary', {})
        sec = u.get('secondary', {})
        pri_pct = pri.get('usedPercent', 0)
        sec_pct = sec.get('usedPercent', 0)
        print(f'{pri_pct}|{sec_pct}')
except:
    print('?|?')
" 2>/dev/null)

  local pri_pct=$(echo "$claude_usage" | cut -d'|' -f1)
  local sec_pct=$(echo "$claude_usage" | cut -d'|' -f2)

  if [ "$pri_pct" != "?" ] && [ "$pri_pct" -ge 80 ] 2>/dev/null; then
    log "ALERT: Claude primary usage at ${pri_pct}%! Approaching rate limit."
    echo "CLAUDE_HIGH_${pri_pct}PCT"
    return
  fi
  if [ "$sec_pct" != "?" ] && [ "$sec_pct" -ge 70 ] 2>/dev/null; then
    log "WARNING: Claude weekly usage at ${sec_pct}%"
  fi

  # Check for rate limit errors in recent Ralph session logs
  local rate_errors
  rate_errors=$(find /Users/alfred/.openclaw/agents/mc-1a5775a5-ff58-486f-93fd-84858e7e7028/sessions -name "*.jsonl" -newer /tmp/mc-monitor-last-check 2>/dev/null | xargs grep -l "rate_limit\|429\|too many requests\|overloaded" 2>/dev/null | wc -l)
  if [ "$rate_errors" -gt 0 ]; then
    log "ALERT: Rate limit errors detected in Ralph's session logs ($rate_errors files)"
    echo "RATE_LIMITED"
    return
  fi

  if [ "$pri_pct" != "?" ]; then
    log "Usage: Claude primary=${pri_pct}% weekly=${sec_pct}%"
  fi
  echo "OK"
}

check_convex() {
  # Verify Convex is accessible (convex dev or convex logs running)
  local convex_pid
  convex_pid=$(pgrep -f "convex" 2>/dev/null | head -1)
  if [ -z "$convex_pid" ]; then
    log "WARNING: No Convex process running"
    echo "CONVEX_DOWN"
    return
  fi
  echo "OK"
}

check_vite() {
  # Verify Vite dev server is running
  local vite_pid
  vite_pid=$(pgrep -f "vite" 2>/dev/null | head -1)
  if [ -z "$vite_pid" ]; then
    log "WARNING: Vite dev server not running"
    echo "VITE_DOWN"
    return
  fi
  echo "OK"
}

# Main monitoring loop
log "=== MC Monitor started ==="
touch /tmp/mc-monitor-last-check

while true; do
  log "--- Check cycle start ---"

  mc_status=$(check_mc_backend)
  agent_status=$(check_agents)
  task_status=$(check_tasks)
  rate_status=$(check_rate_limits)
  convex_status=$(check_convex)
  vite_status=$(check_vite)

  # Summary
  if [ "$mc_status" = "OK" ] && [ "$agent_status" = "OK" ] && [ "$rate_status" = "OK" ]; then
    log "All systems OK | Tasks: $task_status | Convex: $convex_status | Vite: $vite_status"
  else
    log "ISSUES DETECTED | MC: $mc_status | Agents: $agent_status | Rate: $rate_status | Convex: $convex_status | Vite: $vite_status"

    # Auto-recovery actions
    if [ "$agent_status" = "RALPH_STALE" ] || [ "$agent_status" = "RALPH_OFFLINE" ]; then
      log "ACTION: Waking Ralph via openclaw agent CLI..."
      wake_response=$(timeout 120 openclaw agent --agent mc-1a5775a5-ff58-486f-93fd-84858e7e7028 --message "Health check: are you working? Report your current task status and progress. If idle, check the board for inbox tasks and start working." --timeout 90 2>&1)
      if [ -n "$wake_response" ]; then
        log "Ralph responded: $(echo "$wake_response" | head -3)"
      else
        log "WARNING: Ralph did not respond to wake message"
      fi
    fi

    if [ "$convex_status" = "CONVEX_DOWN" ]; then
      log "ACTION: Attempting to restart Convex dev server..."
      cd /Users/alfred/.openclaw/workspace/projects/crm_new && npx convex dev &
      sleep 5
    fi
  fi

  # Log usage summary
  usage_summary=$(bash /Users/alfred/.openclaw/workspace/projects/crm_new/scripts/usage-report.sh 2>/dev/null | grep -E "TOTAL|Claude \(" | tr '\n' ' ')
  if [ -n "$usage_summary" ]; then
    log "USAGE: $usage_summary"
  fi

  # Update last-check timestamp
  touch /tmp/mc-monitor-last-check

  log "--- Check cycle end ---"
  sleep 600  # 10 minutes
done
