# DEPLOYMENT CHECKLIST - CRM Application

**Date:** 2026-03-05 13:06
**Status:** ✅ READY FOR DEPLOYMENT

---

## Pre-Deployment Verification

### ✅ Code Quality
- [x] Typecheck passes (0 errors, 1 warning)
- [x] Build succeeds
- [x] No new lint warnings
- [x] Git commits clean

### ✅ Functionality Testing
- [x] All pages load without errors
- [x] Zero console errors (application code)
- [x] Sidebar navigation works
- [x] Filter dropdowns work (Activities, Documents)
- [x] Import/Export CSV works
- [x] Quick-create buttons work

### ✅ Browser Compatibility
- [x] Chrome/Chromium (tested via Playwright)
- [ ] Firefox (not tested)
- [ ] Safari (not tested)
- [ ] Edge (not tested)

### ✅ Mobile Responsiveness
- [x] Responsive layout verified
- [ ] Touch interactions (not tested)
- [ ] Mobile-specific UI (not tested)

---

## Pages Tested ✅

### CRM Module
1. ✅ Login (`/login`)
2. ✅ Dashboard (`/dashboard`)
3. ✅ Contacts (`/dashboard/contacts`)
4. ✅ Companies (`/dashboard/companies`)
5. ✅ Leads (`/dashboard/leads`)
6. ✅ Products (`/dashboard/products`)
7. ✅ Activities (`/dashboard/activities`)
8. ✅ Documents (`/dashboard/documents`)
9. ✅ Calendar (`/dashboard/calendar`)

### Gabinet Module
10. ✅ Patients (`/dashboard/gabinet/patients`)
11. ✅ Treatments (`/dashboard/gabinet/treatments`)
12. ✅ Calendar (`/dashboard/gabinet/calendar`)
13. ✅ Packages (`/dashboard/gabinet/packages`)

### Settings
14. ✅ General (`/dashboard/settings`)
15. ✅ Team (`/dashboard/settings/team`)

**Total Pages Tested:** 15
**Pages with Errors:** 0
**Success Rate:** 100%

---

## Known Limitations

### Minor Issues (Non-blocking)
1. **"Akcje grupowe"** in Documents — placeholder, not implemented
2. **Row actions** ("Open menu") — not tested via automation
3. **Typecheck warning** — 1 unused variable (Documents)

### Future Enhancements (Optional)
- Migrate more pages to SidebarFilterAction
- Implement bulk actions
- Add more filter options
- Performance optimization

---

## Deployment Steps

### 1. Pre-Deploy
```bash
# Verify build
npm run build

# Run typecheck
npm run typecheck

# Run tests (if available)
npm run test

# Check for secrets/env vars
grep -r "process.env" src/
```

### 2. Build & Deploy
```bash
# Production build
npm run build

# Deploy to hosting (example)
# - Vercel: vercel --prod
# - Netlify: netlify deploy --prod
# - Custom: rsync -avz dist/ user@server:/path
```

### 2a. Apply Supabase Migrations
Production deploys are gated through the `Supabase Migrations` GitHub
Actions workflow (`.github/workflows/supabase-migrations.yml`). On push
to `main` it runs two jobs in order (#951):

1. `apply` — runs `node scripts/supabase-migrations.mjs apply` against
   the deployed Postgres, failing the workflow if any migration can't
   be applied.
2. `deploy` — `needs: apply`, POSTs to the Netlify build hook so the
   frontend deploy only starts after migrations succeed.

The Netlify production build command (`netlify.toml`) also runs
`npm run migrations:apply` before `convex deploy` + `npm run build`,
as defense-in-depth — if a deploy is triggered some other way (manual
re-deploy in Netlify UI, build hook fired by hand), the build will
still abort on a failed migration.

Required secrets:
- `SUPABASE_DB_URL` — set in BOTH GitHub Actions
  (Settings → Secrets and variables → Actions) and Netlify
  (Site settings → Environment variables).
- `NETLIFY_BUILD_HOOK_URL` — set as a GitHub Actions secret; the URL
  comes from Netlify (Site settings → Build & deploy → Build hooks →
  Add build hook, branch = `main`).

Required Netlify UI setup (one-time, do this when adding the hook):
- Disable continuous deployment / auto-publish in Netlify
  (Site settings → Build & deploy → Continuous deployment). Otherwise
  Netlify keeps deploying in parallel on every push and the gating in
  GitHub Actions becomes advisory only.

If `NETLIFY_BUILD_HOOK_URL` is missing the `deploy` job exits 0 with a
warning, so the workflow is safe to run before the Netlify-side setup
is complete. If `SUPABASE_DB_URL` is missing in Netlify, the in-build
migration step exits 0 (fail-open) and only the GHA workflow gates
schema drift.

If both fail, run the migrations manually before the frontend deploy
completes:
```bash
export SUPABASE_DB_URL='postgresql://...'
npm run migrations:apply
```

First-time bootstrap (one-off): the deployed database already has some
migrations applied manually but no tracking table yet. Record those as
applied before the first automated run so they aren't re-executed:
```bash
export SUPABASE_DB_URL='postgresql://...'
node scripts/supabase-migrations.mjs mark 00001 00002 00003 00004
# then apply whatever is actually pending:
npm run migrations:apply
```

### 3. Post-Deploy Verification
- [ ] Login works on production
- [ ] All pages load
- [ ] No console errors
- [ ] Data operations work (create, read, update, delete)
- [ ] Import/Export works
- [ ] Filter dropdowns work

### 4. Monitoring
- [ ] Set up error tracking (Sentry, LogRocket, etc.)
- [ ] Monitor performance (Lighthouse, WebPageTest)
- [ ] Check analytics (Google Analytics, Plausible, etc.)

### 5. Deploy-Failure Alerting (Netlify)

Background: After commit `10773a1` (#1015), `npx convex deploy` inside the
Netlify build started failing on a Convex TypeScript error. Every subsequent
push to `main` produced a failed Netlify build for ~24h, but no one noticed
until a user reported a missing Convex function (#1119). The frontend stayed
on the last successful deploy; any backend functions added after `10773a1`
were silently absent from production. Root cause was a type error (fixed in
#1135) and missing convex typecheck in CI (tracked in #1136). This section
addresses the third gap: nobody was watching Netlify build status.

Verification checklist (one-time, then re-verify after any Netlify org / member
change):

- [ ] Open Netlify → Site settings → Build & deploy → Deploy notifications.
- [ ] Confirm at least one notification exists for "Deploy failed" pointing at
      a channel that is actively monitored by a human. Acceptable channels:
      - Email to a real maintainer (NOT a shared inbox no one reads)
      - Slack incoming webhook posted into a channel the team watches
      - GitHub commit status (so failed deploys mark the commit red on the PR
        / `main` history)
      - Outgoing webhook into an existing alerting pipeline
- [ ] Confirm at least one notification exists for "Deploy succeeded" OR rely
      on the GitHub commit status above, so the absence of a green check on a
      recent merge to `main` is itself a signal something is wrong.
- [ ] Trigger a deliberately-failing deploy on a throwaway branch (e.g. push
      a commit that introduces a TypeScript error in `convex/`) and confirm
      the notification actually reaches the channel. Then revert.
- [ ] Document the chosen channel(s) here in this file so the next person
      to onboard knows where to look:
      - Channel(s) in use: _TBD — fill in when configured_
      - Owner / on-call: _TBD_

In-repo safety nets (already in place or planned):

- `.github/workflows/supabase-migrations.yml` POSTs to a Netlify build hook
  after migrations succeed, but does NOT poll the resulting Netlify deploy
  status. A failed build there will not surface as a failed GitHub Actions
  run. The Netlify dashboard / notification config is currently the only
  signal — see #1137.
- Convex backend typecheck in CI (#1136) catches the most common class of
  Netlify build failures (Convex push aborting on type errors) BEFORE the
  push to `main` ever reaches Netlify.

---

## Environment Variables Required

Production env vars are split across two surfaces — Netlify (build-time +
frontend bundle) and Convex (runtime backend). See `.env.example` for the
full list with per-var `# [netlify]` / `# [convex]` annotations.

### Netlify (Site settings → Environment variables)

Required for the production build command in `netlify.toml`
(`npm run migrations:apply && npx convex deploy --cmd 'npm run build'`):

- `CONVEX_DEPLOY_KEY` — production deploy key from the Convex dashboard;
  without it `convex deploy` fails.
- `SUPABASE_DB_URL` — Postgres connection string used by
  `scripts/supabase-migrations.mjs` to apply pending SQL before the
  frontend goes live. Without it the migration step exits 0 (fail-open)
  and only the GitHub Actions workflow gates schema drift — see #942.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — baked into the
  static bundle by Vite; the runtime supabase-js client cannot start
  without them.
- `VITE_CONVEX_URL` — only set manually if you are not running
  `convex deploy` in the build command. With the current `netlify.toml`
  the Convex CLI injects this for you.

### Convex (`npx convex env set NAME value` against the prod deployment)

Backend runtime secrets — NOT set in Netlify:

- Auth: `AUTH_RESEND_KEY`, `AUTH_EMAIL`, `HOST_URL`, `SITE_URL`, `CONVEX_SITE_URL`
- Email: `RESEND_API_KEY`, `RESEND_FROM`
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- Google OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- Supabase server-side: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`
- `APP_URL`

`SUPABASE_URL` is the one var that must be set in BOTH Netlify (so the
migration script can find the DB host) and Convex (so functions can read
from it at runtime).

### GitHub Actions (Settings → Secrets and variables → Actions)

- `SUPABASE_DB_URL` — same Postgres connection string as in Netlify;
  used by the `apply` job in `supabase-migrations.yml` to run pending
  migrations against the deployed DB on every push to `main`.
- `NETLIFY_BUILD_HOOK_URL` — Netlify build hook URL (`main` branch);
  the workflow POSTs to this after migrations succeed, gating the
  Netlify deploy on the migration step. See #951.

---

## Rollback Plan

**If deployment fails:**
1. Revert to previous commit
2. Redeploy previous version
3. Investigate issue in staging
4. Fix and redeploy

**Rollback command:**
```bash
git revert HEAD
npm run build
# redeploy
```

---

## Success Criteria

✅ **All criteria met:**
- [x] Zero application crashes
- [x] All pages load
- [x] Core features work
- [x] Typecheck clean
- [x] Build succeeds
- [x] No blocking bugs

---

## Sign-Off

**Development:** ✅ Complete
**Testing:** ✅ Complete
**Code Review:** ⚠️ Pending (Alex review)
**Deployment:** ⚠️ Pending (Alex approval)

**Ready for:** Production deployment

**Next:** Alex final review → Deploy → Monitor
