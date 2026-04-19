import { query, action, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { verifyOrgAccess } from "../_helpers/auth";

// Dual-write refs removed — Supabase is now primary for equipment writes

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

export const createEquipment = action({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    currentLocationId: v.optional(v.string()),
    currentRoomId: v.optional(v.string()),
    status: v.optional(equipmentStatusValidator),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_settings", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const now = Date.now();
    const db = createSupabaseDb();

    const equipmentId = await db.insert("gabinetEquipment", {
      organizationId: String(args.organizationId),
      name: args.name,
      description: args.description ?? null,
      serialNumber: args.serialNumber ?? null,
      currentLocationId: args.currentLocationId ?? null,
      currentRoomId: args.currentRoomId ?? null,
      status: args.status ?? "available",
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    return equipmentId;
  },
});

export const updateEquipment = action({
  args: {
    organizationId: v.id("organizations"),
    equipmentId: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    status: v.optional(equipmentStatusValidator),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_settings", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    const equipment = await db.get("gabinetEquipment", args.equipmentId);
    if (!equipment || String(equipment.organizationId) !== String(args.organizationId)) {
      throw new Error("Equipment not found");
    }

    const { organizationId, equipmentId, ...updates } = args;
    const now = Date.now();
    await db.patch("gabinetEquipment", equipmentId, { ...updates, updatedAt: now });

    return equipmentId;
  },
});

export const transferEquipment = action({
  args: {
    organizationId: v.id("organizations"),
    equipmentId: v.string(),
    toLocationId: v.string(),
    toRoomId: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_settings", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    const equipment = await db.get("gabinetEquipment", args.equipmentId);
    if (!equipment || String(equipment.organizationId) !== String(args.organizationId)) {
      throw new Error("Equipment not found");
    }

    const toLocation = await db.get("gabinetLocations", args.toLocationId);
    if (!toLocation || String(toLocation.organizationId) !== String(args.organizationId)) {
      throw new Error("Target location not found");
    }

    const now = Date.now();

    // Insert transfer record
    await db.insert("gabinetEquipmentTransfers", {
      organizationId: String(args.organizationId),
      equipmentId: args.equipmentId,
      fromLocationId: equipment.currentLocationId ? String(equipment.currentLocationId) : null,
      toLocationId: args.toLocationId,
      toRoomId: args.toRoomId ?? null,
      transferredBy: String(authResult.userId),
      transferredAt: now,
      notes: args.notes ?? null,
    });

    // Update equipment location
    await db.patch("gabinetEquipment", args.equipmentId, {
      currentLocationId: args.toLocationId,
      currentRoomId: args.toRoomId ?? null,
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

export const migrateEquipmentStrings = internalMutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .first();
    if (!user) throw new Error("No users found");

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
