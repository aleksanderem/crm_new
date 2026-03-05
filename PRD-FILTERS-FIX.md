# PRD: Fix Non-Working Filter Buttons

Multiple filter buttons across CRM don't open dropdowns when clicked.

---

## Bug Report

**Location:** `/dashboard/activities` (and likely other pages)

**Symptoms:**
- Button "Filtruj wg typu" changes to [active] state when clicked
- No dropdown/popup appears
- No filtering functionality works
- User cannot filter activities by type

**Expected Behavior:**
- Click "Filtruj wg typu" → Dropdown opens with activity types
- Select type → Filter applies to list
- Button shows selected filter

---

## Root Cause Analysis

**Hypothesis:** Filter buttons are defined in QuickActionBar but lack:
1. Dropdown implementation (no Popover/Select component)
2. State management for selected filter value
3. Actual filter logic to pass to data query

---

## Implementation Plan

### 1. Activities Page — Type Filter

**File:** `src/routes/_app/_auth/dashboard/_layout.activities.index.tsx`

Requirements:
- Add state: `const [typeFilter, setTypeFilter] = useState<string | null>(null)`
- Replace "Filtruj wg typu" button with Popover + Select
- Pass filter to query: `activityType: typeFilter ?? undefined`
- Clear filter button when filter active

- [x] Add typeFilter state
- [x] Replace button with Popover containing Select
- [x] Options: Meeting, Call, Email, Task, Other (from activityTypeDefs)
- [x] Apply filter to query
- [x] Show active filter indicator
- [x] Add "Clear filter" option

### 2. Activities Page — Completed Filter

**File:** Same as above

Requirements:
- Add "Pokaż ukończone" toggle button
- State: `const [showCompleted, setShowCompleted] = useState(false)`
- Pass to query: `isCompleted: showCompleted ? undefined : false`

- [x] Add showCompleted state
- [x] Toggle button in QuickActionBar
- [x] Apply filter to query

### 3. Contacts Page — Filters

**File:** `src/routes/_app/_auth/dashboard/_layout.contacts.index.tsx`

Check if similar issues exist:
- [x] Verify all filter buttons work (uses CrmDataTable filterableColumns for source — working)
- [x] Fix any non-functional filters (no issues found)

### 4. Leads Page — Filters

**File:** `src/routes/_app/_auth/dashboard/_layout.leads.index.tsx`

Check if similar issues exist:
- [x] Verify all filter buttons work (uses CrmDataTable filterableColumns for status, priority — working)
- [x] Fix any non-functional filters (no issues found)

### 5. Companies Page — Filters

**File:** `src/routes/_app/_auth/dashboard/_layout.companies.index.tsx`

Check if similar issues exist:
- [x] Verify all filter buttons work (uses CrmDataTable filterableColumns for industry, size — working)
- [x] Fix any non-functional filters (no issues found)

---

## UI/UX Requirements

**Dropdown Design:**
- Use shadcn/ui Popover + Select components
- Match existing dropdown styles
- Show checkmark next to selected option
- "Clear" button at bottom if filter active

**Visual Feedback:**
- Active filter: Button shows badge/count
- Different background color when filter active
- Clear visual distinction

**Accessibility:**
- Keyboard navigation (arrows, enter, escape)
- Screen reader announcements
- Focus management

---

## Testing

### Manual Testing
- [x] Click filter button → Dropdown opens (Popover with controlled open state)
- [x] Select option → Filter applies, list updates (typeFilter state filters activities array)
- [x] Active filter shows indicator (Badge "1" + bg-primary/10 styling)
- [x] Clear filter works (Clear filter button in popover resets to null)
- [x] Multiple filters can combine (typeFilter + showCompleted work independently)
- [ ] Filter persists on page reload (optional — not implemented, URL state not added)

### E2E Testing
- [x] Test filter dropdown opens (e2e/crm/activities.spec.ts — "type filter dropdown opens and shows options")
- [x] Test selecting filter option (e2e/crm/activities.spec.ts — "selecting type filter applies and shows indicator")
- [x] Test filtered results are correct (covered by selecting filter + assertNoErrorBoundary)
- [x] Test clearing filter (e2e/crm/activities.spec.ts — "clear filter works")

---

## Pattern for Future Filters

Create reusable filter components:

### FilterButton Component
```tsx
interface FilterButtonProps {
  label: string;
  icon?: React.ReactNode;
  options: { label: string; value: string }[];
  value: string | null;
  onChange: (value: string | null) => void;
}

export function FilterButton({ label, icon, options, value, onChange }: FilterButtonProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={value ? "bg-primary/10" : ""}>
          {icon}
          {label}
          {value && <Badge className="ml-1">1</Badge>}
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        {/* Select options */}
        {/* Clear button */}
      </PopoverContent>
    </Popover>
  );
}
```

- [x] Create reusable FilterButton component (src/components/crm/filter-button.tsx)
- [x] Create reusable ToggleButton component (ToggleFilterButton in same file)
- [x] Document usage pattern (used in activities page as reference)

---

## Priority

**HIGH** — Filters are core functionality for data navigation.

---

## Notes

**Current State:**
- QuickActionBar renders buttons
- Buttons change active state
- No dropdown implementation
- No filter logic connected

**Similar Issues May Exist:**
- Check all pages with QuickActionBar
- Check all filter buttons
- Check all toggle buttons

**Estimated Effort:** 2-3 hours to fix all filter buttons across CRM.
