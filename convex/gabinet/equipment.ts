import { query, action, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { verifyOrgAccess } from "../_helpers/auth";
import { checkModuleAccess } from "../_helpers/products";
import { logError } from "../_helpers/logged";
import type {
  GabinetEquipmentRow,
  GabinetLocationRow,
  GabinetRoomRow,
} from "../_helpers/supabaseRows";

// Dual-write refs removed — Supabase is now primary for equipment writes

function normalizeUnits(units: string[] | undefined): string[] | null {
  if (!units) return null;
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const raw of units) {
    const trimmed = raw.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    cleaned.push(trimmed);
  }
  return cleaned.length > 0 ? cleaned : null;
}

export const listEquipment = action({
  args: {
    organizationId: v.id("organizations"),
    locationId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<GabinetEquipmentRow[]> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const db = createSupabaseDb();
    let q = db.query("gabinetEquipment").eq("organizationId", String(args.organizationId));
    if (args.locationId) {
      q = q.eq("currentLocationId", String(args.locationId));
    }
    return (await q.collect()) as GabinetEquipmentRow[];
  },
});

export const getEquipment = action({
  args: {
    organizationId: v.id("organizations"),
    equipmentId: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    | (GabinetEquipmentRow & {
        location: GabinetLocationRow | null;
        room: GabinetRoomRow | null;
      })
    | null
  > => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const db = createSupabaseDb();
    const equipment = (await db.get("gabinetEquipment", args.equipmentId)) as
      | GabinetEquipmentRow
      | null;
    if (!equipment || String(equipment.organizationId) !== String(args.organizationId)) {
      return null;
    }
    const location = equipment.currentLocationId
      ? ((await db.get("gabinetLocations", String(equipment.currentLocationId))) as
          | GabinetLocationRow
          | null)
      : null;
    const room = equipment.currentRoomId
      ? ((await db.get("gabinetRooms", String(equipment.currentRoomId))) as
          | GabinetRoomRow
          | null)
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
    description: v.optional(v.union(v.string(), v.null())),
    serialNumber: v.optional(v.union(v.string(), v.null())),
    currentLocationId: v.optional(v.union(v.string(), v.null())),
    currentRoomId: v.optional(v.union(v.string(), v.null())),
    status: v.optional(equipmentStatusValidator),
    parameterUnits: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    try {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_settings", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const now = Date.now();
    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);

    // Self-heal: upsert the org row in Supabase if it is missing (can happen
    // for orgs created before the Supabase migration or during a failed async
    // sync), so the gabinet_equipment_organization_id_fkey FK doesn't fire.
    const client = db.raw();
    const { data: existingOrg } = await client
      .from("organizations")
      .select("id")
      .eq("id", orgIdStr)
      .maybeSingle();
    if (!existingOrg) {
      const org = await ctx.runQuery(internal.supabase.backfill._getOrganization, {
        organizationId: orgIdStr,
      });
      if (org) {
        await client.from("organizations").upsert(
          {
            id: orgIdStr,
            name: org.name,
            slug: org.slug,
            owner_id: String(org.ownerId),
            logo: org.logo ?? null,
            website: org.website ?? null,
            created_at: org.createdAt ?? now,
            updated_at: org.updatedAt ?? now,
          },
          { onConflict: "id" },
        );
      }
    }

    const equipmentId = await db.insert("gabinetEquipment", {
      organizationId: orgIdStr,
      name: args.name,
      description: args.description ?? null,
      serialNumber: args.serialNumber ?? null,
      currentLocationId: args.currentLocationId ?? null,
      currentRoomId: args.currentRoomId ?? null,
      status: args.status ?? "available",
      parameterUnits: normalizeUnits(args.parameterUnits),
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    return equipmentId;
    } catch (err) {
      await logError(ctx, err, {
        scope: "gabinet.equipment",
        fnName: "createEquipment",
        argsJson: JSON.stringify({
          organizationId: args.organizationId,
          name: args.name,
          serialNumber: args.serialNumber,
          currentLocationId: args.currentLocationId,
          currentRoomId: args.currentRoomId,
          status: args.status,
          parameterUnitsCount: args.parameterUnits?.length,
        }),
        organizationId: args.organizationId,
      });
      throw err;
    }
  },
});

export const updateEquipment = action({
  args: {
    organizationId: v.id("organizations"),
    equipmentId: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    serialNumber: v.optional(v.union(v.string(), v.null())),
    status: v.optional(equipmentStatusValidator),
    parameterUnits: v.optional(v.union(v.array(v.string()), v.null())),
  },
  handler: async (ctx, args) => {
    try {
    await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
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

    const { organizationId, equipmentId, parameterUnits, ...updates } = args;
    const now = Date.now();
    const patch: Record<string, unknown> = { ...updates, updatedAt: now };
    if (parameterUnits !== undefined) {
      patch.parameterUnits = parameterUnits === null ? null : normalizeUnits(parameterUnits);
    }
    await db.patch("gabinetEquipment", equipmentId, patch);

    return equipmentId;
    } catch (err) {
      await logError(ctx, err, {
        scope: "gabinet.equipment",
        fnName: "updateEquipment",
        argsJson: JSON.stringify({
          organizationId: args.organizationId,
          equipmentId: args.equipmentId,
          updatedFields: Object.keys(args).filter(
            (k) => k !== "organizationId" && k !== "equipmentId",
          ),
        }),
        organizationId: args.organizationId,
      });
      throw err;
    }
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
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
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
    await checkModuleAccess(ctx, args.organizationId, "equipment");
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
