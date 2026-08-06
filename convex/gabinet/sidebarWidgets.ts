import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { getJunctionTreatmentIds } from "./_helpers/junctionTreatments";

// All widgets are Supabase-primary actions — the underlying business tables
// (gabinet_appointments, gabinet_patients, gabinet_employees, ...) live in
// Supabase now. Each action: auth via internal query, then aggregate via
// supabaseDb.

async function verify(ctx: any, organizationId: string) {
  await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
    organizationId,
  });
  await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
    organizationId,
  });
}

// --- Dashboard KPIs ---
export const getDashboardKpis = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<{
    todayAppointments: number;
    confirmedToday: number;
    totalPatients: number;
    activeEmployees: number;
  }> => {
    await verify(ctx, args.organizationId);
    const db = createSupabaseDb();
    const orgId = String(args.organizationId);
    const todayStr = new Date().toISOString().split("T")[0];

    const [appointments, patients, employees] = await Promise.all([
      db.query("gabinetAppointments").eq("organizationId", orgId).eq("date", todayStr).collect(),
      db.query("gabinetPatients").eq("organizationId", orgId).collect(),
      db.query("gabinetEmployees").eq("organizationId", orgId).collect(),
    ]);

    return {
      todayAppointments: appointments.length,
      confirmedToday: appointments.filter((a: any) => a.status === "confirmed").length,
      totalPatients: patients.length,
      activeEmployees: employees.filter((e: any) => e.isActive).length,
    };
  },
});

// --- Calendar KPIs ---
export const getCalendarKpis = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<{
    todayCount: number;
    confirmed: number;
    unconfirmed: number;
  }> => {
    await verify(ctx, args.organizationId);
    const db = createSupabaseDb();
    const todayStr = new Date().toISOString().split("T")[0];

    const appointments = await db
      .query("gabinetAppointments")
      .eq("organizationId", String(args.organizationId))
      .eq("date", todayStr)
      .collect();

    return {
      todayCount: appointments.length,
      confirmed: appointments.filter((a: any) => a.status === "confirmed").length,
      unconfirmed: appointments.filter(
        (a: any) => a.status === "scheduled" || a.status === "pending_confirmation",
      ).length,
    };
  },
});

// --- Patients KPIs ---
export const getPatientsKpis = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<{ total: number; newThisMonth: number }> => {
    await verify(ctx, args.organizationId);
    const db = createSupabaseDb();

    const patients = await db
      .query("gabinetPatients")
      .eq("organizationId", String(args.organizationId))
      .collect();

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const startOfMonthMs = startOfMonth.getTime();

    return {
      total: patients.length,
      newThisMonth: patients.filter((p: any) => (p.createdAt ?? 0) >= startOfMonthMs).length,
    };
  },
});

// --- Treatments KPIs ---
export const getTreatmentsKpis = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<{
    totalTreatments: number;
    completedThisMonth: number;
    popularTreatment: string | null;
  }> => {
    await verify(ctx, args.organizationId);
    const db = createSupabaseDb();
    const orgId = String(args.organizationId);

    const [treatments, completedAppointments] = await Promise.all([
      db.query("gabinetTreatments").eq("organizationId", orgId).collect(),
      db.query("gabinetAppointments").eq("organizationId", orgId).eq("status", "completed").collect(),
    ]);

    const todayStr = new Date().toISOString().split("T")[0];
    const startOfMonthStr = todayStr.slice(0, 7) + "-01";

    const completedThisMonth = completedAppointments.filter(
      (a: any) => String(a.date ?? "") >= startOfMonthStr,
    );

    const thisMonthIds = completedThisMonth.map((a: any) => String(a._id ?? a.id ?? ""));
    const monthJunctionMap = await getJunctionTreatmentIds(db, thisMonthIds);
    const treatmentCounts: Record<string, number> = {};
    for (const apptId of thisMonthIds) {
      const primaryTid = (monthJunctionMap.get(apptId) ?? [])[0]?.treatmentId;
      if (primaryTid) {
        treatmentCounts[primaryTid] = (treatmentCounts[primaryTid] ?? 0) + 1;
      }
    }
    let popularId: string | null = null;
    let maxCount = 0;
    for (const [id, count] of Object.entries(treatmentCounts)) {
      if (count > maxCount) {
        maxCount = count;
        popularId = id;
      }
    }
    let popularTreatment: string | null = null;
    if (popularId !== null) {
      const found = treatments.find((t: any) => String(t._id ?? t.id) === popularId);
      popularTreatment = (found as any)?.name ?? null;
    }

    return {
      totalTreatments: treatments.length,
      completedThisMonth: completedThisMonth.length,
      popularTreatment,
    };
  },
});

// --- Employees KPIs ---
export const getEmployeesKpis = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<{
    activeCount: number;
    onLeave: number;
    pendingLeaveRequests: number;
  }> => {
    await verify(ctx, args.organizationId);
    const db = createSupabaseDb();
    const orgId = String(args.organizationId);
    const todayStr = new Date().toISOString().split("T")[0];

    const [employees, approvedLeaves, pendingLeaves] = await Promise.all([
      db.query("gabinetEmployees").eq("organizationId", orgId).collect(),
      db.query("gabinetLeaves").eq("organizationId", orgId).eq("status", "approved").collect(),
      db.query("gabinetLeaves").eq("organizationId", orgId).eq("status", "pending").collect(),
    ]);

    return {
      activeCount: employees.filter((e: any) => e.isActive).length,
      onLeave: approvedLeaves.filter(
        (l: any) => String(l.startDate) <= todayStr && String(l.endDate) >= todayStr,
      ).length,
      pendingLeaveRequests: pendingLeaves.length,
    };
  },
});

// --- Packages KPIs ---
export const getPackagesKpis = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<{
    totalPackages: number;
    activePackages: number;
    expiringPackages: number;
  }> => {
    await verify(ctx, args.organizationId);
    const db = createSupabaseDb();
    const orgId = String(args.organizationId);

    const [packages, packageUsages] = await Promise.all([
      db.query("gabinetTreatmentPackages").eq("organizationId", orgId).collect(),
      db.query("gabinetPackageUsage").eq("organizationId", orgId).collect(),
    ]);

    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    return {
      totalPackages: packages.length,
      activePackages: packageUsages.filter((u: any) => u.status === "active").length,
      expiringPackages: packageUsages.filter(
        (u: any) =>
          u.status === "active" &&
          u.expiresAt !== undefined &&
          u.expiresAt !== null &&
          (u.expiresAt as number) <= now + thirtyDaysMs,
      ).length,
    };
  },
});

// --- Staff Load ---
export const getStaffLoad = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<Array<{ name: string; appointmentCount: number; maxCapacity: number }>> => {
    await verify(ctx, args.organizationId);
    const db = createSupabaseDb();
    const orgId = String(args.organizationId);
    const todayStr = new Date().toISOString().split("T")[0];

    const [appointments, employees] = await Promise.all([
      db.query("gabinetAppointments").eq("organizationId", orgId).eq("date", todayStr).collect(),
      db.query("gabinetEmployees").eq("organizationId", orgId).eq("isActive", true).collect(),
    ]);

    const countMap = new Map<string, number>();
    for (const appt of appointments) {
      const key = String((appt as any).employeeId);
      countMap.set(key, (countMap.get(key) ?? 0) + 1);
    }

    return (employees as any[])
      .map((e) => ({
        name: [e.firstName, e.lastName].filter(Boolean).join(" ") || "Employee",
        appointmentCount: countMap.get(String(e.userId)) ?? 0,
        maxCapacity: 8,
      }))
      .filter((e) => e.appointmentCount > 0)
      .sort((a, b) => b.appointmentCount - a.appointmentCount);
  },
});

// --- Today's Schedule ---
export const getTodaySchedule = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<Array<{ name: string; startTime: string; endTime: string; status: "working" | "break" | "off" }>> => {
    await verify(ctx, args.organizationId);
    const db = createSupabaseDb();
    const orgId = String(args.organizationId);

    const today = new Date();
    const dayOfWeek = today.getDay();
    const todayStr = today.toISOString().split("T")[0];

    const [schedules, employees, approvedLeaves] = await Promise.all([
      db.query("gabinetEmployeeSchedules").eq("organizationId", orgId).collect(),
      db.query("gabinetEmployees").eq("organizationId", orgId).eq("isActive", true).collect(),
      db.query("gabinetLeaves").eq("organizationId", orgId).eq("status", "approved").collect(),
    ]);

    // For each employee, pick the most specific schedule entry whose effective
    // period covers today (mirrors resolveScheduleForDate in
    // _availability_supabase.ts). Without this, an employee with a default
    // (isWorking=true) entry and a current-period override (isWorking=false)
    // would still appear here as "working today" while the slot picker
    // correctly treats them as off.
    const schedulesByUser = new Map<string, any[]>();
    for (const s of schedules as any[]) {
      if (s.dayOfWeek !== dayOfWeek) continue;
      if (s.effectiveFrom && todayStr < String(s.effectiveFrom)) continue;
      if (s.effectiveTo && todayStr > String(s.effectiveTo)) continue;
      const key = String(s.userId);
      const list = schedulesByUser.get(key) ?? [];
      list.push(s);
      schedulesByUser.set(key, list);
    }

    const todaySchedules: any[] = [];
    for (const list of schedulesByUser.values()) {
      list.sort((a, b) => {
        const af = (a.effectiveFrom as string | null | undefined) ?? "";
        const bf = (b.effectiveFrom as string | null | undefined) ?? "";
        if (af && bf) return bf.localeCompare(af);
        if (af) return -1;
        if (bf) return 1;
        return 0;
      });
      const effective = list[0];
      if (effective?.isWorking) todaySchedules.push(effective);
    }

    const onLeaveUserIds = new Set(
      (approvedLeaves as any[])
        .filter((l) => String(l.startDate) <= todayStr && String(l.endDate) >= todayStr)
        .map((l) => String(l.userId)),
    );

    return todaySchedules
      .map((s: any) => {
        const employee = (employees as any[]).find((e) => String(e.userId) === String(s.userId));
        if (!employee) return null;
        const name =
          [employee.firstName, employee.lastName].filter(Boolean).join(" ") || "Employee";
        const status: "working" | "break" | "off" = onLeaveUserIds.has(String(s.userId))
          ? "off"
          : "working";
        return { name, startTime: String(s.startTime), endTime: String(s.endTime), status };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  },
});

// --- Reports KPIs ---
export const getReportsKpis = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<{
    thisMonthAppointments: number;
    visitTrend: number;
    attendance: number;
  }> => {
    await verify(ctx, args.organizationId);
    const db = createSupabaseDb();
    const orgId = String(args.organizationId);

    const todayStr = new Date().toISOString().split("T")[0];
    const thisMonthPrefix = todayStr.slice(0, 7);

    const now = new Date();
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthPrefix =
      lastMonthDate.getFullYear() + "-" + String(lastMonthDate.getMonth() + 1).padStart(2, "0");

    const allAppointments = await db
      .query("gabinetAppointments")
      .eq("organizationId", orgId)
      .collect();

    const thisMonthAppointments = (allAppointments as any[]).filter((a) =>
      String(a.date ?? "").startsWith(thisMonthPrefix),
    );
    const lastMonthAppointments = (allAppointments as any[]).filter((a) =>
      String(a.date ?? "").startsWith(lastMonthPrefix),
    );

    const thisMonthCount = thisMonthAppointments.length;
    const lastMonthCount = lastMonthAppointments.length;

    const visitTrend =
      lastMonthCount > 0
        ? Math.round(((thisMonthCount - lastMonthCount) / lastMonthCount) * 100)
        : 0;

    const completedThisMonth = thisMonthAppointments.filter((a) => a.status === "completed").length;
    const attendance =
      thisMonthCount > 0 ? Math.round((completedThisMonth / thisMonthCount) * 100) : 0;

    return {
      thisMonthAppointments: thisMonthCount,
      visitTrend,
      attendance,
    };
  },
});

// --- Day Agenda ---
export interface DayAgendaAppointment {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  patientName: string;
  treatmentName: string;
  treatmentDuration: number;
  employeeName: string;
  confirmed: boolean;
}

export const getDayAgenda = action({
  args: { organizationId: v.id("organizations"), date: v.string() },
  handler: async (ctx, args): Promise<{
    date: string;
    appointments: DayAgendaAppointment[];
    totalAppointments: number;
    confirmedCount: number;
  }> => {
    await verify(ctx, args.organizationId);
    const db = createSupabaseDb();
    const orgId = String(args.organizationId);

    const appointments = (await db
      .query("gabinetAppointments")
      .eq("organizationId", orgId)
      .eq("date", args.date)
      .collect()) as any[];

    const sorted = appointments.sort((a, b) =>
      String(a.startTime).localeCompare(String(b.startTime)),
    );

    const sortedIds = sorted.map((a) => String(a._id ?? a.id ?? ""));
    const junctionMap = await getJunctionTreatmentIds(db, sortedIds);

    const enriched = await Promise.all(
      sorted.map(async (appt, i) => {
        const apptId = sortedIds[i];
        const junctionRows = junctionMap.get(apptId) ?? [];
        const treatmentId = junctionRows[0]?.treatmentId ?? null;
        const [patient, treatment, employee] = await Promise.all([
          appt.patientId ? db.get("gabinetPatients", String(appt.patientId)).catch(() => null) : null,
          treatmentId ? db.get("gabinetTreatments", treatmentId).catch(() => null) : null,
          appt.employeeId
            ? db
                .get<{ name?: string | null; email?: string | null }>(
                  "users",
                  String(appt.employeeId),
                )
                .catch(() => null)
            : null,
        ]);

        const row: DayAgendaAppointment = {
          id: String(appt._id ?? appt.id ?? ""),
          startTime: String(appt.startTime ?? ""),
          endTime: String(appt.endTime ?? ""),
          status: String(appt.status ?? ""),
          patientName: patient
            ? `${(patient as any).firstName ?? ""} ${(patient as any).lastName ?? ""}`.trim() || "—"
            : "—",
          treatmentName: ((treatment as any)?.name as string | undefined) ?? "—",
          treatmentDuration: Number((treatment as any)?.duration ?? 0),
          employeeName:
            (employee?.name as string | null | undefined) ||
            (employee?.email as string | null | undefined) ||
            "—",
          confirmed: appt.status === "confirmed" || appt.status === "completed",
        };
        return row;
      }),
    );

    return {
      date: args.date,
      appointments: enriched,
      totalAppointments: enriched.length,
      confirmedCount: enriched.filter((a) => a.confirmed).length,
    };
  },
});

// --- Weekly Appointments ---
export const getWeeklyAppointments = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<Array<{ day: string; appointments: number }>> => {
    await verify(ctx, args.organizationId);
    const db = createSupabaseDb();
    const orgId = String(args.organizationId);

    const today = new Date();
    const oldestDate = new Date(today);
    oldestDate.setDate(oldestDate.getDate() - 6);
    const oldestStr = oldestDate.toISOString().split("T")[0];
    const todayStr = today.toISOString().split("T")[0];

    const appts = (await db
      .query("gabinetAppointments")
      .eq("organizationId", orgId)
      .gte("date", oldestStr)
      .lte("date", todayStr)
      .collect()) as any[];

    const byDate = new Map<string, number>();
    for (const a of appts) {
      byDate.set(String(a.date), (byDate.get(String(a.date)) ?? 0) + 1);
    }

    const days: { day: string; appointments: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const dayLabel = d.toLocaleDateString("pl-PL", { weekday: "short" });
      days.push({ day: dayLabel, appointments: byDate.get(dateStr) ?? 0 });
    }
    return days;
  },
});

// --- Monthly New Patients ---
export const getMonthlyNewPatients = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<Array<{ month: string; patients: number }>> => {
    await verify(ctx, args.organizationId);
    const db = createSupabaseDb();

    const patients = (await db
      .query("gabinetPatients")
      .eq("organizationId", String(args.organizationId))
      .collect()) as any[];

    const now = new Date();
    const months: { month: string; patients: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const prefix = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
      const label = d.toLocaleDateString("pl-PL", { month: "short" });

      const count = patients.filter((p) => {
        const created = new Date(p.createdAt ?? 0);
        const createdPrefix =
          created.getFullYear() + "-" + String(created.getMonth() + 1).padStart(2, "0");
        return createdPrefix === prefix;
      }).length;

      months.push({ month: label, patients: count });
    }

    return months;
  },
});

// --- Weekly Completed Treatments ---
export const getWeeklyCompletedTreatments = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<Array<{ day: string; completed: number }>> => {
    await verify(ctx, args.organizationId);
    const db = createSupabaseDb();
    const orgId = String(args.organizationId);

    const today = new Date();
    const oldestDate = new Date(today);
    oldestDate.setDate(oldestDate.getDate() - 6);
    const oldestStr = oldestDate.toISOString().split("T")[0];
    const todayStr = today.toISOString().split("T")[0];

    const appts = (await db
      .query("gabinetAppointments")
      .eq("organizationId", orgId)
      .gte("date", oldestStr)
      .lte("date", todayStr)
      .collect()) as any[];

    const byDate = new Map<string, number>();
    for (const a of appts) {
      if (a.status === "completed") {
        byDate.set(String(a.date), (byDate.get(String(a.date)) ?? 0) + 1);
      }
    }

    const days: { day: string; completed: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const dayLabel = d.toLocaleDateString("pl-PL", { weekday: "short" });
      days.push({ day: dayLabel, completed: byDate.get(dateStr) ?? 0 });
    }

    return days;
  },
});

// --- Top Treatments Ranking ---
export const getTopTreatments = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<Array<{ label: string; value: number }>> => {
    await verify(ctx, args.organizationId);
    const db = createSupabaseDb();
    const orgId = String(args.organizationId);

    const [appointments, treatments] = await Promise.all([
      db.query("gabinetAppointments").eq("organizationId", orgId).collect(),
      db.query("gabinetTreatments").eq("organizationId", orgId).collect(),
    ]);

    const topApptIds = (appointments as any[]).map((a) => String(a._id ?? a.id ?? ""));
    const topJunctionMap = await getJunctionTreatmentIds(db, topApptIds);

    const treatmentCounts = new Map<string, number>();
    for (const appt of appointments as any[]) {
      const apptId = String(appt._id ?? appt.id ?? "");
      const junctionRows = topJunctionMap.get(apptId) ?? [];
      const tids = junctionRows.map((r) => r.treatmentId);
      for (const tid of tids) {
        treatmentCounts.set(tid, (treatmentCounts.get(tid) ?? 0) + 1);
      }
    }

    const treatmentMap = new Map(
      (treatments as any[]).map((t) => [String(t._id ?? t.id), t.name as string]),
    );

    const results: { label: string; value: number }[] = [];
    for (const [treatmentId, count] of treatmentCounts) {
      const name = treatmentMap.get(treatmentId);
      if (name) results.push({ label: name, value: count });
    }

    return results.sort((a, b) => b.value - a.value).slice(0, 5);
  },
});

// --- Monthly Appointments ---
export const getMonthlyAppointments = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<Array<{ month: string; appointments: number; completed: number }>> => {
    await verify(ctx, args.organizationId);
    const db = createSupabaseDb();
    const orgId = String(args.organizationId);

    const now = new Date();
    const oldestMonthStart = new Date(now.getFullYear(), now.getMonth() - 5, 1)
      .toISOString()
      .split("T")[0];
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      .toISOString()
      .split("T")[0];

    const allAppointments = (await db
      .query("gabinetAppointments")
      .eq("organizationId", orgId)
      .gte("date", oldestMonthStart)
      .lt("date", nextMonthStart)
      .collect()) as any[];

    const months: { month: string; appointments: number; completed: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const prefix = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
      const label = d.toLocaleDateString("pl-PL", { month: "short" });

      const monthAppts = allAppointments.filter((a) => String(a.date ?? "").startsWith(prefix));
      const completedCount = monthAppts.filter((a) => a.status === "completed").length;

      months.push({
        month: label,
        appointments: monthAppts.length,
        completed: completedCount,
      });
    }

    return months;
  },
});

// --- Appointment Status Distribution ---
export const getAppointmentStatusDistribution = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<{
    total: number;
    statuses: Array<{ status: string; count: number }>;
  }> => {
    await verify(ctx, args.organizationId);
    const db = createSupabaseDb();
    const orgId = String(args.organizationId);

    const now = new Date();
    const thisMonthPrefix = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
    const thisMonthStart = `${thisMonthPrefix}-01`;
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      .toISOString()
      .split("T")[0];

    const thisMonth = (await db
      .query("gabinetAppointments")
      .eq("organizationId", orgId)
      .gte("date", thisMonthStart)
      .lt("date", nextMonthStart)
      .collect()) as any[];

    const statusCounts: Record<string, number> = {};
    for (const appt of thisMonth) {
      statusCounts[String(appt.status)] = (statusCounts[String(appt.status)] ?? 0) + 1;
    }

    return {
      total: thisMonth.length,
      statuses: Object.entries(statusCounts)
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count),
    };
  },
});
