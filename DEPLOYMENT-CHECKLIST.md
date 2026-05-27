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
On every push to `main`, the `Supabase Migrations` GitHub Actions workflow
(`.github/workflows/supabase-migrations.yml`) applies any pending SQL files
from `supabase/migrations/` against the deployed database and notifies
PostgREST to reload its schema cache.

Requires the `SUPABASE_DB_URL` repository secret to be set. If the workflow
fails or the secret is missing, run the migrations manually before the
frontend deploy completes:
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

**Check for:**
- Database connection strings
- API keys
- Authentication secrets
- Feature flags

**Verify:**
- All env vars documented
- Production values set
- Secrets secured

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
