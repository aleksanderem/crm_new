# Secrets Inventory & Rotation Runbook

This document is the single source of truth for every secret the platform uses. It covers where each secret lives, how to update it, and the recommended rotation schedule. Update this file whenever a secret is added, removed, or renamed.

---

## Secret surfaces

Secrets live in exactly three places. Never put a secret anywhere else (not in code comments, docs, screenshots, or AI-generated artifacts).

| Surface | How to set | When used |
|---------|-----------|-----------|
| **GitHub Actions secrets** | Repo → Settings → Secrets and variables → Actions | CI/CD workflows (migrations, backup, deploy trigger) |
| **Netlify environment variables** | Site settings → Environment variables | Netlify build command + Vite bundle bake-in |
| **Convex environment variables** | `npx convex env set NAME value` against the target deployment | Convex function runtime |

Secrets marked `[netlify+convex]` in `.env.example` must be set in both Netlify **and** Convex — the build script reads them via Node at build time and Convex functions read them at runtime.

---

## Full secret inventory

### Auth & email

| Secret | Platform(s) | Purpose | Rotation |
|--------|------------|---------|----------|
| `AUTH_RESEND_KEY` | Convex | Resend API key for auth transactional emails | 180 days |
| `AUTH_EMAIL` | Convex | From address for auth emails | Change only |
| `HOST_URL` | Convex | Base host URL (used in email links) | Change only |
| `SITE_URL` | Convex | Public site URL | Change only |
| `RESEND_API_KEY` | Convex | Resend API key for all other transactional email | 180 days |
| `RESEND_FROM` | Convex | Default from address for transactional email | Change only |
| `APP_URL` | Convex | Application URL | Change only |

### Stripe

| Secret | Platform(s) | Purpose | Rotation |
|--------|------------|---------|----------|
| `STRIPE_SECRET_KEY` | Convex | Stripe API key for billing operations | 180 days or on compromise |
| `STRIPE_WEBHOOK_SECRET` | Convex | Stripe webhook endpoint signing secret | On webhook endpoint change |

### Google OAuth

| Secret | Platform(s) | Purpose | Rotation |
|--------|------------|---------|----------|
| `GOOGLE_CLIENT_ID` | Convex | Google OAuth client ID | On project change |
| `GOOGLE_CLIENT_SECRET` | Convex | Google OAuth client secret | 180 days |
| `GOOGLE_REDIRECT_URI` | Convex | Google OAuth redirect URI | Change only |

### Supabase / database

| Secret | Platform(s) | Purpose | Rotation |
|--------|------------|---------|----------|
| `SUPABASE_URL` | Netlify + Convex + GitHub | Supabase base URL | Change only |
| `SUPABASE_DB_URL` | Netlify + GitHub | Postgres connection string — migration scripts + psql backup transport | 90 days |
| `SUPABASE_ANON_KEY` | Convex | Supabase anon key (signed JWT, no expiry by default) | 90 days |
| `SUPABASE_SERVICE_ROLE_KEY` | Convex + GitHub | Supabase service role key — full DB bypass | 90 days |
| `SUPABASE_JWT_SECRET` | Convex | JWT signing secret (used to mint Supabase tokens from Convex) | 90 days |
| `VITE_SUPABASE_URL` | Netlify | Supabase URL baked into the Vite bundle | Change only |
| `VITE_SUPABASE_ANON_KEY` | Netlify | Supabase anon key baked into the Vite bundle | Same as `SUPABASE_ANON_KEY` |

> Rotating `SUPABASE_JWT_SECRET` invalidates all existing Supabase tokens. Users will be logged out. Plan for a maintenance window or accept a brief auth disruption.

### Convex deployment

| Secret | Platform(s) | Purpose | Rotation |
|--------|------------|---------|----------|
| `CONVEX_DEPLOY_KEY` | Netlify | Convex production deploy key (used by `npx convex deploy` during build) | 90 days |
| `CONVEX_SITE_URL` | Convex | Convex site URL (HTTP actions endpoint) | Change only |

### Netlify / deploy pipeline

| Secret | Platform(s) | Purpose | Rotation |
|--------|------------|---------|----------|
| `NETLIFY_BUILD_HOOK_URL` | GitHub | Netlify build hook URL — triggers production deploy after migrations gate | On hook rotation |
| `NETLIFY_AUTH_TOKEN` | GitHub | Netlify personal access token — polls deploy status after trigger | 90 days |
| `NETLIFY_SITE_ID` | GitHub | Netlify site UUID — pairs with auth token for deploy polling | Change only |

### Sentry

| Secret | Platform(s) | Purpose | Rotation |
|--------|------------|---------|----------|
| `VITE_SENTRY_DSN` | Netlify | Sentry DSN baked into bundle for error reporting | Change only |
| `SENTRY_AUTH_TOKEN` | Netlify | Sentry token for source map upload during build | 180 days |
| `SENTRY_ORG` | Netlify | Sentry organisation slug | Change only |
| `SENTRY_PROJECT` | Netlify | Sentry project slug | Change only |

### Backup (GitHub Actions only)

| Secret | Platform(s) | Purpose | Rotation |
|--------|------------|---------|----------|
| `BACKUP_ENCRYPTION_KEY` | GitHub | AES-256-CBC passphrase for encrypted Postgres dumps | 180 days — see note below |
| `BACKUP_S3_BUCKET` | GitHub | S3 bucket name for backup storage (not secret but lives here) | Change only |
| `BACKUP_AWS_ACCESS_KEY_ID` | GitHub | AWS / S3-compatible access key for backup storage | 90 days |
| `BACKUP_AWS_SECRET_ACCESS_KEY` | GitHub | AWS / S3-compatible secret key for backup storage | 90 days |
| `BACKUP_AWS_ENDPOINT_URL` | GitHub | Optional S3 endpoint override (Backblaze B2, MinIO…) | Change only |
| `BACKUP_AWS_DEFAULT_REGION` | GitHub | Optional S3 region override (default `us-east-1`) | Change only |
| `BACKUP_RETENTION_DAYS` | GitHub | Optional retention override for cleanup job | Change only |

> Rotating `BACKUP_ENCRYPTION_KEY` means **older backups can no longer be decrypted with the new key**. Before rotating: download all backups that may be needed for a restore, decrypt them with the old key, and re-encrypt with the new key. Update the weekly restore drill to verify the latest post-rotation backup decrypts successfully.

---

## Rotation procedures

### GitHub Actions secret

```bash
# Via the GitHub web UI:
# Repo → Settings → Secrets and variables → Actions → (secret name) → Update

# Via the GitHub CLI:
gh secret set SECRET_NAME --body "new-value"
```

After updating a GitHub secret that a scheduled workflow reads (e.g. `BACKUP_ENCRYPTION_KEY`, `SUPABASE_DB_URL`), manually trigger the relevant workflow via `Actions → (workflow) → Run workflow` to confirm the new value works before the next scheduled run.

### Netlify environment variable

```
Site settings → Environment variables → (variable name) → Edit
```

After saving, trigger a new deploy via the Netlify dashboard or by pushing a commit to `main` (the GitHub Actions `Supabase Migrations` workflow triggers Netlify automatically on every push to `main`).

### Convex environment variable

```bash
# Target the production deployment (run from repo root):
npx convex env set SECRET_NAME "new-value"

# List all current Convex environment variables:
npx convex env ls
```

Convex hot-reloads environment variables without a redeploy for most secrets. Secrets used in scheduled jobs or HTTP actions take effect on the next invocation.

### Supabase credentials (ANON_KEY, SERVICE_ROLE_KEY, JWT_SECRET)

1. In the Supabase dashboard go to **Project Settings → API**.
2. Rotate the key or generate a new JWT secret.
3. Update **all** surfaces that hold a copy (see table above — Convex, Netlify, GitHub as applicable).
4. For `SUPABASE_JWT_SECRET`: update Convex, then deploy. Existing tokens expire; users will need to re-authenticate.
5. Verify migrations still apply: `node scripts/supabase-migrations.mjs check` (uses `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`).

---

## Rotation schedule

| Frequency | Secrets |
|-----------|---------|
| **90 days** | `SUPABASE_DB_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `CONVEX_DEPLOY_KEY`, `NETLIFY_AUTH_TOKEN`, `BACKUP_AWS_ACCESS_KEY_ID`, `BACKUP_AWS_SECRET_ACCESS_KEY` |
| **180 days** | `AUTH_RESEND_KEY`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `GOOGLE_CLIENT_SECRET`, `SENTRY_AUTH_TOKEN`, `BACKUP_ENCRYPTION_KEY` |
| **On personnel change** | Everything in the 90-day tier, plus `STRIPE_SECRET_KEY`, `GOOGLE_CLIENT_SECRET` |
| **On compromise** | Rotate immediately, treat as P1 incident (see `docs/RUNBOOK.md`) |

Add a calendar reminder for each tier on the day you first set the secrets. A compromised secret that is rotated on schedule is contained; an unrotated secret that is compromised is a breach.

---

## Automated checks

Three automated layers guard against leaked secrets:

**Pre-commit hook (first line of defence)** — installed via [lefthook](https://github.com/evilmartians/lefthook) when you run `npm install`. Runs `gitleaks protect --staged` before every commit, blocking secrets from ever reaching git history. Requires gitleaks to be installed locally (`brew install gitleaks`); warns and passes if gitleaks is not found rather than blocking unrelated work.

**`secrets-health.yml`** — runs daily at 07:00 UTC. Verifies that at least one migration transport (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, or `SUPABASE_DB_URL`) is set in GitHub secrets. Fails loudly if both transports are absent.

**`secret-scan.yml`** — runs on every push to `main`, every PR, and weekly on Sunday. Scans the full git history with [gitleaks](https://github.com/gitleaks/gitleaks) to detect accidentally committed secrets. Results appear in the Actions tab under "Secret scan (gitleaks)". A failure means a secret pattern was found in history — see "Git history leak response" below.

### Pre-commit hook

The hook is managed by `lefthook` (declared in `devDependencies`) and wired into the `prepare` npm lifecycle script so it installs automatically:

```bash
npm install          # installs dependencies and runs lefthook install
# — or, to install/reinstall the hook manually —
npx lefthook install
```

If gitleaks flags a false positive in your staged files, add an entry to `.gitleaksignore` at the repo root (created if it does not exist):

```bash
# Show the fingerprint gitleaks printed:
gitleaks protect --staged --verbose
# Copy the "Fingerprint" value and append it:
echo "<fingerprint>" >> .gitleaksignore
git add .gitleaksignore
```

Never bypass the hook with `git commit --no-verify` unless you have confirmed the detection is a false positive and have filed a `.gitleaksignore` entry.

---

## Git history leak response

If `secret-scan.yml` flags a real secret in git history:

1. **Rotate the secret immediately.** Treat the leaked value as compromised even if the repo is private — repository access can change.
2. **Identify the commit** from the gitleaks output (`git show <sha>`).
3. **Assess exposure window.** When was it committed? Who has cloned the repo since?
4. **Remove from history** using `git filter-repo` (or BFG Repo Cleaner) and force-push to all branches. Coordinate with anyone who has cloned the repo — they must re-clone or `git fetch --force`.
5. **File a post-mortem** in `docs/post-mortems/` following the template in `docs/RUNBOOK.md`.

To run gitleaks locally before pushing:

```bash
# Install (macOS):
brew install gitleaks

# Scan full history:
gitleaks detect --source . --log-level info

# Scan only uncommitted changes:
gitleaks protect --staged
```

---

## Local development

Copy `.env.example` to `.env.local` and fill in the values for your local Convex dev deployment. Never commit `.env.local` or any `.env.*` file other than `.env.example`. The `.gitignore` excludes `.env.*` (with `!.env.example`) and `*.bak` to prevent accidental commits.

Install gitleaks so the pre-commit hook (see above) can actively guard your commits:

```bash
brew install gitleaks   # macOS / Linux via Homebrew
```
