import { action, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { logActivity } from "../_helpers/activities";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { logError } from "../_helpers/logged";
import type {
  GabinetAppointmentRow,
  GabinetEmployeeRow,
  GabinetTreatmentRow,
  SupabasePaginationResult,
} from "../_helpers/supabaseRows";

// Dual-write refs removed — Supabase is now primary for treatment writes

export const list = action({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<SupabasePaginationResult<GabinetTreatmentRow>> => {
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
      .collect()) as GabinetTreatmentRow[];

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

export const getById = action({
  args: {
    organizationId: v.id("organizations"),
    treatmentId: v.string(),
  },
  handler: async (ctx, args): Promise<GabinetTreatmentRow> => {
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
    const treatment = (await db.get("gabinetTreatments", args.treatmentId)) as GabinetTreatmentRow | null;
    if (!treatment || String(treatment.organizationId) !== String(args.organizationId)) {
      throw new Error("Treatment not found");
    }
    if (perm.scope === "own" && String(treatment.createdBy) !== String(authResult.userId)) {
      throw new Error("Permission denied: you can only view your own records");
    }

    return treatment;
  },
});

export const create = action({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.union(v.string(), v.null())),
    duration: v.number(),
    price: v.number(),
    currency: v.optional(v.string()),
    taxRate: v.optional(v.number()),
    taxExempt: v.optional(v.boolean()),
    requiredEquipment: v.optional(v.array(v.string())),
    requiredEquipmentIds: v.optional(v.array(v.string())),
    contraindications: v.optional(v.union(v.string(), v.null())),
    preparationInstructions: v.optional(v.union(v.string(), v.null())),
    aftercareInstructions: v.optional(v.union(v.string(), v.null())),
    requiresApproval: v.optional(v.boolean()),
    color: v.optional(v.union(v.string(), v.null())),
    sortOrder: v.optional(v.number()),
    treatmentCount: v.optional(v.number()),
    packageId: v.optional(v.union(v.string(), v.null())),
    requiredFormTemplates: v.optional(v.array(v.object({
      templateId: v.string(),
      timing: v.union(v.literal("before_start"), v.literal("after_completion")),
    }))),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.union(v.string(), v.null())),
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
      duration: args.duration,
      price: args.price,
      currency: args.currency ?? null,
      taxRate: args.taxExempt ? null : args.taxRate ?? null,
      taxExempt: args.taxExempt ?? null,
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
      packageId: args.packageId ?? null,
      requiredFormTemplates: args.requiredFormTemplates ?? null,
      tagIds: args.tagIds ?? null,
      categoryId: args.categoryId ?? null,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    // --- Delegate post-write side effects ---
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
    description: v.optional(v.union(v.string(), v.null())),
    duration: v.optional(v.number()),
    price: v.optional(v.number()),
    currency: v.optional(v.string()),
    taxRate: v.optional(v.number()),
    taxExempt: v.optional(v.boolean()),
    requiredEquipment: v.optional(v.array(v.string())),
    requiredEquipmentIds: v.optional(v.array(v.string())),
    contraindications: v.optional(v.union(v.string(), v.null())),
    preparationInstructions: v.optional(v.union(v.string(), v.null())),
    aftercareInstructions: v.optional(v.union(v.string(), v.null())),
    requiresApproval: v.optional(v.boolean()),
    color: v.optional(v.union(v.string(), v.null())),
    sortOrder: v.optional(v.number()),
    treatmentCount: v.optional(v.number()),
    packageId: v.optional(v.union(v.string(), v.null())),
    requiredFormTemplates: v.optional(v.array(v.object({
      templateId: v.string(),
      timing: v.union(v.literal("before_start"), v.literal("after_completion")),
    }))),
    tagIds: v.optional(v.array(v.string())),
    categoryId: v.optional(v.union(v.string(), v.null())),
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
    // ZW (VAT-exempt) is now tracked via the dedicated taxExempt flag; ensure
    // taxRate is cleared whenever the caller marks the treatment exempt.
    const patchPayload: Record<string, unknown> = { ...updates, updatedAt: Date.now() };
    if (updates.taxExempt === true) {
      patchPayload.taxRate = null;
    }
    await db.patch("gabinetTreatments", treatmentId, patchPayload);

    // --- Delegate post-write side effects ---
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

    // --- Delegate post-write side effects ---
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

export const listActive = action({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args): Promise<GabinetTreatmentRow[]> => {
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
      .collect()) as GabinetTreatmentRow[];

    if (perm.scope === "own") {
      results = results.filter(
        (r) => String(r.createdBy) === String(authResult.userId),
      );
    }
    return results;
  },
});

// --- Treatment Detail Page queries/mutations ---

export const getTreatmentStats = action({
  args: {
    organizationId: v.id("organizations"),
    treatmentId: v.string(),
  },
  handler: async (ctx, args): Promise<{
    totalAppointments: number;
    thisMonthAppointments: number;
    completedAppointments: number;
    revenue: number;
  }> => {
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

    const allAppointments = (await db
      .query("gabinetAppointments")
      .eq("organizationId", orgIdStr)
      .eq("treatmentId", args.treatmentId)
      .collect()) as GabinetAppointmentRow[];

    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const thisMonthAppointments = allAppointments.filter((a) => a.date >= monthStart);
    const completedAppointments = allAppointments.filter((a) => a.status === "completed");

    const treatment = await db.get("gabinetTreatments", args.treatmentId);
    const revenue = completedAppointments.length * ((treatment?.price as number | null) ?? 0);

    return {
      totalAppointments: allAppointments.length,
      thisMonthAppointments: thisMonthAppointments.length,
      completedAppointments: completedAppointments.length,
      revenue,
    };
  },
});

export interface TreatmentDetailedStats {
  total: number;
  thisMonth: number;
  completed: number;
  cancelled: number;
  noShow: number;
  revenue: number;
  completionRate: number;
  cancellationRate: number;
  noShowRate: number;
  statusCounts: Record<string, number>;
  monthlyTrend: { month: string; appointments: number; revenue: number }[];
  employeeRanking: {
    userId: string;
    name: string;
    image?: string | null;
    totalAppointments: number;
    completedAppointments: number;
    revenue: number;
  }[];
  lastAppointment: { date: string; startTime: string; patientName: string } | null;
  nextAppointment: { date: string; startTime: string; patientName: string } | null;
  packageStats: {
    totalPackages: number;
    activePackages: number;
    totalSlots: number;
    usedSlots: number;
    remainingSlots: number;
  };
  uniquePatients: number;
  price: number;
}

export const getTreatmentDetailedStats = action({
  args: {
    organizationId: v.id("organizations"),
    treatmentId: v.string(),
  },
  handler: async (ctx, args): Promise<TreatmentDetailedStats> => {
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
  handler: async (ctx, args): Promise<Array<GabinetAppointmentRow & { patientName: string; employeeName: string }>> => {
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
      .collect()) as GabinetAppointmentRow[];

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

/**
 * Row shape returned by `getTreatmentEmployees` — a subset of employee
 * fields enriched with the linked user's display name and avatar. Exported
 * so the treatment detail page can type its consumer directly instead of
 * duck-typing the result.
 */
export type TreatmentEmployeeSummary = Pick<
  GabinetEmployeeRow,
  | "_id"
  | "userId"
  | "firstName"
  | "lastName"
  | "role"
  | "specialization"
  | "isActive"
  | "color"
> & {
  userName: string;
  userImage: string | null | undefined;
};

export const getTreatmentEmployees = action({
  args: {
    organizationId: v.id("organizations"),
    treatmentId: v.string(),
  },
  handler: async (ctx, args): Promise<TreatmentEmployeeSummary[]> => {
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
      .collect()) as GabinetEmployeeRow[];

    const assigned = allEmployees.filter((emp) =>
      (emp.qualifiedTreatmentIds ?? []).includes(args.treatmentId as Id<"gabinetTreatments">),
    );

    const enriched = await Promise.all(
      assigned.map(async (emp) => {
        const user = await db.get("users", String(emp.userId)).catch(() => null);
        return {
          _id: emp._id,
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

export const getRequiredFormTemplates = action({
  args: {
    organizationId: v.id("organizations"),
    treatmentId: v.string(),
  },
  handler: async (ctx, args): Promise<Array<{
    templateId: string;
    timing: "before_start" | "after_completion";
    templateName: string;
    templateCategory: string;
    requiresSignature: boolean;
    isActive: boolean;
  }>> => {
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

    const treatment = await db.get("gabinetTreatments", args.treatmentId);
    if (!treatment || String(treatment.organizationId) !== String(args.organizationId)) {
      throw new Error("Treatment not found");
    }

    const entries = (treatment.requiredFormTemplates as Array<{
      templateId: string;
      timing: "before_start" | "after_completion";
    }> | null) ?? [];
    if (entries.length === 0) return [];

    const templateIds = entries.map((e) => String(e.templateId));
    const templates = await db.getMany("formTemplates", templateIds);
    const templateById = new Map<string, Record<string, unknown>>();
    for (const t of templates) {
      templateById.set(String(t._id), t);
    }

    return entries
      .map((entry) => {
        const template = templateById.get(String(entry.templateId));
        if (!template) return null;
        return {
          templateId: String(entry.templateId),
          timing: entry.timing,
          templateName: (template.name as string | null) ?? "",
          templateCategory: (template.category as string | null) ?? "",
          requiresSignature: (template.requiresSignature as boolean | null) ?? false,
          isActive: (template.isActive as boolean | null) ?? false,
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);
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

    // --- Delegate post-write side effects ---
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
    try {
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

      // --- Delegate post-write side effects ---
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
    } catch (err) {
      await logError(ctx, err, {
        scope: "gabinet.treatments",
        fnName: "saveTreatmentParameters",
        argsJson: JSON.stringify({
          organizationId: args.organizationId,
          treatmentId: args.treatmentId,
          parameterCount: args.parameters?.length,
        }),
        organizationId: args.organizationId,
      });
      throw err;
    }
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

type ResolvedTreatmentVariant = Record<string, unknown> & {
  resolvedPrice: number | null;
  resolvedDuration: number | null;
  resolvedDescription: string | null;
  resolvedShortDescription: string | null;
  resolvedImage: string | null;
  priceInherited: boolean;
  durationInherited: boolean;
  descriptionInherited: boolean;
  shortDescriptionInherited: boolean;
  imageInherited: boolean;
};

function resolveVariantFields(
  variant: Record<string, unknown>,
  treatment: Record<string, unknown>,
): ResolvedTreatmentVariant {
  const variantPrice = variant.price as number | null | undefined;
  const variantDuration = variant.duration as number | null | undefined;
  const variantDescription = variant.description as string | null | undefined;
  const variantShortDescription = variant.shortDescription as string | null | undefined;
  const variantImage = variant.image as string | null | undefined;

  return {
    ...variant,
    resolvedPrice: variantPrice ?? (treatment.price as number | null) ?? null,
    resolvedDuration: variantDuration ?? (treatment.duration as number | null) ?? null,
    resolvedDescription: variantDescription ?? (treatment.description as string | null) ?? null,
    resolvedShortDescription:
      variantShortDescription ?? (treatment.shortDescription as string | null) ?? null,
    resolvedImage: variantImage ?? (treatment.image as string | null) ?? null,
    priceInherited: variantPrice == null,
    durationInherited: variantDuration == null,
    descriptionInherited: variantDescription == null,
    shortDescriptionInherited: variantShortDescription == null,
    imageInherited: variantImage == null,
  };
}

export const listVariants = action({
  args: {
    organizationId: v.id("organizations"),
    treatmentId: v.string(),
  },
  handler: async (ctx, args): Promise<ResolvedTreatmentVariant[]> => {
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

    const treatment = await db.get("gabinetTreatments", args.treatmentId);
    if (!treatment || String(treatment.organizationId) !== String(args.organizationId)) {
      throw new Error("Treatment not found");
    }

    const variants = (await db
      .query("gabinetTreatmentVariants")
      .eq("treatmentId", args.treatmentId)
      .collect()) as Array<Record<string, unknown>>;

    // Sort by sortOrder; Array.sort is stable so insertion order is preserved
    // within the same sortOrder (Supabase rows don't carry _creationTime).
    variants.sort(
      (a, b) =>
        ((a.sortOrder as number | null) ?? 999) -
        ((b.sortOrder as number | null) ?? 999),
    );

    return variants.map((variant) => resolveVariantFields(variant, treatment));
  },
});

export const getVariant = action({
  args: {
    organizationId: v.id("organizations"),
    variantId: v.string(),
  },
  handler: async (ctx, args): Promise<ResolvedTreatmentVariant> => {
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

    const variant = await db.get("gabinetTreatmentVariants", args.variantId);
    if (!variant || String(variant.organizationId) !== String(args.organizationId)) {
      throw new Error("Variant not found");
    }

    const treatment = await db.get("gabinetTreatments", String(variant.treatmentId));
    if (!treatment) throw new Error("Parent treatment not found");

    return resolveVariantFields(variant, treatment);
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

    // --- Delegate post-write side effects ---
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

    // --- Delegate post-write side effects ---
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

    // --- Delegate post-write side effects ---
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
