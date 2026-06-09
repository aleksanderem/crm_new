# Known failure modes & gotchas

Lessons learned in production. Read before deploying this to a new project.

## 1. Stale-branch deploys wipe the dev Convex deployment

**Symptom:** Frontend reports `Could not find public function for '<name>'`.

**Cause:** `npx convex dev` (run by `run-claude.sh` to sync schemas) pushes
the **current working tree** to the configured dev deployment. If the bot is
on a stale feature branch missing functions that landed on `main`, the dev
deployment gets *truncated*: functions on main but not on the branch are
**removed**.

**Fix:** Always rebase the worktree onto fresh `main` before `convex dev`.
The bot's job script does `git pull --rebase origin main` first; if you fork
this code, keep that step.

## 2. Auto-triage hallucinates PR / commit refs

**Symptom:** `claude:not-a-bug` verdict cites `PR #1199 commit ca9d748`, but
the PR doesn't exist and the commit hash isn't in `git log`.

**Cause:** Claude has been trained to phrase confident citations; without a
verification step it'll synthesize plausible-looking references.

**Mitigation:** A `RESOLVED_PATTERN` and `NOT_A_BUG_PATTERN` regex in
`run-claude.sh` flips the label, but doesn't verify cited symbols.
Add a post-hoc grep step before posting — currently a TODO.

## 3. Bot replies to its own comments

**Symptom:** Infinite loop of `@claude` replies.

**Cause:** Forgot to set `BOT_GH_LOGIN` in `.env`, or set it to your own
user instead of the bot account.

**Defense:** `webhook.mjs` filters events where `sender.login == BOT_GH_LOGIN`.
**Always use a separate GitHub account for the bot.**

## 4. SQLite queue locks under load

**Symptom:** `SQLITE_BUSY` in `webhook.stderr.log`.

**Cause:** WAL helps but writes from `webhook.mjs` (insert) and `worker.mjs`
(claim) can race if hundreds of issues land at once.

**Mitigation:** `claimNext` is wrapped in a transaction. Beyond ~50 jobs/min
you'll want a real queue (Redis, BullMQ).

## 5. Worktrees pile up after timeouts

**Symptom:** Disk fills with `/home/claude-bot/worktrees/issue-*`.

**Cause:** Hard timeouts kill Claude mid-job; the cleanup `rmtree` in
`run-claude.sh` only runs on the success path.

**Mitigation:** `auto-retry.sh` (cron, every 15 min) removes worktrees older
than 24h that have no matching running job.

## 6. `claude:retry` label loops if not removed

The webhook listens for `labeled` events. If the bot doesn't remove
`claude:retry` on pickup, every subsequent re-label triggers a new run.
`run-claude.sh` strips it before starting work — don't break that.

## 7. Convex prod ≠ Convex dev

Two separate deployments. `convex deploy` defaults to prod (with
`CONVEX_DEPLOY_KEY` or interactive confirm). `convex dev` targets the dev
deployment set in `.env.local`. The bot's `run-claude.sh` runs `convex dev`
(not `deploy`) — frontend builds in CI handle prod deploys via Netlify's
`CONVEX_DEPLOY_KEY`. If your stack is different, change the script.

## 8. `bypassPermissions` mode

`run-claude.sh` invokes `claude -p --permission-mode bypassPermissions`. This
**disables interactive prompts** but does not bypass the auto-mode safety
classifier; destructive operations (force-push to main, prod DDL, mass
deletes) still get blocked. If the bot starts failing on otherwise-routine
work, check `job-*.log` for `Permission for this action was denied` lines.
