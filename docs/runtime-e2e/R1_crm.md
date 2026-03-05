# R1 CRM Runtime E2E Report

Date: 2026-03-05T00:44:41.657Z
Worker: R1 (runtime-crm)
Env: localhost:5173, Convex cloud: helpful-mule-867
User: amiesak@gmail.com

## Summary

| Metric | Count |
|--------|-------|
| PASS | 15 |
| FAIL | 0 |
| SKIP | 0 |
| Total | 15 |

## Results

| Flow | Step | Status | Detail | Duration |
|------|------|--------|--------|----------|
| Auth | Login | PASS | Post-login URL: http://localhost:5173/dashboard | 5698ms |
| Leads | Navigate to list | PASS | URL: http://localhost:5173/dashboard/leads | 2553ms |
| Leads | List renders | PASS | Table visible | 27ms |
| Leads | Create lead | PASS | Created: E2E-Lead-1772671460067 | 6016ms |
| Leads | View detail | PASS | Detail URL: http://localhost:5173/dashboard/leads/kn74yrked9f6hb5k43ea2bthm182bj | 4588ms |
| Activities | Navigate to list | PASS | URL: http://localhost:5173/dashboard/activities | 1681ms |
| Activities | List renders | PASS | Activity content present | 15ms |
| Activities | Create activity | PASS | Created: E2E-Activity-1772671472861 | 6517ms |
| Calendar | Navigate to calendar | PASS | URL: http://localhost:5173/dashboard/calendar?filter=all | 2362ms |
| Calendar | Calendar renders | PASS | Calendar content visible | 19ms |
| Calendar | No error boundary | PASS | No errors | 4ms |
| Documents | Navigate to list | PASS | URL: http://localhost:5173/dashboard/documents | 2461ms |
| Documents | Page renders | PASS | Documents page content present | 18ms |
| Documents | Upload button available | PASS | Upload button visible | 6ms |
| Overall | Console errors | PASS | No critical console errors | 0ms |

## Convex Data Verification Commands

```bash
# Check leads
npx convex data leads

# Check scheduled activities
npx convex data scheduledActivities --limit 10

# Check documents
npx convex data documents

# Check calendar entries
npx convex data scheduledActivities --limit 5
```
