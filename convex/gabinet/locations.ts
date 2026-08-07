import { action, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { logError } from "../_helpers/logged";
import { logActivity } from "../_helpers/activities";
import type {
  GabinetLocationRow,
  GabinetRoomRow,
} from "../_helpers/supabaseRows";

type GabinetLocationWithRooms = GabinetLocationRow & { rooms: GabinetRoomRow[] };

// Dual-write refs removed — Supabase is now primary for location/room writes

export const listLocations = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<GabinetLocationRow[]> => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const db = createSupabaseDb();
    const results = (await db
      .query("gabinetLocations")
      .eq("organizationId", String(args.organizationId))
      .collect()) as GabinetLocationRow[];
    return results;
  },
});

export const getLocation = action({
  args: {
    organizationId: v.id("organizations"),
    locationId: v.string(),
  },
  handler: async (ctx, args): Promise<GabinetLocationWithRooms | null> => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const db = createSupabaseDb();
    const location = (await db.get("gabinetLocations", args.locationId)) as
      | GabinetLocationRow
      | null;
    if (!location || String(location.organizationId) !== String(args.organizationId)) return null;
    const rooms = (await db
      .query("gabinetRooms")
      .eq("locationId", args.locationId)
      .collect()) as GabinetRoomRow[];
    return { ...location, rooms };
  },
});

export const createLocation = action({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    address: v.optional(v.union(
      v.object({
        street: v.optional(v.union(v.string(), v.null())),
        city: v.optional(v.union(v.string(), v.null())),
        postalCode: v.optional(v.union(v.string(), v.null())),
        country: v.optional(v.union(v.string(), v.null())),
      }),
      v.null(),
    )),
    phone: v.optional(v.union(v.string(), v.null())),
    email: v.optional(v.union(v.string(), v.null())),
    color: v.optional(v.union(v.string(), v.null())),
    fiscalRegisterId: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    try {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_settings", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const now = Date.now();
    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);

    // Self-heal: upsert the org row in Supabase if it is missing (can happen
    // for orgs created before the Supabase migration or during a failed async
    // sync), so the gabinet_locations_organization_id_fkey FK doesn't fire.
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

    const locationId = await db.insert("gabinetLocations", {
      organizationId: orgIdStr,
      name: args.name,
      address: args.address ?? null,
      phone: args.phone ?? null,
      email: args.email ?? null,
      color: args.color ?? null,
      fiscalRegisterId: args.fiscalRegisterId ?? null,
      isActive: true,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    try {
      await ctx.runMutation(internal.gabinet.locations._createLocationSideEffects, {
        organizationId: args.organizationId,
        locationId,
        name: args.name,
        performedBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
      });
    } catch (e) {
      console.error("[locations.createLocation] Side effects FAILED:", e);
    }

    return locationId;
    } catch (err) {
      await logError(ctx, err, {
        scope: "gabinet.locations",
        fnName: "createLocation",
        argsJson: JSON.stringify({
          organizationId: args.organizationId,
          name: args.name,
          hasAddress: !!args.address,
          phone: args.phone,
          email: args.email,
        }),
        organizationId: args.organizationId,
      });
      throw err;
    }
  },
});

export const updateLocation = action({
  args: {
    organizationId: v.id("organizations"),
    locationId: v.string(),
    name: v.optional(v.string()),
    address: v.optional(v.union(
      v.object({
        street: v.optional(v.union(v.string(), v.null())),
        city: v.optional(v.union(v.string(), v.null())),
        postalCode: v.optional(v.union(v.string(), v.null())),
        country: v.optional(v.union(v.string(), v.null())),
      }),
      v.null(),
    )),
    phone: v.optional(v.union(v.string(), v.null())),
    email: v.optional(v.union(v.string(), v.null())),
    color: v.optional(v.union(v.string(), v.null())),
    fiscalRegisterId: v.optional(v.union(v.string(), v.null())),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    try {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_settings", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    const location = await db.get("gabinetLocations", args.locationId);
    if (!location || String(location.organizationId) !== String(args.organizationId)) {
      throw new Error("Location not found");
    }

    const { organizationId, locationId, ...updates } = args;
    const now = Date.now();
    await db.patch("gabinetLocations", locationId, { ...updates, updatedAt: now });

    try {
      await ctx.runMutation(internal.gabinet.locations._updateLocationSideEffects, {
        organizationId,
        locationId,
        performedBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
      });
    } catch (e) {
      console.error("[locations.updateLocation] Side effects FAILED:", e);
    }

    return locationId;
    } catch (err) {
      await logError(ctx, err, {
        scope: "gabinet.locations",
        fnName: "updateLocation",
        argsJson: JSON.stringify({
          organizationId: args.organizationId,
          locationId: args.locationId,
          updatedFields: Object.keys(args).filter(
            (k) => k !== "organizationId" && k !== "locationId",
          ),
        }),
        organizationId: args.organizationId,
      });
      throw err;
    }
  },
});

export const deleteLocation = action({
  args: {
    organizationId: v.id("organizations"),
    locationId: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_settings", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    const location = await db.get("gabinetLocations", args.locationId);
    if (!location || String(location.organizationId) !== String(args.organizationId)) {
      throw new Error("Location not found");
    }

    // Check for active appointments at this location
    const activeAppt = await db.query("gabinetAppointments")
      .eq("organizationId", String(args.organizationId))
      .eq("locationId", args.locationId)
      .neq("status", "cancelled")
      .neq("status", "completed")
      .neq("status", "no_show")
      .first();

    if (activeAppt) {
      throw new Error("Cannot delete location with active appointments");
    }

    // Soft-delete
    await db.patch("gabinetLocations", args.locationId, {
      isActive: false,
      updatedAt: Date.now(),
    });

    try {
      await ctx.runMutation(internal.gabinet.locations._deleteLocationSideEffects, {
        organizationId: args.organizationId,
        locationId: args.locationId,
        performedBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
      });
    } catch (e) {
      console.error("[locations.deleteLocation] Side effects FAILED:", e);
    }

    return args.locationId;
  },
});

export const listRooms = action({
  args: {
    organizationId: v.id("organizations"),
    locationId: v.string(),
  },
  handler: async (ctx, args): Promise<GabinetRoomRow[]> => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const db = createSupabaseDb();
    const location = await db.get("gabinetLocations", args.locationId);
    if (!location || String(location.organizationId) !== String(args.organizationId)) return [];
    return (await db
      .query("gabinetRooms")
      .eq("locationId", args.locationId)
      .collect()) as GabinetRoomRow[];
  },
});

export const createRoom = action({
  args: {
    organizationId: v.id("organizations"),
    locationId: v.string(),
    name: v.string(),
    description: v.optional(v.union(v.string(), v.null())),
    floor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    try {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_settings", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    const location = await db.get("gabinetLocations", args.locationId);
    if (!location || String(location.organizationId) !== String(args.organizationId)) {
      throw new Error("Location not found");
    }

    const now = Date.now();
    const orgIdStr = String(args.organizationId);

    // Self-heal: upsert the org row in Supabase if it is missing (can happen
    // for orgs created before the Supabase migration or during a failed async
    // sync), so the gabinet_rooms_organization_id_fkey FK doesn't fire.
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

    const roomId = await db.insert("gabinetRooms", {
      organizationId: orgIdStr,
      locationId: args.locationId,
      name: args.name,
      description: args.description ?? null,
      floor: args.floor ?? null,
      isActive: true,
      createdAt: now,
    });

    try {
      await ctx.runMutation(internal.gabinet.locations._createRoomSideEffects, {
        organizationId: args.organizationId,
        roomId,
        name: args.name,
        locationId: args.locationId,
        performedBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
      });
    } catch (e) {
      console.error("[locations.createRoom] Side effects FAILED:", e);
    }

    return roomId;
    } catch (err) {
      await logError(ctx, err, {
        scope: "gabinet.locations",
        fnName: "createRoom",
        argsJson: JSON.stringify({
          organizationId: args.organizationId,
          locationId: args.locationId,
          name: args.name,
          floor: args.floor,
        }),
        organizationId: args.organizationId,
      });
      throw err;
    }
  },
});

export const updateRoom = action({
  args: {
    organizationId: v.id("organizations"),
    roomId: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    floor: v.optional(v.union(v.string(), v.null())),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    try {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_settings", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    const room = await db.get("gabinetRooms", args.roomId);
    if (!room || String(room.organizationId) !== String(args.organizationId)) {
      throw new Error("Room not found");
    }

    const { organizationId, roomId, ...updates } = args;
    await db.patch("gabinetRooms", roomId, updates);

    try {
      await ctx.runMutation(internal.gabinet.locations._updateRoomSideEffects, {
        organizationId,
        roomId,
        performedBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
      });
    } catch (e) {
      console.error("[locations.updateRoom] Side effects FAILED:", e);
    }

    return roomId;
    } catch (err) {
      await logError(ctx, err, {
        scope: "gabinet.locations",
        fnName: "updateRoom",
        argsJson: JSON.stringify({
          organizationId: args.organizationId,
          roomId: args.roomId,
          updatedFields: Object.keys(args).filter(
            (k) => k !== "organizationId" && k !== "roomId",
          ),
        }),
        organizationId: args.organizationId,
      });
      throw err;
    }
  },
});

export const deleteRoom = action({
  args: {
    organizationId: v.id("organizations"),
    roomId: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_settings", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    const room = await db.get("gabinetRooms", args.roomId);
    if (!room || String(room.organizationId) !== String(args.organizationId)) {
      throw new Error("Room not found");
    }

    // Check for active appointments in this room
    const activeAppt = await db.query("gabinetAppointments")
      .eq("organizationId", String(args.organizationId))
      .eq("roomId", args.roomId)
      .neq("status", "cancelled")
      .neq("status", "completed")
      .neq("status", "no_show")
      .first();

    if (activeAppt) {
      throw new Error("Cannot delete room with active appointments");
    }

    // Soft-delete
    await db.patch("gabinetRooms", args.roomId, { isActive: false });

    try {
      await ctx.runMutation(internal.gabinet.locations._deleteRoomSideEffects, {
        organizationId: args.organizationId,
        roomId: args.roomId,
        performedBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
      });
    } catch (e) {
      console.error("[locations.deleteRoom] Side effects FAILED:", e);
    }

    return args.roomId;
  },
});

export const _createLocationSideEffects = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    locationId: v.string(),
    name: v.string(),
    performedBy: v.string(),
    actorLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetLocation",
      entityId: args.locationId,
      action: "created",
      description: `Created location "${args.name}"`,
      performedBy: args.performedBy as Id<"users">,
      actorLabel: args.actorLabel,
    });
  },
});

export const _updateLocationSideEffects = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    locationId: v.string(),
    performedBy: v.string(),
    actorLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetLocation",
      entityId: args.locationId,
      action: "updated",
      description: `Updated location`,
      performedBy: args.performedBy as Id<"users">,
      actorLabel: args.actorLabel,
    });
  },
});

export const _deleteLocationSideEffects = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    locationId: v.string(),
    performedBy: v.string(),
    actorLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetLocation",
      entityId: args.locationId,
      action: "deleted",
      description: `Deactivated location`,
      performedBy: args.performedBy as Id<"users">,
      actorLabel: args.actorLabel,
    });
  },
});

export const _createRoomSideEffects = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    roomId: v.string(),
    name: v.string(),
    locationId: v.string(),
    performedBy: v.string(),
    actorLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetRoom",
      entityId: args.roomId,
      action: "created",
      description: `Created room "${args.name}"`,
      metadata: { locationId: args.locationId },
      performedBy: args.performedBy as Id<"users">,
      actorLabel: args.actorLabel,
    });
  },
});

export const _updateRoomSideEffects = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    roomId: v.string(),
    performedBy: v.string(),
    actorLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetRoom",
      entityId: args.roomId,
      action: "updated",
      description: `Updated room`,
      performedBy: args.performedBy as Id<"users">,
      actorLabel: args.actorLabel,
    });
  },
});

export const _deleteRoomSideEffects = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    roomId: v.string(),
    performedBy: v.string(),
    actorLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetRoom",
      entityId: args.roomId,
      action: "deleted",
      description: `Deactivated room`,
      performedBy: args.performedBy as Id<"users">,
      actorLabel: args.actorLabel,
    });
  },
});
