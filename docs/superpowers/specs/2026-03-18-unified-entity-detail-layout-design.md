# Unified Entity Detail Layout — Design Spec

## Problem

Seven entity detail routes (contacts, companies, leads, patients, employees, treatments, appointments) each implement their own bespoke layout with massive code duplication. An existing `EntityDetailLayout` component was built but never adopted. The result is three different tab styles, three different timeline patterns, six copies of relationship search cards, three copies of scheduled activities lists, and no shared notes component.

## Decision

Migrate all entity detail routes onto a shared layout system based on the existing `EntityDetailLayout`, extended with two layout variants and render-hook slots for route-specific content.

## Architecture

### Two Layout Variants

The `EntityDetailLayout` component supports two variants via a `variant` prop:

`default` is the standard 2-column layout with a 420px fixed sidebar (ScrollArea) on the left and a flex-1 tabbed content area on the right. This is used by contacts, companies, leads, patients, employees, and treatments. The sidebar renders: EntityDetailHeader (avatar, title, subtitle, badges, actions), collapsible fields `<dl>`, association cards, and an attachments slot.

`sidebar-slot` is a single-column layout where sidebar content is injected into the app shell's global sidebar via `useSidebarSlot()`. The main area is full-width with a sticky header and tabs. This is used by appointments (and potentially future entity types that need full width for their primary content).

Both variants share the same `EntityDetailHeader` sub-component for consistent header rendering.

### Render Hook Slots

Instead of branching inside the layout, routes pass unique sections as render props:

- `beforeTabs?: ReactNode` — content between header and tab bar (Lead: PipelineProgressBar)
- `headerSubtitle?: ReactNode` — rich subtitle row (Lead: stage breadcrumb + product count)
- `tabFilter?: ReactNode` — filter control below tab bar
- `sidebarExtra?: ReactNode` — extra sidebar content below standard fields/associations

### Shared Sub-Components (Extracted from Duplicated Code)

`ScheduledActivitiesList` — extracted from the identical inline `<ul>` in 3 CRM routes. Renders scheduled activities with colored dot, title, type, and locale-aware date.

`EntityRelationshipCard` — extracted from ~80 lines duplicated x6 across routes. Sidebar card with search input, dropdown results, link/unlink buttons. Supports both CRM and Gabinet entity types via extended `entityRoutes` map.

`EntityNotesSection` — shared notes display with optional threading support. Appointment uses threaded mode (pin/reply), other routes use flat list.

### Unified Tab Styling

All routes use the same underline `border-b-2` tab trigger style, exported as `tabTriggerClass` from the layout component.

### Timeline Unification

All routes use `ActivityTimeline` with the existing `presentActivity` presenter. The appointment route's custom `buildUnifiedHistoryEntries()` is refactored into a shared `mergeTimelineSources()` utility that maps SMS events, automation runs, and workflow history into `ActivityWithMetadata` entries before passing to `ActivityTimeline`. Treatment route gains an activity timeline (currently missing).

### Cleanup

Remove: unreachable activities TabsContent in employee, `@ts-nocheck` in appointment, unused `RelationshipPanel`/`AddRelationshipDialog`, duplicate timeline in patient (overview + activity tab).

Add: `recentlyViewed.track` to all entity detail routes (currently only patient).

## Migration Order

Patient (closest to standard) -> Contact -> Company -> Lead -> Employee -> Treatment -> Appointment (most complex, last).

## Verification

Each migrated route must pass: app typecheck, visual parity check in browser, no console errors. Final verification: focused Playwright smoke for at least one CRM and one Gabinet entity detail page.
