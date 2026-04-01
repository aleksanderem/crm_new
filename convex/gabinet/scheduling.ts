import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { verifyOrgAccess, requireOrgAdmin } from "../_helpers/auth";
import { verifyProductAccess } from "../_helpers/products";
import { GABINET_PRODUCT_ID } from "./_registry";
import { gabinetLeaveTypeValidator, gabinetLeaveStatusValidator } from "../schema";
import { getAvailableSlots } from "./_availability";

// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const writeWorkingHoursRef = internal.supabase.gabinet.workingHours.writeWorkingHoursToSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const updateWorkingHoursRef = internal.supabase.gabinet.workingHours.updateWorkingHoursInSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const writeScheduleRef = internal.supabase.gabinet.employeeSchedules.writeEmployeeScheduleToSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const updateScheduleRef = internal.supabase.gabinet.employeeSchedules.updateEmployeeScheduleInSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const deleteScheduleRef = internal.supabase.gabinet.employeeSchedules.deleteEmployeeScheduleFromSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const updateLeaveBalanceRef = internal.supabase.gabinet.leaveBalances.updateLeaveBalanceInSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const writeLeaveRef = internal.supabase.gabinet.leaves.writeLeaveToSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const updateLeaveRef = internal.supabase.gabinet.leaves.updateLeaveInSupabase;

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
    locationId: v.optional(v.id("gabinetLocations")),
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
        locationId: args.locationId,
        updatedAt: now,
      });

      await ctx.scheduler.runAfter(0, updateWorkingHoursRef, {
        workingHoursId: existing._id,
        organizationId: args.organizationId,
        startTime: args.startTime,
        endTime: args.endTime,
        isOpen: args.isOpen,
        breakStart: args.breakStart,
        breakEnd: args.breakEnd,
        locationId: args.locationId,
        updatedAt: now,
      });

      return existing._id;
    }

    const whId = await ctx.db.insert("gabinetWorkingHours", {
      organizationId: args.organizationId,
      dayOfWeek: args.dayOfWeek,
      startTime: args.startTime,
      endTime: args.endTime,
      isOpen: args.isOpen,
      breakStart: args.breakStart,
      breakEnd: args.breakEnd,
      locationId: args.locationId,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, writeWorkingHoursRef, {
      workingHoursId: whId,
      organizationId: args.organizationId,
      dayOfWeek: args.dayOfWeek,
      startTime: args.startTime,
      endTime: args.endTime,
      isOpen: args.isOpen,
      breakStart: args.breakStart,
      breakEnd: args.breakEnd,
      locationId: args.locationId,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    return whId;
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
      locationId: v.optional(v.id("gabinetLocations")),
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

        await ctx.scheduler.runAfter(0, updateWorkingHoursRef, {
          workingHoursId: existing._id,
          organizationId: args.organizationId,
          startTime: h.startTime,
          endTime: h.endTime,
          isOpen: h.isOpen,
          breakStart: h.breakStart,
          breakEnd: h.breakEnd,
          locationId: h.locationId,
          updatedAt: now,
        });
      } else {
        const whId = await ctx.db.insert("gabinetWorkingHours", {
          organizationId: args.organizationId,
          ...h,
          createdBy: user._id,
          createdAt: now,
          updatedAt: now,
        });

        await ctx.scheduler.runAfter(0, writeWorkingHoursRef, {
          workingHoursId: whId,
          organizationId: args.organizationId,
          dayOfWeek: h.dayOfWeek,
          startTime: h.startTime,
          endTime: h.endTime,
          isOpen: h.isOpen,
          breakStart: h.breakStart,
          breakEnd: h.breakEnd,
          locationId: h.locationId,
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
    locationId: v.optional(v.id("gabinetLocations")),
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
      locationId: args.locationId,
    };

    if (existing) {
      await ctx.db.patch(existing._id, { ...data, updatedAt: now });

      await ctx.scheduler.runAfter(0, updateScheduleRef, {
        scheduleId: existing._id,
        organizationId: args.organizationId,
        startTime: args.startTime,
        endTime: args.endTime,
        isWorking: args.isWorking,
        breakStart: args.breakStart,
        breakEnd: args.breakEnd,
        effectiveFrom: args.effectiveFrom,
        effectiveTo: args.effectiveTo,
        locationId: args.locationId,
        updatedAt: now,
      });

      return existing._id;
    }

    const scheduleId = await ctx.db.insert("gabinetEmployeeSchedules", {
      organizationId: args.organizationId,
      userId: args.userId,
      dayOfWeek: args.dayOfWeek,
      ...data,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, writeScheduleRef, {
      scheduleId,
      organizationId: args.organizationId,
      userId: args.userId,
      dayOfWeek: args.dayOfWeek,
      startTime: args.startTime,
      endTime: args.endTime,
      isWorking: args.isWorking,
      breakStart: args.breakStart,
      breakEnd: args.breakEnd,
      effectiveFrom: args.effectiveFrom,
      effectiveTo: args.effectiveTo,
      locationId: args.locationId,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    return scheduleId;
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
      locationId: v.optional(v.id("gabinetLocations")),
    })),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.organizationId);
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

        await ctx.scheduler.runAfter(0, updateScheduleRef, {
          scheduleId: existing._id,
          organizationId: args.organizationId,
          startTime: h.startTime,
          endTime: h.endTime,
          isWorking: h.isWorking,
          breakStart: h.breakStart,
          breakEnd: h.breakEnd,
          locationId: h.locationId,
          updatedAt: now,
        });
      } else {
        const scheduleId = await ctx.db.insert("gabinetEmployeeSchedules", {
          organizationId: args.organizationId,
          userId: args.userId,
          ...h,
          createdBy: user._id,
          createdAt: now,
          updatedAt: now,
        });

        await ctx.scheduler.runAfter(0, writeScheduleRef, {
          scheduleId,
          organizationId: args.organizationId,
          userId: args.userId,
          dayOfWeek: h.dayOfWeek,
          startTime: h.startTime,
          endTime: h.endTime,
          isWorking: h.isWorking,
          breakStart: h.breakStart,
          breakEnd: h.breakEnd,
          locationId: h.locationId,
          createdBy: user._id,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  },
});

/**
 * Save a full weekly schedule period with optional effectiveFrom/effectiveTo dates.
 * Each call creates or upserts 7 day entries sharing the same effective date range.
 * To manage multiple periods, call with different effectiveFrom values.
 */
export const saveSchedulePeriod = mutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    effectiveFrom: v.optional(v.string()),
    effectiveTo: v.optional(v.string()),
    hours: v.array(v.object({
      dayOfWeek: v.number(),
      startTime: v.string(),
      endTime: v.string(),
      isWorking: v.boolean(),
      breakStart: v.optional(v.string()),
      breakEnd: v.optional(v.string()),
      locationId: v.optional(v.id("gabinetLocations")),
    })),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.organizationId);
    await verifyProductAccess(ctx, args.organizationId, GABINET_PRODUCT_ID);
    const now = Date.now();

    for (const h of args.hours) {
      // Find existing entry matching org+user+day+effectiveFrom
      const candidates = await ctx.db
        .query("gabinetEmployeeSchedules")
        .withIndex("by_orgUserAndDay", (q) =>
          q.eq("organizationId", args.organizationId)
            .eq("userId", args.userId)
            .eq("dayOfWeek", h.dayOfWeek)
        )
        .collect();

      const existing = candidates.find(
        (c) => (c.effectiveFrom ?? "") === (args.effectiveFrom ?? "")
      );

      const data = {
        ...h,
        effectiveFrom: args.effectiveFrom,
        effectiveTo: args.effectiveTo,
      };

      if (existing) {
        await ctx.db.patch(existing._id, { ...data, updatedAt: now });

        await ctx.scheduler.runAfter(0, updateScheduleRef, {
          scheduleId: existing._id,
          organizationId: args.organizationId,
          startTime: h.startTime,
          endTime: h.endTime,
          isWorking: h.isWorking,
          breakStart: h.breakStart,
          breakEnd: h.breakEnd,
          effectiveFrom: args.effectiveFrom,
          effectiveTo: args.effectiveTo,
          locationId: h.locationId,
          updatedAt: now,
        });
      } else {
        const scheduleId = await ctx.db.insert("gabinetEmployeeSchedules", {
          organizationId: args.organizationId,
          userId: args.userId,
          ...data,
          createdBy: user._id,
          createdAt: now,
          updatedAt: now,
        });

        await ctx.scheduler.runAfter(0, writeScheduleRef, {
          scheduleId,
          organizationId: args.organizationId,
          userId: args.userId,
          dayOfWeek: h.dayOfWeek,
          startTime: h.startTime,
          endTime: h.endTime,
          isWorking: h.isWorking,
          breakStart: h.breakStart,
          breakEnd: h.breakEnd,
          effectiveFrom: args.effectiveFrom,
          effectiveTo: args.effectiveTo,
          locationId: h.locationId,
          createdBy: user._id,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  },
});

/**
 * Remove all schedule entries for a given period (matching effectiveFrom).
 */
export const removeSchedulePeriod = mutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    effectiveFrom: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);
    await verifyProductAccess(ctx, args.organizationId, GABINET_PRODUCT_ID);

    const all = await ctx.db
      .query("gabinetEmployeeSchedules")
      .withIndex("by_orgAndUser", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .collect();

    const toRemove = all.filter(
      (s) => (s.effectiveFrom ?? "") === (args.effectiveFrom ?? "")
    );

    for (const s of toRemove) {
      await ctx.db.delete(s._id);

      await ctx.scheduler.runAfter(0, deleteScheduleRef, {
        scheduleId: s._id,
        organizationId: args.organizationId,
      });
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

    const leaveId = await ctx.db.insert("gabinetLeaves", {
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

    // Dual-write leave to Supabase
    await ctx.scheduler.runAfter(0, writeLeaveRef, {
      leaveId: String(leaveId),
      organizationId: String(args.organizationId),
      userId: String(args.userId),
      type: args.type,
      leaveTypeId: args.leaveTypeId ? String(args.leaveTypeId) : undefined,
      startDate: args.startDate,
      endDate: args.endDate,
      startTime: args.startTime,
      endTime: args.endTime,
      status: "pending",
      reason: args.reason,
      createdBy: String(user._id),
      createdAt: now,
      updatedAt: now,
    });

    return leaveId;
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

    // Dual-write approve to Supabase
    await ctx.scheduler.runAfter(0, updateLeaveRef, {
      leaveId: String(args.leaveId),
      organizationId: String(args.organizationId),
      status: "approved",
      approvedBy: String(user._id),
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

          await ctx.scheduler.runAfter(0, updateLeaveBalanceRef, {
            balanceId: balance._id,
            organizationId: args.organizationId,
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

    // Dual-write reject to Supabase
    await ctx.scheduler.runAfter(0, updateLeaveRef, {
      leaveId: String(args.leaveId),
      organizationId: String(args.organizationId),
      status: "rejected",
      approvedBy: String(user._id),
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

// --- Remove employee schedule (delete by id) ---

export const removeEmployeeSchedule = mutation({
  args: {
    organizationId: v.id("organizations"),
    scheduleId: v.id("gabinetEmployeeSchedules"),
  },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);
    await verifyProductAccess(ctx, args.organizationId, GABINET_PRODUCT_ID);

    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule || schedule.organizationId !== args.organizationId) {
      throw new Error("Schedule not found");
    }

    await ctx.db.delete(args.scheduleId);

    await ctx.scheduler.runAfter(0, deleteScheduleRef, {
      scheduleId: args.scheduleId,
      organizationId: args.organizationId,
    });
  },
});

// --- Find Next Available Slot ---

export const findNextAvailableSlot = query({
  args: {
    organizationId: v.id("organizations"),
    employeeId: v.id("users"),
    durationMinutes: v.number(),
    fromDate: v.optional(v.string()), // YYYY-MM-DD, defaults to today
    maxDaysToSearch: v.optional(v.number()), // defaults to 30
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const maxDays = args.maxDaysToSearch ?? 30;

    // Start from fromDate or today
    const startDate = args.fromDate
      ? new Date(args.fromDate + "T00:00:00")
      : new Date();
    // Normalize to YYYY-MM-DD
    const toDateStr = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    for (let dayOffset = 0; dayOffset < maxDays; dayOffset++) {
      const checkDate = new Date(startDate);
      checkDate.setDate(startDate.getDate() + dayOffset);
      const dateStr = toDateStr(checkDate);

      const slots = await getAvailableSlots(ctx, {
        organizationId: args.organizationId,
        userId: args.employeeId,
        date: dateStr,
        duration: args.durationMinutes,
        locationId: undefined,
      });

      if (slots.length > 0) {
        return {
          date: dateStr,
          startTime: slots[0].start,
          endTime: slots[0].end,
        };
      }
    }

    return null;
  },
});
