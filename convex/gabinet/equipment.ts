import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
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
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_settings", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const equipment = await ctx.db.get(args.equipmentId);
    if (!equipment || equipment.organizationId !== args.organizationId) {
      throw new Error("Equipment not found");
    }

    const toLocation = await ctx.db.get(args.toLocationId);
    if (!toLocation || toLocation.organizationId !== args.organizationId) {
      throw new Error("Target location not found");
    }

    const now = Date.now();

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
    const equipment = await ctx.db.get(args.equipmentId);
    if (!equipment || equipment.organizationId !== args.organizationId) return [];
    return await ctx.db
      .query("gabinetEquipmentTransfers")
      .withIndex("by_equipment", (q) => q.eq("equipmentId", args.equipmentId))
      .order("desc")
      .collect();
  },
});

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
            status: "available" as const,
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

    return { migratedEquipment: nameToId.size, updatedTreatments: treatments.filter(t => t.requiredEquipment?.length && !t.requiredEquipmentIds?.length).length };
  },
});
