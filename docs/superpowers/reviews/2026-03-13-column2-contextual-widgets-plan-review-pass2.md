# Plan Review -- Pass 2

## Verdict: APPROVED

All critical and important issues from pass 1 have been resolved. The plan is ready for implementation.

---

### Pass 1 Issue Resolution Summary

C1 (gabinetAppointments numeric timestamps): FIXED. All Gabinet queries now use `todayStr = new Date().toISOString().split("T")[0]` and compare against `a.date === todayStr`. Task 17 getDayAgenda correctly filters `a.date === args.date` and sorts via `a.startTime.localeCompare(b.startTime)`.

C2 (NudgeData import before file exists): FIXED. Task 6 (line 770) creates `convex/nudges.ts` with `NudgeData` export. Task 10 (line 1492) imports it. Ordering is correct.

C3 (by_template index not yet in schema): FIXED. Task 1 adds `templateId` and `by_template` index to emails. Header note at line 19 explicitly states Task 1 must complete before Tasks 5+. The `getEmailTemplatesKpis` query (line 716) now uses `by_org` index and filters `e.templateId != null` in memory, which works regardless of whether the `by_template` index is used directly.

I1 (i18n file paths): FIXED. Task 18 (line 2571) correctly references `public/locales/pl/translation.json` and `public/locales/en/translation.json`.

I4 (Task 13 wrong scheduledActivities fields): FIXED. `getUpcomingEvents` (line 1992) now uses `a.ownerId`, `a.dueDate`, `a.isCompleted`, and `a.activityType`.

I5 (Task 17 Create vs Modify): FIXED. Task 17 (line 2355) says `Modify: convex/gabinet/sidebarWidgets.ts`.

---

### Remaining minor observations (non-blocking)

S1. The tab count still reads "19 CRM + Gabinet tabs" (line 5) and "11 CRM + 8 Gabinet" (line 2643). The spec defines 12 CRM tabs (including Settings, which has no widgets) and 8 Gabinet tabs. The plan correctly skips Settings, so 11 + 8 = 19 is accurate for tabs that receive widgets. Consistent and intentional -- no action needed.

S2. Loading states (pass 1 I6) remain unaddressed -- components return `null` when queries are loading. This is acceptable for a sidebar widget context where a brief flash of empty space is tolerable, but implementers should be aware they can add skeleton states later if needed.

S3. Recharts is confirmed installed (`"recharts": "^2.15.4"` in package.json). No action needed.

S4. The `getInsightsNudges` query (lines 810-815) correctly queries `scheduledActivities` (not `activities`) for overdue check, using `a.dueDate` and `a.isCompleted`. The `getActivitiesNudges` (line 918) and `getCalendarNudges` (line 962) also correctly use `scheduledActivities` with `ownerId`, `dueDate`, and `isCompleted`.

S5. The barrel file `src/components/sidebar-widgets/index.ts` is created in Task 3 (line 171) and updated in Task 12 Step 7 (line 1959). Ordering is correct.

---

### Verification Checklist

1. Schema correctness:
   - [x] gabinetAppointments: string date/startTime comparison throughout
   - [x] gabinetLeaves: string startDate/endDate comparison (todayStr)
   - [x] scheduledActivities: ownerId, dueDate, isCompleted, activityType used correctly
   - [x] activities table: not queried for task-like operations
   - [x] emails.templateId: added in Task 1, dependency documented
   - [x] calls.duration: added in Task 1

2. File actions:
   - [x] convex/sidebarWidgets.ts: Create in T5, Modify in T13
   - [x] convex/gabinet/sidebarWidgets.ts: Create in T9, Modify in T17
   - [x] i18n files: correct public/locales/ paths

3. Cross-task dependencies:
   - [x] T1 (schema) before T5 (queries using new indexes)
   - [x] T5 (sidebarWidgets.ts) before T13 (getUpcomingEvents)
   - [x] T6 (NudgeData) before T10 (imports it)
   - [x] T9 (gabinet sidebarWidgets) before T17 (getDayAgenda)
   - [x] T1 (recentlyViewed table) before T15 (backend)

4. Code quality:
   - [x] No remaining `assignedTo` references
   - [x] No remaining `a.type` references (all use `activityType`)
   - [x] No `src/locales` references
   - [x] `by_orgAndStatus` index on leads confirmed at schema line 575
   - [x] All queries use verifyOrgAccess pattern
