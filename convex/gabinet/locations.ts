import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import type {
  GabinetLocationRow,
  GabinetRoomRow,
} from "../_helpers/supabaseRows";

type GabinetLocationWithRooms = GabinetLocationRow & { rooms: GabinetRoomRow[] };

// Dual-write refs removed — Supabase is now primary for location/room writes

export const listLocations = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<GabinetLocationRow[]> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
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
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
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

    const locationId = await db.insert("gabinetLocations", {
      organizationId: String(args.organizationId),
      name: args.name,
      address: args.address ?? null,
      phone: args.phone ?? null,
      email: args.email ?? null,
      color: args.color ?? null,
      isActive: true,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    return locationId;
  },
});

export const updateLocation = action({
  args: {
    organizationId: v.id("organizations"),
    locationId: v.string(),
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

    const location = await db.get("gabinetLocations", args.locationId);
    if (!location || String(location.organizationId) !== String(args.organizationId)) {
      throw new Error("Location not found");
    }

    const { organizationId, locationId, ...updates } = args;
    const now = Date.now();
    await db.patch("gabinetLocations", locationId, { ...updates, updatedAt: now });

    return locationId;
  },
});

export const deleteLocation = action({
  args: {
    organizationId: v.id("organizations"),
    locationId: v.string(),
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

    return args.locationId;
  },
});

export const listRooms = action({
  args: {
    organizationId: v.id("organizations"),
    locationId: v.string(),
  },
  handler: async (ctx, args): Promise<GabinetRoomRow[]> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
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
    description: v.optional(v.string()),
    floor: v.optional(v.string()),
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

    const location = await db.get("gabinetLocations", args.locationId);
    if (!location || String(location.organizationId) !== String(args.organizationId)) {
      throw new Error("Location not found");
    }

    const now = Date.now();
    const roomId = await db.insert("gabinetRooms", {
      organizationId: String(args.organizationId),
      locationId: args.locationId,
      name: args.name,
      description: args.description ?? null,
      floor: args.floor ?? null,
      isActive: true,
      createdAt: now,
    });

    return roomId;
  },
});

export const updateRoom = action({
  args: {
    organizationId: v.id("organizations"),
    roomId: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    floor: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
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

    const room = await db.get("gabinetRooms", args.roomId);
    if (!room || String(room.organizationId) !== String(args.organizationId)) {
      throw new Error("Room not found");
    }

    const { organizationId, roomId, ...updates } = args;
    await db.patch("gabinetRooms", roomId, updates);

    return roomId;
  },
});

export const deleteRoom = action({
  args: {
    organizationId: v.id("organizations"),
    roomId: v.string(),
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

    return args.roomId;
  },
});
