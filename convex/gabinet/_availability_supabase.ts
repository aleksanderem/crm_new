/**
 * Supabase-backed availability helpers.
 *
 * Mirrors `_availability.ts` but reads from Supabase via `supabaseDb` so it
 * can be called from Convex `action`s. Used by appointment create/update
 * actions and the public slot-picker query once it's been wrapped as an
 * action.
 */

import { createSupabaseDb } from "../_helpers/supabaseDb";

type SupabaseDb = ReturnType<typeof createSupabaseDb>;

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export interface TimeSlot {
  start: string;
  end: string;
}

/**
 * Why no slots were returned. The dialog renders a specific message per
 * reason instead of a generic "no slots" so users know what to fix.
 * Issue #1434.
 */
export type NoSlotsReason =
  | "employee_not_working"
  | "clinic_closed"
  | "on_leave"
  | "fully_booked";

export interface AvailableSlotsResult {
  slots: TimeSlot[];
  reason?: NoSlotsReason;
}

async function resolveScheduleForDate(
  db: SupabaseDb,
  organizationId: string,
  userId: string,
  dayOfWeek: number,
  date: string,
): Promise<Record<string, any> | null> {
  const candidates = await db
    .query("gabinetEmployeeSchedules")
    .eq("organizationId", organizationId)
    .eq("userId", userId)
    .eq("dayOfWeek", dayOfWeek)
    .collect();

  const matching = candidates.filter((c: any) => {
    if (c.effectiveFrom && date < c.effectiveFrom) return false;
    if (c.effectiveTo && date > c.effectiveTo) return false;
    return true;
  });

  matching.sort((a: any, b: any) => {
    if (a.effectiveFrom && b.effectiveFrom) return b.effectiveFrom.localeCompare(a.effectiveFrom);
    if (a.effectiveFrom) return -1;
    if (b.effectiveFrom) return 1;
    return 0;
  });
  return (matching[0] as Record<string, any>) ?? null;
}

export async function checkEmployeeQualificationSupabase(
  db: SupabaseDb,
  args: {
    organizationId: string;
    userId: string;
    treatmentId: string;
  },
): Promise<{ qualified: boolean; reason?: string }> {
  const employees = await db
    .query("gabinetEmployees")
    .eq("organizationId", args.organizationId)
    .eq("userId", args.userId)
    .take(1)
    .collect();
  const employee = employees[0] as any;

  if (!employee) return { qualified: true };

  if (!employee.isActive) {
    return { qualified: false, reason: "Employee is inactive" };
  }

  const qualifiedIds = (employee.qualifiedTreatmentIds as string[] | undefined) ?? [];
  if (qualifiedIds.length === 0) return { qualified: true };
  if (!qualifiedIds.includes(args.treatmentId)) {
    return { qualified: false, reason: "Employee is not qualified for this treatment" };
  }
  return { qualified: true };
}

export async function resolveAppointmentLocationSupabase(
  db: SupabaseDb,
  args: { organizationId: string; userId: string; date: string },
): Promise<string | null> {
  const dayOfWeek = new Date(args.date + "T00:00:00").getDay();
  const schedule = await resolveScheduleForDate(
    db,
    args.organizationId,
    args.userId,
    dayOfWeek,
    args.date,
  );
  return schedule?.locationId ? String(schedule.locationId) : null;
}

export async function getAvailableSlotsSupabase(
  db: SupabaseDb,
  args: {
    organizationId: string;
    userId: string;
    date: string;
    duration: number;
    locationId?: string;
    // When set, slots starting at or before `nowTime` on `nowDate` are
    // filtered out. Server doesn't know the clinic timezone so the caller
    // (frontend) is the source of truth for "now". Issue #1402.
    nowDate?: string;
    nowTime?: string;
  },
): Promise<AvailableSlotsResult> {
  const dayOfWeek = new Date(args.date + "T00:00:00").getDay();

  const empSchedule = await resolveScheduleForDate(
    db,
    args.organizationId,
    args.userId,
    dayOfWeek,
    args.date,
  );

  let startTime: string;
  let endTime: string;
  let breakStart: string | undefined;
  let breakEnd: string | undefined;

  if (empSchedule) {
    if (!empSchedule.isWorking) {
      return { slots: [], reason: "employee_not_working" };
    }
    startTime = empSchedule.startTime;
    endTime = empSchedule.endTime;
    breakStart = empSchedule.breakStart;
    breakEnd = empSchedule.breakEnd;
  } else {
    let clinicHours: any = null;
    if (args.locationId) {
      const rows = await db
        .query("gabinetWorkingHours")
        .eq("organizationId", args.organizationId)
        .eq("locationId", args.locationId)
        .eq("dayOfWeek", dayOfWeek)
        .take(1)
        .collect();
      clinicHours = rows[0];
    }
    if (!clinicHours) {
      const rows = await db
        .query("gabinetWorkingHours")
        .eq("organizationId", args.organizationId)
        .eq("dayOfWeek", dayOfWeek)
        .take(1)
        .collect();
      clinicHours = rows[0];
    }
    if (!clinicHours || !clinicHours.isOpen) {
      return { slots: [], reason: "clinic_closed" };
    }
    startTime = clinicHours.startTime;
    endTime = clinicHours.endTime;
    breakStart = clinicHours.breakStart;
    breakEnd = clinicHours.breakEnd;
  }

  const leaves = await db
    .query("gabinetLeaves")
    .eq("organizationId", args.organizationId)
    .eq("userId", args.userId)
    .collect();

  const activeLeaves = (leaves as any[]).filter(
    (l) =>
      l.status === "approved" &&
      l.startDate <= args.date &&
      l.endDate >= args.date,
  );

  if (activeLeaves.some((l) => !l.startTime)) {
    return { slots: [], reason: "on_leave" };
  }

  const appointments = await db
    .query("gabinetAppointments")
    .eq("organizationId", args.organizationId)
    .eq("employeeId", args.userId)
    .eq("date", args.date)
    .collect();

  const activeAppointments = (appointments as any[]).filter(
    (a) => a.status !== "cancelled" && a.status !== "no_show",
  );

  const blocked: Array<{ start: number; end: number }> = [];

  if (breakStart && breakEnd) {
    blocked.push({ start: timeToMinutes(breakStart), end: timeToMinutes(breakEnd) });
  }

  for (const leave of activeLeaves) {
    if (leave.startTime && leave.endTime) {
      blocked.push({ start: timeToMinutes(leave.startTime), end: timeToMinutes(leave.endTime) });
    }
  }

  for (const appt of activeAppointments) {
    blocked.push({
      start: timeToMinutes(String(appt.startTime)),
      end: timeToMinutes(String(appt.endTime)),
    });
  }

  // Block time from non-gabinet scheduledActivities (e.g. Google Calendar events)
  const resourceActivities = await db
    .query("scheduledActivities")
    .eq("organizationId", args.organizationId)
    .eq("resourceId", args.userId)
    .collect();

  for (const activity of resourceActivities as any[]) {
    if (activity.isCompleted) continue;
    if (!activity.endDate) continue;
    if (activity.moduleRef?.moduleId === "gabinet") continue;
    const actDate = new Date(activity.dueDate);
    const actDateStr = `${actDate.getFullYear()}-${String(actDate.getMonth() + 1).padStart(2, "0")}-${String(actDate.getDate()).padStart(2, "0")}`;
    if (actDateStr !== args.date) continue;
    blocked.push({
      start: actDate.getHours() * 60 + actDate.getMinutes(),
      end:
        new Date(activity.endDate).getHours() * 60 +
        new Date(activity.endDate).getMinutes(),
    });
  }

  blocked.sort((a, b) => a.start - b.start);

  const dayStart = timeToMinutes(startTime);
  const dayEnd = timeToMinutes(endTime);
  const slots: TimeSlot[] = [];

  let cursor = dayStart;
  for (const b of blocked) {
    if (cursor + args.duration <= b.start) {
      let slotStart = cursor;
      while (slotStart + args.duration <= b.start) {
        slots.push({
          start: minutesToTime(slotStart),
          end: minutesToTime(slotStart + args.duration),
        });
        slotStart += 15;
      }
    }
    cursor = Math.max(cursor, b.end);
  }

  let slotStart = cursor;
  while (slotStart + args.duration <= dayEnd) {
    slots.push({
      start: minutesToTime(slotStart),
      end: minutesToTime(slotStart + args.duration),
    });
    slotStart += 15;
  }

  let finalSlots = slots;
  if (args.nowDate && args.nowTime && args.nowDate === args.date) {
    const nowMinutes = timeToMinutes(args.nowTime);
    finalSlots = slots.filter((s) => timeToMinutes(s.start) > nowMinutes);
  }

  if (finalSlots.length === 0) {
    return { slots: finalSlots, reason: "fully_booked" };
  }
  return { slots: finalSlots };
}

export async function checkConflictSupabase(
  db: SupabaseDb,
  args: {
    organizationId: string;
    userId: string;
    date: string;
    startTime: string;
    endTime: string;
    excludeAppointmentId?: string;
    roomId?: string;
    // When true, soft "booking" conflicts (overlapping appointment, overlapping
    // calendar activity, occupied room) are ignored so the caller can
    // double-book on purpose with a warning surfaced in the UI. Hard
    // constraints (working hours, approved leave, clinic closed) still apply.
    // Issue #1526.
    allowBookingConflict?: boolean;
  },
): Promise<{ hasConflict: boolean; reason?: string }> {
  const dayOfWeek = new Date(args.date + "T00:00:00").getDay();
  const reqStart = timeToMinutes(args.startTime);
  const reqEnd = timeToMinutes(args.endTime);

  const empSchedule = await resolveScheduleForDate(
    db,
    args.organizationId,
    args.userId,
    dayOfWeek,
    args.date,
  );

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
    const rows = await db
      .query("gabinetWorkingHours")
      .eq("organizationId", args.organizationId)
      .eq("dayOfWeek", dayOfWeek)
      .take(1)
      .collect();
    const clinicHours = rows[0] as any;
    if (!clinicHours || !clinicHours.isOpen) {
      return { hasConflict: true, reason: "Clinic is closed on this day" };
    }
    const schedStart = timeToMinutes(clinicHours.startTime);
    const schedEnd = timeToMinutes(clinicHours.endTime);
    if (reqStart < schedStart || reqEnd > schedEnd) {
      return { hasConflict: true, reason: "Outside clinic working hours" };
    }
  }

  const leaves = await db
    .query("gabinetLeaves")
    .eq("organizationId", args.organizationId)
    .eq("userId", args.userId)
    .collect();

  for (const leave of leaves as any[]) {
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

  if (!args.allowBookingConflict) {
    const appointments = await db
      .query("gabinetAppointments")
      .eq("organizationId", args.organizationId)
      .eq("employeeId", args.userId)
      .eq("date", args.date)
      .collect();

    for (const appt of appointments as any[]) {
      if (args.excludeAppointmentId && String(appt.id ?? appt._id) === args.excludeAppointmentId) continue;
      if (appt.status === "cancelled" || appt.status === "no_show") continue;
      const apptStart = timeToMinutes(String(appt.startTime));
      const apptEnd = timeToMinutes(String(appt.endTime));
      if (reqStart < apptEnd && reqEnd > apptStart) {
        return { hasConflict: true, reason: "Conflicts with existing appointment" };
      }
    }

    const resourceActivities = await db
      .query("scheduledActivities")
      .eq("organizationId", args.organizationId)
      .eq("resourceId", args.userId)
      .collect();

    for (const activity of resourceActivities as any[]) {
      if (activity.isCompleted) continue;
      if (!activity.endDate) continue;
      const actDate = new Date(activity.dueDate);
      const actDateStr = `${actDate.getFullYear()}-${String(actDate.getMonth() + 1).padStart(2, "0")}-${String(actDate.getDate()).padStart(2, "0")}`;
      if (actDateStr !== args.date) continue;
      if (activity.moduleRef?.moduleId === "gabinet") continue;

      const actStartMin = actDate.getHours() * 60 + actDate.getMinutes();
      const actEndDate = new Date(activity.endDate);
      const actEndMin = actEndDate.getHours() * 60 + actEndDate.getMinutes();
      if (reqStart < actEndMin && reqEnd > actStartMin) {
        return { hasConflict: true, reason: `Conflicts with: ${activity.title}` };
      }
    }

    if (args.roomId) {
      const roomAppointments = await db
        .query("gabinetAppointments")
        .eq("organizationId", args.organizationId)
        .eq("roomId", args.roomId)
        .eq("date", args.date)
        .collect();

      for (const appt of roomAppointments as any[]) {
        if (args.excludeAppointmentId && String(appt.id ?? appt._id) === args.excludeAppointmentId) continue;
        if (appt.status === "cancelled" || appt.status === "no_show") continue;
        if (
          String(appt.startTime) < args.endTime &&
          String(appt.endTime) > args.startTime
        ) {
          return { hasConflict: true, reason: "Room is occupied at this time" };
        }
      }
    }
  }

  return { hasConflict: false };
}
