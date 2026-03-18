# Unified Entity Detail Layout — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all 7 entity detail routes onto a shared `EntityDetailLayout` with two variants, eliminating ~2000 lines of duplicated layout/relationship/timeline code.

**Architecture:** Refactor existing `EntityDetailLayout` to support `default` (2-column sidebar+tabs) and `sidebar-slot` (full-width with app-shell sidebar injection) variants. Extract shared sub-components from duplicated inline code. Migrate routes one-by-one starting with the closest match (patient) and ending with the most complex (appointment).

**Tech Stack:** React 19, TanStack Router, shadcn/ui, Tailwind CSS v4, Convex queries, i18next.

**Testing:** `npx tsc -p tsconfig.app.json --pretty false` after each task. Browser verification on dev server (localhost:5173) for visual parity. Credentials: amiesak@gmail.com / ABcdefg123!@#.

---

## Chunk 1: Shared Foundation Components

### Task 1: Refactor EntityDetailLayout API

**Files:**
- Modify: `src/components/crm/entity-detail-layout.tsx`

- [ ] **Step 1:** Read current `entity-detail-layout.tsx` (262 lines). Plan the API extension.

- [ ] **Step 2:** Add `variant` prop (`"default" | "sidebar-slot"`, default `"default"`)

- [ ] **Step 3:** Add render hook slots: `beforeTabs?: ReactNode`, `headerSubtitle?: ReactNode`, `sidebarExtra?: ReactNode`

- [ ] **Step 4:** Change sidebar width from 280px to 420px to match actual route implementations

- [ ] **Step 5:** Export `tabTriggerClass` constant with underline style: `"relative rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 font-medium text-muted-foreground transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none"`

- [ ] **Step 6:** Add loading skeleton and not-found states as built-in behaviors via `isLoading` and `notFound` props with `onBack` callback

- [ ] **Step 7:** Add `breadcrumbs?: ReactNode` slot rendered above the header

- [ ] **Step 8:** Run `npx tsc -p tsconfig.app.json --pretty false` — expected: PASS (no consumers yet)

- [ ] **Step 9:** Commit: `refactor: extend EntityDetailLayout with variant system and render hooks`

### Task 2: Extract ScheduledActivitiesList

**Files:**
- Create: `src/components/shared/scheduled-activities-list.tsx`

- [ ] **Step 1:** Read the inline `<ul>` in `_layout.contacts.$contactId.lazy.tsx` (the Activities sub-tab, ~30 lines of identical code across 3 CRM routes)

- [ ] **Step 2:** Create `ScheduledActivitiesList` component with props: `activities: Array<{ _id: string; title: string; activityType: string; dueDate: number }>`, `onActivityClick?: (id: string) => void`, `emptyMessage?: string`

- [ ] **Step 3:** Use locale-aware date formatting via `i18n.language` instead of hardcoded `pl-PL`

- [ ] **Step 4:** Run typecheck — expected: PASS

- [ ] **Step 5:** Commit: `feat: extract ScheduledActivitiesList shared component`

### Task 3: Extract EntityRelationshipCard

**Files:**
- Create: `src/components/shared/entity-relationship-card.tsx`

- [ ] **Step 1:** Read the sidebar relationship card code from `_layout.contacts.$contactId.lazy.tsx` — the search input + dropdown + link/unlink block (~80 lines per card)

- [ ] **Step 2:** Create `EntityRelationshipCard` with props: `title: string`, `entityType: string`, `items: Array<{ _id: string; name: string; subtitle?: string }>`, `onSearch: (query: string) => void`, `searchResults: Array<{ _id: string; name: string }>`, `onLink: (targetId: string) => void`, `onUnlink: (relationshipId: string) => void`, `searchQuery: string`, `onSearchQueryChange: (q: string) => void`

- [ ] **Step 3:** Include `entityRoutes` map covering both CRM types (contact, company, lead, document) and Gabinet types (gabinetPatient, gabinetEmployee, gabinetTreatment, gabinetAppointment) for navigation links

- [ ] **Step 4:** Run typecheck — expected: PASS

- [ ] **Step 5:** Commit: `feat: extract EntityRelationshipCard shared component`

### Task 4: Extract EntityNotesSection

**Files:**
- Create: `src/components/shared/entity-notes-section.tsx`

- [ ] **Step 1:** Read notes rendering from `_layout.contacts.$contactId.lazy.tsx` (flat notes list) and `_layout.gabinet.appointments.$appointmentId.lazy.tsx` (threaded notes with pin/reply)

- [ ] **Step 2:** Create `EntityNotesSection` with props: `notes: Array<{ _id: string; content: string; createdAt: number; author: string }>`, `onAdd: (content: string) => void`, `threaded?: boolean`, `onPin?: (id: string) => void`, `onReply?: (parentId: string, content: string) => void`

- [ ] **Step 3:** Run typecheck — expected: PASS

- [ ] **Step 4:** Commit: `feat: extract EntityNotesSection shared component`

### Task 5: Create mergeTimelineSources utility

**Files:**
- Create: `src/components/activity-timeline/merge-timeline-sources.ts`

- [ ] **Step 1:** Read `buildUnifiedHistoryEntries()` from `_layout.gabinet.appointments.$appointmentId.lazy.tsx`

- [ ] **Step 2:** Create `mergeTimelineSources(sources: TimelineSource[]): ActivityWithMetadata[]` that accepts an array of typed source objects: `{ type: "activities" | "smsEvents" | "automationRuns" | "workflowHistory"; entries: any[] }` and maps each to `ActivityWithMetadata` using the appropriate field mapping

- [ ] **Step 3:** Sort merged entries by `createdAt` descending, deduplicate by `_id`

- [ ] **Step 4:** Run typecheck — expected: PASS

- [ ] **Step 5:** Commit: `feat: add mergeTimelineSources utility for unified timeline`

---

## Chunk 2: Route Migrations (CRM)

### Task 6: Migrate Patient detail (reference implementation)

**Files:**
- Modify: `src/routes/_app/_auth/dashboard/_layout.gabinet.patients.$patientId.tsx`

- [ ] **Step 1:** Read current patient route in full

- [ ] **Step 2:** Import `EntityDetailLayout`, `tabTriggerClass`, `ScheduledActivitiesList`, `EntityRelationshipCard`

- [ ] **Step 3:** Replace bespoke 2-column layout with `<EntityDetailLayout variant="default" ... />`. Map existing header, fields, sidebar cards, and tabs to the new props

- [ ] **Step 4:** Remove duplicate ActivityTimeline from overview tab (keep only in activity tab)

- [ ] **Step 5:** Ensure `recentlyViewed.track` call is preserved (patient already has it)

- [ ] **Step 6:** Run typecheck — expected: PASS

- [ ] **Step 7:** Browser verification: navigate to a patient detail page on localhost:5173, confirm visual parity

- [ ] **Step 8:** Commit: `refactor: migrate patient detail to EntityDetailLayout`

### Task 7: Migrate Contact detail

**Files:**
- Modify: `src/routes/_app/_auth/dashboard/_layout.contacts.$contactId.lazy.tsx`

- [ ] **Step 1:** Read current contact route

- [ ] **Step 2:** Replace bespoke layout with `EntityDetailLayout`. Replace inline relationship cards with `EntityRelationshipCard`. Replace inline scheduled activities `<ul>` with `ScheduledActivitiesList`. Extract `tabTriggerClass` to constant reference.

- [ ] **Step 3:** Fix the `ScrollArea` wrapping inconsistency (currently wraps both tab strip and content)

- [ ] **Step 4:** Add `recentlyViewed.track` call (currently missing)

- [ ] **Step 5:** Run typecheck — expected: PASS

- [ ] **Step 6:** Browser verification on localhost:5173

- [ ] **Step 7:** Commit: `refactor: migrate contact detail to EntityDetailLayout`

### Task 8: Migrate Company detail

**Files:**
- Modify: `src/routes/_app/_auth/dashboard/_layout.companies.$companyId.tsx`

- [ ] **Step 1:** Read current company route. Nearly identical to contact — same migration pattern.

- [ ] **Step 2:** Replace layout, relationship cards, scheduled activities list. Add `recentlyViewed.track`.

- [ ] **Step 3:** Run typecheck — expected: PASS

- [ ] **Step 4:** Commit: `refactor: migrate company detail to EntityDetailLayout`

### Task 9: Migrate Lead detail

**Files:**
- Modify: `src/routes/_app/_auth/dashboard/_layout.leads.$leadId.lazy.tsx`

- [ ] **Step 1:** Read current lead route. Key differences: `beforeTabs` slot for PipelineProgressBar, `headerSubtitle` for stage breadcrumb + product count, Products sidebar card, Won/Lost action buttons.

- [ ] **Step 2:** Replace layout with `EntityDetailLayout`, using `beforeTabs={<PipelineProgressBar />}` and `headerSubtitle={<LeadStageInfo />}` render hooks. Replace inline relationship cards and scheduled activities.

- [ ] **Step 3:** Fix the `(field as any).render` pattern — type the render prop properly

- [ ] **Step 4:** Add `recentlyViewed.track`

- [ ] **Step 5:** Run typecheck — expected: PASS

- [ ] **Step 6:** Browser verification — confirm pipeline bar and stage breadcrumb render correctly

- [ ] **Step 7:** Commit: `refactor: migrate lead detail to EntityDetailLayout`

---

## Chunk 3: Route Migrations (Gabinet)

### Task 10: Migrate Employee detail

**Files:**
- Modify: `src/routes/_app/_auth/dashboard/_layout.gabinet.employees.$employeeId.tsx`

- [ ] **Step 1:** Read current employee route. Largest file. Key issues: unreachable `activities` tab, inline weekly calendar, local `EditEmployeeDrawer`.

- [ ] **Step 2:** Replace layout with `EntityDetailLayout`. Remove dead `activities` TabsContent (unreachable — no TabsTrigger exists for it).

- [ ] **Step 3:** Keep inline weekly calendar as tab content — it's route-specific, not a layout concern

- [ ] **Step 4:** Add `recentlyViewed.track`

- [ ] **Step 5:** Run typecheck — expected: PASS

- [ ] **Step 6:** Commit: `refactor: migrate employee detail to EntityDetailLayout, remove dead tab`

### Task 11: Migrate Treatment detail

**Files:**
- Modify: `src/routes/_app/_auth/dashboard/_layout.gabinet.treatments.$treatmentId.tsx`

- [ ] **Step 1:** Read current treatment route. Key differences: pill-style tabs (needs to switch to underline), no activity timeline (needs to be added).

- [ ] **Step 2:** Replace layout with `EntityDetailLayout`. Switch tab style from pill to shared `tabTriggerClass`.

- [ ] **Step 3:** Add `api.activities.getForEntity` query and an Activity tab with `ActivityTimeline`

- [ ] **Step 4:** Add `recentlyViewed.track`

- [ ] **Step 5:** Run typecheck — expected: PASS

- [ ] **Step 6:** Commit: `refactor: migrate treatment detail to EntityDetailLayout, add activity timeline`

### Task 12: Migrate Appointment detail (most complex)

**Files:**
- Modify: `src/routes/_app/_auth/dashboard/_layout.gabinet.appointments.$appointmentId.lazy.tsx`

- [ ] **Step 1:** Read current appointment route. This is the outlier: uses `sidebar-slot` variant, has `@ts-nocheck`, custom `buildUnifiedHistoryEntries()`, threaded notes, SMS timeline.

- [ ] **Step 2:** Remove `// @ts-nocheck` and fix type errors incrementally

- [ ] **Step 3:** Replace bespoke layout with `<EntityDetailLayout variant="sidebar-slot" ... />`. The sidebar content (patient info, treatment info, employee info, packages, prepayment, SMS status) goes into the sidebar-slot injection path.

- [ ] **Step 4:** Replace custom history rendering with `mergeTimelineSources()` + `ActivityTimeline`

- [ ] **Step 5:** Replace inline notes with `EntityNotesSection` in threaded mode

- [ ] **Step 6:** Add `recentlyViewed.track`

- [ ] **Step 7:** Run typecheck — expected: PASS (this is where most type fixes will happen)

- [ ] **Step 8:** Browser verification — this route has the most unique features, verify: sidebar content in app shell, status dropdown, SMS block, documents tab, body chart tab, history tab with merged timeline

- [ ] **Step 9:** Commit: `refactor: migrate appointment detail to EntityDetailLayout sidebar-slot variant`

---

## Chunk 4: Cleanup and Final Verification

### Task 13: Remove dead code

**Files:**
- Delete: `src/components/entity-relationships/relationship-panel.tsx`
- Delete: `src/components/entity-relationships/add-relationship-dialog.tsx`

- [ ] **Step 1:** Verify zero imports of `RelationshipPanel` and `AddRelationshipDialog` across the codebase

- [ ] **Step 2:** Delete both files

- [ ] **Step 3:** Run typecheck — expected: PASS

- [ ] **Step 4:** Commit: `chore: remove unused RelationshipPanel and AddRelationshipDialog`

### Task 14: Final verification

- [ ] **Step 1:** Run full typecheck: `npx tsc -p tsconfig.app.json --pretty false && npx tsc -p convex/tsconfig.json --pretty false`

- [ ] **Step 2:** Browser smoke test: navigate through at least one entity of each type (contact, company, lead, patient, employee, treatment, appointment) and confirm: layout renders, tabs work, timeline shows, sidebar fields display, edit drawer opens

- [ ] **Step 3:** Run existing Convex tests to confirm no backend regressions: `cd convex && npx vitest run --reporter=verbose`

- [ ] **Step 4:** Commit all tracking files and update session state

- [ ] **Step 5:** Final commit: `feat: unified entity detail layout migration complete`
