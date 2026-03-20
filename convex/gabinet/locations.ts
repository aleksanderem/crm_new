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
    await ctx.db.patch(args.locationId, { isActive: false, updatedAt: Date.now() });
    return args.locationId;
  },
});

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
