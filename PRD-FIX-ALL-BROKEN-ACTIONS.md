# PRD: Fix All Broken UI Actions

Critical bugs preventing user interaction with the application.

---

## Confirmed Bugs

### 1. Activities Page - CRASH
**Status:** Component crash on load
**Impact:** Page completely broken

### 2. DropdownMenu Components - NOT WORKING
**Locations:** 
- Documents page: "Z szablonu", "Filtruj wg typu", "Akcje grupowe"
- Documents table: "Open menu" row actions
- Likely all DropdownMenu instances across app

**Symptoms:**
- Button click → timeout
- No dropdown appears
- No console errors (just timeout)

### 3. Popover Components - NOT WORKING
**Locations:** Filter buttons, quick actions
**Symptoms:** Same as DropdownMenu

---

## Root Cause Hypothesis

**Possible causes:**
1. Missing Radix UI DialogContent/DialogTitle (console warnings)
2. DropdownMenu/Popover not properly wrapped in providers
3. Missing onClick handlers
4. Z-index issues (dropdowns render but invisible)
5. Event handler conflicts

---

## Implementation Plan

### 1. Fix Activities Page Crash

**File:** `src/routes/_app/_auth/dashboard/_layout.activities.index.tsx`

**Steps:**
- [ ] Check console error for specific crash line
- [ ] Fix undefined/null reference
- [ ] Add error boundary
- [ ] Verify page loads

### 2. Fix DropdownMenu Components

**Approach:** Test and fix all DropdownMenu instances

**Files to check:**
- `src/components/ui/dropdown-menu.tsx` (base component)
- `src/components/data-table/data-table-row-actions.tsx` (row actions)
- `src/routes/_app/_auth/dashboard/_layout.documents.index.tsx` (documents actions)

**Steps:**
- [ ] Verify DropdownMenu component exists and is correct
- [ ] Check if DropdownMenuTrigger works
- [ ] Test simple dropdown first
- [ ] Check z-index and positioning
- [ ] Fix all broken instances

### 3. Fix Popover Components

**Same approach as DropdownMenu**

**Files to check:**
- `src/components/ui/popover.tsx`
- All Popover usage locations

### 4. Fix DialogTitle Warnings

**Files:** All Dialog usages

**Warning:** `DialogContent requires a DialogTitle for accessibility`

**Steps:**
- [ ] Add VisuallyHidden DialogTitle where missing
- [ ] Or add visible titles
- [ ] Clear all console warnings

---

## Testing Strategy

### Manual Testing
For each page:
- [ ] Dashboard - load and verify
- [ ] Contacts - test all actions
- [ ] Companies - test all actions
- [ ] Leads - test all actions
- [ ] Activities - load page (currently crashes)
- [ ] Documents - test all dropdowns and row actions
- [ ] Products - test all actions

### Component Testing
- [ ] Test DropdownMenu in isolation
- [ ] Test Popover in isolation
- [ ] Test DataTable row actions

---

## Success Criteria

- [ ] Activities page loads without crash
- [ ] All dropdown menus open on click
- [ ] All popover menus open on click
- [ ] All row actions work
- [ ] No timeout errors
- [ ] No console errors related to our code
- [ ] All CRUD operations work from UI

---

## Priority

**CRITICAL** - Multiple core features non-functional

---

## Estimated Effort

- Activities fix: 30 min
- DropdownMenu fix: 1-2 hours
- Popover fix: 30 min
- Testing: 1 hour
- **Total: 3-4 hours**

---

## Notes

**Current State:**
- Login: ✅
- Dashboard: ✅
- Contacts: ✅
- Companies: ?
- Leads: ✅
- Activities: ❌ (crash)
- Documents: ❌ (actions broken)
- Products: ?
- Calendar: ✅

**Pattern:**
- List pages load
- Filter/action buttons don't work
- Row actions don't work
- Only "Add" buttons work
