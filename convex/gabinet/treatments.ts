import { query, action, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { verifyOrgAccess } from "../_helpers/auth";
import { checkPermission } from "../_helpers/permissions";
import { logActivity } from "../_helpers/activities";
import { createSupabaseDb } from "../_helpers/supabaseDb";

// Dual-write refs removed — Supabase is now primary for treatment writes

export const list = action({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    page: Array<Record<string, unknown>>;
    isDone: boolean;
    continueCursor: string;
  }> => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "gabinet_treatments",
      action: "view",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    let results = (await db
      .query("gabinetTreatments")
      .eq("organizationId", String(args.organizationId))
      .order("createdAt", false)
      .collect()) as Array<Record<string, any>>;

    if (args.search) {
      const term = args.search.toLowerCase();
      results = results.filter((r) =>
        String(r.name ?? "").toLowerCase().includes(term),
      );
    }
    if (perm.scope === "own") {
      results = results.filter(
        (r) => String(r.createdBy) === String(authResult.userId),
      );
    }

    return { page: results, isDone: true, continueCursor: "" };
  },
});

export const getById = query({
  args: {
    organizationId: v.id("organizations"),
    treatmentId: v.id("gabinetTreatments"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_treatments", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const treatment = await ctx.db.get(args.treatmentId);
    if (!treatment || treatment.organizationId !== args.organizationId) {
      throw new Error("Treatment not found");
    }
    if (perm.scope === "own" && treatment.createdBy !== user._id) {
      throw new Error("Permission denied: you can only view your own records");
    }

    return treatment;
  },
});

export const create = action({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    duration: v.number(),
    price: v.number(),
    currency: v.optional(v.string()),
    taxRate: v.optional(v.number()),
    requiredEquipment: v.optional(v.array(v.string())),
    requiredEquipmentIds: v.optional(v.array(v.string())),
    contraindications: v.optional(v.string()),
    preparationInstructions: v.optional(v.string()),
    aftercareInstructions: v.optional(v.string()),
    requiresApproval: v.optional(v.boolean()),
    color: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    treatmentCount: v.optional(v.number()),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // --- Auth + permissions (via internal queries) ---
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "gabinet_treatments",
      action: "create",
    }).then((perm: { allowed: boolean; scope: string }) => {
      if (!perm.allowed) throw new Error("Permission denied");
    });

    const now = Date.now();
    const db = createSupabaseDb();

    // --- INSERT treatment directly to Supabase ---
    const treatmentId = await db.insert("gabinetTreatments", {
      organizationId: String(args.organizationId),
      name: args.name,
      description: args.description ?? null,
      category: args.category ?? null,
      duration: args.duration,
      price: args.price,
      currency: args.currency ?? null,
      taxRate: args.taxRate ?? null,
      requiredEquipment: args.requiredEquipment ?? null,
      requiredEquipmentIds: args.requiredEquipmentIds ?? null,
      contraindications: args.contraindications ?? null,
      preparationInstructions: args.preparationInstructions ?? null,
      aftercareInstructions: args.aftercareInstructions ?? null,
      isActive: true,
      requiresApproval: args.requiresApproval ?? null,
      color: args.color ?? null,
      sortOrder: args.sortOrder ?? null,
      treatmentCount: args.treatmentCount ?? null,
      tagIds: args.tagIds ?? null,
      categoryId: args.categoryId ?? null,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    // --- Delegate Convex-only side effects ---
    try {
      await ctx.runMutation(internal.gabinet.treatments._createSideEffects, {
        treatmentId,
        organizationId: args.organizationId,
        name: args.name,
        createdBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[treatments.create] Side effects FAILED for treatment", treatmentId, ":", e);
    }

    return treatmentId;
  },
});

export const _createSideEffects = internalMutation({
  args: {
    treatmentId: v.string(),
    organizationId: v.id("organizations"),
    name: v.string(),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    const createdByUserId = args.createdBy as Id<"users">;

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetTreatment",
      entityId: args.treatmentId as Id<"gabinetTreatments">,
      action: "created",
      description: `Created treatment "${args.name}"`,
      performedBy: createdByUserId,
    });
  },
});

export const update = action({
  args: {
    organizationId: v.id("organizations"),
    treatmentId: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    duration: v.optional(v.number()),
    price: v.optional(v.number()),
    currency: v.optional(v.string()),
    taxRate: v.optional(v.number()),
    requiredEquipment: v.optional(v.array(v.string())),
    requiredEquipmentIds: v.optional(v.array(v.string())),
    contraindications: v.optional(v.string()),
    preparationInstructions: v.optional(v.string()),
    aftercareInstructions: v.optional(v.string()),
    requiresApproval: v.optional(v.boolean()),
    color: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    treatmentCount: v.optional(v.number()),
    requiredFormTemplates: v.optional(v.array(v.object({
      templateId: v.string(),
      timing: v.union(v.literal("before_start"), v.literal("after_completion")),
    }))),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // --- Auth + permissions (via internal queries) ---
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "gabinet_treatments",
        action: "edit",
      },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    // --- Read treatment from Supabase ---
    const treatment = await db.get("gabinetTreatments", args.treatmentId);
    if (!treatment || String(treatment.organizationId) !== String(args.organizationId)) {
      throw new Error("Treatment not found");
    }
    if (perm.scope === "own" && String(treatment.createdBy) !== String(authResult.userId)) {
      throw new Error("Permission denied: you can only edit your own records");
    }

    // --- Build updates and PATCH to Supabase ---
    const { organizationId, treatmentId, ...updates } = args;
    await db.patch("gabinetTreatments", treatmentId, { ...updates, updatedAt: Date.now() });

    // --- Delegate Convex-only side effects ---
    try {
      await ctx.runMutation(internal.gabinet.treatments._updateSideEffects, {
        treatmentId,
        organizationId,
        treatmentName: (treatment.name as string) ?? "",
        updatedBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[treatments.update] Side effects FAILED for treatment", treatmentId, ":", e);
    }

    return treatmentId;
  },
});

export const _updateSideEffects = internalMutation({
  args: {
    treatmentId: v.string(),
    organizationId: v.id("organizations"),
    treatmentName: v.string(),
    updatedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const updatedByUserId = args.updatedBy as Id<"users">;

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetTreatment",
      entityId: args.treatmentId as Id<"gabinetTreatments">,
      action: "updated",
      description: `Updated treatment "${args.treatmentName}"`,
      performedBy: updatedByUserId,
    });
  },
});

export const remove = action({
  args: {
    organizationId: v.id("organizations"),
    treatmentId: v.string(),
  },
  handler: async (ctx, args) => {
    // --- Auth + permissions (via internal queries) ---
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "gabinet_treatments",
        action: "delete",
      },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    // --- Read treatment from Supabase ---
    const treatment = await db.get("gabinetTreatments", args.treatmentId);
    if (!treatment || String(treatment.organizationId) !== String(args.organizationId)) {
      throw new Error("Treatment not found");
    }
    if (perm.scope === "own" && String(treatment.createdBy) !== String(authResult.userId)) {
      throw new Error("Permission denied: you can only delete your own records");
    }

    // --- Soft-delete: PATCH isActive=false in Supabase ---
    await db.patch("gabinetTreatments", args.treatmentId, {
      isActive: false,
      updatedAt: Date.now(),
    });

    // --- Delegate Convex-only side effects ---
    try {
      await ctx.runMutation(internal.gabinet.treatments._removeSideEffects, {
        treatmentId: args.treatmentId,
        organizationId: args.organizationId,
        treatmentName: (treatment.name as string) ?? "",
        deletedBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[treatments.remove] Side effects FAILED for treatment", args.treatmentId, ":", e);
    }

    return args.treatmentId;
  },
});

export const _removeSideEffects = internalMutation({
  args: {
    treatmentId: v.string(),
    organizationId: v.id("organizations"),
    treatmentName: v.string(),
    deletedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const deletedByUserId = args.deletedBy as Id<"users">;

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetTreatment",
      entityId: args.treatmentId as Id<"gabinetTreatments">,
      action: "deleted",
      description: `Deleted treatment "${args.treatmentName}"`,
      performedBy: deletedByUserId,
    });
  },
});

export const listByCategory = query({
  args: {
    organizationId: v.id("organizations"),
    category: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_treatments", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const results = await ctx.db
      .query("gabinetTreatments")
      .withIndex("by_orgAndCategory", (q) =>
        q.eq("organizationId", args.organizationId).eq("category", args.category)
      )
      .collect();
    if (perm.scope === "own") {
      return results.filter((r) => r.createdBy === user._id);
    }
    return results;
  },
});

export const listActive = action({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args): Promise<Array<Record<string, unknown>>> => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "gabinet_treatments",
      action: "view",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    let results = (await db
      .query("gabinetTreatments")
      .eq("organizationId", String(args.organizationId))
      .eq("isActive", true)
      .collect()) as Array<Record<string, any>>;

    if (perm.scope === "own") {
      results = results.filter(
        (r) => String(r.createdBy) === String(authResult.userId),
      );
    }
    return results;
  },
});

// --- Treatment Detail Page queries/mutations ---

export const getTreatmentStats = query({
  args: {
    organizationId: v.id("organizations"),
    treatmentId: v.id("gabinetTreatments"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_treatments", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const allAppointments = await ctx.db
      .query("gabinetAppointments")
      .withIndex("by_orgAndTreatment", (q) =>
        q.eq("organizationId", args.organizationId).eq("treatmentId", args.treatmentId)
      )
      .collect();

    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const thisMonthAppointments = allAppointments.filter((a) => a.date >= monthStart);
    const completedAppointments = allAppointments.filter((a) => a.status === "completed");

    const treatment = await ctx.db.get(args.treatmentId);
    const revenue = completedAppointments.length * (treatment?.price ?? 0);

    return {
      totalAppointments: allAppointments.length,
      thisMonthAppointments: thisMonthAppointments.length,
      completedAppointments: completedAppointments.length,
      revenue,
    };
  },
});

export const getTreatmentDetailedStats = action({
  args: {
    organizationId: v.id("organizations"),
    treatmentId: v.string(),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "gabinet_treatments",
      action: "view",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);
    const treatment = await db.get("gabinetTreatments", args.treatmentId);
    if (!treatment) throw new Error("Treatment not found");

    const price = (treatment.price as number | null) ?? 0;

    const allAppointments = (await db
      .query("gabinetAppointments")
      .eq("organizationId", orgIdStr)
      .eq("treatmentId", args.treatmentId)
      .collect()) as Array<Record<string, any>>;

    const appointmentIds = new Set(allAppointments.map((a) => String(a._id ?? a.id)));
    const completedPayments = (await db
      .query("payments")
      .eq("organizationId", orgIdStr)
      .eq("status", "completed")
      .collect()) as Array<Record<string, any>>;
    const treatmentPayments = completedPayments.filter(
      (p) => p.appointmentId && appointmentIds.has(String(p.appointmentId)),
    );

    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const today = now.toISOString().slice(0, 10);

    // --- Basic counts ---
    const total = allAppointments.length;
    const thisMonth = allAppointments.filter((a) => a.date >= monthStart).length;
    const completed = allAppointments.filter((a) => a.status === "completed").length;
    const cancelled = allAppointments.filter((a) => a.status === "cancelled").length;
    const noShow = allAppointments.filter((a) => a.status === "no_show").length;
    const revenue = treatmentPayments.reduce((sum, p) => sum + p.amount, 0);

    // --- Rates ---
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const cancellationRate = total > 0 ? Math.round((cancelled / total) * 100) : 0;
    const noShowRate = total > 0 ? Math.round((noShow / total) * 100) : 0;

    // --- Status distribution for donut chart ---
    const statusCounts: Record<string, number> = {};
    for (const apt of allAppointments) {
      statusCounts[String(apt.status)] = (statusCounts[String(apt.status)] ?? 0) + 1;
    }

    // --- Monthly trend (last 12 months) ---
    // Build a map of appointmentId -> payment amounts for revenue by month
    const paymentByAppointment = new Map<string, number>();
    for (const p of treatmentPayments) {
      if (p.appointmentId) {
        const apId = String(p.appointmentId);
        paymentByAppointment.set(apId, (paymentByAppointment.get(apId) ?? 0) + (p.amount ?? 0));
      }
    }

    const monthlyTrend: { month: string; appointments: number; revenue: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const monthApts = allAppointments.filter((a) => String(a.date ?? "").startsWith(key));
      const monthRevenue = monthApts.reduce(
        (sum, a) => sum + (paymentByAppointment.get(String(a._id ?? a.id)) ?? 0),
        0,
      );
      monthlyTrend.push({
        month: key,
        appointments: monthApts.length,
        revenue: monthRevenue,
      });
    }

    // --- Employee ranking (top performers) ---
    const employeeMap: Record<string, { count: number; completedCount: number; revenue: number }> = {};
    for (const apt of allAppointments) {
      const eid = String(apt.employeeId);
      if (!employeeMap[eid]) employeeMap[eid] = { count: 0, completedCount: 0, revenue: 0 };
      employeeMap[eid].count++;
      if (apt.status === "completed") employeeMap[eid].completedCount++;
      employeeMap[eid].revenue += paymentByAppointment.get(String(apt._id ?? apt.id)) ?? 0;
    }

    const employeeRanking = await Promise.all(
      Object.entries(employeeMap)
        .sort((a, b) => b[1].completedCount - a[1].completedCount)
        .slice(0, 5)
        .map(async ([userId, data]) => {
          const user = await db.get("users", userId).catch(() => null);
          return {
            userId,
            name: (user?.name as string | null) ?? (user?.email as string | null) ?? "—",
            image: user?.image as string | null | undefined,
            totalAppointments: data.count,
            completedAppointments: data.completedCount,
            revenue: data.revenue,
          };
        })
    );

    // --- Last and next appointment ---
    const pastApts = allAppointments
      .filter((a) => a.date <= today && (a.status === "completed" || a.status === "in_progress"))
      .sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));

    const futureApts = allAppointments
      .filter((a) => a.date >= today && a.status !== "cancelled" && a.status !== "no_show" && a.status !== "completed")
      .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));

    let lastAppointment: { date: string; startTime: string; patientName: string } | null = null;
    if (pastApts[0]) {
      const patient = await db.get("gabinetPatients", String(pastApts[0].patientId));
      lastAppointment = {
        date: pastApts[0].date,
        startTime: pastApts[0].startTime,
        patientName: patient ? `${(patient.firstName as string) ?? ""} ${(patient.lastName as string) ?? ""}`.trim() : "—",
      };
    }

    let nextAppointment: { date: string; startTime: string; patientName: string } | null = null;
    if (futureApts[0]) {
      const patient = await db.get("gabinetPatients", String(futureApts[0].patientId));
      nextAppointment = {
        date: futureApts[0].date,
        startTime: futureApts[0].startTime,
        patientName: patient ? `${(patient.firstName as string) ?? ""} ${(patient.lastName as string) ?? ""}`.trim() : "—",
      };
    }

    // --- Package stats ---
    const allPackages = (await db
      .query("gabinetTreatmentPackages")
      .eq("organizationId", orgIdStr)
      .collect()) as Array<Record<string, any>>;

    const packagesWithThisTreatment = allPackages.filter((pkg) =>
      (pkg.treatments as Array<{ treatmentId: string }> | undefined)?.some(
        (t) => String(t.treatmentId) === args.treatmentId,
      ),
    );
    const activePackages = packagesWithThisTreatment.filter((pkg) => pkg.isActive === true);

    let totalPackageSlots = 0;
    let usedPackageSlots = 0;

    if (packagesWithThisTreatment.length > 0) {
      const packageIds = new Set(packagesWithThisTreatment.map((p) => String(p._id ?? p.id)));
      const allUsage = (await db
        .query("gabinetPackageUsage")
        .eq("organizationId", orgIdStr)
        .collect()) as Array<Record<string, any>>;

      const relevantUsage = allUsage.filter(
        (u) => packageIds.has(String(u.packageId)) && u.status === "active",
      );

      for (const usage of relevantUsage) {
        for (const tu of (usage.treatmentsUsed as Array<{ treatmentId: string; totalCount: number; usedCount: number }> | undefined) ?? []) {
          if (String(tu.treatmentId) === args.treatmentId) {
            totalPackageSlots += tu.totalCount ?? 0;
            usedPackageSlots += tu.usedCount ?? 0;
          }
        }
      }
    }

    // --- Unique patients count ---
    const uniquePatients = new Set(allAppointments.map((a) => String(a.patientId))).size;

    return {
      total,
      thisMonth,
      completed,
      cancelled,
      noShow,
      revenue,
      completionRate,
      cancellationRate,
      noShowRate,
      statusCounts,
      monthlyTrend,
      employeeRanking,
      lastAppointment,
      nextAppointment,
      packageStats: {
        totalPackages: packagesWithThisTreatment.length,
        activePackages: activePackages.length,
        totalSlots: totalPackageSlots,
        usedSlots: usedPackageSlots,
        remainingSlots: totalPackageSlots - usedPackageSlots,
      },
      uniquePatients,
      price,
    };
  },
});

export const listTreatmentAppointments = action({
  args: {
    organizationId: v.id("organizations"),
    treatmentId: v.string(),
    status: v.optional(v.string()),
    employeeId: v.optional(v.string()),
    dateFrom: v.optional(v.string()),
    dateTo: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Array<Record<string, unknown>>> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "gabinet_appointments",
      action: "view",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);

    let appointments = (await db
      .query("gabinetAppointments")
      .eq("organizationId", orgIdStr)
      .eq("treatmentId", args.treatmentId)
      .collect()) as Array<Record<string, any>>;

    if (args.status) appointments = appointments.filter((a) => a.status === args.status);
    if (args.employeeId) appointments = appointments.filter((a) => String(a.employeeId) === args.employeeId);
    if (args.dateFrom) appointments = appointments.filter((a) => String(a.date) >= args.dateFrom!);
    if (args.dateTo) appointments = appointments.filter((a) => String(a.date) <= args.dateTo!);

    appointments.sort((a, b) =>
      String(b.date + b.startTime).localeCompare(String(a.date + a.startTime)),
    );

    // Enrich with patient + employee names (batch .in() would be nicer but keep
    // the original per-row shape for now).
    const enriched = await Promise.all(
      appointments.map(async (apt) => {
        const patient = await db.get("gabinetPatients", String(apt.patientId)).catch(() => null);
        const employeeUser = await db.get("users", String(apt.employeeId)).catch(() => null);
        return {
          ...apt,
          patientName: patient
            ? `${(patient.firstName as string) ?? ""} ${(patient.lastName as string) ?? ""}`.trim()
            : "—",
          employeeName: (employeeUser?.name as string | null) ?? (employeeUser?.email as string | null) ?? "—",
        };
      }),
    );

    return enriched;
  },
});

export const getTreatmentEmployees = action({
  args: {
    organizationId: v.id("organizations"),
    treatmentId: v.string(),
  },
  handler: async (ctx, args): Promise<Array<Record<string, unknown>>> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "gabinet_employees",
      action: "view",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const allEmployees = (await db
      .query("gabinetEmployees")
      .eq("organizationId", String(args.organizationId))
      .collect()) as Array<Record<string, any>>;

    const assigned = allEmployees.filter((emp) =>
      ((emp.qualifiedTreatmentIds as string[] | undefined) ?? []).includes(args.treatmentId),
    );

    const enriched = await Promise.all(
      assigned.map(async (emp) => {
        const user = await db.get("users", String(emp.userId)).catch(() => null);
        return {
          _id: emp._id ?? emp.id,
          userId: emp.userId,
          firstName: emp.firstName,
          lastName: emp.lastName,
          role: emp.role,
          specialization: emp.specialization,
          isActive: emp.isActive,
          color: emp.color,
          userName: (user?.name as string | null) ?? (user?.email as string | null) ?? "—",
          userImage: user?.image as string | null | undefined,
        };
      }),
    );

    return enriched;
  },
});

export const getRequiredFormTemplates = query({
  args: {
    organizationId: v.id("organizations"),
    treatmentId: v.id("gabinetTreatments"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_treatments", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const treatment = await ctx.db.get(args.treatmentId);
    if (!treatment || treatment.organizationId !== args.organizationId) {
      throw new Error("Treatment not found");
    }

    const entries = treatment.requiredFormTemplates ?? [];
    const enriched = await Promise.all(
      entries.map(async (entry) => {
        const template = await ctx.db.get(entry.templateId);
        return template
          ? {
              templateId: entry.templateId,
              timing: entry.timing,
              templateName: template.name,
              templateCategory: template.category,
              requiresSignature: template.requiresSignature,
              isActive: template.isActive,
            }
          : null;
      }),
    );

    return enriched.filter((e): e is NonNullable<typeof e> => e !== null);
  },
});

export const setRequiredFormTemplates = action({
  args: {
    organizationId: v.id("organizations"),
    treatmentId: v.string(),
    requiredFormTemplates: v.array(v.object({
      templateId: v.string(),
      timing: v.union(v.literal("before_start"), v.literal("after_completion")),
    })),
  },
  handler: async (ctx, args) => {
    // --- Auth + permissions (via internal queries) ---
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "gabinet_treatments",
      action: "edit",
    }).then((perm: { allowed: boolean; scope: string }) => {
      if (!perm.allowed) throw new Error("Permission denied");
    });

    const db = createSupabaseDb();

    // --- Read treatment from Supabase ---
    const treatment = await db.get("gabinetTreatments", args.treatmentId);
    if (!treatment || String(treatment.organizationId) !== String(args.organizationId)) {
      throw new Error("Treatment not found");
    }

    // --- PATCH to Supabase ---
    await db.patch("gabinetTreatments", args.treatmentId, {
      requiredFormTemplates: args.requiredFormTemplates,
      updatedAt: Date.now(),
    });

    // --- Delegate Convex-only side effects ---
    try {
      await ctx.runMutation(internal.gabinet.treatments._updateSideEffects, {
        treatmentId: args.treatmentId,
        organizationId: args.organizationId,
        treatmentName: (treatment.name as string) ?? "",
        updatedBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[treatments.setRequiredFormTemplates] Side effects FAILED:", e);
    }

    return args.treatmentId;
  },
});

export const saveTreatmentParameters = action({
  args: {
    organizationId: v.id("organizations"),
    treatmentId: v.string(),
    parameters: v.array(
      v.object({
        name: v.string(),
        type: v.union(
          v.literal("text"),
          v.literal("number"),
          v.literal("checkbox"),
          v.literal("radio"),
          v.literal("select"),
        ),
        description: v.optional(v.string()),
        unit: v.optional(v.string()),
        options: v.optional(v.array(v.string())),
        isRequired: v.optional(v.boolean()),
      })
    ),
  },
  handler: async (ctx, args) => {
    // --- Auth + permissions (via internal queries) ---
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "gabinet_treatments",
      action: "edit",
    }).then((perm: { allowed: boolean; scope: string }) => {
      if (!perm.allowed) throw new Error("Permission denied");
    });

    const db = createSupabaseDb();

    // --- Read treatment from Supabase ---
    const treatment = await db.get("gabinetTreatments", args.treatmentId);
    if (!treatment || String(treatment.organizationId) !== String(args.organizationId)) {
      throw new Error("Treatment not found");
    }

    // --- PATCH to Supabase ---
    await db.patch("gabinetTreatments", args.treatmentId, {
      parameters: args.parameters,
      updatedAt: Date.now(),
    });

    // --- Delegate Convex-only side effects ---
    try {
      await ctx.runMutation(internal.gabinet.treatments._updateSideEffects, {
        treatmentId: args.treatmentId,
        organizationId: args.organizationId,
        treatmentName: (treatment.name as string) ?? "",
        updatedBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[treatments.saveTreatmentParameters] Side effects FAILED:", e);
    }

    return args.treatmentId;
  },
});

// --- Migration: convert old parameters to typed format ---

export const migrateParametersToTyped = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();

    const treatments = await db.query("gabinetTreatments")
      .eq("organizationId", String(args.organizationId))
      .collect();

    let count = 0;
    for (const t of treatments) {
      const params = t.parameters as any[] | null;
      if (!params?.length) continue;
      const first = params[0] as any;
      if (first.type) continue; // already migrated

      const migrated = params.map((p: any) => ({
        name: p.name,
        type: "text" as const,
        description: p.value || undefined,
        unit: p.unit || undefined,
      }));
      await db.patch("gabinetTreatments", t._id as string, {
        parameters: migrated,
        updatedAt: Date.now(),
      });
      count++;
    }
    return { migratedCount: count };
  },
});

// --- Treatment Variants ---

export const listVariants = query({
  args: {
    organizationId: v.id("organizations"),
    treatmentId: v.id("gabinetTreatments"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_treatments", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const treatment = await ctx.db.get(args.treatmentId);
    if (!treatment || treatment.organizationId !== args.organizationId) {
      throw new Error("Treatment not found");
    }

    const variants = await ctx.db
      .query("gabinetTreatmentVariants")
      .withIndex("by_treatment", (q) => q.eq("treatmentId", args.treatmentId))
      .collect();

    // Sort by sortOrder, then by creation time
    variants.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a._creationTime - b._creationTime);

    // Resolve inherited fields
    return variants.map((variant) => ({
      ...variant,
      resolvedPrice: variant.price ?? treatment.price,
      resolvedDuration: variant.duration ?? treatment.duration,
      resolvedDescription: variant.description ?? treatment.description,
      resolvedShortDescription: variant.shortDescription ?? treatment.shortDescription,
      resolvedImage: variant.image ?? treatment.image,
      priceInherited: variant.price === undefined,
      durationInherited: variant.duration === undefined,
      descriptionInherited: variant.description === undefined,
      shortDescriptionInherited: variant.shortDescription === undefined,
      imageInherited: variant.image === undefined,
    }));
  },
});

export const getVariant = query({
  args: {
    organizationId: v.id("organizations"),
    variantId: v.id("gabinetTreatmentVariants"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_treatments", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const variant = await ctx.db.get(args.variantId);
    if (!variant || variant.organizationId !== args.organizationId) {
      throw new Error("Variant not found");
    }

    const treatment = await ctx.db.get(variant.treatmentId);
    if (!treatment) throw new Error("Parent treatment not found");

    return {
      ...variant,
      resolvedPrice: variant.price ?? treatment.price,
      resolvedDuration: variant.duration ?? treatment.duration,
      resolvedDescription: variant.description ?? treatment.description,
      resolvedShortDescription: variant.shortDescription ?? treatment.shortDescription,
      resolvedImage: variant.image ?? treatment.image,
      priceInherited: variant.price === undefined,
      durationInherited: variant.duration === undefined,
      descriptionInherited: variant.description === undefined,
      shortDescriptionInherited: variant.shortDescription === undefined,
      imageInherited: variant.image === undefined,
    };
  },
});

export const createVariant = action({
  args: {
    organizationId: v.id("organizations"),
    treatmentId: v.string(),
    name: v.string(),
    price: v.optional(v.number()),
    duration: v.optional(v.number()),
    description: v.optional(v.string()),
    shortDescription: v.optional(v.string()),
    image: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // --- Auth + permissions (via internal queries) ---
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "gabinet_treatments",
      action: "edit",
    }).then((perm: { allowed: boolean; scope: string }) => {
      if (!perm.allowed) throw new Error("Permission denied");
    });

    const db = createSupabaseDb();

    // --- Verify parent treatment exists in Supabase ---
    const treatment = await db.get("gabinetTreatments", args.treatmentId);
    if (!treatment || String(treatment.organizationId) !== String(args.organizationId)) {
      throw new Error("Treatment not found");
    }

    // --- INSERT variant directly to Supabase ---
    const variantId = await db.insert("gabinetTreatmentVariants", {
      organizationId: String(args.organizationId),
      treatmentId: args.treatmentId,
      name: args.name,
      price: args.price ?? null,
      duration: args.duration ?? null,
      description: args.description ?? null,
      shortDescription: args.shortDescription ?? null,
      image: args.image ?? null,
      isActive: args.isActive ?? true,
      sortOrder: args.sortOrder ?? null,
    });

    // --- Delegate Convex-only side effects ---
    try {
      await ctx.runMutation(internal.gabinet.treatments._createSideEffects, {
        treatmentId: args.treatmentId,
        organizationId: args.organizationId,
        name: `Added variant "${args.name}" to treatment "${(treatment.name as string) ?? ""}"`,
        createdBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[treatments.createVariant] Side effects FAILED:", e);
    }

    return variantId;
  },
});

export const updateVariant = action({
  args: {
    organizationId: v.id("organizations"),
    variantId: v.string(),
    name: v.optional(v.string()),
    price: v.optional(v.number()),
    duration: v.optional(v.number()),
    description: v.optional(v.string()),
    shortDescription: v.optional(v.string()),
    image: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
    // Allow explicitly clearing overrides back to inherited
    clearPrice: v.optional(v.boolean()),
    clearDuration: v.optional(v.boolean()),
    clearDescription: v.optional(v.boolean()),
    clearShortDescription: v.optional(v.boolean()),
    clearImage: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // --- Auth + permissions (via internal queries) ---
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "gabinet_treatments",
      action: "edit",
    }).then((perm: { allowed: boolean; scope: string }) => {
      if (!perm.allowed) throw new Error("Permission denied");
    });

    const db = createSupabaseDb();

    // --- Read variant from Supabase ---
    const variant = await db.get("gabinetTreatmentVariants", args.variantId);
    if (!variant || String(variant.organizationId) !== String(args.organizationId)) {
      throw new Error("Variant not found");
    }

    // --- Build updates ---
    const updates: Record<string, unknown> = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.isActive !== undefined) updates.isActive = args.isActive;
    if (args.sortOrder !== undefined) updates.sortOrder = args.sortOrder;

    // Handle overridable fields — set or clear
    if (args.clearPrice) updates.price = null;
    else if (args.price !== undefined) updates.price = args.price;

    if (args.clearDuration) updates.duration = null;
    else if (args.duration !== undefined) updates.duration = args.duration;

    if (args.clearDescription) updates.description = null;
    else if (args.description !== undefined) updates.description = args.description;

    if (args.clearShortDescription) updates.shortDescription = null;
    else if (args.shortDescription !== undefined) updates.shortDescription = args.shortDescription;

    if (args.clearImage) updates.image = null;
    else if (args.image !== undefined) updates.image = args.image;

    // --- PATCH to Supabase ---
    await db.patch("gabinetTreatmentVariants", args.variantId, updates);

    // --- Delegate Convex-only side effects ---
    try {
      await ctx.runMutation(internal.gabinet.treatments._updateSideEffects, {
        treatmentId: variant.treatmentId as string,
        organizationId: args.organizationId,
        treatmentName: `Updated variant "${(variant.name as string) ?? ""}"`,
        updatedBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[treatments.updateVariant] Side effects FAILED:", e);
    }

    return args.variantId;
  },
});

export const deleteVariant = action({
  args: {
    organizationId: v.id("organizations"),
    variantId: v.string(),
  },
  handler: async (ctx, args) => {
    // --- Auth + permissions (via internal queries) ---
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "gabinet_treatments",
      action: "delete",
    }).then((perm: { allowed: boolean; scope: string }) => {
      if (!perm.allowed) throw new Error("Permission denied");
    });

    const db = createSupabaseDb();

    // --- Read variant from Supabase ---
    const variant = await db.get("gabinetTreatmentVariants", args.variantId);
    if (!variant || String(variant.organizationId) !== String(args.organizationId)) {
      throw new Error("Variant not found");
    }

    // --- DELETE from Supabase ---
    await db.delete("gabinetTreatmentVariants", args.variantId);

    // --- Delegate Convex-only side effects ---
    try {
      await ctx.runMutation(internal.gabinet.treatments._updateSideEffects, {
        treatmentId: variant.treatmentId as string,
        organizationId: args.organizationId,
        treatmentName: `Deleted variant "${(variant.name as string) ?? ""}"`,
        updatedBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[treatments.deleteVariant] Side effects FAILED:", e);
    }

    return args.variantId;
  },
});
