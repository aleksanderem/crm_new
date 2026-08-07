# Deployment & Rollback Runbook

This document describes the full deployment chain for the production system, how to verify a deploy succeeded, and how to roll back each layer independently. For incident response and post-mortem templates see `docs/RUNBOOK.md`. For database backup and restore see `docs/backup-restore.md`.

---

## Deployment chain overview

Every production deploy passes through three layers in this order:

```
1. Supabase migrations  →  2. Convex deploy  →  3. Netlify (Vite build)
```

The order is enforced by the `supabase-migrations.yml` GitHub Actions workflow and the `netlify.toml` build command. **Never trigger a Netlify deploy before migrations have been applied.** A frontend that references columns or tables that don't exist yet will throw at runtime.

The normal trigger is a push to `main`:

1. GitHub Actions `.github/workflows/supabase-migrations.yml` runs its `apply` job — applies any pending SQL files in `supabase/migrations/` to the production Postgres instance.
2. After `apply` succeeds, the `deploy` job POSTs to the Netlify build hook (`NETLIFY_BUILD_HOOK_URL` repo secret).
3. Netlify runs the production build command from `netlify.toml`:
   ```
   npm run migrations:apply && npx convex deploy --cmd 'npm run build'
   ```
   This applies migrations a second time (defense-in-depth, idempotent) then deploys Convex functions and builds the static frontend bundle.
4. Netlify publishes the resulting deploy only if the build command exits 0.

Auto-publish in Netlify must be **disabled** (Site settings → Build & deploy → Continuous deployment). Otherwise Netlify fires its own parallel deploy on every push, bypassing the migration gate.

---

## Environment variables across three surfaces

Env vars are split across three separate locations. Setting a var in the wrong place silently fails — the build passes but the feature does not work at runtime.

### 1. Netlify (Site settings → Environment variables)

Used by the Netlify build command and by Vite to bake `VITE_*` values into the static bundle.

| Variable | Required | Notes |
|----------|----------|-------|
| `CONVEX_DEPLOY_KEY` | Yes | Production deploy key from Convex dashboard. Without it `convex deploy` fails. |
| `SUPABASE_DB_URL` | Yes | Postgres connection string for `scripts/supabase-migrations.mjs`. Without it the migration step exits 0 (fail-open). |
| `VITE_SUPABASE_URL` | Yes | Baked into the bundle — the supabase-js client will not start without it. |
| `VITE_SUPABASE_ANON_KEY` | Yes | Baked into the bundle. |
| `VITE_CONVEX_URL` | Usually auto-injected | `convex deploy` writes this; only set manually if not running `convex deploy` in the build. |
| `VITE_SENTRY_DSN` | Recommended | Baked into the bundle; activates Sentry error capture. |
| `SENTRY_AUTH_TOKEN` | Optional | Enables source-map upload to Sentry at build time. |
| `SENTRY_ORG` | Optional | Required with `SENTRY_AUTH_TOKEN`. |
| `SENTRY_PROJECT` | Optional | Required with `SENTRY_AUTH_TOKEN`. |

### 2. Convex (set with `npx convex env set NAME value`)

Used by Convex functions at runtime. Run against the production deployment.

| Variable | Notes |
|----------|-------|
| `AUTH_RESEND_KEY` | Auth email provider key. |
| `AUTH_EMAIL` | Sender address for auth emails. |
| `HOST_URL` | Public app URL (no trailing slash). |
| `SITE_URL` | Public app URL (same as HOST_URL in most setups). |
| `CONVEX_SITE_URL` | The `.convex.site` base URL for HTTP actions. |
| `APP_URL` | Used in email templates and redirect links. |
| `RESEND_API_KEY` | Transactional email. |
| `RESEND_FROM` | Sender address for transactional email. |
| `STRIPE_SECRET_KEY` | Stripe billing. |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature verification. |
| `GOOGLE_CLIENT_ID` | Gmail OAuth. |
| `GOOGLE_CLIENT_SECRET` | Gmail OAuth. |
| `GOOGLE_REDIRECT_URI` | Gmail OAuth redirect. |
| `SUPABASE_URL` | HTTP URL for Convex → Supabase writes. Must match Netlify `VITE_SUPABASE_URL`. |
| `SUPABASE_ANON_KEY` | Supabase anon key for JWT validation. |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key for privileged writes. Keep secret. |
| `SUPABASE_JWT_SECRET` | Used by the JWT bridge to mint Supabase tokens. |

`SUPABASE_URL` is the one variable that must appear in **both** Netlify and Convex. The build script reads it for migrations; Convex functions read it at runtime.

### 3. GitHub Actions (Settings → Secrets and variables → Actions)

Used only by CI workflows — never exposed to the browser or Convex runtime.

| Secret | Used by | Notes |
|--------|---------|-------|
| `SUPABASE_URL` | `supabase-migrations.yml` check job | HTTP transport for migration status check. |
| `SUPABASE_SERVICE_ROLE_KEY` | `supabase-migrations.yml` | HTTP transport auth. |
| `SUPABASE_DB_URL` | `supabase-migrations.yml` apply job | Fallback psql transport. |
| `NETLIFY_BUILD_HOOK_URL` | `supabase-migrations.yml` deploy job | POSTed after migrations succeed; gates the Netlify deploy. |
| `NETLIFY_AUTH_TOKEN` | `supabase-migrations.yml` poll step | Needed to poll Netlify deploy status. Degrades to warning if absent. |
| `NETLIFY_SITE_ID` | `supabase-migrations.yml` poll step | Same. |
| `BACKUP_*` | `backup.yml` | See `docs/backup-restore.md`. |

---

## Normal deployment workflow

### 1. Pre-deploy checks

Run these before merging to `main`:

```bash
npm run typecheck           # TypeScript (frontend + Convex)
npm run test:unit           # Convex unit tests + frontend unit tests
npm run migrations:check    # Verify no pending migrations are mismatched
```

The `typecheck.yml` and `unit.yml` GitHub Actions workflows run these on every pull request. Do not merge a PR with failing checks.

### 2. Merge to main

Push or merge to `main`. GitHub Actions will:

- Run `supabase-migrations.yml` → applies pending migrations → triggers Netlify build hook.
- Run `typecheck.yml` and `unit.yml` in parallel (informational if post-merge, but catches regressions).

Monitor the Actions tab for the `Supabase Migrations` workflow. If the `apply` job fails, **the Netlify deploy will not be triggered** — the frontend stays on the previous version.

### 3. Monitor the Netlify build

Open Netlify → Deploys for the site. The new build should appear within a minute of the GitHub Actions `deploy` job succeeding. Watch for the build log to confirm:

- `npm run migrations:apply` exits 0 (migration already applied — idempotent success).
- `npx convex deploy` exits 0 with a deployment URL.
- `npm run build` exits 0 and produces a `dist/` directory.

If `convex deploy` fails with a TypeScript error, the build aborts and the previous frontend stays live. Fix the Convex type error, push a new commit.

### 4. Post-deploy verification

After Netlify marks the deploy as "Published":

- Open the production URL and log in.
- Navigate to a recently changed page and confirm the new behaviour is visible.
- Open browser DevTools → Console; confirm no new errors.
- Check the Convex dashboard → Functions to confirm the new function versions are deployed.
- If a migration was included, run a quick sanity query via the Supabase SQL editor to confirm the schema change landed.

For a first deployment to a new environment, additionally verify:

- Stripe webhook endpoint is registered and the `STRIPE_WEBHOOK_SECRET` matches.
- A test email (password reset or invite) delivers successfully.
- The `/health` Convex HTTP action returns 200.

---

## Rollback procedures

### Important: layers are independent

Rolling back Netlify via the dashboard (re-publishing a previous cached deploy artifact) does **not** roll back Convex. The cached artifact contains the static bundle only — it does not re-run the build command. If the new Convex deployment introduced a bug, you must roll back Convex separately.

### Layer 1: Roll back the Netlify frontend

**Via Netlify dashboard (fastest — under 1 minute):**

1. Open Netlify → Deploys.
2. Identify the last known-good deploy using the commit SHA (`git log --oneline origin/main`).
3. Click "Publish deploy" on that entry.

**Via Netlify CLI:**

```bash
netlify login
netlify api listSiteDeploys --data '{"site_id": "<SITE_ID>"}' | jq '.[] | {id, created_at, state}'
netlify api restoreSiteDeploy --data '{"site_id": "<SITE_ID>", "deploy_id": "<DEPLOY_ID>"}'
```

### Layer 2: Roll back the Convex backend

Convex does not have a one-click rollback in the dashboard. To redeploy an older version:

```bash
git checkout <good-commit-sha>
CONVEX_DEPLOY_KEY=<prod-key> npx convex deploy --prod
git checkout main
```

The `CONVEX_DEPLOY_KEY` is the same key set in Netlify environment variables. After this, push a fix commit to `main` and let the normal pipeline redeploy both Convex and the frontend together.

If the Convex function bug was introduced by a schema change (new table or field), you may also need to roll back the Supabase migration (see below).

### Layer 3: Roll back a Supabase migration

Migrations have no built-in undo. Two paths:

**Path A — Forward rollback (additive changes only)**

If the migration added columns, tables, or indexes without dropping or transforming data:

```bash
# Create a reverse migration file
cat > supabase/migrations/000XX_rollback_<description>.sql <<'SQL'
ALTER TABLE some_table DROP COLUMN IF EXISTS some_column;
SQL

# Apply via the normal path (push to main) or manually:
export SUPABASE_URL="..."
export SUPABASE_SERVICE_ROLE_KEY="..."
node scripts/supabase-migrations.mjs apply
```

**Path B — Restore from backup (destructive changes)**

If the migration dropped columns, truncated rows, or caused data corruption, follow the full procedure in `docs/backup-restore.md`. Key steps:

1. Take an immediate backup of the current (broken) state as a rollback point.
2. Restore the last clean backup.
3. Re-apply only the migrations up to (but not including) the broken one.
4. Update `SUPABASE_URL` in Convex if the restore target is a different host:
   ```bash
   npx convex env set SUPABASE_URL "postgresql://..."
   ```
5. Roll back the Netlify frontend to a commit that predates the broken migration.

### Full-stack rollback sequence

When a deploy breaks multiple layers at once, roll back in reverse order:

1. Roll back Netlify frontend (publish previous deploy).
2. Roll back Convex (redeploy from older commit).
3. Roll back Supabase migration if needed (forward migration or backup restore).

After each step, verify the corresponding layer is stable before proceeding to the next.

---

## Manual deploy (bypassing normal pipeline)

Use this when you need to apply migrations or deploy without pushing to `main` — for example, to recover from drift or to apply a hotfix to a branch deploy.

```bash
# Apply pending migrations manually
export SUPABASE_URL="..."
export SUPABASE_SERVICE_ROLE_KEY="..."
node scripts/supabase-migrations.mjs apply

# Deploy Convex manually
export CONVEX_DEPLOY_KEY="..."
npx convex deploy --prod

# Trigger Netlify build manually (via build hook)
curl -X POST -H "Content-Type: application/json" -d '{}' \
  "https://api.netlify.com/build_hooks/<HOOK_ID>"
```

Or trigger migrations only via workflow_dispatch in GitHub Actions:

Actions → Supabase Migrations → Run workflow → main.

---

## First-time environment bootstrap

When setting up a new environment (fresh Netlify site or new Postgres instance):

**1. Set GitHub Actions secrets** (Settings → Secrets and variables → Actions):
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `NETLIFY_BUILD_HOOK_URL`, `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`

**2. Set Convex environment variables:**
```bash
npx convex env set AUTH_RESEND_KEY re_...
npx convex env set SUPABASE_URL https://...
# (all variables listed in the Convex table above)
```

**3. Set Netlify environment variables** (Site settings → Environment variables):
`CONVEX_DEPLOY_KEY`, `SUPABASE_DB_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

**4. Disable auto-publish in Netlify** (Site settings → Build & deploy → Continuous deployment → Disable).

**5. If migrations were previously applied manually** (no tracking table yet):
```bash
export SUPABASE_DB_URL='postgresql://...'
node scripts/supabase-migrations.mjs mark 00001 00002 00003 ...  # list already-applied files
npm run migrations:apply
```

**6. Push to main** to trigger the full pipeline and confirm everything passes.

---

## Related documents

- `docs/RUNBOOK.md` — incident severity levels, first-response checklist, rollback decision tree, downtime communication templates, post-incident review.
- `docs/backup-restore.md` — automated backup pipeline, restore procedure, weekly drill.
- `DEPLOYMENT-CHECKLIST.md` — per-deploy sign-off checklist and deploy-failure alerting setup.
- `.env.example` — annotated list of all environment variables with `[netlify]` / `[convex]` tags.
