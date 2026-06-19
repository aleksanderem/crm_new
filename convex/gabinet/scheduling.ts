import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { logError } from "../_helpers/logged";
import { gabinetLeaveTypeValidator, gabinetLeaveStatusValidator } from "../schema";
import { getAvailableSlotsSupabase } from "./_availability_supabase";
import type {
  GabinetEmployeeScheduleRow,
  GabinetLeaveRow,
  GabinetWorkingHoursRow,
} from "../_helpers/supabaseRows";

// Dual-write refs removed — Supabase is now primary for scheduling writes

// --- Working Hours (clinic-level defaults) ---

export const getWorkingHours = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<GabinetWorkingHoursRow[]> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const db = createSupabaseDb();
    return (await db
      .query("gabinetWorkingHours")
      .eq("organizationId", String(args.organizationId))
      .collect()) as GabinetWorkingHoursRow[];
  },
});

export const setWorkingHours = action({
  args: {
    organizationId: v.id("organizations"),
    dayOfWeek: v.number(),
    startTime: v.string(),
    endTime: v.string(),
    isOpen: v.boolean(),
    breakStart: v.optional(v.string()),
    breakEnd: v.optional(v.string()),
    locationId: v.optional(v.string()),
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

    // Check if entry already exists for this org+day
    const existing = await db.query("gabinetWorkingHours")
      .eq("organizationId", String(args.organizationId))
      .eq("dayOfWeek", args.dayOfWeek)
      .first();

    if (existing) {
      await db.patch("gabinetWorkingHours", existing._id as string, {
        startTime: args.startTime,
        endTime: args.endTime,
        isOpen: args.isOpen,
        breakStart: args.breakStart ?? null,
        breakEnd: args.breakEnd ?? null,
        locationId: args.locationId ?? null,
        updatedAt: now,
      });
      return existing._id as string;
    }

    const whId = await db.insert("gabinetWorkingHours", {
      organizationId: String(args.organizationId),
      dayOfWeek: args.dayOfWeek,
      startTime: args.startTime,
      endTime: args.endTime,
      isOpen: args.isOpen,
      breakStart: args.breakStart ?? null,
      breakEnd: args.breakEnd ?? null,
      locationId: args.locationId ?? null,
      createdBy: authResult.userId,
      createdAt: now,
      updatedAt: now,
    });

    return whId;
  },
});

export const bulkSetWorkingHours = action({
  args: {
    organizationId: v.id("organizations"),
    hours: v.array(v.object({
      dayOfWeek: v.number(),
      startTime: v.string(),
      endTime: v.string(),
      isOpen: v.boolean(),
      breakStart: v.optional(v.string()),
      breakEnd: v.optional(v.string()),
      locationId: v.optional(v.string()),
    })),
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

    for (const h of args.hours) {
      const existing = await db.query("gabinetWorkingHours")
        .eq("organizationId", String(args.organizationId))
        .eq("dayOfWeek", h.dayOfWeek)
        .first();

      if (existing) {
        await db.patch("gabinetWorkingHours", existing._id as string, {
          startTime: h.startTime,
          endTime: h.endTime,
          isOpen: h.isOpen,
          breakStart: h.breakStart ?? null,
          breakEnd: h.breakEnd ?? null,
          locationId: h.locationId ?? null,
          updatedAt: now,
        });
      } else {
        await db.insert("gabinetWorkingHours", {
          organizationId: String(args.organizationId),
          dayOfWeek: h.dayOfWeek,
          startTime: h.startTime,
          endTime: h.endTime,
          isOpen: h.isOpen,
          breakStart: h.breakStart ?? null,
          breakEnd: h.breakEnd ?? null,
          locationId: h.locationId ?? null,
          createdBy: authResult.userId,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  },
});

// --- Employee Schedules (per-employee overrides) ---

export const getEmployeeSchedule = action({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
  },
  handler: async (ctx, args): Promise<GabinetEmployeeScheduleRow[]> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const db = createSupabaseDb();
    return (await db
      .query("gabinetEmployeeSchedules")
      .eq("organizationId", String(args.organizationId))
      .eq("userId", args.userId)
      .collect()) as GabinetEmployeeScheduleRow[];
  },
});

export const setEmployeeSchedule = action({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
    dayOfWeek: v.number(),
    startTime: v.string(),
    endTime: v.string(),
    isWorking: v.boolean(),
    breakStart: v.optional(v.string()),
    breakEnd: v.optional(v.string()),
    effectiveFrom: v.optional(v.string()),
    effectiveTo: v.optional(v.string()),
    locationId: v.optional(v.string()),
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

    const candidates = await db.query("gabinetEmployeeSchedules")
      .eq("organizationId", String(args.organizationId))
      .eq("userId", args.userId)
      .eq("dayOfWeek", args.dayOfWeek)
      .collect();

    const existing = candidates.find(
      (c) => ((c.effectiveFrom as string | null | undefined) ?? "") === (args.effectiveFrom ?? "")
    );

    const data: Record<string, unknown> = {
      startTime: args.startTime,
      endTime: args.endTime,
      isWorking: args.isWorking,
      breakStart: args.breakStart ?? null,
      breakEnd: args.breakEnd ?? null,
      effectiveFrom: args.effectiveFrom ?? null,
      effectiveTo: args.effectiveTo ?? null,
      locationId: args.locationId ?? null,
    };

    if (existing) {
      await db.patch("gabinetEmployeeSchedules", existing._id as string, {
        ...data,
        updatedAt: now,
      });
      return existing._id as string;
    }

    const scheduleId = await db.insert("gabinetEmployeeSchedules", {
      organizationId: String(args.organizationId),
      userId: args.userId,
      dayOfWeek: args.dayOfWeek,
      ...data,
      createdBy: authResult.userId,
      createdAt: now,
      updatedAt: now,
    });

    return scheduleId;
  },
});

export const bulkSetEmployeeSchedule = action({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
    hours: v.array(v.object({
      dayOfWeek: v.number(),
      startTime: v.string(),
      endTime: v.string(),
      isWorking: v.boolean(),
      breakStart: v.optional(v.string()),
      breakEnd: v.optional(v.string()),
      locationId: v.optional(v.string()),
    })),
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

    for (const h of args.hours) {
      const candidates = await db.query("gabinetEmployeeSchedules")
        .eq("organizationId", String(args.organizationId))
        .eq("userId", args.userId)
        .eq("dayOfWeek", h.dayOfWeek)
        .collect();

      const existing = candidates.find(
        (c) => !((c.effectiveFrom as string | null | undefined) ?? "")
      );

      if (existing) {
        await db.patch("gabinetEmployeeSchedules", existing._id as string, {
          startTime: h.startTime,
          endTime: h.endTime,
          isWorking: h.isWorking,
          breakStart: h.breakStart ?? null,
          breakEnd: h.breakEnd ?? null,
          locationId: h.locationId ?? null,
          updatedAt: now,
        });
      } else {
        await db.insert("gabinetEmployeeSchedules", {
          organizationId: String(args.organizationId),
          userId: args.userId,
          dayOfWeek: h.dayOfWeek,
          startTime: h.startTime,
          endTime: h.endTime,
          isWorking: h.isWorking,
          breakStart: h.breakStart ?? null,
          breakEnd: h.breakEnd ?? null,
          effectiveFrom: null,
          effectiveTo: null,
          locationId: h.locationId ?? null,
          createdBy: authResult.userId,
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
export const saveSchedulePeriod = action({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
    effectiveFrom: v.optional(v.string()),
    effectiveTo: v.optional(v.string()),
    hours: v.array(v.object({
      dayOfWeek: v.number(),
      startTime: v.string(),
      endTime: v.string(),
      isWorking: v.boolean(),
      breakStart: v.optional(v.string()),
      breakEnd: v.optional(v.string()),
      locationId: v.optional(v.string()),
    })),
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

    for (const h of args.hours) {
      // Find existing entry matching org+user+day+effectiveFrom
      const candidates = await db.query("gabinetEmployeeSchedules")
        .eq("organizationId", String(args.organizationId))
        .eq("userId", args.userId)
        .eq("dayOfWeek", h.dayOfWeek)
        .collect();

      const existing = candidates.find(
        (c) => ((c.effectiveFrom as string) ?? "") === (args.effectiveFrom ?? "")
      );

      const data: Record<string, unknown> = {
        startTime: h.startTime,
        endTime: h.endTime,
        isWorking: h.isWorking,
        breakStart: h.breakStart ?? null,
        breakEnd: h.breakEnd ?? null,
        effectiveFrom: args.effectiveFrom ?? null,
        effectiveTo: args.effectiveTo ?? null,
        locationId: h.locationId ?? null,
      };

      if (existing) {
        await db.patch("gabinetEmployeeSchedules", existing._id as string, {
          ...data,
          updatedAt: now,
        });
      } else {
        await db.insert("gabinetEmployeeSchedules", {
          organizationId: String(args.organizationId),
          userId: args.userId,
          dayOfWeek: h.dayOfWeek,
          ...data,
          createdBy: authResult.userId,
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
export const removeSchedulePeriod = action({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
    effectiveFrom: v.optional(v.string()),
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

    const all = await db.query("gabinetEmployeeSchedules")
      .eq("organizationId", String(args.organizationId))
      .eq("userId", args.userId)
      .collect();

    const toRemove = all.filter(
      (s) => ((s.effectiveFrom as string) ?? "") === (args.effectiveFrom ?? "")
    );

    for (const s of toRemove) {
      await db.delete("gabinetEmployeeSchedules", s._id as string);
    }
  },
});

export const listEmployeeSchedules = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<GabinetEmployeeScheduleRow[]> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const db = createSupabaseDb();
    return (await db
      .query("gabinetEmployeeSchedules")
      .eq("organizationId", String(args.organizationId))
      .collect()) as GabinetEmployeeScheduleRow[];
  },
});

// --- Leaves ---

export const listLeaves = action({
  args: {
    organizationId: v.id("organizations"),
    status: v.optional(gabinetLeaveStatusValidator),
  },
  handler: async (ctx, args): Promise<GabinetLeaveRow[]> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const db = createSupabaseDb();
    let q = db.query("gabinetLeaves").eq("organizationId", String(args.organizationId));
    if (args.status) {
      q = q.eq("status", args.status);
    }
    return (await q.collect()) as GabinetLeaveRow[];
  },
});

export const createLeave = action({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
    type: gabinetLeaveTypeValidator,
    leaveTypeId: v.optional(v.string()),
    startDate: v.string(),
    endDate: v.string(),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const now = Date.now();
    const db = createSupabaseDb();

    const leaveId = await db.insert("gabinetLeaves", {
      organizationId: String(args.organizationId),
      userId: args.userId,
      type: args.type,
      leaveTypeId: args.leaveTypeId ?? null,
      startDate: args.startDate,
      endDate: args.endDate,
      startTime: args.startTime ?? null,
      endTime: args.endTime ?? null,
      status: "pending",
      reason: args.reason ?? null,
      createdBy: authResult.userId,
      createdAt: now,
      updatedAt: now,
    });

    return leaveId;
    } catch (err) {
      await logError(ctx, err, {
        scope: "gabinet.scheduling",
        fnName: "createLeave",
        argsJson: JSON.stringify(args),
        organizationId: args.organizationId,
      });
      throw err;
    }
  },
});

export const approveLeave = action({
  args: {
    organizationId: v.id("organizations"),
    leaveId: v.string(),
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

    const leave = await db.get("gabinetLeaves", args.leaveId);
    if (!leave || String(leave.organizationId) !== String(args.organizationId)) {
      throw new Error("Leave not found");
    }

    await db.patch("gabinetLeaves", args.leaveId, {
      status: "approved",
      approvedBy: authResult.userId,
      approvedAt: now,
      updatedAt: now,
    });

    // Update leave balance if leaveTypeId is set
    if (leave.leaveTypeId) {
      const startD = new Date(leave.startDate as string);
      const endD = new Date(leave.endDate as string);
      const days = Math.max(1, Math.ceil((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24)) + 1);
      const year = startD.getFullYear();

      // Find employee record from Supabase
      const employee = await db.query("gabinetEmployees")
        .eq("organizationId", String(args.organizationId))
        .eq("userId", leave.userId as string)
        .first();

      if (employee) {
        const balance = await db.query("gabinetLeaveBalances")
          .eq("organizationId", String(args.organizationId))
          .eq("employeeId", employee._id as string)
          .eq("leaveTypeId", leave.leaveTypeId as string)
          .eq("year", year)
          .first();

        if (balance) {
          await db.patch("gabinetLeaveBalances", balance._id as string, {
            usedDays: (balance.usedDays as number) + days,
            updatedAt: now,
          });
        }
      }
    }
  },
});

export const rejectLeave = action({
  args: {
    organizationId: v.id("organizations"),
    leaveId: v.string(),
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

    const leave = await db.get("gabinetLeaves", args.leaveId);
    if (!leave || String(leave.organizationId) !== String(args.organizationId)) {
      throw new Error("Leave not found");
    }

    await db.patch("gabinetLeaves", args.leaveId, {
      status: "rejected",
      approvedBy: authResult.userId,
      approvedAt: now,
      updatedAt: now,
    });
  },
});

export const getLeavesByDateRange = action({
  args: {
    organizationId: v.id("organizations"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args): Promise<GabinetLeaveRow[]> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const db = createSupabaseDb();
    const leaves = (await db
      .query("gabinetLeaves")
      .eq("organizationId", String(args.organizationId))
      .gte("startDate", args.startDate)
      .lte("startDate", args.endDate)
      .collect()) as GabinetLeaveRow[];

    return leaves.filter((l) => l.status === "approved");
  },
});

// --- Remove employee schedule (delete by id) ---

export const removeEmployeeSchedule = action({
  args: {
    organizationId: v.id("organizations"),
    scheduleId: v.string(),
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

    const schedule = await db.get("gabinetEmployeeSchedules", args.scheduleId);
    if (!schedule || String(schedule.organizationId) !== String(args.organizationId)) {
      throw new Error("Schedule not found");
    }

    await db.delete("gabinetEmployeeSchedules", args.scheduleId);
  },
});

// --- Find Next Available Slot ---

export const findNextAvailableSlot = action({
  args: {
    organizationId: v.id("organizations"),
    employeeId: v.string(),
    durationMinutes: v.number(),
    fromDate: v.optional(v.string()), // YYYY-MM-DD, defaults to today
    maxDaysToSearch: v.optional(v.number()), // defaults to 30
    // Client local "now" — when present, slots on `nowDate` that are at or
    // before `nowTime` are excluded so the search never returns a past slot.
    // Issue #1402.
    nowDate: v.optional(v.string()),
    nowTime: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();

    const maxDays = args.maxDaysToSearch ?? 30;

    // Start from fromDate, then nowDate, then server today (last resort).
    const startDate = args.fromDate
      ? new Date(args.fromDate + "T00:00:00")
      : args.nowDate
        ? new Date(args.nowDate + "T00:00:00")
        : new Date();
    // Normalize to YYYY-MM-DD
    const toDateStr = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    for (let dayOffset = 0; dayOffset < maxDays; dayOffset++) {
      const checkDate = new Date(startDate);
      checkDate.setDate(startDate.getDate() + dayOffset);
      const dateStr = toDateStr(checkDate);

      const { slots } = await getAvailableSlotsSupabase(db, {
        organizationId: String(args.organizationId),
        userId: args.employeeId,
        date: dateStr,
        duration: args.durationMinutes,
        locationId: undefined,
        nowDate: args.nowDate,
        nowTime: args.nowTime,
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
