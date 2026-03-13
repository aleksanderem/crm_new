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

    const now = Date.now();
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

// --- Documents KPIs ---
export const getDocumentsKpis = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const templates = await ctx.db
      .query("gabinetDocumentTemplates")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const documents = await ctx.db
      .query("gabinetDocuments")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const startOfMonthMs = startOfMonth.getTime();

    const newDocumentsThisMonth = documents.filter(
      (d) => d.createdAt >= startOfMonthMs,
    ).length;

    const pendingSignature = documents.filter(
      (d) => d.status === "pending_signature",
    ).length;

    return {
      totalTemplates: templates.length,
      newDocumentsThisMonth,
      pendingSignature,
    };
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
