# Phase 2: Platform Improvements — Design Document

**Goal:** Add granular permissions (RBAC), notifications, audit logging, user profiles, unified calendar with drag & drop, quick actions across all views, and gabinet package management UI.

**Architecture:** Six phases building on the existing Convex + React stack. RBAC is the foundation — every subsequent phase integrates with it. Each phase is independently deployable.

**Tech Stack:** Convex (backend), React + TanStack Router (frontend), shadcn/ui components, HTML5 Drag API (calendar).

---

## Phase 1: RBAC — Role-Based Access Control

### Data Model

New table `orgPermissions` stores per-organization permission overrides:

```
orgPermissions {
  organizationId: Id<"organizations">
  role: "member" | "viewer"  // only these are configurable
  permissions: Record<Feature, Record<Action, Scope>>
  updatedBy: Id<"users">
  updatedAt: number
}
```

Features: `leads`, `contacts`, `companies`, `documents`, `activities`, `calls`, `email`, `products`, `pipelines`, `gabinet_patients`, `gabinet_appointments`, `gabinet_treatments`, `gabinet_packages`, `gabinet_employees`, `settings`, `team`.

Actions: `view`, `create`, `edit`, `delete`.

Scope values: `"none"` (no access), `"own"` (only records where createdBy/ownerId === userId), `"all"` (all records in org).

Owner and admin roles have hardcoded `"all"` scope on everything — not configurable. Only member and viewer permissions are editable.

Default permissions (used when no `orgPermissions` override exists):
- owner: all actions = "all" scope
- admin: all actions = "all" scope (except cannot delete organization)
- member: view = "all", create = "all", edit = "own", delete = "own"
- viewer: view = "all", create/edit/delete = "none"

### Resource Invites (External Guests)

New table `resourceInvites`:

```
resourceInvites {
  organizationId: Id<"organizations">
  email: string
  userId: optional Id<"users">  // set after guest registers/logs in
  resourceType: string  // "lead", "contact", "gabinetPatient", etc.
  resourceId: string
  accessLevel: "viewer" | "editor"
  invitedBy: Id<"users">
  token: string
  status: "pending" | "accepted" | "revoked"
  createdAt: number
  updatedAt: number
}
```

Guests are NOT members of the organization. They can only access the specific resource they were invited to. Viewer guests see data but cannot edit. Editor guests can edit fields and add notes/activities on that resource.

### Backend Enforcement

New helper `checkPermission(ctx, orgId, feature, action)` returns `{ allowed: boolean, scope: "own" | "all" }`. Called at the start of every mutation/query alongside `verifyOrgAccess`.

New helper `checkResourceAccess(ctx, resourceType, resourceId)` checks `resourceInvites` for users who are not org members.

Flow: `verifyOrgAccess` runs first. If user is org member, `checkPermission` determines scope. If user is NOT org member, `checkResourceAccess` checks for resource invite.

Queries with scope "own" filter results to `createdBy === userId` or `ownerId === userId`. Mutations with scope "own" verify ownership before allowing edit/delete.

### Frontend Enforcement

Hook: `usePermission(feature, action)` returns `{ allowed: boolean, scope: "own" | "all" }`. Uses a query that fetches the user's effective permissions for the current org (merged defaults + overrides).

Components: action buttons, menu items, and form fields check permissions before rendering. `QuickActionBar`, sidebar items, and table row actions all respect RBAC.

Invited guests: entity detail page renders normally but sidebar navigation is hidden. Top bar shows "You have viewer/editor access to this resource".

### Settings UI

New route: `/dashboard/settings/permissions`

Layout: table with features as rows, roles (member, viewer) as columns. Each cell is a dropdown with options: "None", "Own only", "All". Owner and admin columns shown but greyed out (not editable).

Separate section: "Resource Sharing" toggle — enable/disable ability to invite external guests (on by default).

---

## Phase 2: Audit Log + Notifications

### Audit Log

New table `auditLog`:

```
auditLog {
  organizationId: Id<"organizations">
  userId: Id<"users">
  action: string  // "permission_changed", "member_invited", "member_removed",
                   // "resource_shared", "entity_deleted", "status_changed", etc.
  entityType: optional string
  entityId: optional string
  details: optional string  // JSON with before/after values
  ipAddress: optional string
  createdAt: number
}
```

Logged actions: permission changes, team member invite/remove/role change, resource invite/revoke, entity delete, appointment status changes, payment create/refund, login/logout events.

Backend: `logAudit(ctx, { action, entityType, entityId, details })` helper called from mutations that perform auditable actions.

UI: `/dashboard/settings/audit-log` — filterable table with columns: timestamp, user, action, entity, details. Filters: date range, user, action type. Owner and admin only.

### Notifications

New table `notifications`:

```
notifications {
  organizationId: Id<"organizations">
  userId: Id<"users">  // recipient
  type: string  // "assigned", "invited", "status_changed", "mention", etc.
  title: string
  message: string
  link: optional string  // route to navigate to on click
  isRead: boolean
  createdAt: number
}
```

Notification triggers (created from mutations):
- Assigned to a lead/activity/appointment
- Invited to resource (resourceInvite)
- Appointment status changed (for patient's doctor and creator)
- Team member role changed
- Deal won/lost (for owner)
- New team member joined

Backend: `createNotification(ctx, { userId, type, title, message, link })` helper.

Frontend: bell icon in top bar with unread count badge. Click opens dropdown with notification list (most recent 20). Each item shows: icon, title, message preview, timestamp, read/unread dot. Click navigates to `link`. "Mark all read" button. No push notifications or email notifications in this phase.

---

## Phase 3: User Profile

New route: `/dashboard/settings/profile`

Sections:
- Avatar upload (uses existing storage system)
- Name, email (display, not editable if OAuth-linked)
- Password change (current + new + confirm, only for password-based accounts)
- Language selector (en/pl, updates i18n context)
- Theme selector (light/dark/system, replaces current sidebar toggle)
- Timezone selector

Backend: `users.updateProfile` mutation for name/avatar/preferences. Password change goes through `@convex-dev/auth` flow.

User preferences stored as new optional fields on the `users` table: `language`, `theme`, `timezone`.

---

## Phase 4: Quick Actions

### Entity List Pages

New component: `QuickActionBar` rendered between MiniChartsRow and EnhancedDataTable.

Horizontal bar with icon+label buttons. Actions are defined per entity type in a config map:

```
leads: ["New Deal", "Import CSV", "Export CSV", "Kanban View"]
contacts: ["New Contact", "Import CSV", "Export CSV"]
companies: ["New Company", "Import CSV", "Export CSV"]
activities: ["New Activity"]
documents: ["Upload Document"]
calls: ["Log Call"]
gabinet_patients: ["New Patient", "Import CSV"]
gabinet_appointments: ["New Appointment"]
gabinet_treatments: ["New Treatment"]
gabinet_packages: ["New Package"]
gabinet_employees: ["New Employee"]
```

Each action checks `usePermission(feature, "create")` before rendering. Actions either open quick-create dialogs or trigger navigation.

### Entity Detail Pages

New component: `EntityQuickActions` rendered above the tab bar in the middle column.

Sticky horizontal bar with contextual icon buttons depending on entity type:

```
lead detail: ["Schedule Activity", "Send Email", "Add Note", "Log Call", "Share"]
contact detail: ["Schedule Activity", "Send Email", "Add Note", "Log Call", "Share"]
company detail: ["Schedule Activity", "Add Note", "Share"]
patient detail: ["Book Appointment", "Add Document", "Add Package", "Add Note", "Share"]
document detail: ["Download", "Share"]
```

"Share" button opens the resource invite dialog (from Phase 1).

Each button checks RBAC. On detail pages of resources you don't own, edit-type actions check scope === "all" or ownership.

---

## Phase 5: Unified Calendar + Drag & Drop

### Data Source Unification

Calendar queries switch from `gabinetAppointments` to `scheduledActivities` as primary data source.

New query: `scheduledActivities.listForCalendar` accepts `organizationId`, `startDate`, `endDate`, optional `resourceId`, optional `moduleFilter` ("all" | "gabinet" | "crm"). Returns events with resolved metadata (patient name, treatment name for gabinet; entity name for CRM).

RBAC integration: query filters events based on user permissions. User without CRM access sees only gabinet events. User without gabinet access sees only CRM events. Filtering happens server-side.

### Calendar Route

New top-level route: `/dashboard/calendar` accessible from both CRM and Gabinet workspaces.

Existing `/dashboard/gabinet/calendar` redirects to `/dashboard/calendar?filter=gabinet`.

### Event Rendering

Events render with module-specific styling:
- Gabinet appointments: stetoscope icon, color from `_registry` (#7C6AE8), shows patient + treatment name
- CRM activities: icon from activity type definition (phone, clock, mail), color from definition, shows activity title + linked entity name

Click behavior: opens appropriate detail dialog based on `moduleRef.moduleId`. Gabinet events open `AppointmentDetailDialog`. CRM events open `ActivityDetailDrawer`.

### Drag & Drop

Scope: day view and week view only. Month view is read-only.

Implementation: HTML5 Drag API on event elements. Drop zones are time slots (15-minute granularity).

On drop: call `appointments.update` (for gabinet) with new date/startTime/endTime. If dropped on different employee column (week view), also update `employeeId`.

Validation: backend `checkConflict` runs during the update mutation. If conflict, mutation throws, frontend reverts the drag and shows error toast.

Permissions: only events the user can edit (scope "all" or own + is owner) show drag handles. CRM activities are not draggable (edit from entity detail page).

### Filter UI

Top bar additions:
- Module filter dropdown: "All", "Gabinet", "CRM"
- Employee filter (existing, unchanged)
- Both filters respect RBAC — "CRM" option hidden if no CRM access

---

## Phase 6: Gabinet Package UI

### Patient Detail — Packages Card

New card in left sidebar of `/dashboard/gabinet/patients/$patientId`:

"Packages" card showing:
- List of active `gabinetPackageUsage` records for this patient
- Each shows: package name, progress bar (usedCount/totalCount per treatment), expiry date, status badge
- "Add Package" button opens package purchase drawer

### Package Purchase Drawer

Drawer with:
- Dropdown of available packages (from `gabinetPackages` where isActive)
- Shows package details: included treatments, total price, validity days
- Payment method selector (cash/card/transfer)
- "Purchase" button creates `gabinetPackageUsage` record + `payments` record

### Appointment Booking Integration

In appointment create/edit dialog:
- After selecting patient and treatment, check if patient has active package containing that treatment with remaining uses
- If yes, show "Use package: [PackageName] (3/10 remaining)" checkbox
- When checked: set `packageUsageId` on appointment, price shows as "Covered by package"
- On appointment completion: increment `usedCount` for that treatment in the package usage

### Package List Enhancement

On `/dashboard/gabinet/packages` list page:
- New column: "Active Uses" — count of active `gabinetPackageUsage` records for each package
- Click count to see list of patients with this package

---

## Phase Order & Dependencies

```
Phase 1 (RBAC) ──────────────────────────┐
                                         │
Phase 2 (Audit + Notifications) ─────────┤ depends on RBAC helpers
                                         │
Phase 3 (User Profile) ──────────────────┤ independent, small
                                         │
Phase 4 (Quick Actions) ─────────────────┤ uses usePermission hook
                                         │
Phase 5 (Calendar) ──────────────────────┤ uses RBAC for filtering
                                         │
Phase 6 (Packages) ──────────────────────┘ independent, frontend only
```

Phases 3 and 6 are independent and can be parallelized with any other phase. Phases 2, 4, 5 depend on Phase 1 being complete.
