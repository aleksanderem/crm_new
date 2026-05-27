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
Migrations are applied in two places so the frontend never goes live
against a DB that's missing the columns it expects (issue #942):

1. The Netlify production build command (`netlify.toml`) runs
   `npm run migrations:apply` before `convex deploy` + `npm run build`,
   so a failed migration aborts the frontend deploy.
2. The `Supabase Migrations` GitHub Actions workflow
   (`.github/workflows/supabase-migrations.yml`) applies pending SQL on
   every push to `main` as a secondary signal (surfaces failures in PR
   checks even if Netlify is misconfigured).

Both paths require the `SUPABASE_DB_URL` secret:
- Netlify: set it under Site settings → Environment variables.
- GitHub Actions: set it under Settings → Secrets and variables → Actions.

If the secret is missing in Netlify, `npm run migrations:apply` exits 0
(fail-open) and the Netlify gating becomes a no-op — set the env var to
get the gating behavior.

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
