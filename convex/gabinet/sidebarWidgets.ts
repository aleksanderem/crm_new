import { query } from "../_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "../_helpers/auth";

// --- Dashboard KPIs ---
export const getDashboardKpis = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const todayStr = new Date().toISOString().split("T")[0];

    const appointments = await ctx.db
      .query("gabinetAppointments")
      .withIndex("by_orgAndDate", (q) =>
        q.eq("organizationId", args.organizationId).eq("date", todayStr),
      )
      .collect();

    const confirmedToday = appointments.filter(
      (a) => a.status === "confirmed",
    ).length;

    const patients = await ctx.db
      .query("gabinetPatients")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const employees = await ctx.db
      .query("gabinetEmployees")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const activeEmployees = employees.filter((e) => e.isActive).length;

    return {
      todayAppointments: appointments.length,
      confirmedToday,
      totalPatients: patients.length,
      activeEmployees,
    };
  },
});

// --- Calendar KPIs ---
export const getCalendarKpis = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const todayStr = new Date().toISOString().split("T")[0];

    const appointments = await ctx.db
      .query("gabinetAppointments")
      .withIndex("by_orgAndDate", (q) =>
        q.eq("organizationId", args.organizationId).eq("date", todayStr),
      )
      .collect();

    const confirmed = appointments.filter(
      (a) => a.status === "confirmed",
    ).length;
    const unconfirmed = appointments.filter(
      (a) => a.status === "scheduled" || a.status === "pending_confirmation",
    ).length;

    return {
      todayCount: appointments.length,
      confirmed,
      unconfirmed,
    };
  },
});

// --- Patients KPIs ---
export const getPatientsKpis = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const patients = await ctx.db
      .query("gabinetPatients")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const startOfMonthMs = startOfMonth.getTime();

    const newThisMonth = patients.filter(
      (p) => p.createdAt >= startOfMonthMs,
    ).length;

    return {
      total: patients.length,
      newThisMonth,
    };
  },
});

// --- Treatments KPIs ---
export const getTreatmentsKpis = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const treatments = await ctx.db
      .query("gabinetTreatments")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const todayStr = new Date().toISOString().split("T")[0];
    const startOfMonthStr = todayStr.slice(0, 7) + "-01";

    const completedAppointments = await ctx.db
      .query("gabinetAppointments")
      .withIndex("by_orgAndStatus", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "completed"),
      )
      .collect();

    const completedThisMonth = completedAppointments.filter(
      (a) => a.date >= startOfMonthStr,
    );

    // Find most popular treatment by completed appointments this month
    const treatmentCounts: Record<string, number> = {};
    for (const appt of completedThisMonth) {
      const id = appt.treatmentId as string;
      treatmentCounts[id] = (treatmentCounts[id] ?? 0) + 1;
    }
    let popularTreatment: string | null = null;
    let maxCount = 0;
    for (const [id, count] of Object.entries(treatmentCounts)) {
      if (count > maxCount) {
        maxCount = count;
        popularTreatment = id;
      }
    }
    if (popularTreatment !== null) {
      const found = treatments.find((t) => t._id === popularTreatment);
      popularTreatment = found?.name ?? null;
    }

    return {
      totalTreatments: treatments.length,
      completedThisMonth: completedThisMonth.length,
      popularTreatment,
    };
  },
});

// --- Employees KPIs ---
export const getEmployeesKpis = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const employees = await ctx.db
      .query("gabinetEmployees")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const activeCount = employees.filter((e) => e.isActive).length;

    const todayStr = new Date().toISOString().split("T")[0];

    const leaves = await ctx.db
      .query("gabinetLeaves")
      .withIndex("by_orgAndStatus", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "approved"),
      )
      .collect();

    const onLeave = leaves.filter(
      (l) => l.startDate <= todayStr && l.endDate >= todayStr,
    ).length;

    const pendingLeaves = await ctx.db
      .query("gabinetLeaves")
      .withIndex("by_orgAndStatus", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "pending"),
      )
      .collect();

    return {
      activeCount,
      onLeave,
      pendingLeaveRequests: pendingLeaves.length,
    };
  },
});

// --- Packages KPIs ---
export const getPackagesKpis = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const packages = await ctx.db
      .query("gabinetTreatmentPackages")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const packageUsages = await ctx.db
      .query("gabinetPackageUsage")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const activePackages = packageUsages.filter(
      (u) => u.status === "active",
    ).length;

    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const expiringPackages = packageUsages.filter(
      (u) =>
        u.status === "active" &&
        u.expiresAt !== undefined &&
        u.expiresAt <= now + thirtyDaysMs,
    ).length;

    return {
      totalPackages: packages.length,
      activePackages,
      expiringPackages,
    };
  },
});

// --- Staff Load (Gabinet Calendar) ---
export const getStaffLoad = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const todayStr = new Date().toISOString().split("T")[0];

    const appointments = await ctx.db
      .query("gabinetAppointments")
      .withIndex("by_orgAndDate", (q) =>
        q.eq("organizationId", args.organizationId).eq("date", todayStr),
      )
      .collect();

    const employees = await ctx.db
      .query("gabinetEmployees")
      .withIndex("by_orgAndActive", (q) =>
        q.eq("organizationId", args.organizationId).eq("isActive", true),
      )
      .collect();

    const countMap = new Map<string, number>();
    for (const appt of appointments) {
      const key = String(appt.employeeId);
      countMap.set(key, (countMap.get(key) ?? 0) + 1);
    }

    return employees
      .map((e) => ({
        name: [e.firstName, e.lastName].filter(Boolean).join(" ") || "Employee",
        appointmentCount: countMap.get(String(e.userId)) ?? 0,
        maxCapacity: 8,
      }))
      .filter((e) => e.appointmentCount > 0)
      .sort((a, b) => b.appointmentCount - a.appointmentCount);
  },
});

// --- Today's Schedule (Gabinet Employees) ---
export const getTodaySchedule = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sunday, 1=Monday...
    const todayStr = today.toISOString().split("T")[0];

    const schedules = await ctx.db
      .query("gabinetEmployeeSchedules")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const todaySchedules = schedules.filter(
      (s) => s.dayOfWeek === dayOfWeek && s.isWorking,
    );

    const employees = await ctx.db
      .query("gabinetEmployees")
      .withIndex("by_orgAndActive", (q) =>
        q.eq("organizationId", args.organizationId).eq("isActive", true),
      )
      .collect();

    const approvedLeaves = await ctx.db
      .query("gabinetLeaves")
      .withIndex("by_orgAndStatus", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "approved"),
      )
      .collect();

    const onLeaveUserIds = new Set(
      approvedLeaves
        .filter((l) => l.startDate <= todayStr && l.endDate >= todayStr)
        .map((l) => String(l.userId)),
    );

    return todaySchedules
      .map((s) => {
        const employee = employees.find((e) => e.userId === s.userId);
        if (!employee) return null;
        const name =
          [employee.firstName, employee.lastName].filter(Boolean).join(" ") || "Employee";
        const status: "working" | "break" | "off" = onLeaveUserIds.has(String(s.userId))
          ? "off"
          : "working";
        return { name, startTime: s.startTime, endTime: s.endTime, status };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  },
});

// --- Reports KPIs ---
export const getReportsKpis = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const todayStr = new Date().toISOString().split("T")[0];
    const thisMonthPrefix = todayStr.slice(0, 7); // "YYYY-MM"

    const now = new Date();
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthPrefix =
      lastMonthDate.getFullYear() +
      "-" +
      String(lastMonthDate.getMonth() + 1).padStart(2, "0");

    const allAppointments = await ctx.db
      .query("gabinetAppointments")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const thisMonthAppointments = allAppointments.filter((a) =>
      a.date.startsWith(thisMonthPrefix),
    );
    const lastMonthAppointments = allAppointments.filter((a) =>
      a.date.startsWith(lastMonthPrefix),
    );

    const thisMonthCount = thisMonthAppointments.length;
    const lastMonthCount = lastMonthAppointments.length;

    let visitTrend = 0;
    if (lastMonthCount > 0) {
      visitTrend = Math.round(
        ((thisMonthCount - lastMonthCount) / lastMonthCount) * 100,
      );
    }

    const completedThisMonth = thisMonthAppointments.filter(
      (a) => a.status === "completed",
    ).length;
    const attendance =
      thisMonthCount > 0
        ? Math.round((completedThisMonth / thisMonthCount) * 100)
        : 0;

    return {
      thisMonthAppointments: thisMonthCount,
      visitTrend,
      attendance,
    };
  },
});

// --- Day Agenda (Column 2 takeover) ---
export const getDayAgenda = query({
  args: { organizationId: v.id("organizations"), date: v.string() },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const appointments = await ctx.db
      .query("gabinetAppointments")
      .withIndex("by_orgAndDate", (q) =>
        q.eq("organizationId", args.organizationId).eq("date", args.date),
      )
      .collect();

    const sorted = appointments.sort((a, b) => a.startTime.localeCompare(b.startTime));

    const enriched = await Promise.all(
      sorted.map(async (appt) => {
        const patient = appt.patientId ? await ctx.db.get(appt.patientId) : null;
        const treatment = appt.treatmentId ? await ctx.db.get(appt.treatmentId) : null;
        const employee = appt.employeeId ? await ctx.db.get(appt.employeeId) : null;

        return {
          id: appt._id,
          startTime: appt.startTime,
          endTime: appt.endTime,
          status: appt.status,
          patientName: patient ? `${patient.firstName} ${patient.lastName}` : "—",
          treatmentName: treatment?.name ?? "—",
          treatmentDuration: treatment?.duration ?? 0,
          employeeName: employee
            ? employee.name || "Employee"
            : "—",
          confirmed: appt.status === "confirmed" || appt.status === "completed",
        };
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

// --- Dashboard Weekly Appointments (sparkline data) ---
export const getWeeklyAppointments = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const today = new Date();
    const days: { day: string; appointments: number }[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const dayLabel = d.toLocaleDateString("pl-PL", { weekday: "short" });

      const appts = await ctx.db
        .query("gabinetAppointments")
        .withIndex("by_orgAndDate", (q) =>
          q.eq("organizationId", args.organizationId).eq("date", dateStr),
        )
        .collect();

      days.push({ day: dayLabel, appointments: appts.length });
    }

    return days;
  },
});

// --- Dashboard Monthly Patients (sparkline data) ---
export const getMonthlyNewPatients = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const patients = await ctx.db
      .query("gabinetPatients")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const now = new Date();
    const months: { month: string; patients: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const prefix =
        d.getFullYear() +
        "-" +
        String(d.getMonth() + 1).padStart(2, "0");
      const label = d.toLocaleDateString("pl-PL", { month: "short" });

      const count = patients.filter((p) => {
        const created = new Date(p.createdAt);
        const createdPrefix =
          created.getFullYear() +
          "-" +
          String(created.getMonth() + 1).padStart(2, "0");
        return createdPrefix === prefix;
      }).length;

      months.push({ month: label, patients: count });
    }

    return months;
  },
});

// --- Dashboard Weekly Completed Treatments (sparkline data) ---
export const getWeeklyCompletedTreatments = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const today = new Date();
    const days: { day: string; completed: number }[] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const dayLabel = d.toLocaleDateString("pl-PL", { weekday: "short" });

      const appts = await ctx.db
        .query("gabinetAppointments")
        .withIndex("by_orgAndDate", (q) =>
          q.eq("organizationId", args.organizationId).eq("date", dateStr),
        )
        .collect();

      const completed = appts.filter((a) => a.status === "completed").length;
      days.push({ day: dayLabel, completed });
    }

    return days;
  },
});

// --- Top Treatments Ranking ---
export const getTopTreatments = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const appointments = await ctx.db
      .query("gabinetAppointments")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const treatments = await ctx.db
      .query("gabinetTreatments")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    // Count appointments per treatment
    const treatmentCounts = new Map<string, number>();
    for (const appt of appointments) {
      if (appt.treatmentId) {
        treatmentCounts.set(
          String(appt.treatmentId),
          (treatmentCounts.get(String(appt.treatmentId)) ?? 0) + 1,
        );
      }
    }

    const treatmentMap = new Map(
      treatments.map((t) => [String(t._id), t.name]),
    );

    const results: { label: string; value: number }[] = [];
    for (const [treatmentId, count] of treatmentCounts) {
      const name = treatmentMap.get(treatmentId);
      if (name) {
        results.push({ label: name, value: count });
      }
    }

    return results.sort((a, b) => b.value - a.value).slice(0, 5);
  },
});

// --- Monthly Appointments (last 6 months, for area chart) ---
export const getMonthlyAppointments = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const now = new Date();
    const oldestMonthStart = new Date(now.getFullYear(), now.getMonth() - 5, 1)
      .toISOString()
      .split("T")[0];
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      .toISOString()
      .split("T")[0];

    const allAppointments = await ctx.db
      .query("gabinetAppointments")
      .withIndex("by_orgAndDate", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .gte("date", oldestMonthStart)
          .lt("date", nextMonthStart),
      )
      .collect();
    const months: { month: string; appointments: number; completed: number }[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const prefix =
        d.getFullYear() +
        "-" +
        String(d.getMonth() + 1).padStart(2, "0");
      const label = d.toLocaleDateString("pl-PL", { month: "short" });

      const monthAppts = allAppointments.filter((a) => a.date.startsWith(prefix));
      const completedCount = monthAppts.filter((a) => a.status === "completed").length;

      months.push({ month: label, appointments: monthAppts.length, completed: completedCount });
    }

    return months;
  },
});

// --- Appointment Status Distribution (for donut chart) ---
export const getAppointmentStatusDistribution = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const now = new Date();
    const thisMonthPrefix =
      now.getFullYear() +
      "-" +
      String(now.getMonth() + 1).padStart(2, "0");
    const thisMonthStart = `${thisMonthPrefix}-01`;
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      .toISOString()
      .split("T")[0];

    const thisMonth = await ctx.db
      .query("gabinetAppointments")
      .withIndex("by_orgAndDate", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .gte("date", thisMonthStart)
          .lt("date", nextMonthStart),
      )
      .collect();

    const statusCounts: Record<string, number> = {};
    for (const appt of thisMonth) {
      statusCounts[appt.status] = (statusCounts[appt.status] ?? 0) + 1;
    }

    return {
      total: thisMonth.length,
      statuses: Object.entries(statusCounts)
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count),
    };
  },
});
