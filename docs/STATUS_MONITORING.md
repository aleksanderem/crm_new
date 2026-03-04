# Status Monitoring

Real-time project status monitoring via `status.json`, event logging, and a React dashboard.

## Quick Start

Run the status watcher (updates every 60s, configurable via `STATUS_INTERVAL` env var):

```bash
npm run status:watch
```

Run a one-off status update:

```bash
npm run status:update
```

Push events (compares current status against last snapshot, logs transitions):

```bash
npm run status:event
```

Start the dashboard (Vite dev server on port 4173, polls `status.json` every 5s):

```bash
cd status-dashboard && npm install   # first time only
npm run status:dashboard
```

Then open http://localhost:4173 in your browser.

## Files

| Path | Purpose |
|------|---------|
| `status.json` | Machine-readable project status (auto-generated) |
| `STATUS.md` | Human-readable project status (auto-generated) |
| `scripts/status/update-status.mjs` | Collects git info, processes, timestamps and writes both files |
| `scripts/status/push-event.mjs` | Detects state changes, appends to `scripts/status/events.log`, and sends `openclaw system event` push notifications |
| `scripts/status/watch-status.mjs` | Runs update + push-event in a loop (default 60s) |
| `status-dashboard/` | Vite React app that displays status cards |

## Agent Visibility

The status system detects running coding agents and openclaw sessions, surfaced in `status.json` and the dashboard.

### Agents (`status.json → agents`)

The `update-status.mjs` script runs `ps -eo pid,etime,command` and matches processes against known agent patterns: `claude -p`, `openclaw-tui`, `openclaw-onboard`, `codex`, `opencode`, `copaw`, `pi`. Each detected agent includes:

- `pid` — OS process ID
- `agent` — agent name (e.g. "claude", "copaw")
- `command` — truncated command line (up to 120 chars)
- `started_at` — ISO timestamp derived from the process elapsed time (best-effort; null if `ps` format differs)
- `state` — always "running" (dead processes are not listed by `ps`)
- `last_output` — last non-empty line from agent log (when captured)
- `log_file` — path to log file (when captured)

To reliably capture `last_output`, spawn Claude with wrapper:

```bash
scripts/agents/spawn-claude-headless.sh <agent-name> <prompt-file>
```

This writes logs and metadata to `.runtime/agents/`, which status monitor reads.

Limitations: `ps` output format varies across systems. The script tries `pid,etime,command` first, falling back to `pid,command`. The `started_at` field is approximate (based on elapsed time, not actual start timestamp). Agents that exit between polls will not appear. `last_output` is only guaranteed for wrapper-spawned agents.

### OpenClaw Sessions (`status.json → openclaw_sessions`)

The `agent-sessions.mjs` helper reads `~/.openclaw/agents/main/sessions/sessions.json` and returns a summary of up to 20 recent sessions. Each entry includes: `key`, `sessionId`, `updatedAt`, `ageMs`, `model`, `modelProvider`, `agentId`, `kind`, `totalTokens`, `inputTokens`, `outputTokens`.

If the sessions file is missing or unreadable, `openclaw_sessions` is an empty array — this is not treated as an error.

### Dashboard Cards

The status dashboard shows two new cards:

- "Agents" — lists each detected agent with PID, badge, truncated command, and start time.
- "OpenClaw Sessions" — lists recent sessions with agent ID, model, key, update time, and token usage.

## Sprint Progress Board (TODO/DONE)

Status generator now exposes `status.json.sprint0` used by dashboard card **Sprint 0 TODO / DONE**.

- Auto-done heuristics: Convex configured, pass markers from status fields.
- Manual progress override file: `.runtime/sprint0-progress.json`
  - `current_focus`: string
  - `done`: array of task ids (`convex`, `typecheck`, `build`, `lint`, `blast`, `report`)

Example:

```json
{
  "current_focus": "Fix gabinet API typings",
  "done": ["convex", "typecheck"]
}
```

## Configuration

Set `STATUS_INTERVAL` (in seconds) to change the polling interval of the watcher:

```bash
STATUS_INTERVAL=10 npm run status:watch
```
