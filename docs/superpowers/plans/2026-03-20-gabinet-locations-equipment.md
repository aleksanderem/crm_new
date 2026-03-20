# Gabinet Locations & Equipment Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-location support (branches + rooms) and equipment inventory management to the Gabinet module, with location-aware scheduling, room conflict detection, and equipment availability validation during appointment booking.

**Architecture:** Three new tables (locations, rooms, equipment) plus a transfer audit log. Optional locationId/roomId fields added to existing schedules, appointments, and working hours tables. Availability logic extended with room conflict checking and equipment location validation. Two new settings pages for management UI.

**Tech Stack:** Convex (schema, mutations, queries), React 19, TanStack Router/Query, shadcn/ui, i18next (PL/EN)

**Spec:** `docs/superpowers/specs/2026-03-20-gabinet-locations-equipment-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `convex/gabinet/locations.ts` | CRUD mutations/queries for locations and rooms |
| `convex/gabinet/equipment.ts` | CRUD mutations/queries for equipment, transfers |
| `src/routes/_app/_auth/dashboard/_layout.gabinet.settings.locations.tsx` | Locations + rooms settings page |
| `src/routes/_app/_auth/dashboard/_layout.gabinet.settings.equipment.tsx` | Equipment inventory settings page |

### Modified Files
| File | Changes |
|------|---------|
| `convex/schema/gabinet.ts` | 4 new table definitions + field additions to 4 existing tables |
| `convex/gabinet/_availability.ts` | Room conflict check, equipment availability check, location resolution, effectiveFrom/To filtering fix |
| `convex/gabinet/appointments.ts` | locationId/roomId in create + update mutations, update getAvailableSlotsQuery to accept locationId |
| `convex/gabinet/treatments.ts` | requiredEquipmentIds field in create/update |
| `convex/gabinet/scheduling.ts` | locationId in saveSchedulePeriod/setEmployeeSchedule/bulkSetEmployeeSchedule/setWorkingHours/bulkSetWorkingHours, pass locationId to getAvailableSlots |
| `convex/gabinet/patientPortal.ts` | Pass locationId to getAvailableSlots callers |
| `src/components/gabinet/appointment-form.tsx` | Location/room selectors, equipment validation |
| `src/components/gabinet/calendar/appointment-detail-dialog.tsx` | Location + room display |
| `src/components/gabinet/treatment-form.tsx` | Equipment multi-select replacing string input |
| `src/routes/_app/_auth/dashboard/_layout.gabinet.employees.$employeeId.tsx` | Schedule location dropdown |
| `src/components/layout/app-sidebar.tsx` | Nav items for locations/equipment settings |
| `public/locales/pl/translation.json` | PL i18n keys |
| `public/locales/en/translation.json` | EN i18n keys |

---

## Task 1: Schema — New Tables + Field Additions

**Files:**
- Modify: `convex/schema/gabinet.ts`

This task adds all 4 new tables and all field additions to existing tables in one schema push, so that subsequent tasks can use the full schema immediately.

- [ ] **Step 1: Add gabinetLocations table**

Insert after the last gabinet table definition (before any non-gabinet tables). Add:

```typescript
gabinetLocations: defineTable({
  organizationId: v.id("organizations"),
  name: v.string(),
  address: v.optional(v.object({
    street: v.optional(v.string()),
    city: v.optional(v.string()),
    postalCode: v.optional(v.string()),
    country: v.optional(v.string()),
  })),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
  color: v.optional(v.string()),
  isActive: v.boolean(),
  createdBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.optional(v.number()),
})
  .index("by_org", ["organizationId"])
  .searchIndex("search_name", {
    searchField: "name",
    filterFields: ["organizationId"],
  }),
```

- [ ] **Step 2: Add gabinetRooms table**

```typescript
gabinetRooms: defineTable({
  organizationId: v.id("organizations"),
  locationId: v.id("gabinetLocations"),
  name: v.string(),
  description: v.optional(v.string()),
  floor: v.optional(v.string()),
  isActive: v.boolean(),
  createdAt: v.number(),
})
  .index("by_org", ["organizationId"])
  .index("by_location", ["locationId"]),
```

- [ ] **Step 3: Add gabinetEquipment table**

```typescript
gabinetEquipment: defineTable({
  organizationId: v.id("organizations"),
  name: v.string(),
  description: v.optional(v.string()),
  serialNumber: v.optional(v.string()),
  currentLocationId: v.optional(v.id("gabinetLocations")),
  currentRoomId: v.optional(v.id("gabinetRooms")),
  status: v.union(
    v.literal("available"),
    v.literal("in_use"),
    v.literal("maintenance"),
    v.literal("retired"),
  ),
  createdBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.optional(v.number()),
})
  .index("by_org", ["organizationId"])
  .index("by_location", ["organizationId", "currentLocationId"])
  .index("by_room", ["organizationId", "currentRoomId"])
  .searchIndex("search_name", {
    searchField: "name",
    filterFields: ["organizationId"],
  }),
```

- [ ] **Step 4: Add gabinetEquipmentTransfers table**

```typescript
gabinetEquipmentTransfers: defineTable({
  organizationId: v.id("organizations"),
  equipmentId: v.id("gabinetEquipment"),
  fromLocationId: v.optional(v.id("gabinetLocations")),
  toLocationId: v.id("gabinetLocations"),
  toRoomId: v.optional(v.id("gabinetRooms")),
  transferredBy: v.id("users"),
  transferredAt: v.number(),
  notes: v.optional(v.string()),
})
  .index("by_equipment", ["equipmentId"])
  .index("by_org", ["organizationId"])
  .index("by_orgAndTime", ["organizationId", "transferredAt"]),
```

- [ ] **Step 5: Add fields to existing tables**

In `gabinetEmployeeSchedules` definition, add:
```typescript
locationId: v.optional(v.id("gabinetLocations")),
```

In `gabinetAppointments` definition, add fields:
```typescript
locationId: v.optional(v.id("gabinetLocations")),
roomId: v.optional(v.id("gabinetRooms")),
```

And add index:
```typescript
.index("by_orgAndRoomAndDate", ["organizationId", "roomId", "date"])
```

In `gabinetTreatments` definition, add (keep old `requiredEquipment` for migration):
```typescript
requiredEquipmentIds: v.optional(v.array(v.id("gabinetEquipment"))),
```

In `gabinetWorkingHours` definition, add:
```typescript
locationId: v.optional(v.id("gabinetLocations")),
```

And add index:
```typescript
.index("by_orgAndLocation", ["organizationId", "locationId"])
```

- [ ] **Step 6: Push schema**

Run: `npx convex dev --once`
Expected: Schema pushes successfully with no errors.

- [ ] **Step 7: Commit**

```bash
git add convex/schema/gabinet.ts
git commit -m "feat(gabinet): add schema for locations, rooms, equipment, transfers"
```

---

## Task 2: Backend — Locations & Rooms CRUD

**Files:**
- Create: `convex/gabinet/locations.ts`

- [ ] **Step 1: Create locations.ts with list and get queries**

```typescript
import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "../_helpers/auth";
import { checkPermission } from "../_helpers/permissions";
import { verifyProductAccess } from "../_helpers/products";
import { GABINET_PRODUCT_ID } from "./_registry";

export const listLocations = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return await ctx.db
      .query("gabinetLocations")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
  },
});

export const getLocation = query({
  args: {
    organizationId: v.id("organizations"),
    locationId: v.id("gabinetLocations"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const location = await ctx.db.get(args.locationId);
    if (!location || location.organizationId !== args.organizationId) return null;
    const rooms = await ctx.db
      .query("gabinetRooms")
      .withIndex("by_location", (q) => q.eq("locationId", args.locationId))
      .collect();
    return { ...location, rooms };
  },
});
```

- [ ] **Step 2: Add create and update location mutations**

Follow the treatment create/update pattern: `verifyOrgAccess` → `checkPermission` → `db.insert`/`db.patch`.

```typescript
export const createLocation = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    address: v.optional(v.object({
      street: v.optional(v.string()),
      city: v.optional(v.string()),
      postalCode: v.optional(v.string()),
      country: v.optional(v.string()),
    })),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    await verifyProductAccess(ctx, args.organizationId, GABINET_PRODUCT_ID);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_settings", "edit");
    if (!perm.allowed) throw new Error("Permission denied");
    const now = Date.now();
    return await ctx.db.insert("gabinetLocations", {
      ...args,
      isActive: true,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateLocation = mutation({
  args: {
    organizationId: v.id("organizations"),
    locationId: v.id("gabinetLocations"),
    name: v.optional(v.string()),
    address: v.optional(v.object({
      street: v.optional(v.string()),
      city: v.optional(v.string()),
      postalCode: v.optional(v.string()),
      country: v.optional(v.string()),
    })),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    color: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    await verifyProductAccess(ctx, args.organizationId, GABINET_PRODUCT_ID);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_settings", "edit");
    if (!perm.allowed) throw new Error("Permission denied");
    const location = await ctx.db.get(args.locationId);
    if (!location || location.organizationId !== args.organizationId) {
      throw new Error("Location not found");
    }
    const { organizationId, locationId, ...updates } = args;
    await ctx.db.patch(locationId, { ...updates, updatedAt: Date.now() });
    return locationId;
  },
});
```

- [ ] **Step 3: Add deleteLocation mutation**

```typescript
export const deleteLocation = mutation({
  args: {
    organizationId: v.id("organizations"),
    locationId: v.id("gabinetLocations"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    await verifyProductAccess(ctx, args.organizationId, GABINET_PRODUCT_ID);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_settings", "edit");
    if (!perm.allowed) throw new Error("Permission denied");
    const location = await ctx.db.get(args.locationId);
    if (!location || location.organizationId !== args.organizationId) {
      throw new Error("Location not found");
    }
    // Block if active appointments reference this location
    const activeAppts = await ctx.db
      .query("gabinetAppointments")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .filter((q) =>
        q.and(
          q.eq(q.field("locationId"), args.locationId),
          q.neq(q.field("status"), "cancelled"),
          q.neq(q.field("status"), "completed"),
          q.neq(q.field("status"), "no_show"),
        )
      )
      .first();
    if (activeAppts) {
      throw new Error("Cannot delete location with active appointments");
    }
    // Soft-delete: mark inactive
    await ctx.db.patch(args.locationId, { isActive: false, updatedAt: Date.now() });
    return args.locationId;
  },
});
```

- [ ] **Step 4: Add room CRUD**

```typescript
export const listRooms = query({
  args: {
    organizationId: v.id("organizations"),
    locationId: v.id("gabinetLocations"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return await ctx.db
      .query("gabinetRooms")
      .withIndex("by_location", (q) => q.eq("locationId", args.locationId))
      .collect();
  },
});

export const createRoom = mutation({
  args: {
    organizationId: v.id("organizations"),
    locationId: v.id("gabinetLocations"),
    name: v.string(),
    description: v.optional(v.string()),
    floor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    await verifyProductAccess(ctx, args.organizationId, GABINET_PRODUCT_ID);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_settings", "edit");
    if (!perm.allowed) throw new Error("Permission denied");
    const location = await ctx.db.get(args.locationId);
    if (!location || location.organizationId !== args.organizationId) {
      throw new Error("Location not found");
    }
    return await ctx.db.insert("gabinetRooms", {
      ...args,
      isActive: true,
      createdAt: Date.now(),
    });
  },
});

export const updateRoom = mutation({
  args: {
    organizationId: v.id("organizations"),
    roomId: v.id("gabinetRooms"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    floor: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    await verifyProductAccess(ctx, args.organizationId, GABINET_PRODUCT_ID);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_settings", "edit");
    if (!perm.allowed) throw new Error("Permission denied");
    const room = await ctx.db.get(args.roomId);
    if (!room || room.organizationId !== args.organizationId) {
      throw new Error("Room not found");
    }
    const { organizationId, roomId, ...updates } = args;
    await ctx.db.patch(roomId, updates);
    return roomId;
  },
});

export const deleteRoom = mutation({
  args: {
    organizationId: v.id("organizations"),
    roomId: v.id("gabinetRooms"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    await verifyProductAccess(ctx, args.organizationId, GABINET_PRODUCT_ID);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_settings", "edit");
    if (!perm.allowed) throw new Error("Permission denied");
    const room = await ctx.db.get(args.roomId);
    if (!room || room.organizationId !== args.organizationId) {
      throw new Error("Room not found");
    }
    // Block if active appointments reference this room
    const activeAppt = await ctx.db
      .query("gabinetAppointments")
      .withIndex("by_orgAndRoomAndDate", (q) =>
        q.eq("organizationId", args.organizationId).eq("roomId", args.roomId)
      )
      .filter((q) =>
        q.and(
          q.neq(q.field("status"), "cancelled"),
          q.neq(q.field("status"), "completed"),
          q.neq(q.field("status"), "no_show"),
        )
      )
      .first();
    if (activeAppt) {
      throw new Error("Cannot delete room with active appointments");
    }
    await ctx.db.patch(args.roomId, { isActive: false });
    return args.roomId;
  },
});
```

- [ ] **Step 5: Verify**

Run: `npx convex dev --once`
Expected: No type errors. Functions registered.

- [ ] **Step 6: Commit**

```bash
git add convex/gabinet/locations.ts
git commit -m "feat(gabinet): add locations and rooms CRUD backend"
```

---

## Task 3: Backend — Equipment CRUD & Transfers

**Files:**
- Create: `convex/gabinet/equipment.ts`

- [ ] **Step 1: Create equipment.ts with list and get queries**

```typescript
import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "../_helpers/auth";
import { checkPermission } from "../_helpers/permissions";
import { verifyProductAccess } from "../_helpers/products";
import { GABINET_PRODUCT_ID } from "./_registry";

export const listEquipment = query({
  args: {
    organizationId: v.id("organizations"),
    locationId: v.optional(v.id("gabinetLocations")),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    if (args.locationId) {
      return await ctx.db
        .query("gabinetEquipment")
        .withIndex("by_location", (q) =>
          q.eq("organizationId", args.organizationId)
            .eq("currentLocationId", args.locationId)
        )
        .collect();
    }
    return await ctx.db
      .query("gabinetEquipment")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
  },
});

export const getEquipment = query({
  args: {
    organizationId: v.id("organizations"),
    equipmentId: v.id("gabinetEquipment"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const equipment = await ctx.db.get(args.equipmentId);
    if (!equipment || equipment.organizationId !== args.organizationId) return null;
    const location = equipment.currentLocationId
      ? await ctx.db.get(equipment.currentLocationId)
      : null;
    const room = equipment.currentRoomId
      ? await ctx.db.get(equipment.currentRoomId)
      : null;
    return { ...equipment, location, room };
  },
});
```

- [ ] **Step 2: Add create and update equipment mutations**

```typescript
const equipmentStatusValidator = v.union(
  v.literal("available"),
  v.literal("in_use"),
  v.literal("maintenance"),
  v.literal("retired"),
);

export const createEquipment = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    currentLocationId: v.optional(v.id("gabinetLocations")),
    currentRoomId: v.optional(v.id("gabinetRooms")),
    status: v.optional(equipmentStatusValidator),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    await verifyProductAccess(ctx, args.organizationId, GABINET_PRODUCT_ID);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_settings", "edit");
    if (!perm.allowed) throw new Error("Permission denied");
    const now = Date.now();
    return await ctx.db.insert("gabinetEquipment", {
      ...args,
      status: args.status ?? "available",
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateEquipment = mutation({
  args: {
    organizationId: v.id("organizations"),
    equipmentId: v.id("gabinetEquipment"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    status: v.optional(equipmentStatusValidator),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    await verifyProductAccess(ctx, args.organizationId, GABINET_PRODUCT_ID);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_settings", "edit");
    if (!perm.allowed) throw new Error("Permission denied");
    const equipment = await ctx.db.get(args.equipmentId);
    if (!equipment || equipment.organizationId !== args.organizationId) {
      throw new Error("Equipment not found");
    }
    const { organizationId, equipmentId, ...updates } = args;
    await ctx.db.patch(equipmentId, { ...updates, updatedAt: Date.now() });
    return equipmentId;
  },
});
```

- [ ] **Step 3: Add transfer mutation and transfer history query**

```typescript
export const transferEquipment = mutation({
  args: {
    organizationId: v.id("organizations"),
    equipmentId: v.id("gabinetEquipment"),
    toLocationId: v.id("gabinetLocations"),
    toRoomId: v.optional(v.id("gabinetRooms")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    await verifyProductAccess(ctx, args.organizationId, GABINET_PRODUCT_ID);

    const equipment = await ctx.db.get(args.equipmentId);
    if (!equipment || equipment.organizationId !== args.organizationId) {
      throw new Error("Equipment not found");
    }

    const toLocation = await ctx.db.get(args.toLocationId);
    if (!toLocation || toLocation.organizationId !== args.organizationId) {
      throw new Error("Target location not found");
    }

    const now = Date.now();

    // Log the transfer
    await ctx.db.insert("gabinetEquipmentTransfers", {
      organizationId: args.organizationId,
      equipmentId: args.equipmentId,
      fromLocationId: equipment.currentLocationId ?? undefined,
      toLocationId: args.toLocationId,
      toRoomId: args.toRoomId,
      transferredBy: user._id,
      transferredAt: now,
      notes: args.notes,
    });

    // Update equipment location
    await ctx.db.patch(args.equipmentId, {
      currentLocationId: args.toLocationId,
      currentRoomId: args.toRoomId,
      updatedAt: now,
    });

    return args.equipmentId;
  },
});

export const listTransfers = query({
  args: {
    organizationId: v.id("organizations"),
    equipmentId: v.id("gabinetEquipment"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return await ctx.db
      .query("gabinetEquipmentTransfers")
      .withIndex("by_equipment", (q) => q.eq("equipmentId", args.equipmentId))
      .order("desc")
      .collect();
  },
});
```

- [ ] **Step 4: Verify**

Run: `npx convex dev --once`
Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add convex/gabinet/equipment.ts
git commit -m "feat(gabinet): add equipment CRUD and transfer backend"
```

---

## Task 4: Backend — Availability Logic Extensions

**Files:**
- Modify: `convex/gabinet/_availability.ts`

This is the most critical task. Extends `checkConflict()` with room checking, adds equipment availability validation, adds location resolution from employee schedule, and fixes the `.first()` bug for effectiveFrom/effectiveTo.

- [ ] **Step 1: Add resolveScheduleForDate helper**

At the top of `_availability.ts`, add a helper that correctly resolves an employee's schedule for a specific date, filtering by effectiveFrom/effectiveTo. This replaces the `.first()` calls throughout the file.

```typescript
async function resolveScheduleForDate(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  userId: Id<"users">,
  dayOfWeek: number,
  date: string, // YYYY-MM-DD
) {
  const candidates = await ctx.db
    .query("gabinetEmployeeSchedules")
    .withIndex("by_orgUserAndDay", (q) =>
      q.eq("organizationId", organizationId)
        .eq("userId", userId)
        .eq("dayOfWeek", dayOfWeek)
    )
    .collect();

  // Filter by effectiveFrom/effectiveTo — null means unbounded
  const matching = candidates.filter((c) => {
    if (c.effectiveFrom && date < c.effectiveFrom) return false;
    if (c.effectiveTo && date > c.effectiveTo) return false;
    return true;
  });

  // Sort by effectiveFrom descending (most recent/specific first), nulls last
  matching.sort((a, b) => {
    if (a.effectiveFrom && b.effectiveFrom) return b.effectiveFrom.localeCompare(a.effectiveFrom);
    if (a.effectiveFrom) return -1;
    if (b.effectiveFrom) return 1;
    return 0;
  });
  return matching[0] ?? null;
}
```

- [ ] **Step 2: Replace `.first()` calls in checkConflict and getAvailableSlots with resolveScheduleForDate**

Find all instances where employee schedule is fetched with `.first()` and replace with the new helper. Pass the `date` argument through.

- [ ] **Step 3: Add resolveAppointmentLocation function**

```typescript
export async function resolveAppointmentLocation(
  ctx: QueryCtx,
  args: {
    organizationId: Id<"organizations">;
    userId: Id<"users">;
    date: string;
  }
): Promise<Id<"gabinetLocations"> | null> {
  const dayOfWeek = new Date(args.date + "T00:00:00").getDay();
  const schedule = await resolveScheduleForDate(
    ctx, args.organizationId, args.userId, dayOfWeek, args.date
  );
  return schedule?.locationId ?? null;
}
```

- [ ] **Step 4: Add room conflict check inside checkConflict**

Extend `checkConflict` args to accept optional `roomId`. After the existing employee conflict check, add:

```typescript
// Room conflict check
if (args.roomId) {
  const roomAppointments = await ctx.db
    .query("gabinetAppointments")
    .withIndex("by_orgAndRoomAndDate", (q) =>
      q.eq("organizationId", args.organizationId)
        .eq("roomId", args.roomId)
        .eq("date", args.date)
    )
    .collect();

  for (const appt of roomAppointments) {
    if (args.excludeAppointmentId && appt._id === args.excludeAppointmentId) continue;
    if (appt.status === "cancelled" || appt.status === "no_show") continue;
    if (appt.startTime < args.endTime && appt.endTime > args.startTime) {
      return { hasConflict: true, reason: "Room is occupied at this time" };
    }
  }
}
```

- [ ] **Step 5: Add checkEquipmentAvailability function**

```typescript
export async function checkEquipmentAvailability(
  ctx: QueryCtx,
  args: {
    organizationId: Id<"organizations">;
    requiredEquipmentIds: Id<"gabinetEquipment">[];
    locationId: Id<"gabinetLocations">;
  }
): Promise<{ available: boolean; missing: { name: string; currentLocation?: string }[] }> {
  const missing: { name: string; currentLocation?: string }[] = [];

  for (const eqId of args.requiredEquipmentIds) {
    const equipment = await ctx.db.get(eqId);
    if (!equipment || equipment.organizationId !== args.organizationId) {
      missing.push({ name: "Unknown equipment" });
      continue;
    }
    if (equipment.status !== "available") {
      missing.push({ name: equipment.name, currentLocation: `Status: ${equipment.status}` });
      continue;
    }
    if (equipment.currentLocationId !== args.locationId) {
      const loc = equipment.currentLocationId
        ? await ctx.db.get(equipment.currentLocationId)
        : null;
      missing.push({ name: equipment.name, currentLocation: loc?.name ?? "Unassigned" });
    }
  }

  return { available: missing.length === 0, missing };
}
```

- [ ] **Step 6: Update getAvailableSlots to accept optional locationId**

Add `locationId?: Id<"gabinetLocations">` to the args. When resolving working hours, first try location-specific hours via `by_orgAndLocation` with that locationId, then fall back to org defaults (locationId undefined).

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 8: Commit**

```bash
git add convex/gabinet/_availability.ts
git commit -m "feat(gabinet): extend availability with room conflicts, equipment checks, location resolution"
```

---

## Task 5: Backend — Appointment Mutations Integration

**Files:**
- Modify: `convex/gabinet/appointments.ts`

- [ ] **Step 1: Add locationId and roomId to create mutation args**

Add to the `create` mutation's args:
```typescript
locationId: v.optional(v.id("gabinetLocations")),
roomId: v.optional(v.id("gabinetRooms")),
```

- [ ] **Step 2: Add roomId to existing checkConflict call + location resolution + equipment check**

Pass `args.roomId` to the existing `checkConflict` call (which now handles room conflicts since Task 4 Step 4). After that call, add:

```typescript
// Resolve location from employee schedule (or use explicit)
let resolvedLocationId = args.locationId ?? null;
if (!resolvedLocationId) {
  resolvedLocationId = await resolveAppointmentLocation(ctx, {
    organizationId: args.organizationId,
    userId: args.employeeId,
    date: args.date,
  });
}

// Check equipment availability if treatment has required equipment and location is known
// This is a SOFT CHECK — returns data for the frontend to display as a warning
if (resolvedLocationId && treatment?.requiredEquipmentIds?.length) {
  const eqCheck = await checkEquipmentAvailability(ctx, {
    organizationId: args.organizationId,
    requiredEquipmentIds: treatment.requiredEquipmentIds,
    locationId: resolvedLocationId,
  });
  // Note: equipment check is advisory — don't throw. The frontend shows warnings.
  // If hard blocking is desired, uncomment the throw below:
  // if (!eqCheck.available) {
  //   const names = eqCheck.missing.map((m) => m.name).join(", ");
  //   throw new Error(`Required equipment not at this location: ${names}`);
  // }
}
```

Include `locationId: resolvedLocationId ?? undefined` and `roomId: args.roomId` in the insert data.

- [ ] **Step 3: Add locationId and roomId to update mutation args**

Add to the `update` mutation's args:
```typescript
locationId: v.optional(v.id("gabinetLocations")),
roomId: v.optional(v.id("gabinetRooms")),
```

In the conflict-checking block (when date/time/employee change), also pass `roomId` to `checkConflict`. Re-resolve location if employee or date changed. Re-validate equipment availability at the new location.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: Clean.

- [ ] **Step 5: Commit**

```bash
git add convex/gabinet/appointments.ts
git commit -m "feat(gabinet): add location/room/equipment to appointment create and update"
```

---

## Task 6: Backend — Schedule & Treatment Changes

**Files:**
- Modify: `convex/gabinet/scheduling.ts`
- Modify: `convex/gabinet/treatments.ts`
- Modify: `convex/gabinet/patientPortal.ts`

- [ ] **Step 1: Add locationId to all schedule-setting mutations**

In `scheduling.ts`, add `locationId: v.optional(v.id("gabinetLocations"))` to:
- `saveSchedulePeriod` — in each item of the `hours` array arg, include in insert/patch data
- `setEmployeeSchedule` — add to args, include in insert/patch data
- `bulkSetEmployeeSchedule` — add to each item in the array arg, include in insert/patch data

- [ ] **Step 1b: Add locationId to working hours mutations**

In `scheduling.ts`, add `locationId: v.optional(v.id("gabinetLocations"))` to:
- `setWorkingHours` — add to args, include in insert/patch data
- `bulkSetWorkingHours` — add to each item in the array arg, include in insert/patch data

Without this, per-location working hours records can never be created, and `getAvailableSlots` would find no location-specific rows.

- [ ] **Step 2: Pass locationId to getAvailableSlots callers**

In `scheduling.ts` and `patientPortal.ts`, where `getAvailableSlots` is called, resolve and pass the `locationId` parameter. If not available, pass undefined (backward compat).

Also update `getAvailableSlotsQuery` in `appointments.ts` (line ~578) to accept optional `locationId` arg and pass it through to `getAvailableSlots`. This is a public query that the frontend uses directly.

- [ ] **Step 3: Add requiredEquipmentIds to treatment create/update**

In `treatments.ts`, add `requiredEquipmentIds: v.optional(v.array(v.id("gabinetEquipment")))` to both create and update mutation args. Include in insert/patch data.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add convex/gabinet/scheduling.ts convex/gabinet/treatments.ts convex/gabinet/patientPortal.ts
git commit -m "feat(gabinet): add locationId to schedules, equipmentIds to treatments"
```

---

## Task 7: i18n Keys

**Files:**
- Modify: `public/locales/pl/translation.json`
- Modify: `public/locales/en/translation.json`

- [ ] **Step 1: Add PL keys under gabinet.locations, gabinet.equipment, and gabinet.appointment**

Add all keys from the spec i18n tables. The JSON structure uses nested objects (not flat dot-notation). Example nesting:

```json
{
  "gabinet": {
    "locations": {
      "title": "Lokalizacje",
      "addLocation": "Dodaj lokalizację",
      "name": "Nazwa",
      "address": "Adres",
      "phone": "Telefon",
      "email": "Email",
      "rooms": "Gabinety",
      "addRoom": "Dodaj gabinet",
      "roomName": "Nazwa gabinetu",
      "floor": "Piętro",
      "noLocations": "Brak lokalizacji",
      "noRooms": "Brak gabinetów",
      "deleteConfirm": "Czy na pewno chcesz usunąć tę lokalizację?",
      "activeAppointments": "Nie można usunąć lokalizacji z aktywnymi wizytami"
    },
    "equipment": {
      "title": "Sprzęt",
      "addEquipment": "Dodaj sprzęt",
      "name": "Nazwa",
      "serialNumber": "Numer seryjny",
      "description": "Opis",
      "status": "Status",
      "currentLocation": "Aktualna lokalizacja",
      "transfer": "Przenieś",
      "transferHistory": "Historia przeniesień",
      "transferTo": "Przenieś do",
      "notes": "Notatki",
      "noEquipment": "Brak sprzętu",
      "statuses": {
        "available": "Dostępny",
        "in_use": "W użyciu",
        "maintenance": "Serwis",
        "retired": "Wycofany"
      }
    },
    "appointment": {
      "location": "Lokalizacja",
      "room": "Gabinet",
      "autoLocation": "Auto (z grafiku)",
      "roomConflict": "Gabinet zajęty w tym terminie",
      "equipmentWarning": "Brak wymaganego sprzętu w tej lokalizacji"
    }
  }
}
```

- [ ] **Step 2: Add EN keys**

Mirror all PL keys with EN translations. Same nesting structure.

- [ ] **Step 3: Commit**

```bash
git add public/locales/pl/translation.json public/locales/en/translation.json
git commit -m "feat(gabinet): add i18n keys for locations and equipment (PL + EN)"
```

---

## Task 8: Frontend — Locations Settings Page

**Files:**
- Create: `src/routes/_app/_auth/dashboard/_layout.gabinet.settings.locations.tsx`
- Modify: `src/components/layout/app-sidebar.tsx` (add nav item)

Follow the leaves settings page pattern (`_layout.gabinet.settings.leaves.tsx`).

- [ ] **Step 1: Create the route file with page component**

Page structure:
- Page header: "Lokalizacje" with "Dodaj lokalizację" button
- List of location cards, each showing: name, address, phone, room count, active badge
- Expand/click a location → inline edit form (name, address, phone, email, color picker) + rooms sub-list
- Rooms sub-list: room name, floor, active toggle, delete button
- "Dodaj gabinet" button within each location
- Dialogs for adding/editing locations and rooms

Use `useQuery(convexQuery(api.gabinet.locations.listLocations, { organizationId }))` for data and `useMutation(api.gabinet.locations.createLocation)` etc. for mutations.

- [ ] **Step 2: Add nav item to sidebar**

In `app-sidebar.tsx`, add "Lokalizacje" link under gabinet settings section pointing to `/dashboard/gabinet/settings/locations`.

- [ ] **Step 3: Verify in browser**

Navigate to the locations settings page. Create a location with address and rooms. Verify data persists.

- [ ] **Step 4: Commit**

```bash
git add src/routes/_app/_auth/dashboard/_layout.gabinet.settings.locations.tsx src/components/layout/app-sidebar.tsx
git commit -m "feat(gabinet): add locations settings page with rooms management"
```

---

## Task 9: Frontend — Equipment Settings Page

**Files:**
- Create: `src/routes/_app/_auth/dashboard/_layout.gabinet.settings.equipment.tsx`
- Modify: `src/components/layout/app-sidebar.tsx` (add nav item)

- [ ] **Step 1: Create the route file with page component**

Page structure:
- Page header: "Sprzęt" with "Dodaj sprzęt" button
- Table: name, serial number, current location badge, status badge, actions
- Click to edit: name, description, serial number, status dropdown
- Transfer action button → dialog with location selector, optional room, notes field
- Expandable transfer history per item

- [ ] **Step 2: Add nav item to sidebar**

Add "Sprzęt" link under gabinet settings.

- [ ] **Step 3: Verify in browser**

Create equipment, assign to location, transfer between locations. Verify transfer log.

- [ ] **Step 4: Commit**

```bash
git add src/routes/_app/_auth/dashboard/_layout.gabinet.settings.equipment.tsx src/components/layout/app-sidebar.tsx
git commit -m "feat(gabinet): add equipment settings page with transfer management"
```

---

## Task 10: Frontend — Employee Schedule Location Assignment

**Files:**
- Modify: `src/routes/_app/_auth/dashboard/_layout.gabinet.employees.$employeeId.tsx`

- [ ] **Step 1: Add location dropdown to schedule editor**

In the employee schedule section, each day row gets an optional location selector (populated from `listLocations` query). The selected locationId is included in the `saveSchedulePeriod` mutation call.

- [ ] **Step 2: Verify in browser**

Set an employee schedule with different locations per day. Verify data saves and displays correctly.

- [ ] **Step 3: Commit**

```bash
git add src/routes/_app/_auth/dashboard/_layout.gabinet.employees.\$employeeId.tsx
git commit -m "feat(gabinet): add location assignment to employee schedule"
```

---

## Task 11: Frontend — Treatment Form Equipment Selection

**Files:**
- Modify: `src/components/gabinet/treatment-form.tsx`
- Modify: `src/routes/_app/_auth/dashboard/_layout.gabinet.treatments.$treatmentId.tsx`

- [ ] **Step 1: Replace requiredEquipment string input with equipment multi-select**

Remove the free-text input for `requiredEquipment`. Add a multi-select dropdown that fetches from `listEquipment` query and saves `requiredEquipmentIds`. Show equipment name + current location as context.

- [ ] **Step 2: Update treatment detail page to display equipment references**

In the treatment detail overview, show linked equipment with their current locations instead of plain strings.

- [ ] **Step 3: Verify in browser**

Edit a treatment, select equipment from dropdown, save. Verify the treatment detail shows equipment correctly.

- [ ] **Step 4: Commit**

```bash
git add src/components/gabinet/treatment-form.tsx src/routes/_app/_auth/dashboard/_layout.gabinet.treatments.\$treatmentId.tsx
git commit -m "feat(gabinet): replace equipment text input with entity references in treatment form"
```

---

## Task 12: Frontend — Appointment Form Location & Room

**Files:**
- Modify: `src/components/gabinet/appointment-form.tsx`
- Modify: `src/components/gabinet/calendar/appointment-detail-dialog.tsx`

- [ ] **Step 1: Add location and room to appointment form**

After employee + date selection:
1. Auto-resolve location from employee schedule (display as badge)
2. Allow override via location dropdown
3. Show room selector filtered by the resolved location
4. If treatment has requiredEquipmentIds, call `checkEquipmentAvailability` from a separate query (not the create mutation) and show results as soft warnings (yellow badge per missing item with current location info). This is advisory — users can still proceed with booking.

- [ ] **Step 2: Update appointment detail dialog**

Show location name, room name, and equipment status in the appointment detail view.

- [ ] **Step 3: Verify in browser**

Create an appointment with a located employee. Verify location auto-resolves. Select a room. Verify room conflict detection. Verify equipment warning when equipment is at wrong location.

- [ ] **Step 4: Commit**

```bash
git add src/components/gabinet/appointment-form.tsx src/components/gabinet/calendar/appointment-detail-dialog.tsx
git commit -m "feat(gabinet): add location, room, and equipment validation to appointment form"
```

---

## Task 13: Frontend — Calendar Location Filter

**Files:**
- Modify: `src/routes/_app/_auth/dashboard/_layout.gabinet.calendar.index.lazy.tsx`

- [ ] **Step 1: Add location filter dropdown to calendar toolbar**

Add a dropdown populated from `listLocations`. When selected, filter displayed appointments by `locationId`. Use location `color` field for appointment color-coding.

- [ ] **Step 2: Verify in browser**

Switch between locations in calendar. Verify filtering works correctly.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(gabinet): add location filter to calendar toolbar"
```

---

## Task 14: Migration — Equipment Strings to Records

**Files:**
- Modify: `convex/gabinet/equipment.ts` (add migration mutation)

- [ ] **Step 1: Write one-time migration mutation**

```typescript
export const migrateEquipmentStrings = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const treatments = await ctx.db
      .query("gabinetTreatments")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const nameToId = new Map<string, Id<"gabinetEquipment">>();
    const now = Date.now();

    // Idempotency: pre-load existing equipment by name to avoid duplicates on re-run
    const existingEquipment = await ctx.db
      .query("gabinetEquipment")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    for (const eq of existingEquipment) {
      nameToId.set(eq.name, eq._id);
    }

    for (const t of treatments) {
      if (!t.requiredEquipment?.length) continue;
      if (t.requiredEquipmentIds?.length) continue; // Already migrated
      const equipmentIds: Id<"gabinetEquipment">[] = [];

      for (const name of t.requiredEquipment) {
        if (!nameToId.has(name)) {
          const id = await ctx.db.insert("gabinetEquipment", {
            organizationId: args.organizationId,
            name,
            status: "available",
            createdBy: user._id,
            createdAt: now,
            updatedAt: now,
          });
          nameToId.set(name, id);
        }
        equipmentIds.push(nameToId.get(name)!);
      }

      await ctx.db.patch(t._id, { requiredEquipmentIds: equipmentIds });
    }

    return { migratedEquipment: nameToId.size, updatedTreatments: treatments.filter(t => t.requiredEquipment?.length).length };
  },
});
```

- [ ] **Step 2: Run migration per org**

Run: `npx convex run gabinet/equipment:migrateEquipmentStrings '{"organizationId": "<orgId>"}'`

- [ ] **Step 3: Verify migrated data**

Check that equipment records were created and treatments have `requiredEquipmentIds` populated.

- [ ] **Step 4: Commit**

```bash
git add convex/gabinet/equipment.ts
git commit -m "feat(gabinet): add equipment string-to-record migration"
```

---

## Summary

| Task | Description | Estimated complexity |
|------|------------|---------------------|
| 1 | Schema — 4 new tables + field additions | Small |
| 2 | Backend — Locations + Rooms CRUD | Medium |
| 3 | Backend — Equipment CRUD + Transfers | Medium |
| 4 | Backend — Availability extensions | Large (critical path) |
| 5 | Backend — Appointment mutations | Medium |
| 6 | Backend — Schedule + Treatment changes | Small |
| 7 | i18n keys | Small |
| 8 | Frontend — Locations settings page | Large |
| 9 | Frontend — Equipment settings page | Large |
| 10 | Frontend — Employee schedule location | Medium |
| 11 | Frontend — Treatment equipment select | Medium |
| 12 | Frontend — Appointment form integration | Large |
| 13 | Frontend — Calendar location filter | Medium |
| 14 | Migration — Equipment strings to records | Small |

**Critical path:** Tasks 1 → 4 → 5 must be sequential. Tasks 2, 3, 6, 7 can run in parallel after Task 1. Frontend tasks (8-13) can run in parallel after their backend dependencies complete.
