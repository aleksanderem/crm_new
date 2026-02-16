import { QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/** Parse "HH:MM" to minutes since midnight */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Format minutes since midnight to "HH:MM" */
function minutesToTime(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

interface TimeSlot {
  start: string; // "HH:MM"
  end: string;
}

/**
 * Check if an employee is qualified to perform a specific treatment.
 * Returns true if qualified or if no employee record exists (fallback for non-gabinet users).
 */
export async function checkEmployeeQualification(
  ctx: QueryCtx,
  args: {
    organizationId: Id<"organizations">;
    userId: Id<"users">;
    treatmentId: Id<"gabinetTreatments">;
  }
): Promise<{ qualified: boolean; reason?: string }> {
  const employee = await ctx.db
    .query("gabinetEmployees")
    .withIndex("by_orgAndUser", (q) =>
      q.eq("organizationId", args.organizationId).eq("userId", args.userId)
    )
    .first();

  // If no employee record, allow (backward compat)
  if (!employee) return { qualified: true };

  if (!employee.isActive) {
    return { qualified: false, reason: "Employee is inactive" };
  }

  if (employee.qualifiedTreatmentIds.length === 0) {
    // No qualifications defined = can do anything
    return { qualified: true };
  }

  if (!employee.qualifiedTreatmentIds.includes(args.treatmentId)) {
    return { qualified: false, reason: "Employee is not qualified for this treatment" };
  }

  return { qualified: true };
}

/**
 * Get available time slots for a given employee on a given date.
 * Considers: employee schedule (or clinic defaults), breaks, approved leaves, existing appointments.
 */
export async function getAvailableSlots(
  ctx: QueryCtx,
  args: {
    organizationId: Id<"organizations">;
    userId: Id<"users">;
    date: string; // YYYY-MM-DD
    duration: number; // minutes
  }
): Promise<TimeSlot[]> {
  const dayOfWeek = new Date(args.date + "T00:00:00").getDay();

  // 1. Get employee-specific schedule for this day, or fall back to clinic defaults
  const empSchedule = await ctx.db
    .query("gabinetEmployeeSchedules")
    .withIndex("by_orgUserAndDay", (q) =>
      q.eq("organizationId", args.organizationId)
        .eq("userId", args.userId)
        .eq("dayOfWeek", dayOfWeek)
    )
    .first();

  let startTime: string;
  let endTime: string;
  let breakStart: string | undefined;
  let breakEnd: string | undefined;

  if (empSchedule) {
    if (!empSchedule.isWorking) return [];
    startTime = empSchedule.startTime;
    endTime = empSchedule.endTime;
    breakStart = empSchedule.breakStart;
    breakEnd = empSchedule.breakEnd;
  } else {
    const clinicHours = await ctx.db
      .query("gabinetWorkingHours")
      .withIndex("by_orgAndDay", (q) =>
        q.eq("organizationId", args.organizationId).eq("dayOfWeek", dayOfWeek)
      )
      .first();

    if (!clinicHours || !clinicHours.isOpen) return [];
    startTime = clinicHours.startTime;
    endTime = clinicHours.endTime;
    breakStart = clinicHours.breakStart;
    breakEnd = clinicHours.breakEnd;
  }

  // 2. Check for approved leaves overlapping this date
  const leaves = await ctx.db
    .query("gabinetLeaves")
    .withIndex("by_orgAndUser", (q) =>
      q.eq("organizationId", args.organizationId).eq("userId", args.userId)
    )
    .collect();

  const activeLeaves = leaves.filter(
    (l) => l.status === "approved" && l.startDate <= args.date && l.endDate >= args.date
  );

  if (activeLeaves.some((l) => !l.startTime)) {
    // Full-day leave
    return [];
  }

  // 3. Get existing appointments for this employee on this date
  const appointments = await ctx.db
    .query("gabinetAppointments")
    .withIndex("by_orgAndEmployeeAndDate", (q) =>
      q.eq("organizationId", args.organizationId)
        .eq("employeeId", args.userId)
        .eq("date", args.date)
    )
    .collect();

  const activeAppointments = appointments.filter(
    (a) => a.status !== "cancelled" && a.status !== "no_show"
  );

  // 4. Build blocked intervals
  const blocked: Array<{ start: number; end: number }> = [];

  // Break
  if (breakStart && breakEnd) {
    blocked.push({ start: timeToMinutes(breakStart), end: timeToMinutes(breakEnd) });
  }

  // Partial leaves
  for (const leave of activeLeaves) {
    if (leave.startTime && leave.endTime) {
      blocked.push({ start: timeToMinutes(leave.startTime), end: timeToMinutes(leave.endTime) });
    }
  }

  // Existing appointments
  for (const appt of activeAppointments) {
    blocked.push({ start: timeToMinutes(appt.startTime), end: timeToMinutes(appt.endTime) });
  }

  // Also block time from non-gabinet scheduledActivities for this resource
  const resourceActivities = await ctx.db
    .query("scheduledActivities")
    .withIndex("by_orgAndResourceAndDueDate", (q) =>
      q.eq("organizationId", args.organizationId).eq("resourceId", args.userId)
    )
    .collect();

  for (const activity of resourceActivities) {
    if (activity.isCompleted) continue;
    if (!activity.endDate) continue;
    if (activity.moduleRef?.moduleId === "gabinet") continue; // skip, already counted
    const actDate = new Date(activity.dueDate);
    const actDateStr = `${actDate.getFullYear()}-${String(actDate.getMonth() + 1).padStart(2, "0")}-${String(actDate.getDate()).padStart(2, "0")}`;
    if (actDateStr !== args.date) continue;

    blocked.push({
      start: actDate.getHours() * 60 + actDate.getMinutes(),
      end: new Date(activity.endDate).getHours() * 60 + new Date(activity.endDate).getMinutes(),
    });
  }

  // Sort blocked intervals
  blocked.sort((a, b) => a.start - b.start);

  // 5. Find available slots with requested duration
  const dayStart = timeToMinutes(startTime);
  const dayEnd = timeToMinutes(endTime);
  const slots: TimeSlot[] = [];

  let cursor = dayStart;
  for (const b of blocked) {
    if (cursor + args.duration <= b.start) {
      // Generate slots in this gap
      let slotStart = cursor;
      while (slotStart + args.duration <= b.start) {
        slots.push({ start: minutesToTime(slotStart), end: minutesToTime(slotStart + args.duration) });
        slotStart += 15; // 15-minute increments
      }
    }
    cursor = Math.max(cursor, b.end);
  }

  // After last blocked interval
  let slotStart = cursor;
  while (slotStart + args.duration <= dayEnd) {
    slots.push({ start: minutesToTime(slotStart), end: minutesToTime(slotStart + args.duration) });
    slotStart += 15;
  }

  return slots;
}

/**
 * Check if a time range conflicts with existing appointments or schedule constraints.
 */
export async function checkConflict(
  ctx: QueryCtx,
  args: {
    organizationId: Id<"organizations">;
    userId: Id<"users">;
    date: string;
    startTime: string;
    endTime: string;
    excludeAppointmentId?: Id<"gabinetAppointments">;
  }
): Promise<{ hasConflict: boolean; reason?: string }> {
  const dayOfWeek = new Date(args.date + "T00:00:00").getDay();
  const reqStart = timeToMinutes(args.startTime);
  const reqEnd = timeToMinutes(args.endTime);

  // Check working hours
  const empSchedule = await ctx.db
    .query("gabinetEmployeeSchedules")
    .withIndex("by_orgUserAndDay", (q) =>
      q.eq("organizationId", args.organizationId)
        .eq("userId", args.userId)
        .eq("dayOfWeek", dayOfWeek)
    )
    .first();

  if (empSchedule) {
    if (!empSchedule.isWorking) {
      return { hasConflict: true, reason: "Employee is not working on this day" };
    }
    const schedStart = timeToMinutes(empSchedule.startTime);
    const schedEnd = timeToMinutes(empSchedule.endTime);
    if (reqStart < schedStart || reqEnd > schedEnd) {
      return { hasConflict: true, reason: "Outside employee working hours" };
    }
  } else {
    const clinicHours = await ctx.db
      .query("gabinetWorkingHours")
      .withIndex("by_orgAndDay", (q) =>
        q.eq("organizationId", args.organizationId).eq("dayOfWeek", dayOfWeek)
      )
      .first();

    if (!clinicHours || !clinicHours.isOpen) {
      return { hasConflict: true, reason: "Clinic is closed on this day" };
    }
    const schedStart = timeToMinutes(clinicHours.startTime);
    const schedEnd = timeToMinutes(clinicHours.endTime);
    if (reqStart < schedStart || reqEnd > schedEnd) {
      return { hasConflict: true, reason: "Outside clinic working hours" };
    }
  }

  // Check approved leaves
  const leaves = await ctx.db
    .query("gabinetLeaves")
    .withIndex("by_orgAndUser", (q) =>
      q.eq("organizationId", args.organizationId).eq("userId", args.userId)
    )
    .collect();

  for (const leave of leaves) {
    if (leave.status !== "approved") continue;
    if (leave.startDate > args.date || leave.endDate < args.date) continue;

    if (!leave.startTime) {
      return { hasConflict: true, reason: "Employee is on leave" };
    }
    if (leave.startTime && leave.endTime) {
      const leaveStart = timeToMinutes(leave.startTime);
      const leaveEnd = timeToMinutes(leave.endTime);
      if (reqStart < leaveEnd && reqEnd > leaveStart) {
        return { hasConflict: true, reason: "Conflicts with employee leave" };
      }
    }
  }

  // Check existing appointments
  const appointments = await ctx.db
    .query("gabinetAppointments")
    .withIndex("by_orgAndEmployeeAndDate", (q) =>
      q.eq("organizationId", args.organizationId)
        .eq("employeeId", args.userId)
        .eq("date", args.date)
    )
    .collect();

  for (const appt of appointments) {
    if (args.excludeAppointmentId && appt._id === args.excludeAppointmentId) continue;
    if (appt.status === "cancelled" || appt.status === "no_show") continue;

    const apptStart = timeToMinutes(appt.startTime);
    const apptEnd = timeToMinutes(appt.endTime);
    if (reqStart < apptEnd && reqEnd > apptStart) {
      return { hasConflict: true, reason: "Conflicts with existing appointment" };
    }
  }

  // Check scheduledActivities for this resource (non-gabinet events blocking the employee)
  const resourceActivities = await ctx.db
    .query("scheduledActivities")
    .withIndex("by_orgAndResourceAndDueDate", (q) =>
      q.eq("organizationId", args.organizationId).eq("resourceId", args.userId)
    )
    .collect();

  for (const activity of resourceActivities) {
    if (activity.isCompleted) continue;
    if (!activity.endDate) continue;
    // Filter to same day
    const actDate = new Date(activity.dueDate);
    const actDateStr = `${actDate.getFullYear()}-${String(actDate.getMonth() + 1).padStart(2, "0")}-${String(actDate.getDate()).padStart(2, "0")}`;
    if (actDateStr !== args.date) continue;
    // Skip if this is a gabinet:appointment (already checked above via gabinetAppointments)
    if (activity.moduleRef?.moduleId === "gabinet") continue;

    const actStartMin = actDate.getHours() * 60 + actDate.getMinutes();
    const actEndDate = new Date(activity.endDate);
    const actEndMin = actEndDate.getHours() * 60 + actEndDate.getMinutes();

    if (reqStart < actEndMin && reqEnd > actStartMin) {
      return { hasConflict: true, reason: `Conflicts with: ${activity.title}` };
    }
  }

  return { hasConflict: false };
}
