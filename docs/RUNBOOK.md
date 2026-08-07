# Incident Runbook & Rollback Procedures

This document covers incident response, Netlify deploy rollback, Supabase migration rollback, database restoration, and downtime communication. It complements the principles in `RELIABILITY.md` and the backup mechanics in `backup-restore.md`.

---

## Severity levels

| Level | Definition | Target response time | Target resolution time |
|-------|------------|----------------------|------------------------|
| P1 | Production fully down — login broken, data unreadable, or all API calls failing | 15 minutes | 2 hours |
| P2 | Partial outage — one feature area broken or degraded, other flows intact | 1 hour | 8 hours |
| P3 | Non-blocking degradation — cosmetic, slow, or single-user issue | Next business day | 3 business days |

---

## Detection signals

Automated monitors surface incidents in two ways:

**GitHub uptime monitoring** (`.github/workflows/uptime.yml`) polls every 10 minutes and opens a GitHub issue labelled `bug` with `uptime-monitoring-alert` in the body when the frontend URL or the Convex health endpoint fails. Subsequent failures while the issue is open add comments rather than opening duplicates. When the incident is resolved, **close the issue manually** so the next failure starts a fresh tracking thread.

**Netlify deploy health check** (`.github/workflows/netlify-deploy-healthcheck.yml`) runs hourly and opens a separate `bug` issue when the latest deploy on `main` is in the `error` state.

Both monitors also log failures to the GitHub Actions tab under their respective workflow names.

---

## Incident response roles

For a solo operator or small team this collapses to one person. In a larger team, keep these roles separate to avoid confusion:

**Incident Commander (IC)** — one person owns the incident end-to-end: declares severity, coordinates action, owns communication, and calls the all-clear. Rotate the on-call slot weekly.

**Responder** — executes technical actions (deploy rollback, migration revert, restore) and reports status to the IC.

**Communicator** — drafts and sends status updates to affected users. On a small team this is the IC.

---

## First-response checklist

Run through these within the first 15 minutes of a P1 alert:

1. **Confirm the incident is real.** Check the uptime monitoring issue comments for the failing component. Open the SITE_URL and CONVEX_SITE_URL in a browser. Rule out a monitoring false-positive (e.g. a one-off network blip that has since recovered).

2. **Identify the blast radius.** Is it the frontend (Netlify CDN down), the Convex runtime, or Supabase connectivity? The Convex `/health` response body names which backend dependency is failing.

3. **Correlate with recent changes.** Run `git log --oneline -10 origin/main` and check the GitHub Actions tab for the most recent `Supabase Migrations` workflow run. Identify whether a deploy or migration coincided with the outage start.

4. **Declare severity and assign roles.** Post a short message in your team channel (see template below) so everyone knows who is handling it.

5. **Execute the relevant rollback procedure** from the sections below.

6. **Monitor recovery.** Wait for the uptime workflow to pass (up to 10 minutes), then close the tracking issue.

---

## Netlify rollback

The deploy pipeline uses a GitHub Actions build hook to trigger Netlify after migrations succeed. Auto-publish in Netlify must be disabled (see issue #951 in the codebase). This means rolling back the frontend is independent of rolling back migrations.

### Via the Netlify dashboard (preferred)

1. Open the Netlify dashboard for the site.
2. Go to **Deploys**.
3. Find the last deploy that was known good (use the commit SHA from `git log` to identify it).
4. Click **"Publish deploy"** on that entry.

The previous build artifact is already cached — this takes under a minute.

### Via the Netlify CLI

```bash
npm install -g netlify-cli
netlify login
netlify sites:list   # find your site ID
netlify api listSiteDeploys --data '{"site_id": "<SITE_ID>"}' | jq '.[].id'

# Restore a specific deploy by ID
netlify api restoreSiteDeploy --data '{"site_id": "<SITE_ID>", "deploy_id": "<DEPLOY_ID>"}'
```

### After rolling back

If the rollback was caused by a code bug, push a fix commit to `main`. The `Supabase Migrations` workflow will apply pending migrations (none in this case) and trigger a new Netlify build.

If the rollback was caused by a broken migration that the new frontend depends on, fix the migration first (see the next section) before re-deploying the frontend.

---

## Supabase migration rollback

Migrations are numbered sequentially in `supabase/migrations/`. The `scripts/supabase-migrations.mjs` script tracks which migrations have been applied in the `_migrations` table in Postgres. There is no built-in undo command — rolling back a migration means one of two paths:

### Path A: Write a reverse migration (additive-only changes)

Use this when the migration added new columns, tables, or indexes but did not delete or transform existing data.

1. Create a new migration file that undoes the change:

```bash
# Example: if migration 00070 added a column
# Create 00070_rollback_some_column.sql
cat > supabase/migrations/00070_rollback_some_column.sql <<'SQL'
ALTER TABLE some_table DROP COLUMN IF EXISTS some_column;
SQL
```

2. Apply it via the normal path — push to `main` and let the `Supabase Migrations` workflow run, or apply manually:

```bash
export SUPABASE_URL="..."
export SUPABASE_SERVICE_ROLE_KEY="..."
node scripts/supabase-migrations.mjs apply
```

3. Rollback the frontend deploy (see above) if the frontend code references the reverted column.

### Path B: Restore from backup (destructive changes or data corruption)

Use this when the migration dropped columns, truncated data, or caused corruption that cannot be undone by a new forward migration. This is destructive — all data written after the last backup will be lost.

See `docs/backup-restore.md` for the full procedure. The key steps are:

1. Trigger a manual backup of the current state first (even if broken) so you have a rollback point:

```bash
# Actions → Supabase Backup → Run workflow
```

2. Provision a new Postgres instance or confirm you will overwrite the existing one.

3. Run the restore script:

```bash
export BACKUP_ENCRYPTION_KEY="..."
export BACKUP_S3_BUCKET="..."
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."
export TARGET_DB_URL="postgresql://..."

bash scripts/restore-supabase.sh
```

4. Apply any migrations between the backup timestamp and the migration that caused the problem — but exclude the broken migration and everything after it:

```bash
# Inspect which migrations exist up to the safe point, then apply only those.
# Manually pass a MAX_MIGRATION env var or temporarily rename the bad migration file
# to exclude it, then run:
node scripts/supabase-migrations.mjs apply
```

5. Update `SUPABASE_URL` in Netlify environment variables and in Convex:

```bash
npx convex env set SUPABASE_URL "postgresql://..."
```

6. Rollback the Netlify frontend to a commit that predates the broken migration (see above).

---

## Database restore (infrastructure failure)

If the Supabase host is lost or corrupted independent of a migration, follow the full restore procedure in `docs/backup-restore.md`. The summary:

1. Provision a clean Postgres instance and install `uuid-ossp` + `pg_trgm` extensions.
2. Set the required env vars (`BACKUP_ENCRYPTION_KEY`, `BACKUP_S3_BUCKET`, credentials).
3. Run `bash scripts/restore-supabase.sh` (latest) or pass a specific backup key.
4. Run `node scripts/supabase-migrations.mjs apply` to apply any migrations newer than the backup.
5. Verify RLS is enabled on all tables (the restore script includes a RLS verification step).
6. Update `SUPABASE_URL` in Convex and Netlify, then redeploy.

Backups are stored as `supabase-backups/backup-<UTC timestamp>.sql.gz.enc` in the S3 bucket. List available backups:

```bash
aws s3 ls s3://<BACKUP_S3_BUCKET>/supabase-backups/ --endpoint-url <BACKUP_AWS_ENDPOINT_URL>
```

---

## Downtime communication

### Internal status channel (immediate — within 5 minutes of P1 detection)

Post in the team chat with the following structure:

```
[INCIDENT] P1 — <brief description>
Status: Investigating / Identified / Fixing / Resolved
Impact: <what is broken for users>
Started: <time UTC>
IC: <name>
Next update: <time UTC>
```

Update the post every 30 minutes until resolved.

### External status page or email (if customers are affected)

Send within 30 minutes of confirming a P1 outage:

```
Subject: [STATUS] Service disruption — <date>

We are currently experiencing a disruption affecting <affected area>.

Impact: <what users cannot do>
Started: <time in user-local timezone if known, otherwise UTC>
Status: We have identified the cause and are working on a resolution.

We will send an update within <30|60> minutes or as soon as service is restored.

We apologise for the inconvenience.
```

Resolution notification:

```
Subject: [RESOLVED] Service disruption — <date>

The disruption affecting <affected area> has been resolved.

Resolution time: <time UTC>
Duration: <X minutes/hours>
Root cause: <brief summary — save the full post-mortem for the PIR>

Thank you for your patience.
```

---

## Post-incident review (PIR)

Run a PIR within 48 hours for every P1 incident and any P2 that took more than 4 hours to resolve. Blameless — focus on systems, not people.

Document in a new file under `docs/post-mortems/YYYY-MM-DD-<slug>.md` with:

1. **Summary** — one paragraph, what happened and what the impact was.
2. **Timeline** — key events with UTC timestamps (detection, escalation, identified cause, each recovery action, resolution).
3. **Root cause** — the underlying technical reason, not the immediate trigger.
4. **Contributing factors** — what made it worse or harder to detect.
5. **Action items** — concrete follow-up tasks with owners and deadlines. Each item should be tracked as a GitHub issue.
6. **What went well** — things that worked as intended during the response.
