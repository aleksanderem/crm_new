import { action, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { logError } from "../_helpers/logged";
import { logActivity } from "../_helpers/activities";
import { logAudit } from "../auditLog";
import { createNotificationDirect } from "../notifications";
import { gabinetLeaveTypeValidator, gabinetLeaveStatusValidator } from "../schema";
import { getAvailableSlotsSupabase } from "./_availability_supabase";
import type {
  GabinetEmployeeScheduleRow,
  GabinetLeaveBalanceRow,
  GabinetLeaveRow,
  GabinetLeaveTypeRow,
  GabinetWorkingHoursRow,
} from "../_helpers/supabaseRows";

// Dual-write refs removed — Supabase is now primary for scheduling writes

// --- Working Hours (clinic-level defaults) ---

export const getWorkingHours = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<GabinetWorkingHoursRow[]> => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
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

    // Check if entry already exists for this org+day+locationId
    const whQuery = db.query("gabinetWorkingHours")
      .eq("organizationId", String(args.organizationId))
      .eq("dayOfWeek", args.dayOfWeek);
    if (args.locationId) {
      whQuery.eq("locationId", args.locationId);
    } else {
      whQuery.isNull("locationId");
    }
    const existing = await whQuery.first();

    let whId: string;
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
      whId = existing._id as string;
    } else {
      whId = await db.insert("gabinetWorkingHours", {
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
    }

    try {
      await ctx.runMutation(internal.gabinet.scheduling._workingHoursSideEffects, {
        organizationId: args.organizationId,
        workingHoursId: whId,
        dayOfWeek: args.dayOfWeek,
        performedBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
      });
    } catch (e) {
      console.error("[scheduling.setWorkingHours] Side effects FAILED:", e);
    }

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

    for (const h of args.hours) {
      const hQuery = db.query("gabinetWorkingHours")
        .eq("organizationId", String(args.organizationId))
        .eq("dayOfWeek", h.dayOfWeek);
      if (h.locationId) {
        hQuery.eq("locationId", h.locationId);
      } else {
        hQuery.isNull("locationId");
      }
      const existing = await hQuery.first();

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

    try {
      await ctx.runMutation(internal.gabinet.scheduling._bulkWorkingHoursSideEffects, {
        organizationId: args.organizationId,
        performedBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
      });
    } catch (e) {
      console.error("[scheduling.bulkSetWorkingHours] Side effects FAILED:", e);
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
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
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

    let scheduleId: string;
    if (existing) {
      await db.patch("gabinetEmployeeSchedules", existing._id as string, {
        ...data,
        updatedAt: now,
      });
      scheduleId = existing._id as string;
    } else {
      scheduleId = await db.insert("gabinetEmployeeSchedules", {
        organizationId: String(args.organizationId),
        userId: args.userId,
        dayOfWeek: args.dayOfWeek,
        ...data,
        createdBy: authResult.userId,
        createdAt: now,
        updatedAt: now,
      });
    }

    try {
      await ctx.runMutation(internal.gabinet.scheduling._employeeScheduleSideEffects, {
        organizationId: args.organizationId,
        scheduleId,
        userId: args.userId,
        performedBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
      });
    } catch (e) {
      console.error("[scheduling.setEmployeeSchedule] Side effects FAILED:", e);
    }

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

    try {
      await ctx.runMutation(internal.gabinet.scheduling._bulkEmployeeScheduleSideEffects, {
        organizationId: args.organizationId,
        userId: args.userId,
        performedBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
      });
    } catch (e) {
      console.error("[scheduling.bulkSetEmployeeSchedule] Side effects FAILED:", e);
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

    try {
      await ctx.runMutation(internal.gabinet.scheduling._saveSchedulePeriodSideEffects, {
        organizationId: args.organizationId,
        userId: args.userId,
        effectiveFrom: args.effectiveFrom,
        performedBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
      });
    } catch (e) {
      console.error("[scheduling.saveSchedulePeriod] Side effects FAILED:", e);
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

    try {
      await ctx.runMutation(internal.gabinet.scheduling._removeSchedulePeriodSideEffects, {
        organizationId: args.organizationId,
        userId: args.userId,
        effectiveFrom: args.effectiveFrom,
        performedBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
      });
    } catch (e) {
      console.error("[scheduling.removeSchedulePeriod] Side effects FAILED:", e);
    }
  },
});

export const listEmployeeSchedules = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<GabinetEmployeeScheduleRow[]> => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
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

    let initialStatus: "pending" | "approved" = "pending";
    if (args.leaveTypeId) {
      const leaveType = (await db.get("gabinetLeaveTypes", args.leaveTypeId)) as GabinetLeaveTypeRow | null;
      if (leaveType && !leaveType.requiresApproval) {
        initialStatus = "approved";
      }
    }

    const leaveId = await db.insert("gabinetLeaves", {
      organizationId: String(args.organizationId),
      userId: args.userId,
      type: args.type,
      leaveTypeId: args.leaveTypeId ?? null,
      startDate: args.startDate,
      endDate: args.endDate,
      startTime: args.startTime ?? null,
      endTime: args.endTime ?? null,
      status: initialStatus,
      reason: args.reason ?? null,
      createdBy: authResult.userId,
      createdAt: now,
      updatedAt: now,
    });

    try {
      await ctx.runMutation(internal.gabinet.scheduling._createLeaveSideEffects, {
        organizationId: args.organizationId,
        leaveId,
        userId: args.userId,
        type: args.type,
        startDate: args.startDate,
        endDate: args.endDate,
        performedBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
      });
    } catch (e) {
      console.error("[scheduling.createLeave] Side effects FAILED:", e);
    }

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

    try {
      await ctx.runMutation(internal.gabinet.scheduling._leaveSideEffects, {
        organizationId: args.organizationId,
        leaveId: args.leaveId,
        userId: leave.userId as string,
        action: "status_changed",
        description: `Leave request approved`,
        performedBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
        auditAction: "leave_approved",
      });
    } catch (e) {
      console.error("[scheduling.approveLeave] Side effects FAILED:", e);
    }

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
        const balance = (await db.query("gabinetLeaveBalances")
          .eq("organizationId", String(args.organizationId))
          .eq("employeeId", employee._id as string)
          .eq("leaveTypeId", leave.leaveTypeId as string)
          .eq("year", year)
          .first()) as GabinetLeaveBalanceRow | null;

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

    try {
      await ctx.runMutation(internal.gabinet.scheduling._leaveSideEffects, {
        organizationId: args.organizationId,
        leaveId: args.leaveId,
        userId: leave.userId as string,
        action: "status_changed",
        description: `Leave request rejected`,
        performedBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
        auditAction: "leave_rejected",
      });
    } catch (e) {
      console.error("[scheduling.rejectLeave] Side effects FAILED:", e);
    }
  },
});

export const deleteLeave = action({
  args: {
    organizationId: v.id("organizations"),
    leaveId: v.string(),
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

    const leave = await db.get("gabinetLeaves", args.leaveId);
    if (!leave || String(leave.organizationId) !== String(args.organizationId)) {
      throw new Error("Leave not found");
    }

    // If the leave was approved and had a leave type, reverse the balance deduction
    if (leave.status === "approved" && leave.leaveTypeId) {
      const startD = new Date(leave.startDate as string);
      const endD = new Date(leave.endDate as string);
      const days = Math.max(1, Math.ceil((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24)) + 1);
      const year = startD.getFullYear();

      const employee = await db.query("gabinetEmployees")
        .eq("organizationId", String(args.organizationId))
        .eq("userId", leave.userId as string)
        .first();

      if (employee) {
        const balance = (await db.query("gabinetLeaveBalances")
          .eq("organizationId", String(args.organizationId))
          .eq("employeeId", employee._id as string)
          .eq("leaveTypeId", leave.leaveTypeId as string)
          .eq("year", year)
          .first()) as GabinetLeaveBalanceRow | null;

        if (balance) {
          await db.patch("gabinetLeaveBalances", balance._id as string, {
            usedDays: Math.max(0, (balance.usedDays as number) - days),
            updatedAt: Date.now(),
          });
        }
      }
    }

    await db.delete("gabinetLeaves", args.leaveId);

    try {
      await ctx.runMutation(internal.gabinet.scheduling._leaveSideEffects, {
        organizationId: args.organizationId,
        leaveId: args.leaveId,
        userId: leave.userId as string,
        action: "deleted",
        description: `Leave request deleted`,
        performedBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
      });
    } catch (e) {
      console.error("[scheduling.deleteLeave] Side effects FAILED:", e);
    }
  },
});

export const getLeavesByDateRange = action({
  args: {
    organizationId: v.id("organizations"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args): Promise<GabinetLeaveRow[]> => {
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
    const leaves = (await db
      .query("gabinetLeaves")
      .eq("organizationId", String(args.organizationId))
      .lte("startDate", args.endDate)
      .gte("endDate", args.startDate)
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

    const schedule = await db.get("gabinetEmployeeSchedules", args.scheduleId);
    if (!schedule || String(schedule.organizationId) !== String(args.organizationId)) {
      throw new Error("Schedule not found");
    }

    await db.delete("gabinetEmployeeSchedules", args.scheduleId);

    try {
      await ctx.runMutation(internal.gabinet.scheduling._employeeScheduleSideEffects, {
        organizationId: args.organizationId,
        scheduleId: args.scheduleId,
        userId: String(schedule.userId),
        performedBy: String(authResult.userId),
        actorLabel: authResult.userName ?? authResult.userEmail,
      });
    } catch (e) {
      console.error("[scheduling.removeEmployeeSchedule] Side effects FAILED:", e);
    }
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
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });

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

export const _workingHoursSideEffects = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    workingHoursId: v.string(),
    dayOfWeek: v.number(),
    performedBy: v.string(),
    actorLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetWorkingHours",
      entityId: args.workingHoursId,
      action: "updated",
      description: `Updated working hours for ${days[args.dayOfWeek] ?? `day ${args.dayOfWeek}`}`,
      metadata: { dayOfWeek: args.dayOfWeek },
      performedBy: args.performedBy as Id<"users">,
      actorLabel: args.actorLabel,
    });
  },
});

export const _bulkWorkingHoursSideEffects = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    performedBy: v.string(),
    actorLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetWorkingHours",
      entityId: String(args.organizationId),
      action: "updated",
      description: `Updated organization working hours`,
      performedBy: args.performedBy as Id<"users">,
      actorLabel: args.actorLabel,
    });
  },
});

export const _employeeScheduleSideEffects = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    scheduleId: v.string(),
    userId: v.string(),
    performedBy: v.string(),
    actorLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetEmployeeSchedule",
      entityId: args.scheduleId,
      action: "updated",
      description: `Updated employee schedule`,
      metadata: { userId: args.userId },
      performedBy: args.performedBy as Id<"users">,
      actorLabel: args.actorLabel,
    });
  },
});

export const _bulkEmployeeScheduleSideEffects = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
    performedBy: v.string(),
    actorLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetEmployeeSchedule",
      entityId: args.userId,
      action: "updated",
      description: `Updated employee weekly schedule`,
      metadata: { userId: args.userId },
      performedBy: args.performedBy as Id<"users">,
      actorLabel: args.actorLabel,
    });
  },
});

export const _saveSchedulePeriodSideEffects = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
    effectiveFrom: v.optional(v.string()),
    performedBy: v.string(),
    actorLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetEmployeeSchedule",
      entityId: args.userId,
      action: "updated",
      description: args.effectiveFrom
        ? `Saved schedule period from ${args.effectiveFrom}`
        : `Saved default schedule period`,
      metadata: { userId: args.userId, effectiveFrom: args.effectiveFrom },
      performedBy: args.performedBy as Id<"users">,
      actorLabel: args.actorLabel,
    });
  },
});

export const _removeSchedulePeriodSideEffects = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.string(),
    effectiveFrom: v.optional(v.string()),
    performedBy: v.string(),
    actorLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetEmployeeSchedule",
      entityId: args.userId,
      action: "deleted",
      description: args.effectiveFrom
        ? `Removed schedule period from ${args.effectiveFrom}`
        : `Removed default schedule period`,
      metadata: { userId: args.userId, effectiveFrom: args.effectiveFrom },
      performedBy: args.performedBy as Id<"users">,
      actorLabel: args.actorLabel,
    });
  },
});

export const _createLeaveSideEffects = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    leaveId: v.string(),
    userId: v.string(),
    type: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    performedBy: v.string(),
    actorLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetLeave",
      entityId: args.userId,
      action: "created",
      description: `Leave request created (${args.type}: ${args.startDate} – ${args.endDate})`,
      metadata: { leaveId: args.leaveId, type: args.type, startDate: args.startDate, endDate: args.endDate },
      performedBy: args.performedBy as Id<"users">,
      actorLabel: args.actorLabel,
    });
  },
});

export const _leaveSideEffects = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    leaveId: v.string(),
    userId: v.string(),
    action: v.union(v.literal("status_changed"), v.literal("deleted")),
    description: v.string(),
    performedBy: v.string(),
    actorLabel: v.optional(v.string()),
    auditAction: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetLeave",
      entityId: args.userId,
      action: args.action,
      description: args.description,
      metadata: { leaveId: args.leaveId },
      performedBy: args.performedBy as Id<"users">,
      actorLabel: args.actorLabel,
    });

    if (args.auditAction) {
      await logAudit(ctx, {
        organizationId: args.organizationId,
        userId: args.performedBy as Id<"users">,
        action: args.auditAction,
        entityType: "gabinetLeave",
        entityId: args.leaveId,
        details: args.description,
      });
    }

    if (args.action === "status_changed" && args.userId !== args.performedBy) {
      const actorSuffix = args.actorLabel ? ` by ${args.actorLabel}` : "";
      await createNotificationDirect(ctx, {
        organizationId: args.organizationId,
        userId: args.userId as Id<"users">,
        type: "leave_decision",
        title: args.description,
        message: `${args.description}${actorSuffix}.`,
      });
    }
  },
});
