import { query, action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { verifyOrgAccess } from "../_helpers/auth";
import type { GabinetLeaveTypeRow } from "../_helpers/supabaseRows";

// Dual-write refs removed — Supabase is now primary for leaveType writes

export const list = action({
  args: {
    organizationId: v.id("organizations"),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<GabinetLeaveTypeRow[]> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const db = createSupabaseDb();
    let q = db.query("gabinetLeaveTypes").eq("organizationId", String(args.organizationId));
    if (args.activeOnly) {
      q = q.eq("isActive", true);
    }
    return (await q.collect()) as GabinetLeaveTypeRow[];
  },
});

export const getById = query({
  args: {
    organizationId: v.id("organizations"),
    leaveTypeId: v.id("gabinetLeaveTypes"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const lt = await ctx.db.get(args.leaveTypeId);
    if (!lt || lt.organizationId !== args.organizationId) {
      throw new Error("Leave type not found");
    }
    return lt;
  },
});

export const create = action({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    color: v.optional(v.string()),
    isPaid: v.boolean(),
    annualQuotaDays: v.optional(v.number()),
    requiresApproval: v.boolean(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    if (authResult.role !== "owner" && authResult.role !== "admin") {
      throw new Error("Admin access required");
    }
    const now = Date.now();
    const db = createSupabaseDb();

    const leaveTypeId = await db.insert("gabinetLeaveTypes", {
      organizationId: String(args.organizationId),
      name: args.name,
      color: args.color ?? null,
      isPaid: args.isPaid,
      annualQuotaDays: args.annualQuotaDays ?? null,
      requiresApproval: args.requiresApproval,
      isActive: true,
      createdBy: authResult.userId,
      createdAt: now,
      updatedAt: now,
    });

    return leaveTypeId;
  },
});

export const update = action({
  args: {
    organizationId: v.id("organizations"),
    leaveTypeId: v.string(),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    isPaid: v.optional(v.boolean()),
    annualQuotaDays: v.optional(v.number()),
    requiresApproval: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    if (authResult.role !== "owner" && authResult.role !== "admin") {
      throw new Error("Admin access required");
    }
    const db = createSupabaseDb();

    const lt = await db.get("gabinetLeaveTypes", args.leaveTypeId);
    if (!lt || String(lt.organizationId) !== String(args.organizationId)) {
      throw new Error("Leave type not found");
    }

    const { organizationId, leaveTypeId, ...updates } = args;
    const now = Date.now();

    // Build patch object with only provided fields
    const patch: Record<string, unknown> = { updatedAt: now };
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.color !== undefined) patch.color = updates.color;
    if (updates.isPaid !== undefined) patch.isPaid = updates.isPaid;
    if (updates.annualQuotaDays !== undefined) patch.annualQuotaDays = updates.annualQuotaDays;
    if (updates.requiresApproval !== undefined) patch.requiresApproval = updates.requiresApproval;
    if (updates.isActive !== undefined) patch.isActive = updates.isActive;

    await db.patch("gabinetLeaveTypes", leaveTypeId, patch);

    return leaveTypeId;
  },
});

export const remove = action({
  args: {
    organizationId: v.id("organizations"),
    leaveTypeId: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    if (authResult.role !== "owner" && authResult.role !== "admin") {
      throw new Error("Admin access required");
    }
    const db = createSupabaseDb();

    const lt = await db.get("gabinetLeaveTypes", args.leaveTypeId);
    if (!lt || String(lt.organizationId) !== String(args.organizationId)) {
      throw new Error("Leave type not found");
    }

    // Soft-delete
    await db.patch("gabinetLeaveTypes", args.leaveTypeId, {
      isActive: false,
      updatedAt: Date.now(),
    });
  },
});

// --- Leave Balances ---

export const getBalances = query({
  args: {
    organizationId: v.id("organizations"),
    employeeId: v.id("gabinetEmployees"),
    year: v.number(),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    return await ctx.db
      .query("gabinetLeaveBalances")
      .withIndex("by_orgAndEmployee", (q) =>
        q.eq("organizationId", args.organizationId).eq("employeeId", args.employeeId)
      )
      .collect()
      .then((all) => all.filter((b) => b.year === args.year));
  },
});

export const getAllBalances = query({
  args: {
    organizationId: v.id("organizations"),
    year: v.number(),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    return await ctx.db
      .query("gabinetLeaveBalances")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect()
      .then((all) => all.filter((b) => b.year === args.year));
  },
});

export const initializeBalance = action({
  args: {
    organizationId: v.id("organizations"),
    employeeId: v.string(),
    leaveTypeId: v.string(),
    year: v.number(),
    totalDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    if (authResult.role !== "owner" && authResult.role !== "admin") {
      throw new Error("Admin access required");
    }
    const now = Date.now();
    const db = createSupabaseDb();

    // Check if balance already exists
    const existing = await db.query("gabinetLeaveBalances")
      .eq("organizationId", String(args.organizationId))
      .eq("employeeId", args.employeeId)
      .eq("leaveTypeId", args.leaveTypeId)
      .eq("year", args.year)
      .first();

    if (existing) {
      if (args.totalDays !== undefined) {
        await db.patch("gabinetLeaveBalances", existing._id as string, {
          totalDays: args.totalDays,
          updatedAt: now,
        });
      }
      return existing._id as string;
    }

    // Get quota from leave type
    const leaveType = await db.get("gabinetLeaveTypes", args.leaveTypeId);
    if (!leaveType) throw new Error("Leave type not found");

    const totalDays = args.totalDays ?? (leaveType.annualQuotaDays as number) ?? 0;
    const balanceId = await db.insert("gabinetLeaveBalances", {
      organizationId: String(args.organizationId),
      employeeId: args.employeeId,
      leaveTypeId: args.leaveTypeId,
      year: args.year,
      totalDays,
      usedDays: 0,
      createdAt: now,
      updatedAt: now,
    });

    return balanceId;
  },
});

export const adjustBalance = action({
  args: {
    organizationId: v.id("organizations"),
    balanceId: v.string(),
    totalDays: v.optional(v.number()),
    usedDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    if (authResult.role !== "owner" && authResult.role !== "admin") {
      throw new Error("Admin access required");
    }
    const db = createSupabaseDb();

    const balance = await db.get("gabinetLeaveBalances", args.balanceId);
    if (!balance || String(balance.organizationId) !== String(args.organizationId)) {
      throw new Error("Balance not found");
    }

    const now = Date.now();
    const updates: Record<string, unknown> = { updatedAt: now };
    if (args.totalDays !== undefined) updates.totalDays = args.totalDays;
    if (args.usedDays !== undefined) updates.usedDays = args.usedDays;

    await db.patch("gabinetLeaveBalances", args.balanceId, updates);
  },
});

/** Initialize balances for all active employees for a given year */
export const initializeAllBalances = action({
  args: {
    organizationId: v.id("organizations"),
    year: v.number(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    if (authResult.role !== "owner" && authResult.role !== "admin") {
      throw new Error("Admin access required");
    }
    const now = Date.now();
    const db = createSupabaseDb();

    const employees = await db.query("gabinetEmployees")
      .eq("organizationId", String(args.organizationId))
      .eq("isActive", true)
      .collect();

    const leaveTypes = await db.query("gabinetLeaveTypes")
      .eq("organizationId", String(args.organizationId))
      .eq("isActive", true)
      .collect();

    let created = 0;
    for (const emp of employees) {
      for (const lt of leaveTypes) {
        if ((lt.annualQuotaDays as number | undefined) === undefined) continue;

        const existing = await db.query("gabinetLeaveBalances")
          .eq("organizationId", String(args.organizationId))
          .eq("employeeId", emp._id as string)
          .eq("leaveTypeId", lt._id as string)
          .eq("year", args.year)
          .first();

        if (!existing) {
          await db.insert("gabinetLeaveBalances", {
            organizationId: String(args.organizationId),
            employeeId: emp._id as string,
            leaveTypeId: lt._id as string,
            year: args.year,
            totalDays: lt.annualQuotaDays as number,
            usedDays: 0,
            createdAt: now,
            updatedAt: now,
          });

          created++;
        }
      }
    }

    return { created };
  },
});
