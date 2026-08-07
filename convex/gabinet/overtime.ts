import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { logError } from "../_helpers/logged";
import { gabinetLeaveStatusValidator } from "../schema";
import type { GabinetOvertimeRow } from "../_helpers/supabaseRows";

export const listOvertime = action({
  args: {
    organizationId: v.id("organizations"),
    status: v.optional(gabinetLeaveStatusValidator),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<GabinetOvertimeRow[]> => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_settings", action: "view" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");
    const db = createSupabaseDb();
    let q = db.query("gabinetOvertime").eq("organizationId", String(args.organizationId));
    if (args.status) {
      q = q.eq("status", args.status);
    }
    if (args.userId) {
      q = q.eq("userId", args.userId);
    }
    return (await q.collect()) as GabinetOvertimeRow[];
  },
});

export const createOvertime = action({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
    date: v.string(),
    hours: v.number(),
    reason: v.optional(v.string()),
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

      const overtimeId = await db.insert("gabinetOvertime", {
        organizationId: String(args.organizationId),
        userId: args.userId,
        date: args.date,
        hours: args.hours,
        status: "pending",
        reason: args.reason ?? null,
        createdBy: authResult.userId,
        createdAt: now,
        updatedAt: now,
      });

      return overtimeId;
    } catch (err) {
      await logError(ctx, err, {
        scope: "gabinet.overtime",
        fnName: "createOvertime",
        argsJson: JSON.stringify(args),
        organizationId: args.organizationId,
      });
      throw err;
    }
  },
});

export const approveOvertime = action({
  args: {
    organizationId: v.id("organizations"),
    overtimeId: v.string(),
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
    const now = Date.now();
    const db = createSupabaseDb();

    const overtime = await db.get("gabinetOvertime", args.overtimeId);
    if (!overtime || String(overtime.organizationId) !== String(args.organizationId)) {
      throw new Error("Overtime record not found");
    }

    await db.patch("gabinetOvertime", args.overtimeId, {
      status: "approved",
      approvedBy: authResult.userId,
      approvedAt: now,
      updatedAt: now,
    });
  },
});

export const rejectOvertime = action({
  args: {
    organizationId: v.id("organizations"),
    overtimeId: v.string(),
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
    const now = Date.now();
    const db = createSupabaseDb();

    const overtime = await db.get("gabinetOvertime", args.overtimeId);
    if (!overtime || String(overtime.organizationId) !== String(args.organizationId)) {
      throw new Error("Overtime record not found");
    }

    await db.patch("gabinetOvertime", args.overtimeId, {
      status: "rejected",
      approvedBy: authResult.userId,
      approvedAt: now,
      updatedAt: now,
    });
  },
});

export const deleteOvertime = action({
  args: {
    organizationId: v.id("organizations"),
    overtimeId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(
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

    const overtime = await db.get("gabinetOvertime", args.overtimeId);
    if (!overtime || String(overtime.organizationId) !== String(args.organizationId)) {
      throw new Error("Overtime record not found");
    }

    await db.delete("gabinetOvertime", args.overtimeId);
  },
});
