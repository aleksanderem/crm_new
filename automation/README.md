# GitHub Issues → Claude Code worker

A small daemon that watches a GitHub repo for `@claude` mentions and
`claude:retry` label flips, and runs Claude Code headless against the issue
in a fresh git worktree. Closes the loop by relabeling, commenting,
opening PRs, and auto-spawning follow-up issues.

This is what the `crm_new` project has been using since ~2026-04. It survived
mass triage, regression sweeps, and auto-tune of `max-turns`. The export here
captures the **exact** files that were running on prod when this README was
written.

## Architecture (4 boxes)

```
  GitHub webhook ──HTTPS──▶  nginx-rc / Caddy / nginx
        │                          │  reverse-proxies
        │                          ▼
        │                    127.0.0.1:9090  (webhook.mjs)
        │                          │
        │                          ▼   enqueue
        │                    SQLite queue.db
        │                          │
        │                          ▼   poll every 3s
        ▼                    worker.mjs
  GitHub Issues  ◀───────────────  │
  (labels, comments, PRs)          ▼  spawn /bin/bash
                                run-claude.sh
                                   │
                                   ▼ `claude -p --permission-mode bypassPermissions ...`
                                Claude Code (CLI)
```

Each job runs in its own `git worktree add` so the worker can handle multiple
issues without stepping on itself. Tunables (max-turns, attempts, timeout)
live in `worker/tuning.json` and are mutated in place by `tune.mjs`.

## What the labels mean

| Label              | Set by      | Meaning                                                |
| ------------------ | ----------- | ------------------------------------------------------ |
| `claude:working`   | worker      | Job picked up, Claude is running                       |
| `claude:done`      | worker      | PR opened or change committed; success                 |
| `claude:needs-info` | worker     | Claude wants more from the reporter (no PR)            |
| `claude:not-a-bug` | worker      | Claude verified the feature already exists / WAD       |
| `claude:failed`    | worker      | Hit retry budget or hard error                         |
| `claude:retry`     | **human**   | Forces a retry. Removed by the worker on pickup        |
| `claude:conflict`  | worker      | Branch needs a manual rebase                           |
| `claude:auto-resolved` | worker  | Closed by Claude because root cause was already merged |
| `auto-followup`    | worker      | Issue auto-opened by Claude for an out-of-scope finding |

Every state transition is mutually exclusive — `run-claude.sh` strips all of
the worker-managed labels before applying the new one, so the issue is never
in two states at once.

## Triggers

The webhook accepts these events:

- `issues.opened` with `@claude` in the body  →  enqueue
- `issue_comment.created` with `@claude` in the body  →  enqueue
- `issues.labeled` with `claude:retry` added  →  enqueue (label is removed
  on pickup so a later retry just re-adds it)

Bot's own comments are filtered out via `BOT_GH_LOGIN`.

## Install

1. **Pick a host with root + `node >= 20`, `jq`, `git`, `gh` CLI, and `claude` CLI.**
2. Copy `automation/` to the host.
3. `bash automation/install.sh` — creates the `claude-bot` user, installs
   systemd units, drops the nginx-rc location snippet into place, prompts for
   the env values.
4. On GitHub:
   - Create a webhook (Repo → Settings → Webhooks).
     URL: `https://<your-host>/_claude-webhook/github`
     Content type: `application/json`
     Secret: the value from `.env`'s `WEBHOOK_SECRET`
     Events: *Issues*, *Issue comments*.
   - In the same UI add the worker labels (or let the bot create them when
     it first runs — `gh label create` calls live in `run-claude.sh`).
5. `gh auth login --hostname github.com` **as `claude-bot`** (not root).
   The worker calls `gh` for every action — it uses whatever auth lives in
   `~claude-bot/.config/gh/hosts.yml`.
6. `systemctl enable --now claude-webhook claude-worker`
7. `claude-health` to confirm green.

## Files in this directory

| Path                            | Purpose                                                  |
| ------------------------------- | -------------------------------------------------------- |
| `worker/webhook.mjs`            | HTTP listener on 127.0.0.1:9090, HMAC verify, enqueue    |
| `worker/worker.mjs`             | Polls queue, spawns `run-claude.sh` for each job         |
| `worker/run-claude.sh`          | The actual issue-handling logic (the brain of the bot)   |
| `worker/auto-retry.sh`          | Re-triggers jobs that hit the per-attempt timeout        |
| `worker/extract-followups.mjs`  | Parses Claude's output for `Opened follow-up issue(s)`   |
| `worker/ground-pr-body.mjs`     | Rejects PR summaries citing files that aren't in the diff |
| `worker/health-queue.mjs`       | Queue stats (pending / running / stuck > 1h)             |
| `worker/tune.mjs`               | Auto-tunes `max_turns` / `per_attempt_timeout` based on  |
|                                 | exit codes across the last N jobs                        |
| `worker/tuning.json`            | The mutable tunable state                                |
| `worker/.env.example`           | Required env vars                                        |
| `systemd/claude-webhook.service` | Systemd unit for the HTTP listener                      |
| `systemd/claude-worker.service` | Systemd unit for the queue-polling daemon                |
| `nginx/claude-webhook.location.conf` | location block — drop into your vhost          |
| `bin/claude-health`             | Single-shot health check (services, queue, recent jobs)  |
| `docs/PROMPTS.md`               | What `run-claude.sh` passes to Claude (the "system" half)|

## Operating notes

- **`max-turns` is auto-tuned**, not pinned. Don't hand-edit `tuning.json` —
  use `tune.mjs` and check the next few job logs.
- **Bot account ≠ your user.** The worker won't touch issues where
  `trigger_login == BOT_GH_LOGIN`, so make sure the bot's GitHub login is
  in `.env`. Otherwise it will reply to its own comments.
- **Worktrees are not cleaned automatically.** `auto-retry.sh` blows away
  stale worktrees older than 24h.
- **Hallucinated PR / commit refs** in `NOT_A_BUG:` verdicts have happened
  (see `docs/KNOWN-FAILURE-MODES.md`). The check is: every cited symbol
  should be greppable in `main` before posting.
- **Don't `npx convex dev` from an old branch.** The worker runs it as part
  of `run-claude.sh`, and from a stale tree it overwrites the dev
  deployment with old function definitions. Always rebase first.

## Removing it

`systemctl disable --now claude-webhook claude-worker`
`rm -rf /home/claude-bot /etc/systemd/system/claude-{webhook,worker}.service`
`rm /etc/nginx-rc/extra.d/*.claude-webhook.conf`
Delete the GitHub webhook from the repo settings.
