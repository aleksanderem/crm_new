# Modular Platform Architecture — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Formalize the modular platform architecture (registry pattern, shared calendar, dual-write appointments, product subscriptions, basic billing), complete Gabinet end-to-end, add tests, and prepare for multi-tenant SaaS launch.

**Architecture:** Three-layer system (Platform Core → Shared Services → Products). Each product module registers entity types, activity types, and navigation entries via a registry file. Shared services (calendar, contacts, custom fields, relationships, notes, activity log) work with any registered entity type via autodiscovery. Products are independently purchasable via Stripe subscriptions per organization.

**Tech Stack:** Convex BaaS, React 18, TypeScript, TanStack Router, TanStack React Query + Table, shadcn/ui, Stripe, i18next (en+pl), Vitest (backend tests), Playwright (E2E).

---

## Phase 1: Architecture Formalization

### Task 1: Add `moduleRef` and `resourceId` fields to `scheduledActivities` schema

**Files:**
- Modify: `convex/schema.ts:572-595` (scheduledActivities table + indexes)

**Step 1: Update the scheduledActivities table definition**

In `convex/schema.ts`, add two new optional fields to the `scheduledActivities` table definition and a new index:

```typescript
scheduledActivities: defineTable({
  organizationId: v.id("organizations"),
  title: v.string(),
  activityType: activityTypeValidator,
  dueDate: v.number(),
  endDate: v.optional(v.number()),
  isCompleted: v.boolean(),
  completedAt: v.optional(v.number()),
  ownerId: v.id("users"),
  description: v.optional(v.string()),
  linkedEntityType: v.optional(v.string()),
  linkedEntityId: v.optional(v.string()),
  googleEventId: v.optional(v.string()),
  googleCalendarId: v.optional(v.string()),
  lastGoogleSyncAt: v.optional(v.number()),
  // NEW: link to module extension record
  moduleRef: v.optional(v.object({
    moduleId: v.string(),       // e.g. "gabinet"
    entityType: v.string(),     // e.g. "gabinetAppointment"
    entityId: v.string(),       // the _id of the extension record
  })),
  // NEW: resource performing the work (distinct from ownerId who created the event)
  resourceId: v.optional(v.id("users")),
  createdBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_org", ["organizationId"])
  .index("by_orgAndDueDate", ["organizationId", "dueDate"])
  .index("by_owner", ["ownerId"])
  .index("by_orgAndType", ["organizationId", "activityType"])
  .index("by_orgAndCompleted", ["organizationId", "isCompleted"])
  // NEW indexes:
  .index("by_orgAndResource", ["organizationId", "resourceId"])
  .index("by_orgAndResourceAndDueDate", ["organizationId", "resourceId", "dueDate"]),
```

**Step 2: Push schema to Convex**

Run: `npx convex dev` (if already running, it will auto-deploy on save)
Expected: Schema deploys without error. Existing data is untouched because new fields are optional.

**Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: add moduleRef and resourceId to scheduledActivities schema"
```

---

### Task 2: Add `scheduledActivityId` to `gabinetAppointments` schema

**Files:**
- Modify: `convex/schema.ts:960-998` (gabinetAppointments table)

**Step 1: Add the back-reference field**

Add after `packageUsageId` in the gabinetAppointments definition:

```typescript
// Link to the shared calendar event
scheduledActivityId: v.optional(v.id("scheduledActivities")),
```

**Step 2: Verify schema deploys**

Run: `npx convex dev`
Expected: Schema deploys. Existing appointments get `undefined` for the new field (no migration needed).

**Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: add scheduledActivityId back-reference to gabinetAppointments"
```

---

### Task 3: Add `productSubscriptions` and `platformProducts` tables

**Files:**
- Modify: `convex/schema.ts` (add two new tables after `subscriptions`)

**Step 1: Add tables to schema**

Insert after the existing `subscriptions` table definition (around line 287):

```typescript
// --- Product Subscriptions (per organization, per product) ---

platformProducts: defineTable({
  productId: v.string(),       // "crm" | "gabinet" | etc
  name: v.string(),
  description: v.string(),
  isActive: v.boolean(),
  prices: v.object({
    month: v.object({
      usd: v.number(),
      eur: v.number(),
    }),
    year: v.object({
      usd: v.number(),
      eur: v.number(),
    }),
  }),
  stripeProductId: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_productId", ["productId"])
  .index("by_stripeProductId", ["stripeProductId"]),

productSubscriptions: defineTable({
  organizationId: v.id("organizations"),
  productId: v.string(),       // matches platformProducts.productId
  stripeSubscriptionId: v.optional(v.string()),
  status: v.union(
    v.literal("active"),
    v.literal("trialing"),
    v.literal("past_due"),
    v.literal("canceled"),
    v.literal("incomplete"),
  ),
  currentPeriodStart: v.optional(v.number()),
  currentPeriodEnd: v.optional(v.number()),
  cancelAtPeriodEnd: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_org", ["organizationId"])
  .index("by_orgAndProduct", ["organizationId", "productId"])
  .index("by_stripeSubscriptionId", ["stripeSubscriptionId"]),
```

**Step 2: Verify schema deploys**

Run: `npx convex dev`
Expected: Two new tables created, no data yet.

**Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: add platformProducts and productSubscriptions tables"
```

---

### Task 4: Create `verifyProductAccess` helper

**Files:**
- Create: `convex/_helpers/products.ts`

**Step 1: Write the helper**

```typescript
import { QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * Verify that the organization has an active subscription for a specific product.
 * Throws if no active subscription exists.
 *
 * During development/MVP, if no platformProducts or productSubscriptions exist at all,
 * access is granted (grace period). Once the first productSubscription is created
 * for any org, enforcement begins.
 */
export async function verifyProductAccess(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  productId: string,
): Promise<void> {
  const subscription = await ctx.db
    .query("productSubscriptions")
    .withIndex("by_orgAndProduct", (q) =>
      q.eq("organizationId", organizationId).eq("productId", productId)
    )
    .first();

  if (!subscription) {
    // Grace period: if no subscriptions exist at all, allow access
    const anySubscription = await ctx.db
      .query("productSubscriptions")
      .first();
    if (!anySubscription) return; // no enforcement yet

    throw new Error(`No active subscription for product: ${productId}`);
  }

  if (subscription.status !== "active" && subscription.status !== "trialing") {
    throw new Error(`Subscription for ${productId} is ${subscription.status}`);
  }
}
```

**Step 2: Verify it compiles**

Run: `npx convex dev`
Expected: Compiles without error.

**Step 3: Commit**

```bash
git add convex/_helpers/products.ts
git commit -m "feat: add verifyProductAccess helper with grace period"
```

---

### Task 5: Create Gabinet module registry

**Files:**
- Create: `convex/gabinet/_registry.ts`

**Step 1: Write the registry file**

This is the module contract — it declares what Gabinet contributes to the platform:

```typescript
/**
 * Gabinet Module Registry
 *
 * Declares the entity types, activity types, navigation entries,
 * and calendar renderers that this module contributes to the platform.
 */

export const GABINET_MODULE_ID = "gabinet";

/** Entity types this module owns */
export const GABINET_ENTITY_TYPES = [
  "gabinetPatient",
  "gabinetTreatment",
  "gabinetAppointment",
  "gabinetPackage",
  "gabinetDocument",
  "gabinetEmployee",
] as const;

/** Activity types this module contributes to the shared calendar */
export const GABINET_ACTIVITY_TYPES = [
  {
    key: "gabinet:appointment",
    name: "Wizyta",
    icon: "stethoscope",
    color: "#7C6AE8",
    isSystem: true,
  },
] as const;

/** Navigation entries for the sidebar */
export const GABINET_NAVIGATION = [
  { label: "sidebar.gabinet.dashboard", href: "/dashboard/gabinet", icon: "stethoscope-02" },
  { label: "sidebar.gabinet.patients", href: "/dashboard/gabinet/patients", icon: "user-group" },
  { label: "sidebar.gabinet.calendar", href: "/dashboard/gabinet/calendar", icon: "calendar-03" },
  { label: "sidebar.gabinet.treatments", href: "/dashboard/gabinet/treatments", icon: "medicine-02" },
  { label: "sidebar.gabinet.employees", href: "/dashboard/gabinet/employees", icon: "user-multiple-02" },
  { label: "sidebar.gabinet.packages", href: "/dashboard/gabinet/packages", icon: "package" },
  { label: "sidebar.gabinet.documents", href: "/dashboard/gabinet/documents", icon: "file-02" },
  { label: "sidebar.gabinet.reports", href: "/dashboard/gabinet/reports", icon: "chart-line-data-01" },
] as const;

/** Product ID for subscription gating */
export const GABINET_PRODUCT_ID = "gabinet";
```

**Step 2: Commit**

```bash
git add convex/gabinet/_registry.ts
git commit -m "feat: create Gabinet module registry (entity types, activity types, navigation)"
```

---

### Task 6: Create CRM module registry

**Files:**
- Create: `convex/crm/_registry.ts`
- Create directory: `convex/crm/` (if it doesn't exist)

**Step 1: Write the CRM registry**

```typescript
/**
 * CRM Module Registry
 *
 * Declares the entity types and navigation entries that CRM contributes.
 */

export const CRM_MODULE_ID = "crm";

export const CRM_ENTITY_TYPES = [
  "lead",
  "pipeline",
  "product",
  "call",
] as const;

export const CRM_ACTIVITY_TYPES = [
  { key: "call", name: "Call", icon: "phone", color: "#3b82f6", isSystem: true },
  { key: "meeting", name: "Meeting", icon: "clock", color: "#a855f7", isSystem: true },
  { key: "email", name: "Email", icon: "mail", color: "#22c55e", isSystem: true },
  { key: "task", name: "Task", icon: "check-circle", color: "#f97316", isSystem: true },
] as const;

export const CRM_NAVIGATION = [
  { label: "sidebar.dashboard", href: "/dashboard", icon: "home-09" },
  { label: "sidebar.contacts", href: "/dashboard/contacts", icon: "user-group" },
  { label: "sidebar.companies", href: "/dashboard/companies", icon: "building-06" },
  { label: "sidebar.leads", href: "/dashboard/leads", icon: "trending-up" },
  { label: "sidebar.pipelines", href: "/dashboard/pipelines", icon: "git-branch" },
  { label: "sidebar.activities", href: "/dashboard/activities", icon: "calendar-03" },
  { label: "sidebar.calls", href: "/dashboard/calls", icon: "phone-01" },
  { label: "sidebar.documents", href: "/dashboard/documents", icon: "file-02" },
  { label: "sidebar.products", href: "/dashboard/products", icon: "package" },
  { label: "sidebar.inbox", href: "/dashboard/inbox", icon: "mail-01" },
] as const;

export const CRM_PRODUCT_ID = "crm";
```

**Step 2: Commit**

```bash
git add convex/crm/_registry.ts
git commit -m "feat: create CRM module registry"
```

---

### Task 7: Seed Gabinet activity types in `seedDefaults`

**Files:**
- Modify: `convex/seedDefaults.ts:122-144` (activityTypes section)

**Step 1: Import gabinet registry and add its activity types to seeding**

At top of file, add:
```typescript
import { GABINET_ACTIVITY_TYPES } from "./gabinet/_registry";
```

In the activity types seeding section (around line 123), after the existing CRM activity types array, append the gabinet ones:

```typescript
const activityTypes = [
  { key: "call", name: "Call", icon: "phone", color: "#3b82f6" },
  { key: "meeting", name: "Meeting", icon: "clock", color: "#a855f7" },
  { key: "email", name: "Email", icon: "mail", color: "#22c55e" },
  { key: "task", name: "Task", icon: "check-circle", color: "#f97316" },
  // Gabinet activity types
  ...GABINET_ACTIVITY_TYPES.map((at) => ({
    key: at.key,
    name: at.name,
    icon: at.icon,
    color: at.color,
  })),
];
```

**Step 2: Verify schema + functions deploy**

Run: `npx convex dev`
Expected: Deploys without error. New orgs will get `gabinet:appointment` in their activity type definitions.

**Step 3: Commit**

```bash
git add convex/seedDefaults.ts
git commit -m "feat: seed gabinet:appointment activity type via registry"
```

---

## Phase 2: Dual Write — Appointment ↔ scheduledActivity

### Task 8: Implement dual write in `appointments.create`

**Files:**
- Modify: `convex/gabinet/appointments.ts:203-306` (create mutation)

**Step 1: Add scheduledActivity creation to the create mutation**

After the `gabinetAppointments` insert (line 278-282), before `logActivity`, add:

```typescript
// Dual write: create shared calendar event
const treatment = await ctx.db.get(args.treatmentId);
const patient = await ctx.db.get(args.patientId);
const patientName = patient
  ? `${patient.firstName}${patient.lastName ? " " + patient.lastName : ""}`
  : "Patient";
const treatmentName = treatment?.name ?? "Treatment";

// Convert date + time to epoch ms for dueDate/endDate
const dueDateMs = new Date(`${args.date}T${args.startTime}:00`).getTime();
const endDateMs = new Date(`${args.date}T${args.endTime}:00`).getTime();

const scheduledActivityId = await ctx.db.insert("scheduledActivities", {
  organizationId: args.organizationId,
  title: `${treatmentName} — ${patientName}`,
  activityType: "gabinet:appointment",
  dueDate: dueDateMs,
  endDate: endDateMs,
  isCompleted: false,
  ownerId: user._id,
  description: args.notes,
  linkedEntityType: "gabinetAppointment",
  linkedEntityId: firstId,
  moduleRef: {
    moduleId: "gabinet",
    entityType: "gabinetAppointment",
    entityId: firstId,
  },
  resourceId: args.employeeId,
  createdBy: user._id,
  createdAt: now,
  updatedAt: now,
});

// Store back-reference on appointment
await ctx.db.patch(firstId, { scheduledActivityId });
```

Note: For recurring appointments, each occurrence should also get its own scheduledActivity. Add similar logic inside the recurring loop (line 285-293):

```typescript
// Inside the recurring loop, after the insert:
const recurId = await ctx.db.insert("gabinetAppointments", {
  ...baseData,
  date: dates[i],
  recurringIndex: i + 1,
});

const recurDueMs = new Date(`${dates[i]}T${args.startTime}:00`).getTime();
const recurEndMs = new Date(`${dates[i]}T${args.endTime}:00`).getTime();

const recurActivityId = await ctx.db.insert("scheduledActivities", {
  organizationId: args.organizationId,
  title: `${treatmentName} — ${patientName}`,
  activityType: "gabinet:appointment",
  dueDate: recurDueMs,
  endDate: recurEndMs,
  isCompleted: false,
  ownerId: user._id,
  description: args.notes,
  linkedEntityType: "gabinetAppointment",
  linkedEntityId: recurId,
  moduleRef: {
    moduleId: "gabinet",
    entityType: "gabinetAppointment",
    entityId: recurId,
  },
  resourceId: args.employeeId,
  createdBy: user._id,
  createdAt: now,
  updatedAt: now,
});

await ctx.db.patch(recurId, { scheduledActivityId: recurActivityId });
```

Replace the existing recurring loop accordingly (currently it just does `await ctx.db.insert("gabinetAppointments", ...)` without capturing the id).

**Step 2: Verify it compiles and deploys**

Run: `npx convex dev`
Expected: Deploys. Creating an appointment now inserts both a `gabinetAppointment` and a `scheduledActivity`.

**Step 3: Commit**

```bash
git add convex/gabinet/appointments.ts
git commit -m "feat: dual write — appointment.create inserts scheduledActivity"
```

---

### Task 9: Sync status changes to scheduledActivity

**Files:**
- Modify: `convex/gabinet/appointments.ts` (updateStatus, cancel mutations)

**Step 1: In `updateStatus` mutation, sync completion to scheduledActivity**

After `ctx.db.patch(args.appointmentId, patch)` in the updateStatus handler, add:

```typescript
// Sync to scheduledActivity
if (appt.scheduledActivityId) {
  const activityPatch: Record<string, unknown> = { updatedAt: Date.now() };
  if (args.status === "completed") {
    activityPatch.isCompleted = true;
    activityPatch.completedAt = Date.now();
  }
  if (args.status === "cancelled" || args.status === "no_show") {
    activityPatch.isCompleted = true;
    activityPatch.completedAt = Date.now();
  }
  await ctx.db.patch(appt.scheduledActivityId, activityPatch);
}
```

**Step 2: In `cancel` mutation, mark scheduledActivity as completed**

After `ctx.db.patch(args.appointmentId, ...)` in the cancel handler, add:

```typescript
// Sync cancellation to scheduledActivity
if (appt.scheduledActivityId) {
  await ctx.db.patch(appt.scheduledActivityId, {
    isCompleted: true,
    completedAt: Date.now(),
    updatedAt: Date.now(),
  });
}
```

**Step 3: In `update` mutation, sync time/date changes to scheduledActivity**

After `ctx.db.patch(appointmentId, ...)` in the update handler, add:

```typescript
// Sync time changes to scheduledActivity
if (appt.scheduledActivityId && (args.date || args.startTime || args.endTime)) {
  const syncDate = args.date ?? appt.date;
  const syncStart = args.startTime ?? appt.startTime;
  const syncEnd = args.endTime ?? appt.endTime;
  const activityPatch: Record<string, unknown> = { updatedAt: Date.now() };
  activityPatch.dueDate = new Date(`${syncDate}T${syncStart}:00`).getTime();
  activityPatch.endDate = new Date(`${syncDate}T${syncEnd}:00`).getTime();
  await ctx.db.patch(appt.scheduledActivityId, activityPatch);
}
```

**Step 4: Verify deploys**

Run: `npx convex dev`
Expected: All mutations deploy.

**Step 5: Commit**

```bash
git add convex/gabinet/appointments.ts
git commit -m "feat: sync appointment status/time changes to scheduledActivity"
```

---

### Task 10: Extend conflict checking to include scheduledActivities

**Files:**
- Modify: `convex/gabinet/_availability.ts:196-294` (checkConflict function)
- Modify: `convex/gabinet/_availability.ts:128-161` (getAvailableSlots — blocked intervals)

**Step 1: In `checkConflict`, also check scheduledActivities for the resource**

After the existing appointment conflict check (line 272-291), add:

```typescript
// Check scheduledActivities for this resource (non-gabinet events blocking the employee)
const resourceActivities = await ctx.db
  .query("scheduledActivities")
  .withIndex("by_orgAndResourceAndDueDate", (q) =>
    q.eq("organizationId", args.organizationId).eq("resourceId", args.userId)
  )
  .collect();

const datePrefix = args.date; // "YYYY-MM-DD"
for (const activity of resourceActivities) {
  if (activity.isCompleted) continue;
  if (!activity.endDate) continue;
  // Filter to same day
  const actDate = new Date(activity.dueDate);
  const actDateStr = `${actDate.getFullYear()}-${String(actDate.getMonth() + 1).padStart(2, "0")}-${String(actDate.getDate()).padStart(2, "0")}`;
  if (actDateStr !== datePrefix) continue;
  // Skip if this is a gabinet:appointment (already checked above via gabinetAppointments)
  if (activity.moduleRef?.moduleId === "gabinet") continue;

  const actStartMin = actDate.getHours() * 60 + actDate.getMinutes();
  const actEndDate = new Date(activity.endDate);
  const actEndMin = actEndDate.getHours() * 60 + actEndDate.getMinutes();

  if (reqStart < actEndMin && reqEnd > actStartMin) {
    return { hasConflict: true, reason: `Conflicts with: ${activity.title}` };
  }
}
```

**Step 2: In `getAvailableSlots`, add scheduledActivities to blocked intervals**

After the existing appointments blocked intervals (line 157-160), add:

```typescript
// Also block time from non-gabinet scheduledActivities for this resource
const resourceActivities = await ctx.db
  .query("scheduledActivities")
  .withIndex("by_orgAndResourceAndDueDate", (q) =>
    q.eq("organizationId", args.organizationId).eq("resourceId", args.userId)
  )
  .collect();

for (const activity of resourceActivities) {
  if (activity.isCompleted) continue;
  if (!activity.endDate) continue;
  if (activity.moduleRef?.moduleId === "gabinet") continue; // skip, already counted
  const actDate = new Date(activity.dueDate);
  const actDateStr = `${actDate.getFullYear()}-${String(actDate.getMonth() + 1).padStart(2, "0")}-${String(actDate.getDate()).padStart(2, "0")}`;
  if (actDateStr !== args.date) continue;

  blocked.push({
    start: actDate.getHours() * 60 + actDate.getMinutes(),
    end: new Date(activity.endDate).getHours() * 60 + new Date(activity.endDate).getMinutes(),
  });
}
```

**Step 3: Verify deploys**

Run: `npx convex dev`
Expected: Deploys without error.

**Step 4: Commit**

```bash
git add convex/gabinet/_availability.ts
git commit -m "feat: conflict checking reads scheduledActivities for cross-module blocking"
```

---

## Phase 3: Basic Billing (Payments)

### Task 11: Add `payments` table to schema

**Files:**
- Modify: `convex/schema.ts` (add payments table in the Shared Services section)

**Step 1: Add payments table**

Insert near the other shared service tables (after `scheduledActivities`, around line 596):

```typescript
// --- Payments ---

payments: defineTable({
  organizationId: v.id("organizations"),
  patientId: v.optional(v.id("gabinetPatients")),
  appointmentId: v.optional(v.id("gabinetAppointments")),
  packageUsageId: v.optional(v.id("gabinetPackageUsage")),
  amount: v.number(),
  currency: v.string(),
  paymentMethod: v.union(
    v.literal("cash"),
    v.literal("card"),
    v.literal("transfer"),
    v.literal("other"),
  ),
  status: v.union(
    v.literal("pending"),
    v.literal("completed"),
    v.literal("refunded"),
    v.literal("cancelled"),
  ),
  paidAt: v.optional(v.number()),
  notes: v.optional(v.string()),
  createdBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_org", ["organizationId"])
  .index("by_orgAndStatus", ["organizationId", "status"])
  .index("by_orgAndPatient", ["organizationId", "patientId"])
  .index("by_appointment", ["appointmentId"]),
```

**Step 2: Verify schema deploys**

Run: `npx convex dev`
Expected: New table created.

**Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: add payments table to schema"
```

---

### Task 12: Create payments backend (CRUD + revenue query)

**Files:**
- Create: `convex/payments.ts`

**Step 1: Write the payments module**

```typescript
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { verifyOrgAccess } from "./_helpers/auth";
import { logActivity } from "./_helpers/activities";

const paymentMethodValidator = v.union(
  v.literal("cash"),
  v.literal("card"),
  v.literal("transfer"),
  v.literal("other"),
);

const paymentStatusValidator = v.union(
  v.literal("pending"),
  v.literal("completed"),
  v.literal("refunded"),
  v.literal("cancelled"),
);

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
    status: v.optional(paymentStatusValidator),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    if (args.status) {
      return await ctx.db
        .query("payments")
        .withIndex("by_orgAndStatus", (q) =>
          q.eq("organizationId", args.organizationId).eq("status", args.status!)
        )
        .order("desc")
        .paginate(args.paginationOpts);
    }

    return await ctx.db
      .query("payments")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getByAppointment = query({
  args: {
    organizationId: v.id("organizations"),
    appointmentId: v.id("gabinetAppointments"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return await ctx.db
      .query("payments")
      .withIndex("by_appointment", (q) => q.eq("appointmentId", args.appointmentId))
      .first();
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.optional(v.id("gabinetPatients")),
    appointmentId: v.optional(v.id("gabinetAppointments")),
    packageUsageId: v.optional(v.id("gabinetPackageUsage")),
    amount: v.number(),
    currency: v.string(),
    paymentMethod: paymentMethodValidator,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();

    const paymentId = await ctx.db.insert("payments", {
      organizationId: args.organizationId,
      patientId: args.patientId,
      appointmentId: args.appointmentId,
      packageUsageId: args.packageUsageId,
      amount: args.amount,
      currency: args.currency,
      paymentMethod: args.paymentMethod,
      status: "pending",
      notes: args.notes,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    return paymentId;
  },
});

export const markPaid = mutation({
  args: {
    organizationId: v.id("organizations"),
    paymentId: v.id("payments"),
    paymentMethod: v.optional(paymentMethodValidator),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);

    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.organizationId !== args.organizationId) {
      throw new Error("Payment not found");
    }

    if (payment.status !== "pending") {
      throw new Error(`Cannot mark ${payment.status} payment as paid`);
    }

    const now = Date.now();
    await ctx.db.patch(args.paymentId, {
      status: "completed",
      paidAt: now,
      ...(args.paymentMethod ? { paymentMethod: args.paymentMethod } : {}),
      updatedAt: now,
    });

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetAppointment",
      entityId: payment.appointmentId ?? args.paymentId,
      action: "updated",
      description: `Payment of ${payment.amount} ${payment.currency} marked as paid`,
      performedBy: user._id,
    });

    return args.paymentId;
  },
});

export const refund = mutation({
  args: {
    organizationId: v.id("organizations"),
    paymentId: v.id("payments"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);

    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.organizationId !== args.organizationId) {
      throw new Error("Payment not found");
    }

    if (payment.status !== "completed") {
      throw new Error(`Cannot refund a ${payment.status} payment`);
    }

    await ctx.db.patch(args.paymentId, {
      status: "refunded",
      notes: args.reason
        ? `${payment.notes ? payment.notes + "\n" : ""}Refund: ${args.reason}`
        : payment.notes,
      updatedAt: Date.now(),
    });

    return args.paymentId;
  },
});

/** Revenue summary for a time range */
export const getRevenueSummary = query({
  args: {
    organizationId: v.id("organizations"),
    startDate: v.number(),
    endDate: v.number(),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const payments = await ctx.db
      .query("payments")
      .withIndex("by_orgAndStatus", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "completed")
      )
      .collect();

    const filtered = payments.filter(
      (p) => p.paidAt && p.paidAt >= args.startDate && p.paidAt <= args.endDate
    );

    const total = filtered.reduce((sum, p) => sum + p.amount, 0);
    const count = filtered.length;

    // Group by payment method
    const byMethod: Record<string, { count: number; total: number }> = {};
    for (const p of filtered) {
      if (!byMethod[p.paymentMethod]) {
        byMethod[p.paymentMethod] = { count: 0, total: 0 };
      }
      byMethod[p.paymentMethod].count++;
      byMethod[p.paymentMethod].total += p.amount;
    }

    return { total, count, byMethod };
  },
});
```

**Step 2: Verify deploys**

Run: `npx convex dev`
Expected: Deploys without error.

**Step 3: Commit**

```bash
git add convex/payments.ts
git commit -m "feat: add payments CRUD with markPaid, refund, and revenue summary"
```

---

### Task 13: Auto-create pending payment on appointment completion

**Files:**
- Modify: `convex/gabinet/appointments.ts:464-551` (handleAppointmentCompletion function)

**Step 1: Add payment creation at end of handleAppointmentCompletion**

After the loyalty points section (line 549), add:

```typescript
// 3. Create pending payment (if not covered by package)
if (!args.packageUsageId && treatment && treatment.price > 0) {
  await ctx.db.insert("payments", {
    organizationId: args.organizationId,
    patientId: args.patientId,
    appointmentId: args.appointmentId,
    amount: treatment.price,
    currency: "PLN",
    paymentMethod: "cash", // default, can be changed when marking as paid
    status: "pending",
    createdBy: args.userId,
    createdAt: now,
    updatedAt: now,
  });
}
```

**Step 2: Verify deploys**

Run: `npx convex dev`
Expected: Deploys. Completing a non-package appointment now creates a pending payment.

**Step 3: Commit**

```bash
git add convex/gabinet/appointments.ts
git commit -m "feat: auto-create pending payment on appointment completion"
```

---

## Phase 4: Backend Tests

### Task 14: Set up Vitest for Convex functions

**Files:**
- Create: `convex/tests/setup.ts`
- Modify: `package.json` (add vitest if not present)

**Step 1: Install Vitest and Convex test helpers**

Run: `npm install -D vitest convex-test`

**Step 2: Create test setup file**

```typescript
// convex/tests/setup.ts
import { convexTest } from "convex-test";
import schema from "../schema";

export function createTestConvex() {
  return convexTest(schema);
}
```

**Step 3: Add test script to package.json**

In the `scripts` section of `package.json`, add:
```json
"test:convex": "vitest run --config convex/vitest.config.ts"
```

**Step 4: Create vitest config**

Create `convex/vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex", "convex-test"] } },
  },
});
```

**Step 5: Commit**

```bash
git add convex/tests/setup.ts convex/vitest.config.ts package.json package-lock.json
git commit -m "chore: set up Vitest for Convex backend tests"
```

---

### Task 15: Write appointment state machine tests

**Files:**
- Create: `convex/tests/appointments.test.ts`

**Step 1: Write tests for VALID_TRANSITIONS**

```typescript
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";

describe("Appointment State Machine", () => {
  it("allows scheduled -> confirmed transition", async () => {
    const t = convexTest(schema);
    // Setup: create user, org, membership, patient, treatment, appointment
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", { name: "Test User", email: "test@test.com" });
    });
    const orgId = await t.run(async (ctx) => {
      return await ctx.db.insert("organizations", {
        name: "Test Org", slug: "test", ownerId: userId, createdAt: Date.now(), updatedAt: Date.now(),
      });
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("teamMemberships", {
        userId, organizationId: orgId, role: "owner", joinedAt: Date.now(),
      });
    });
    const patientId = await t.run(async (ctx) => {
      return await ctx.db.insert("gabinetPatients", {
        organizationId: orgId, firstName: "Jan", createdBy: userId, createdAt: Date.now(), updatedAt: Date.now(),
      });
    });
    const treatmentId = await t.run(async (ctx) => {
      return await ctx.db.insert("gabinetTreatments", {
        organizationId: orgId, name: "Konsultacja", duration: 30, price: 100,
        isActive: true, createdBy: userId, createdAt: Date.now(), updatedAt: Date.now(),
      });
    });

    // Create appointment directly in DB
    const apptId = await t.run(async (ctx) => {
      return await ctx.db.insert("gabinetAppointments", {
        organizationId: orgId, patientId, treatmentId, employeeId: userId,
        date: "2026-03-01", startTime: "10:00", endTime: "10:30",
        status: "scheduled", isRecurring: false,
        createdBy: userId, createdAt: Date.now(), updatedAt: Date.now(),
      });
    });

    // Transition to confirmed should work
    await t.mutation(api.gabinet.appointments.updateStatus, {
      organizationId: orgId, appointmentId: apptId, status: "confirmed",
    }, { identity: { subject: userId } });

    const updated = await t.run(async (ctx) => ctx.db.get(apptId));
    expect(updated?.status).toBe("confirmed");
  });

  it("rejects completed -> scheduled transition", async () => {
    const t = convexTest(schema);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", { name: "Test", email: "t@t.com" });
    });
    const orgId = await t.run(async (ctx) => {
      return await ctx.db.insert("organizations", {
        name: "Test", slug: "test2", ownerId: userId, createdAt: Date.now(), updatedAt: Date.now(),
      });
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("teamMemberships", {
        userId, organizationId: orgId, role: "owner", joinedAt: Date.now(),
      });
    });
    const patientId = await t.run(async (ctx) => {
      return await ctx.db.insert("gabinetPatients", {
        organizationId: orgId, firstName: "Anna", createdBy: userId, createdAt: Date.now(), updatedAt: Date.now(),
      });
    });
    const treatmentId = await t.run(async (ctx) => {
      return await ctx.db.insert("gabinetTreatments", {
        organizationId: orgId, name: "Zabieg", duration: 60, price: 200,
        isActive: true, createdBy: userId, createdAt: Date.now(), updatedAt: Date.now(),
      });
    });
    const apptId = await t.run(async (ctx) => {
      return await ctx.db.insert("gabinetAppointments", {
        organizationId: orgId, patientId, treatmentId, employeeId: userId,
        date: "2026-03-01", startTime: "11:00", endTime: "12:00",
        status: "completed", isRecurring: false,
        createdBy: userId, createdAt: Date.now(), updatedAt: Date.now(),
      });
    });

    await expect(
      t.mutation(api.gabinet.appointments.updateStatus, {
        organizationId: orgId, appointmentId: apptId, status: "scheduled",
      }, { identity: { subject: userId } })
    ).rejects.toThrow("Cannot transition");
  });
});
```

Note: The exact `convex-test` API may vary. Adjust the test setup based on the actual API of the `convex-test` package. The key assertions are: valid transitions succeed, invalid transitions throw.

**Step 2: Run tests**

Run: `npm run test:convex`
Expected: Tests pass (or fail if `convex-test` API differs — adjust accordingly).

**Step 3: Commit**

```bash
git add convex/tests/appointments.test.ts
git commit -m "test: add appointment state machine transition tests"
```

---

### Task 16: Write conflict checking tests

**Files:**
- Create: `convex/tests/availability.test.ts`

**Step 1: Write conflict checking tests**

Test cases to cover:
1. Double booking same employee/time — should conflict
2. Non-overlapping times — no conflict
3. Employee on leave — should conflict
4. Outside working hours — should conflict
5. scheduledActivity blocking (cross-module) — should conflict

These tests will use direct DB inserts to set up state and call `checkConflict` / `getAvailableSlots` as pure functions (not via mutation). Since these are exported from `_availability.ts`, they can be tested by calling them with a mock `QueryCtx`.

The exact test structure depends on `convex-test`'s ability to test internal functions. If `convex-test` only supports testing via `api.*`, wrap the availability functions in query endpoints for testing, or test through the appointment create mutation (which calls checkConflict internally).

**Step 2: Run tests**

Run: `npm run test:convex`
Expected: All conflict tests pass.

**Step 3: Commit**

```bash
git add convex/tests/availability.test.ts
git commit -m "test: add conflict checking and availability tests"
```

---

### Task 17: Write payment flow tests

**Files:**
- Create: `convex/tests/payments.test.ts`

**Step 1: Test payment lifecycle**

Test cases:
1. Create payment → status is "pending"
2. Mark paid → status is "completed", paidAt is set
3. Cannot mark already-completed payment as paid again
4. Refund completed payment → status is "refunded"
5. Cannot refund a pending payment
6. Revenue summary aggregates correctly

**Step 2: Run tests and commit**

```bash
git add convex/tests/payments.test.ts
git commit -m "test: add payment lifecycle tests"
```

---

### Task 18: Write product access gating tests

**Files:**
- Create: `convex/tests/product-access.test.ts`

**Step 1: Test verifyProductAccess behavior**

Test cases:
1. No subscriptions at all → access granted (grace period)
2. Active subscription exists for requested product → access granted
3. No subscription for requested product but other products exist → access denied
4. Canceled subscription → access denied
5. Trialing subscription → access granted

**Step 2: Run tests and commit**

```bash
git add convex/tests/product-access.test.ts
git commit -m "test: add product access gating tests"
```

---

## Phase 5: Multi-tenant SaaS Launch Prep

### Task 19: Add product access checks to Gabinet backend functions

**Files:**
- Modify: `convex/gabinet/appointments.ts` (add verifyProductAccess to create, update, updateStatus)
- Modify: `convex/gabinet/scheduling.ts` (add to setWorkingHours, createLeave, etc.)

**Step 1: Import and call verifyProductAccess in mutations**

At the top of each gabinet mutation file, add:
```typescript
import { verifyProductAccess } from "../_helpers/products";
import { GABINET_PRODUCT_ID } from "./_registry";
```

In each mutation handler, after `verifyOrgAccess`, add:
```typescript
await verifyProductAccess(ctx, args.organizationId, GABINET_PRODUCT_ID);
```

Only add to mutations (write operations), not queries. This way read-only views work even without a subscription (useful for showing what gabinet offers).

**Step 2: Verify deploys**

Run: `npx convex dev`
Expected: Deploys. During grace period (no subscriptions exist), all mutations still work.

**Step 3: Commit**

```bash
git add convex/gabinet/appointments.ts convex/gabinet/scheduling.ts
git commit -m "feat: gate gabinet mutations behind product subscription check"
```

---

### Task 20: Frontend — sidebar gating by product subscription

**Files:**
- Modify: `src/components/layout/app-sidebar.tsx` (conditionally show module sections)

**Step 1: Add a query to check active product subscriptions**

Create `convex/productSubscriptions.ts`:

```typescript
import { query } from "./_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";

export const getActiveProducts = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const subs = await ctx.db
      .query("productSubscriptions")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    // If no subscriptions exist at all, return all products (grace period)
    if (subs.length === 0) {
      return ["crm", "gabinet"];
    }

    return subs
      .filter((s) => s.status === "active" || s.status === "trialing")
      .map((s) => s.productId);
  },
});
```

**Step 2: In the sidebar, use active products to show/hide sections**

In `app-sidebar.tsx`, query `api.productSubscriptions.getActiveProducts` and conditionally render CRM items (when `activeProducts.includes("crm")`) and Gabinet items (when `activeProducts.includes("gabinet")`).

**Step 3: Verify UI works**

Run the dev server: `npm run dev`
Expected: Sidebar shows both CRM and Gabinet sections (grace period — no subscriptions exist).

**Step 4: Commit**

```bash
git add convex/productSubscriptions.ts src/components/layout/app-sidebar.tsx
git commit -m "feat: sidebar product gating with grace period"
```

---

### Task 21: Seed platform products

**Files:**
- Modify: `convex/seedDefaults.ts` (add platformProducts seeding)

**Step 1: Add platformProducts seeding**

In `seedOrganizationDefaultsHandler`, add a new section:

```typescript
// --- Platform Products (global, not per-org) ---
const existingProducts = await ctx.db
  .query("platformProducts")
  .first();

if (!existingProducts) {
  const products = [
    {
      productId: "crm",
      name: "CRM",
      description: "Contact management, leads, pipelines, deals, documents, email",
      prices: { month: { usd: 29, eur: 27 }, year: { usd: 290, eur: 270 } },
    },
    {
      productId: "gabinet",
      name: "Gabinet",
      description: "Patient management, appointments, treatments, scheduling, billing",
      prices: { month: { usd: 49, eur: 45 }, year: { usd: 490, eur: 450 } },
    },
  ];

  for (const prod of products) {
    await ctx.db.insert("platformProducts", {
      ...prod,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }
}
```

**Step 2: Verify and commit**

```bash
git add convex/seedDefaults.ts
git commit -m "feat: seed platform products (CRM, Gabinet)"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| 1. Architecture Formalization | 1-7 | moduleRef/resourceId on scheduledActivities, productSubscriptions tables, verifyProductAccess helper, module registries for CRM and Gabinet |
| 2. Dual Write | 8-10 | Appointment creates scheduledActivity, status syncs, conflict checking reads both sources |
| 3. Basic Billing | 11-13 | Payments table, CRUD, auto-create on completion, revenue summary |
| 4. Tests | 14-18 | Vitest setup, state machine tests, conflict tests, payment tests, access gating tests |
| 5. SaaS Launch Prep | 19-21 | Product access gating on mutations, sidebar gating, platform products seeded |

Frontend completion tasks (packages UI, loyalty panel, medical documents, calendar extraction to shared components) are intentionally deferred to a follow-up plan — the backend foundations in this plan must land first.
