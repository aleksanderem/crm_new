import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess, requireOrgAdmin } from "../_helpers/auth";

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    activeOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    if (args.activeOnly) {
      return await ctx.db
        .query("gabinetLeaveTypes")
        .withIndex("by_orgAndActive", (q) =>
          q.eq("organizationId", args.organizationId).eq("isActive", true)
        )
        .collect();
    }

    return await ctx.db
      .query("gabinetLeaveTypes")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
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

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    color: v.optional(v.string()),
    isPaid: v.boolean(),
    annualQuotaDays: v.optional(v.number()),
    requiresApproval: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.organizationId);
    const now = Date.now();

    return await ctx.db.insert("gabinetLeaveTypes", {
      organizationId: args.organizationId,
      name: args.name,
      color: args.color,
      isPaid: args.isPaid,
      annualQuotaDays: args.annualQuotaDays,
      requiresApproval: args.requiresApproval,
      isActive: true,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    leaveTypeId: v.id("gabinetLeaveTypes"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    isPaid: v.optional(v.boolean()),
    annualQuotaDays: v.optional(v.number()),
    requiresApproval: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);

    const lt = await ctx.db.get(args.leaveTypeId);
    if (!lt || lt.organizationId !== args.organizationId) {
      throw new Error("Leave type not found");
    }

    const { organizationId, leaveTypeId, ...updates } = args;
    await ctx.db.patch(leaveTypeId, { ...updates, updatedAt: Date.now() });
    return leaveTypeId;
  },
});

export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    leaveTypeId: v.id("gabinetLeaveTypes"),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);

    const lt = await ctx.db.get(args.leaveTypeId);
    if (!lt || lt.organizationId !== args.organizationId) {
      throw new Error("Leave type not found");
    }

    // Soft-delete
    await ctx.db.patch(args.leaveTypeId, { isActive: false, updatedAt: Date.now() });
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

export const initializeBalance = mutation({
  args: {
    organizationId: v.id("organizations"),
    employeeId: v.id("gabinetEmployees"),
    leaveTypeId: v.id("gabinetLeaveTypes"),
    year: v.number(),
    totalDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);
    const now = Date.now();

    // Check if balance already exists
    const existing = await ctx.db
      .query("gabinetLeaveBalances")
      .withIndex("by_orgEmployeeTypeYear", (q) =>
        q.eq("organizationId", args.organizationId)
          .eq("employeeId", args.employeeId)
          .eq("leaveTypeId", args.leaveTypeId)
          .eq("year", args.year)
      )
      .first();

    if (existing) {
      if (args.totalDays !== undefined) {
        await ctx.db.patch(existing._id, { totalDays: args.totalDays, updatedAt: now });
      }
      return existing._id;
    }

    // Get quota from leave type
    const leaveType = await ctx.db.get(args.leaveTypeId);
    if (!leaveType) throw new Error("Leave type not found");

    return await ctx.db.insert("gabinetLeaveBalances", {
      organizationId: args.organizationId,
      employeeId: args.employeeId,
      leaveTypeId: args.leaveTypeId,
      year: args.year,
      totalDays: args.totalDays ?? leaveType.annualQuotaDays ?? 0,
      usedDays: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const adjustBalance = mutation({
  args: {
    organizationId: v.id("organizations"),
    balanceId: v.id("gabinetLeaveBalances"),
    totalDays: v.optional(v.number()),
    usedDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);

    const balance = await ctx.db.get(args.balanceId);
    if (!balance || balance.organizationId !== args.organizationId) {
      throw new Error("Balance not found");
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.totalDays !== undefined) updates.totalDays = args.totalDays;
    if (args.usedDays !== undefined) updates.usedDays = args.usedDays;

    await ctx.db.patch(args.balanceId, updates);
  },
});

/** Initialize balances for all active employees for a given year */
export const initializeAllBalances = mutation({
  args: {
    organizationId: v.id("organizations"),
    year: v.number(),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);
    const now = Date.now();

    const employees = await ctx.db
      .query("gabinetEmployees")
      .withIndex("by_orgAndActive", (q) =>
        q.eq("organizationId", args.organizationId).eq("isActive", true)
      )
      .collect();

    const leaveTypes = await ctx.db
      .query("gabinetLeaveTypes")
      .withIndex("by_orgAndActive", (q) =>
        q.eq("organizationId", args.organizationId).eq("isActive", true)
      )
      .collect();

    let created = 0;
    for (const emp of employees) {
      for (const lt of leaveTypes) {
        if (lt.annualQuotaDays === undefined) continue;

        const existing = await ctx.db
          .query("gabinetLeaveBalances")
          .withIndex("by_orgEmployeeTypeYear", (q) =>
            q.eq("organizationId", args.organizationId)
              .eq("employeeId", emp._id)
              .eq("leaveTypeId", lt._id)
              .eq("year", args.year)
          )
          .first();

        if (!existing) {
          await ctx.db.insert("gabinetLeaveBalances", {
            organizationId: args.organizationId,
            employeeId: emp._id,
            leaveTypeId: lt._id,
            year: args.year,
            totalDays: lt.annualQuotaDays,
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
