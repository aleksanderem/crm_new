# Supabase Backup & Restore

Self-hosted Supabase Postgres is the sole production data store. This document covers the automated backup pipeline and the procedure for restoring to a clean instance.

---

## Architecture

Backups run nightly at 03:00 UTC via `.github/workflows/backup.yml`. Each backup goes through three stages:

1. `pg_dump` — plain-format SQL dump of all schemas (no owners, no ACLs)
2. gzip compression
3. AES-256-CBC encryption (PBKDF2, 200 000 iterations) via `openssl enc`

The resulting `.sql.gz.enc` file is uploaded to an S3-compatible bucket. Objects older than 30 days are deleted automatically at the end of each run (configurable via `BACKUP_RETENTION_DAYS`).

A weekly restore drill runs every Sunday at 04:00 UTC. It downloads the latest backup, decrypts it, verifies gzip integrity, confirms the SQL header, and reports the table count. This ensures the backup artifact is intact without requiring a live target database in CI.

---

## Required secrets

Set these in **Settings → Secrets and variables → Actions** before the first backup runs:

| Secret | Description |
|--------|-------------|
| `SUPABASE_DB_URL` | PostgreSQL connection string: `postgresql://user:pass@host:5433/postgres` |
| `BACKUP_ENCRYPTION_KEY` | Passphrase for AES-256-CBC encryption. Generate with `openssl rand -base64 32`. Store this separately from the backups — losing it means losing all backups. |
| `BACKUP_S3_BUCKET` | Destination bucket name without the `s3://` prefix |
| `BACKUP_AWS_ACCESS_KEY_ID` | S3 credentials |
| `BACKUP_AWS_SECRET_ACCESS_KEY` | S3 credentials |
| `BACKUP_AWS_ENDPOINT_URL` | (optional) Override endpoint for Backblaze B2, MinIO, or other S3-compatible stores |
| `BACKUP_AWS_DEFAULT_REGION` | (optional) S3 region; defaults to `us-east-1` |

Backblaze B2 example endpoint: `https://s3.us-west-004.backblazeb2.com`

---

## Backup layout in the bucket

```
s3://<BACKUP_S3_BUCKET>/
  supabase-backups/
    backup-20260805T030012Z.sql.gz.enc
    backup-20260804T030009Z.sql.gz.enc
    ...
```

Each filename encodes the UTC timestamp of the run. You can list all backups with:

```bash
aws s3 ls s3://<BACKUP_S3_BUCKET>/supabase-backups/ --endpoint-url <BACKUP_AWS_ENDPOINT_URL>
```

---

## Restore procedure (clean-instance recovery)

Use `scripts/restore-supabase.sh` to restore any backup to a target Postgres database.

### 1. Prepare the target database

On the target Postgres instance, create a clean database and install extensions:

```sql
-- Connect as superuser
CREATE DATABASE postgres;
\c postgres
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
```

If restoring over an existing database (not recommended for clean recovery), truncate or drop the public schema first to avoid constraint conflicts:

```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
```

### 2. Export required env vars

```bash
export BACKUP_ENCRYPTION_KEY="<same passphrase used during backup>"
export BACKUP_S3_BUCKET="<your-bucket-name>"
export AWS_ACCESS_KEY_ID="<key>"
export AWS_SECRET_ACCESS_KEY="<secret>"
export AWS_ENDPOINT_URL="<endpoint-url-if-applicable>"
export TARGET_DB_URL="postgresql://postgres:password@new-host:5432/postgres"
```

### 3. Run the restore script

Restore the latest backup:

```bash
bash scripts/restore-supabase.sh
```

Restore a specific backup by passing its S3 key:

```bash
bash scripts/restore-supabase.sh supabase-backups/backup-20260805T030012Z.sql.gz.enc
```

The script prompts for confirmation when run interactively. Set `RESTORE_NO_PROMPT=1` to skip the prompt in automated contexts.

### 4. Apply any migrations that postdate the backup

After restoring, run any Supabase migrations that were applied between the backup timestamp and now:

```bash
export SUPABASE_DB_URL="$TARGET_DB_URL"
node scripts/supabase-migrations.mjs
```

### 5. Re-apply RLS policies

Because the dump was taken with `--no-owner --no-acl`, Row Level Security policies are included in the dump but role grants are not. Verify RLS is enabled on all tables:

```sql
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false;
```

If any tables show `rowsecurity = false`, enable it:

```sql
ALTER TABLE <tablename> ENABLE ROW LEVEL SECURITY;
```

### 6. Update Supabase application config

Point the Supabase Kong/PostgREST stack at the new Postgres host and restart. Update environment variables in Convex (`npx convex env set SUPABASE_URL ...`) and Netlify to reflect the new URL.

---

## Manual backup

Trigger a backup at any time via the GitHub Actions UI:

**Actions → Supabase Backup → Run workflow**

Or run the script locally:

```bash
export SUPABASE_DB_URL="postgresql://..."
export BACKUP_ENCRYPTION_KEY="..."
export BACKUP_S3_BUCKET="..."
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."

bash scripts/backup-supabase.sh
```

---

## Decrypt a backup without restoring

To inspect a backup without running a full restore:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -pass "pass:<BACKUP_ENCRYPTION_KEY>" \
  -in backup-20260805T030012Z.sql.gz.enc \
  -out backup.sql.gz

gunzip backup.sql.gz
head -50 backup.sql
```

---

## Alerts

Backup failures surface as workflow failures in the Actions tab. The `Secrets Health Check` workflow (`.github/workflows/secrets-health.yml`) runs daily at 07:00 UTC and will alert if any required backup secret is unset.

Retention adjustments (e.g., temporarily keep 60 days) can be passed as an input when triggering the workflow manually.
