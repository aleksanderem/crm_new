# PRD: Comprehensive E2E Testing — Every Button, Every Flow

Complete E2E test coverage for all CRM + Gabinet features.

---

## Testing Philosophy

**Goal:** Every user-facing button, form, and data transformation tested via real browser automation.

**Not unit tests.** Real E2E with:
- Login as real user
- Click actual buttons
- Fill real forms
- Verify data persists
- Test cross-module integrations

---

## Test Structure

```
e2e/
├── auth.spec.ts — Login, logout, session
├── crm/
│   ├── contacts.spec.ts — Contact CRUD + search + filters
│   ├── companies.spec.ts — Company CRUD + relationships
│   ├── leads.spec.ts — Lead pipeline + stage transitions
│   ├── activities.spec.ts — Activity CRUD + calendar
│   ├── documents.spec.ts — Document upload + view
│   └── products.spec.ts — Product CRUD + search
├── gabinet/
│   ├── patients.spec.ts — Patient CRUD + search + medical data
│   ├── treatments.spec.ts — Treatment CRUD + categories
│   ├── scheduling.spec.ts — Working hours + employee schedules
│   ├── leaves.spec.ts — Leave request → approval flow
│   ├── appointments.spec.ts — Appointment booking + conflicts
│   ├── calendar.spec.ts — Day/week/month views + navigation
│   ├── packages.spec.ts — Package purchase + usage
│   ├── loyalty.spec.ts — Points earn/spend
│   ├── documents.spec.ts — Document creation + signing
│   └── portal.spec.ts — Patient portal auth + data access
├── settings/
│   ├── team.spec.ts — Invite + role changes + seat limits
│   ├── permissions.spec.ts — Permission gates + restrictions
│   └── custom-fields.spec.ts — Custom field CRUD
└── integrations/
    ├── quick-create.spec.ts — Quick-create modal all entity types
    ├── sidebar.spec.ts — Sidebar navigation + contextual actions
    └── search.spec.ts — Global search across entities
```

---

## 1. Auth Tests

### 1.1 Login Flow
- [x] Email + password login succeeds
- [x] Invalid password shows error
- [x] Non-existent user shows error
- [x] Login redirects to dashboard or onboarding

### 1.2 Session Management
- [x] Refresh preserves session
- [x] Logout clears session
- [x] Protected route redirects to login when not authenticated

### 1.3 Password Reset
- [ ] Request reset email sent
- [ ] Reset link works
- [ ] New password applied

---

## 2. CRM — Contacts

### 2.1 List View
- [x] Contacts list loads
- [x] Pagination works
- [x] Search by name filters results
- [x] Search by email filters results
- [x] Sort by name works
- [x] Sort by createdAt works
- [x] Saved views appear in dropdown
- [x] Create saved view works

### 2.2 Create Contact
- [x] SidePanel opens on create button click
- [x] Form validation shows errors for required fields
- [x] Submit creates contact
- [x] New contact appears in list
- [x] SidePanel closes after submit

### 2.3 Edit Contact
- [x] SidePanel opens with contact data
- [x] Changes persist after save
- [ ] List updates with new data

### 2.4 Delete Contact
- [x] Delete confirmation appears
- [x] Contact removed from list after confirm
- [x] Cancel keeps contact

### 2.5 Detail View
- [x] Detail page loads
- [x] All tabs render (Overview, Activities, Documents, Notes)
- [x] Edit button works
- [x] Related entities appear

---

## 3. CRM — Companies

### 3.1 List View
- [x] Companies list loads
- [x] Search filters results
- [x] Pagination works

### 3.2 CRUD Operations
- [x] Create company succeeds
- [x] Edit company persists changes
- [x] Delete company removes from list

### 3.3 Relationships
- [ ] Contacts appear in company detail
- [ ] Add contact to company works
- [ ] Remove contact from company works

---

## 4. CRM — Leads

### 4.1 Pipeline View
- [x] Pipeline loads with stages
- [x] Leads appear in correct stages
- [ ] Drag-and-drop moves leads between stages
- [ ] Stage change persists

### 4.2 Lead CRUD
- [x] Create lead succeeds
- [x] Edit lead persists
- [x] Delete lead removes

### 4.3 Stage Transitions
- [ ] Move lead forward works
- [ ] Move lead backward works
- [ ] Lost lead workflow works

---

## 5. CRM — Activities

### 5.1 List View
- [x] Activities list loads
- [x] Filters by type work
- [x] Filters by date work

### 5.2 Activity CRUD
- [x] Create activity succeeds
- [x] Complete activity changes status
- [x] Delete activity removes

### 5.3 Calendar Integration
- [x] Activities appear in calendar
- [x] Click activity opens detail

---

## 6. CRM — Documents

### 6.1 List View
- [x] Documents list loads
- [ ] Filters by type work

### 6.2 Upload Flow
- [ ] File upload succeeds
- [ ] Document appears in list
- [ ] Download works

---

## 7. CRM — Products

### 7.1 List View
- [x] Products list loads
- [x] Search filters results

### 7.2 Product CRUD
- [x] Create product succeeds
- [x] Edit product persists
- [x] Delete product removes

---

## 8. Gabinet — Patients

### 8.1 List View
- [x] Patients list loads
- [x] Search by name works
- [x] Search by email works
- [x] Filter by isActive works

### 8.2 Patient CRUD
- [x] Create patient with all fields succeeds
- [x] Edit patient persists changes
- [x] Soft-delete sets isActive=false
- [ ] Patient no longer appears in active list

### 8.3 Patient Detail
- [x] Detail page loads
- [ ] Overview tab shows all data
- [ ] Medical notes field editable
- [ ] Allergies field editable
- [ ] Emergency contact fields editable

### 8.4 Medical Data
- [x] PESEL validation works
- [ ] Date of birth picker works
- [ ] Gender selector works
- [ ] Blood type field saves

---

## 9. Gabinet — Treatments

### 9.1 List View
- [x] Treatments list loads
- [x] Filter by category works
- [x] Filter by isActive works

### 9.2 Treatment CRUD
- [x] Create treatment succeeds
- [ ] Color picker works
- [x] Duration in minutes saves
- [x] Price + currency saves
- [x] Edit treatment persists
- [x] Delete treatment soft-deletes

---

## 10. Gabinet — Scheduling

### 10.1 Working Hours
- [x] Scheduling page loads
- [x] 7-day table renders
- [x] Time pickers work for each day
- [x] isOpen toggle disables time fields
- [x] Break times save
- [x] Save button persists all changes
- [x] Reload shows saved hours

### 10.2 Employee Schedules
- [ ] Employee schedule override UI works
- [ ] Per-day overrides save
- [ ] "Use defaults" toggle works

---

## 11. Gabinet — Leaves

### 11.1 Leave Request Flow
- [x] Create leave request succeeds
- [x] Leave appears with "pending" status
- [x] Admin can approve
- [ ] Status changes to "approved"
- [x] Admin can reject
- [ ] Status changes to "rejected"

### 11.2 Leave Types
- [x] Leave types list loads
- [x] Create leave type succeeds
- [x] Color picker works
- [x] Delete leave type soft-deletes

### 11.3 Leave Balances
- [x] Balance display per employee
- [x] Progress bars show usage
- [x] Year filter works

---

## 12. Gabinet — Appointments

### 12.1 Appointment Creation
- [x] Calendar page loads
- [x] Click-to-create opens dialog
- [x] Patient search works
- [x] Treatment selector shows categories
- [x] Employee selector works
- [ ] Available slots load from backend
- [ ] Slot selection works
- [ ] Submit creates appointment
- [ ] Appointment appears in calendar

### 12.2 Recurring Appointments
- [x] Recurring toggle shows options
- [ ] Frequency selector works (daily/weekly/monthly)
- [ ] Count field works
- [ ] Until date picker works
- [ ] Submit creates series
- [ ] All instances appear in calendar

### 12.3 Conflict Detection
- [ ] Overlapping appointment shows warning
- [ ] Cannot create conflicting appointment

### 12.4 Status Transitions
- [ ] scheduled → confirmed works
- [ ] confirmed → in_progress works
- [ ] in_progress → completed works
- [ ] Cancel sets status + reason

---

## 13. Gabinet — Calendar

### 13.1 View Switching
- [x] Day view renders time grid
- [x] Week view renders 7 columns
- [x] Month view renders day cells
- [x] View switcher works

### 13.2 Navigation
- [x] Previous button works
- [x] Next button works
- [x] Today button works
- [ ] Date picker navigation works

### 13.3 Filters
- [x] Employee filter works
- [x] Filtered appointments only show

### 13.4 Appointment Display
- [ ] Appointments render with correct colors
- [x] Click appointment opens detail
- [x] Edit from detail works

---

## 14. Gabinet — Packages

### 14.1 Package CRUD
- [x] Packages list loads
- [x] Create package with treatments succeeds
- [x] Treatment quantities save
- [x] Total price calculates
- [x] Edit package persists
- [x] Delete package soft-deletes

### 14.2 Package Purchase
- [ ] Purchase creates usage record
- [ ] Patient packages list shows active
- [ ] Progress bar shows used/total
- [ ] Expiration date displays

### 14.3 Package Usage
- [ ] Link appointment to package works
- [ ] Complete appointment deducts from package
- [ ] Usage count updates

---

## 15. Gabinet — Loyalty

### 15.1 Points Flow
- [ ] Complete appointment awards points
- [x] Points balance updates
- [x] Transaction history shows
- [ ] Spend points succeeds
- [ ] Spend validates balance

### 15.2 Tiers
- [x] Tier displays based on points
- [ ] Tier upgrade happens at threshold

---

## 16. Gabinet — Documents

### 16.1 Template Management
- [x] Templates list loads
- [x] Create template succeeds
- [x] Placeholder insertion works
- [x] Edit template persists

### 16.2 Document Creation
- [x] Create from template works
- [ ] Placeholders render with patient data
- [ ] Rich text editor works

### 16.3 Signature Flow
- [x] Request signature changes status
- [x] Signature pad renders
- [ ] Drawing works (mouse)
- [ ] Drawing works (touch)
- [x] Clear button works
- [ ] Save signature works
- [ ] Status changes to "signed"

### 16.4 Document Actions
- [x] View signed document shows signature
- [ ] PDF download works
- [ ] Archive document works

---

## 17. Gabinet — Patient Portal

### 17.1 Authentication
- [ ] Email input sends OTP
- [ ] OTP input validates
- [ ] Successful login creates session
- [ ] Session persists across refresh
- [ ] Logout clears session

### 17.2 Portal Data Access
- [ ] Profile page shows patient data
- [ ] Appointments page shows patient's appointments
- [ ] Documents page shows patient's documents
- [ ] Packages page shows patient's packages
- [ ] Loyalty page shows patient's points
- [ ] No cross-patient data leakage

---

## 18. Settings — Team

### 18.1 Team Management
- [x] Team members list loads
- [x] Invite member succeeds
- [x] Role change persists
- [ ] Remove member works

### 18.2 Seat Limits
- [x] Seat usage displays
- [x] Progress bar shows usage
- [ ] Invite disabled at limit
- [x] Error message shows upgrade CTA
- [ ] Member removal frees seat

---

## 19. Settings — Permissions

### 19.1 Permission Gates
- [x] Non-admin cannot access admin routes
- [ ] Viewer cannot create entities
- [ ] Permission denied message shows

### 19.2 Role-Based UI
- [ ] Quick-create respects permissions
- [ ] Sidebar actions respect permissions
- [ ] Edit/delete buttons hide when not allowed

---

## 20. Integrations

### 20.1 Quick-Create Modal
- [x] Quick-create button in header works
- [x] All entity types appear in tabs
- [x] Contact form creates contact
- [x] Company form creates company
- [x] Lead form creates lead
- [x] Activity form creates activity
- [ ] Patient form creates patient
- [ ] Treatment form creates treatment
- [ ] Document form creates document

### 20.2 Sidebar Navigation
- [x] All sidebar items navigate correctly
- [x] Collapsible sections expand/collapse
- [x] Active item highlights
- [ ] Contextual actions change per page

### 20.3 Global Search
- [x] Search opens with shortcut
- [x] Search returns contacts
- [x] Search returns companies
- [x] Search returns leads
- [x] Search returns patients
- [x] Click result navigates to detail

---

## 21. Data Transformations

### 21.1 Date Formatting
- [ ] Dates display in correct locale
- [ ] Date pickers use correct format
- [ ] Date range queries work

### 21.2 Currency Formatting
- [ ] Prices display with correct currency
- [ ] Currency selector works

### 21.3 Number Formatting
- [ ] Large numbers formatted correctly
- [ ] Percentages display correctly

### 21.4 Text Transformations
- [ ] Truncation works for long text
- [ ] Ellipsis appears when needed

---

## 22. Error Handling

### 22.1 Form Validation
- [ ] Required field errors appear
- [ ] Email validation works
- [ ] Phone validation works
- [ ] Custom validation messages show

### 22.2 API Errors
- [ ] Network error shows message
- [ ] Permission error shows message
- [ ] Validation error shows message

### 22.3 Edge Cases
- [ ] Empty states display correctly
- [ ] Loading states display
- [ ] Pagination at boundaries works

---

## 23. Accessibility

### 23.1 Keyboard Navigation
- [ ] Tab navigation works
- [ ] Enter submits forms
- [ ] Escape closes modals

### 23.2 Screen Reader
- [ ] Labels present for all inputs
- [ ] ARIA attributes correct
- [ ] Focus management works

---

## Success Criteria

**Coverage:**
- [ ] Every button in every view clicked and verified
- [ ] Every form submitted and data persisted
- [ ] Every filter/search works
- [ ] Every CRUD operation tested
- [ ] Every status transition tested
- [ ] Every integration tested

**Reliability:**
- [ ] All tests pass consistently (no flaky tests)
- [ ] Tests run in <5 minutes total
- [ ] Tests run in CI (GitHub Actions)

**Maintenance:**
- [x] Page Object Model used for reusability
- [x] Helper functions for common actions
- [x] Clear test naming convention

---

## Notes

**Test Data:**
- Use dedicated test organization
- Reset state between tests
- Use fixtures for consistent data

**CI Integration:**
- Run on every PR
- Run on main branch commits
- Block merges on failures

**Estimated Effort:**
- ~150-200 test cases
- ~2-3 days of focused work
- High value for catching regressions
