import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess, requireOrgAdmin } from "../_helpers/auth";
import { verifyProductAccess } from "../_helpers/products";
import { GABINET_PRODUCT_ID } from "./_registry";
import { gabinetLeaveTypeValidator, gabinetLeaveStatusValidator } from "../schema";

// --- Working Hours (clinic-level defaults) ---

export const getWorkingHours = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return await ctx.db
      .query("gabinetWorkingHours")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
  },
});

export const setWorkingHours = mutation({
  args: {
    organizationId: v.id("organizations"),
    dayOfWeek: v.number(),
    startTime: v.string(),
    endTime: v.string(),
    isOpen: v.boolean(),
    breakStart: v.optional(v.string()),
    breakEnd: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.organizationId);
    await verifyProductAccess(ctx, args.organizationId, GABINET_PRODUCT_ID);
    const now = Date.now();

    const existing = await ctx.db
      .query("gabinetWorkingHours")
      .withIndex("by_orgAndDay", (q) =>
        q.eq("organizationId", args.organizationId).eq("dayOfWeek", args.dayOfWeek)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        startTime: args.startTime,
        endTime: args.endTime,
        isOpen: args.isOpen,
        breakStart: args.breakStart,
        breakEnd: args.breakEnd,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("gabinetWorkingHours", {
      organizationId: args.organizationId,
      dayOfWeek: args.dayOfWeek,
      startTime: args.startTime,
      endTime: args.endTime,
      isOpen: args.isOpen,
      breakStart: args.breakStart,
      breakEnd: args.breakEnd,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const bulkSetWorkingHours = mutation({
  args: {
    organizationId: v.id("organizations"),
    hours: v.array(v.object({
      dayOfWeek: v.number(),
      startTime: v.string(),
      endTime: v.string(),
      isOpen: v.boolean(),
      breakStart: v.optional(v.string()),
      breakEnd: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.organizationId);
    await verifyProductAccess(ctx, args.organizationId, GABINET_PRODUCT_ID);
    const now = Date.now();

    for (const h of args.hours) {
      const existing = await ctx.db
        .query("gabinetWorkingHours")
        .withIndex("by_orgAndDay", (q) =>
          q.eq("organizationId", args.organizationId).eq("dayOfWeek", h.dayOfWeek)
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, { ...h, updatedAt: now });
      } else {
        await ctx.db.insert("gabinetWorkingHours", {
          organizationId: args.organizationId,
          ...h,
          createdBy: user._id,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  },
});

// --- Employee Schedules (per-employee overrides) ---

export const getEmployeeSchedule = query({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return await ctx.db
      .query("gabinetEmployeeSchedules")
      .withIndex("by_orgAndUser", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .collect();
  },
});

export const setEmployeeSchedule = mutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    dayOfWeek: v.number(),
    startTime: v.string(),
    endTime: v.string(),
    isWorking: v.boolean(),
    breakStart: v.optional(v.string()),
    breakEnd: v.optional(v.string()),
    effectiveFrom: v.optional(v.string()),
    effectiveTo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.organizationId);
    await verifyProductAccess(ctx, args.organizationId, GABINET_PRODUCT_ID);
    const now = Date.now();

    const existing = await ctx.db
      .query("gabinetEmployeeSchedules")
      .withIndex("by_orgUserAndDay", (q) =>
        q.eq("organizationId", args.organizationId)
          .eq("userId", args.userId)
          .eq("dayOfWeek", args.dayOfWeek)
      )
      .first();

    const data = {
      startTime: args.startTime,
      endTime: args.endTime,
      isWorking: args.isWorking,
      breakStart: args.breakStart,
      breakEnd: args.breakEnd,
      effectiveFrom: args.effectiveFrom,
      effectiveTo: args.effectiveTo,
    };

    if (existing) {
      await ctx.db.patch(existing._id, { ...data, updatedAt: now });
      return existing._id;
    }

    return await ctx.db.insert("gabinetEmployeeSchedules", {
      organizationId: args.organizationId,
      userId: args.userId,
      dayOfWeek: args.dayOfWeek,
      ...data,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const bulkSetEmployeeSchedule = mutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    hours: v.array(v.object({
      dayOfWeek: v.number(),
      startTime: v.string(),
      endTime: v.string(),
      isWorking: v.boolean(),
      breakStart: v.optional(v.string()),
      breakEnd: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    await verifyProductAccess(ctx, args.organizationId, GABINET_PRODUCT_ID);
    const now = Date.now();

    for (const h of args.hours) {
      const existing = await ctx.db
        .query("gabinetEmployeeSchedules")
        .withIndex("by_orgUserAndDay", (q) =>
          q.eq("organizationId", args.organizationId)
            .eq("userId", args.userId)
            .eq("dayOfWeek", h.dayOfWeek)
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, { ...h, updatedAt: now });
      } else {
        await ctx.db.insert("gabinetEmployeeSchedules", {
          organizationId: args.organizationId,
          userId: args.userId,
          ...h,
          createdBy: user._id,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  },
});

export const listEmployeeSchedules = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return await ctx.db
      .query("gabinetEmployeeSchedules")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
  },
});

// --- Leaves ---

export const listLeaves = query({
  args: {
    organizationId: v.id("organizations"),
    status: v.optional(gabinetLeaveStatusValidator),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    if (args.status) {
      return await ctx.db
        .query("gabinetLeaves")
        .withIndex("by_orgAndStatus", (q) =>
          q.eq("organizationId", args.organizationId).eq("status", args.status!)
        )
        .collect();
    }

    return await ctx.db
      .query("gabinetLeaves")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
  },
});

export const createLeave = mutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    type: gabinetLeaveTypeValidator,
    leaveTypeId: v.optional(v.id("gabinetLeaveTypes")),
    startDate: v.string(),
    endDate: v.string(),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    await verifyProductAccess(ctx, args.organizationId, GABINET_PRODUCT_ID);
    const now = Date.now();

    return await ctx.db.insert("gabinetLeaves", {
      organizationId: args.organizationId,
      userId: args.userId,
      type: args.type,
      leaveTypeId: args.leaveTypeId,
      startDate: args.startDate,
      endDate: args.endDate,
      startTime: args.startTime,
      endTime: args.endTime,
      status: "pending",
      reason: args.reason,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const approveLeave = mutation({
  args: {
    organizationId: v.id("organizations"),
    leaveId: v.id("gabinetLeaves"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.organizationId);
    await verifyProductAccess(ctx, args.organizationId, GABINET_PRODUCT_ID);
    const now = Date.now();

    const leave = await ctx.db.get(args.leaveId);
    if (!leave || leave.organizationId !== args.organizationId) {
      throw new Error("Leave not found");
    }

    await ctx.db.patch(args.leaveId, {
      status: "approved",
      approvedBy: user._id,
      approvedAt: now,
      updatedAt: now,
    });

    // Update leave balance if leaveTypeId is set
    if (leave.leaveTypeId) {
      const startD = new Date(leave.startDate);
      const endD = new Date(leave.endDate);
      const days = Math.max(1, Math.ceil((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24)) + 1);
      const year = startD.getFullYear();

      // Find employee record
      const employee = await ctx.db
        .query("gabinetEmployees")
        .withIndex("by_orgAndUser", (q) =>
          q.eq("organizationId", args.organizationId).eq("userId", leave.userId)
        )
        .first();

      if (employee) {
        const balance = await ctx.db
          .query("gabinetLeaveBalances")
          .withIndex("by_orgEmployeeTypeYear", (q) =>
            q.eq("organizationId", args.organizationId)
              .eq("employeeId", employee._id)
              .eq("leaveTypeId", leave.leaveTypeId!)
              .eq("year", year)
          )
          .first();

        if (balance) {
          await ctx.db.patch(balance._id, {
            usedDays: balance.usedDays + days,
            updatedAt: now,
          });
        }
      }
    }
  },
});

export const rejectLeave = mutation({
  args: {
    organizationId: v.id("organizations"),
    leaveId: v.id("gabinetLeaves"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.organizationId);
    await verifyProductAccess(ctx, args.organizationId, GABINET_PRODUCT_ID);

    const leave = await ctx.db.get(args.leaveId);
    if (!leave || leave.organizationId !== args.organizationId) {
      throw new Error("Leave not found");
    }

    await ctx.db.patch(args.leaveId, {
      status: "rejected",
      approvedBy: user._id,
      approvedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const getLeavesByDateRange = query({
  args: {
    organizationId: v.id("organizations"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const leaves = await ctx.db
      .query("gabinetLeaves")
      .withIndex("by_orgAndDate", (q) =>
        q.eq("organizationId", args.organizationId)
          .gte("startDate", args.startDate)
          .lte("startDate", args.endDate)
      )
      .collect();

    return leaves.filter((l) => l.status === "approved");
  },
});
