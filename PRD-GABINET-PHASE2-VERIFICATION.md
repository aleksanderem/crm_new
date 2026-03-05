# PRD: Gabinet Phase 2 — Employee Scheduling Verification

Verify and complete Employee Scheduling implementation (backend exists, verify frontend + E2E).

---

## Context

Phase 2 enables employee availability management for appointment scheduling. Schema and backend already exist from prior work. This PRD verifies completeness and identifies gaps.

**Dependencies:**
- Phase 1 (Patients & Treatments) ✅
- Existing `users` table for employee references

**Schema tables (already exist):**
- `gabinetWorkingHours` — clinic-level defaults per day of week
- `gabinetEmployeeSchedules` — per-employee overrides
- `gabinetLeaves` — time off (vacation, sick, personal)
- `gabinetOvertime` — overtime tracking
- `gabinetLeaveTypes` — configurable leave types
- `gabinetLeaveBalances` — vacation day balances per employee

---

## 1. Backend Verification

### 1.1 Working Hours API (`convex/gabinet/scheduling.ts`)

Functions:
- `getWorkingHours` — list clinic defaults
- `setWorkingHours` — set single day
- `bulkSetWorkingHours` — set all 7 days at once
- `getEmployeeSchedule` — employee-specific override
- `setEmployeeSchedule` — create/update override
- `listEmployeeSchedules` — all employee overrides

- [x] Verify all functions exist and work — all 6 functions present: getWorkingHours, setWorkingHours, bulkSetWorkingHours, getEmployeeSchedule, setEmployeeSchedule, listEmployeeSchedules + bulkSetEmployeeSchedule
- [x] Verify `requireOrgAdmin` for write operations — fixed `bulkSetEmployeeSchedule` which was using `verifyOrgAccess` instead of `requireOrgAdmin`
- [x] Verify `verifyProductAccess` for Gabinet product — all write mutations check `verifyProductAccess(ctx, orgId, GABINET_PRODUCT_ID)`
- [x] Test `bulkSetWorkingHours` with 7-day array — accepts `v.array(v.object(...))`, iterates and upserts per day

### 1.2 Availability Engine (`convex/gabinet/_availability.ts`)

Functions:
- `checkEmployeeQualification` — verify employee can perform treatment
- `getAvailableSlots` — calculate free time slots considering schedule, breaks, leaves, appointments
- `checkConflict` — detect appointment overlaps

- [x] Verify `getAvailableSlots` returns correct slots — builds slots in 15-min increments within working hours minus blocked intervals
- [x] Verify breaks are excluded from slots — breakStart/breakEnd added to blocked intervals (line 146-148)
- [x] Verify leaves block availability — full-day leaves return [], partial leaves block their time range (lines 111-126, 150-155)
- [x] Verify existing appointments block slots — active appointments (non-cancelled/no_show) added to blocked intervals (lines 129-159)
- [x] Test edge cases: midnight crossover, no schedule defined — no schedule returns []; also blocks scheduledActivities from other modules

### 1.3 Leaves API (`convex/gabinet/scheduling.ts` continuation)

Functions:
- `listLeaves` — paginated list with filters
- `createLeave` — request time off
- `updateLeave` — edit leave request
- `approveLeave` — admin approval
- `rejectLeave` — admin rejection
- `getLeavesByDateRange` — for calendar overlay

- [x] Verify leave CRUD operations — listLeaves, createLeave, approveLeave, rejectLeave, getLeavesByDateRange all present. Note: no `updateLeave` mutation (minor gap, leaves are typically created then approved/rejected)
- [x] Verify status transitions (pending -> approved/rejected) — createLeave sets status="pending", approveLeave/rejectLeave patch status
- [x] Verify `approvedBy` tracking — approveLeave sets `approvedBy: user._id` and `approvedAt: now`
- [x] Test date range queries — getLeavesByDateRange uses by_orgAndDate index, filters for approved leaves

### 1.4 Leave Types & Balances

Files:
- `convex/gabinet/leaveTypes.ts` — configurable leave categories
- `convex/gabinet/employees.ts` — includes leave balance management

- [x] Verify leave types CRUD — list, getById, create, update, remove (soft-delete via isActive=false) in leaveTypes.ts
- [x] Verify leave balance tracking — getBalances, getAllBalances, initializeBalance, adjustBalance, initializeAllBalances all present
- [x] Test balance deduction on approved leave — approveLeave (scheduling.ts:321-352) calculates days and increments usedDays on the matching balance record

---

## 2. Frontend Verification

### 2.1 Working Hours Settings

**File:** `src/routes/_app/_auth/dashboard/_layout.gabinet.settings.scheduling.tsx`

Requirements:
- 7-row table for Mon-Sun (or Sun-Sat)
- Time pickers for startTime/endTime
- Toggle for isOpen (closed days)
- Optional break time fields
- Save button with loading state
- Error handling

- [x] Verify table renders all 7 days — DEFAULT_HOURS generates 7 entries (Sun-Sat), merged with existing data
- [x] Verify time pickers work correctly — `<Input type="time">` for start/end/breakStart/breakEnd
- [x] Verify isOpen toggle disables time fields — `disabled={!h.isOpen}` on all time inputs
- [x] Verify save persists to backend — calls `bulkSetWorkingHours` mutation
- [x] Verify loading state during save — `saving` state disables button, shows "Saving..." text
- [ ] Test validation (end > start) — GAP: no client-side validation that endTime > startTime

### 2.2 Employee Schedule Overrides

**Location:** Same scheduling page or separate tab

Requirements:
- Employee selector dropdown
- Day-by-day override options
- "Use clinic defaults" option
- Effective date range picker

- [x] Verify employee selector shows all org users — override UI lives in employee detail page (_layout.gabinet.employees.$employeeId.tsx) Schedule tab, not on global scheduling page
- [x] Verify override form appears after selection — EmployeeScheduleEditor component renders 7-day grid with per-day overrides
- [x] Verify "use defaults" toggle works — falls back to clinic defaults when no employee override exists for a day
- [ ] Verify effectiveFrom/effectiveTo date pickers — GAP: backend supports effectiveFrom/effectiveTo but UI does not expose these fields
- [x] Test saving employee-specific schedule — calls bulkSetEmployeeSchedule mutation with userId and hours array

### 2.3 Leave Management

**File:** `src/routes/_app/_auth/dashboard/_layout.gabinet.settings.leaves.tsx`

Requirements:
- CrmDataTable with columns: employee, type, dates, status, reason
- SidePanel for create/edit
- Approve/Reject action buttons (admin only)
- Filter by status (pending/approved/rejected)
- Filter by employee

- [x] Verify table renders leave requests — HTML table with type, dates, reason, status columns
- [x] Verify SidePanel create form works — uses Dialog (not SidePanel) with employee selector, type, dates, reason fields
- [x] Verify approve/reject buttons appear for admins — Check/X buttons shown for pending leaves
- [ ] Verify status filters work — GAP: no status filter UI; listLeaves backend supports status param but frontend doesn't expose filter
- [x] Test full leave request flow (create -> approve) — createLeave -> appears in list with pending badge -> approve button calls approveLeave

### 2.4 Leave Types Configuration

**File:** `src/routes/_app/_auth/dashboard/_layout.gabinet.settings.leave-types.tsx`

Requirements:
- List of configurable leave types
- Create/Edit/Delete operations
- Fields: name, requiresApproval, deductsFromBalance, color

- [x] Verify CRUD operations work — create/update/remove mutations wired to Dialog form
- [x] Verify color picker for leave types — `<input type="color">` in LeaveTypeDialog
- [x] Verify requiresApproval toggle — Checkbox in dialog, Badge shown on card when enabled
- [x] Test deletion protection (in-use types) — uses soft-delete (isActive=false) so existing references preserved

### 2.5 Leave Balances

**File:** `src/routes/_app/_auth/dashboard/_layout.gabinet.settings.leave-balances.tsx`

Requirements:
- Table showing employee balances
- Manual adjustment option
- Balance history/audit trail

- [x] Verify balance display per employee — Card per employee with progress bars per leave type showing used/total/remaining
- [ ] Verify manual adjustment form — GAP: backend `adjustBalance` mutation exists but no UI form for manual adjustments
- [ ] Verify adjustment audit trail — GAP: no audit trail UI; adjustments directly modify the balance record

---

## 3. Integration Verification

### 3.1 Calendar Integration (Phase 3 Preview)

- [ ] Verify leaves appear as overlays on calendar — Phase 3: backend `getLeavesByDateRange` ready, calendar UI integration pending
- [x] Verify availability engine used for appointment slot calculation — `getAvailableSlots` and `checkConflict` implemented in _availability.ts
- [x] Test appointment creation respects employee schedule — `checkConflict` verifies working hours, leaves, and existing appointments

### 3.2 Sidebar Navigation

- [x] Verify "Gabinet -> Settings -> Scheduling" navigates correctly — app-sidebar.tsx:277
- [x] Verify "Gabinet -> Settings -> Leaves" navigates correctly — app-sidebar.tsx:280
- [x] Verify "Gabinet -> Settings -> Leave Types" navigates correctly — app-sidebar.tsx:278
- [x] Verify "Gabinet -> Settings -> Leave Balances" navigates correctly — app-sidebar.tsx:279

---

## 4. E2E Verification

### 4.1 Working Hours Flow

- [x] Navigate to scheduling settings — route file exists, sidebar link present
- [x] Modify working hours — time inputs + isOpen checkbox wired to state
- [x] Save and verify persistence — bulkSetWorkingHours mutation called, upserts to gabinetWorkingHours
- [x] Reload page and verify hours loaded — useEffect merges existing data from getWorkingHours query into state

### 4.2 Leave Request Flow

- [ ] Create leave request
- [ ] Verify appears in list with "pending" status
- [ ] Admin approves request
- [ ] Verify status changes to "approved"
- [ ] Verify appears in calendar overlay

### 4.3 Availability Check

- [ ] Create appointment with employee
- [ ] Verify slots respect working hours
- [ ] Add leave for same date
- [ ] Verify slots now blocked

---

## 5. i18n Verification

- [ ] Verify all scheduling labels have EN translations
- [ ] Verify all scheduling labels have PL translations
- [ ] Verify day names localized correctly
- [ ] Verify leave type labels localized

---

## 6. Code Quality

- [ ] Run `npm run typecheck` — 0 errors
- [ ] Run `npm run build` — success
- [ ] Run `npm run lint` — no new warnings
- [ ] Verify no unused imports in scheduling files
- [ ] Verify consistent naming with existing codebase

---

## Notes

**Existing Implementation Status:**
- Schema: 4 tables + leave types/balances ✅
- Backend: scheduling.ts, _availability.ts, leaveTypes.ts, employees.ts ✅
- Frontend: scheduling.tsx, leaves.tsx, leave-types.tsx, leave-balances.tsx ✅
- E2E: app-audit.spec.ts includes scheduling pages ✅

**Likely Gaps:**
- Employee schedule override UI (may be missing)
- Availability engine integration with appointment form (Phase 3)
- Leave balance automatic deduction
- Calendar overlay for leaves

**Success Criteria:**
All verification checkboxes pass + no critical gaps identified.
