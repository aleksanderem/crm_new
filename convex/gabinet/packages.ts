import { query, action, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { verifyOrgAccess } from "../_helpers/auth";
import { checkPermission } from "../_helpers/permissions";
import { logActivity } from "../_helpers/activities";
import { publishActivityEnvelope } from "../_helpers/activityEnvelope";
import { Id } from "../_generated/dataModel";

// Dual-write refs removed — Supabase is now primary for package writes

export const list = action({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
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
      feature: "gabinet_packages",
      action: "view",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);
    const userIdStr = String(authResult.userId);

    let page = (await db
      .query("gabinetTreatmentPackages")
      .eq("organizationId", orgIdStr)
      .order("createdAt", false)
      .collect()) as Array<Record<string, any>>;
    if (perm.scope === "own") {
      page = page.filter((r) => String(r.createdBy) === userIdStr);
    }
    return { page, isDone: true, continueCursor: "" };
  },
});

export const listActive = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<Array<Record<string, unknown>>> => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "gabinet_packages",
      action: "view",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);
    const userIdStr = String(authResult.userId);

    let results = (await db
      .query("gabinetTreatmentPackages")
      .eq("organizationId", orgIdStr)
      .eq("isActive", true)
      .collect()) as Array<Record<string, any>>;
    if (perm.scope === "own") {
      results = results.filter((r) => String(r.createdBy) === userIdStr);
    }
    return results;
  },
});

export const getById = query({
  args: {
    organizationId: v.id("organizations"),
    packageId: v.id("gabinetTreatmentPackages"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_packages", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const pkg = await ctx.db.get(args.packageId);
    if (!pkg || pkg.organizationId !== args.organizationId) throw new Error("Package not found");
    if (perm.scope === "own" && pkg.createdBy !== user._id) {
      throw new Error("Permission denied: you can only view your own records");
    }
    return pkg;
  },
});

export const create = action({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    treatments: v.array(v.object({
      treatmentId: v.string(),
      quantity: v.number(),
    })),
    totalPrice: v.number(),
    currency: v.optional(v.string()),
    discountPercent: v.optional(v.number()),
    validityDays: v.optional(v.number()),
    loyaltyPointsAwarded: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_packages", action: "create" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const now = Date.now();
    const db = createSupabaseDb();

    const packageId = await db.insert("gabinetTreatmentPackages", {
      organizationId: String(args.organizationId),
      name: args.name,
      description: args.description ?? null,
      treatments: args.treatments,
      totalPrice: args.totalPrice,
      currency: args.currency ?? null,
      discountPercent: args.discountPercent ?? null,
      validityDays: args.validityDays ?? null,
      loyaltyPointsAwarded: args.loyaltyPointsAwarded ?? null,
      isActive: true,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    try {
      await ctx.runMutation(internal.gabinet.packages._createSideEffects, {
        packageId,
        organizationId: args.organizationId,
        name: args.name,
        createdBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[packages.create] Side effects FAILED for package", packageId, ":", e);
    }

    return packageId;
  },
});

export const _createSideEffects = internalMutation({
  args: {
    packageId: v.string(),
    organizationId: v.id("organizations"),
    name: v.string(),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetPackage",
      entityId: args.packageId as Id<"gabinetTreatmentPackages">,
      action: "created",
      description: `Created package ${args.name}`,
      performedBy: args.createdBy as Id<"users">,
    });
  },
});

export const update = action({
  args: {
    organizationId: v.id("organizations"),
    packageId: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    treatments: v.optional(v.array(v.object({
      treatmentId: v.string(),
      quantity: v.number(),
    }))),
    totalPrice: v.optional(v.number()),
    currency: v.optional(v.string()),
    discountPercent: v.optional(v.number()),
    validityDays: v.optional(v.number()),
    loyaltyPointsAwarded: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_packages", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    const pkg = await db.get("gabinetTreatmentPackages", args.packageId);
    if (!pkg || String(pkg.organizationId) !== String(args.organizationId)) throw new Error("Package not found");
    if (perm.scope === "own" && String(pkg.createdBy) !== String(authResult.userId)) {
      throw new Error("Permission denied: you can only edit your own records");
    }

    const { organizationId, packageId, ...updates } = args;
    await db.patch("gabinetTreatmentPackages", packageId, { ...updates, updatedAt: Date.now() });

    return packageId;
  },
});

export const remove = action({
  args: {
    organizationId: v.id("organizations"),
    packageId: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_packages", action: "delete" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    const pkg = await db.get("gabinetTreatmentPackages", args.packageId);
    if (!pkg || String(pkg.organizationId) !== String(args.organizationId)) throw new Error("Package not found");
    if (perm.scope === "own" && String(pkg.createdBy) !== String(authResult.userId)) {
      throw new Error("Permission denied: you can only delete your own records");
    }

    await db.patch("gabinetTreatmentPackages", args.packageId, { isActive: false, updatedAt: Date.now() });
  },
});

// --- Package Usage ---

export const purchasePackage = action({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.string(),
    packageId: v.string(),
    paidAmount: v.number(),
    paymentMethod: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_packages", action: "create" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const now = Date.now();
    const db = createSupabaseDb();

    const pkg = await db.get("gabinetTreatmentPackages", args.packageId);
    if (!pkg || String(pkg.organizationId) !== String(args.organizationId)) throw new Error("Package not found");

    const pkgValidityDays = pkg.validityDays as number | null | undefined;
    const expiresAt = pkgValidityDays
      ? now + pkgValidityDays * 24 * 60 * 60 * 1000
      : null;

    const pkgTreatments = pkg.treatments as Array<{ treatmentId: string; quantity: number }>;
    const treatmentsUsed = pkgTreatments.map((t) => ({
      treatmentId: t.treatmentId,
      usedCount: 0,
      totalCount: t.quantity,
    }));

    const usageId = await db.insert("gabinetPackageUsage", {
      organizationId: String(args.organizationId),
      patientId: args.patientId,
      packageId: args.packageId,
      purchasedAt: now,
      expiresAt,
      status: "active",
      treatmentsUsed,
      paidAmount: args.paidAmount,
      paymentMethod: args.paymentMethod ?? null,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    // Side effects: activity envelope + loyalty points
    try {
      await ctx.runMutation(internal.gabinet.packages._purchaseSideEffects, {
        usageId,
        organizationId: args.organizationId,
        packageId: args.packageId,
        packageName: (pkg.name as string) ?? "",
        patientId: args.patientId,
        paidAmount: args.paidAmount,
        paymentMethod: args.paymentMethod,
        loyaltyPointsAwarded: (pkg.loyaltyPointsAwarded as number | undefined) ?? 0,
        createdBy: String(authResult.userId),
        createdAt: now,
      });
    } catch (e) {
      console.error("[packages.purchasePackage] Side effects FAILED for usage", usageId, ":", e);
    }

    // Award loyalty points directly in Supabase
    const loyaltyPointsAwarded = (pkg.loyaltyPointsAwarded as number | undefined) ?? 0;
    if (loyaltyPointsAwarded > 0) {
      const loyalty = await db
        .query("gabinetLoyaltyPoints")
        .eq("organizationId", String(args.organizationId))
        .eq("patientId", args.patientId)
        .first();

      const newBalance = ((loyalty?.balance as number) ?? 0) + loyaltyPointsAwarded;
      const newLifetimeEarned = ((loyalty?.lifetimeEarned as number) ?? 0) + loyaltyPointsAwarded;

      if (loyalty) {
        await db.patch("gabinetLoyaltyPoints", String(loyalty._id), {
          balance: newBalance,
          lifetimeEarned: newLifetimeEarned,
          updatedAt: now,
        });
      } else {
        await db.insert("gabinetLoyaltyPoints", {
          organizationId: String(args.organizationId),
          patientId: args.patientId,
          balance: newBalance,
          lifetimeEarned: newLifetimeEarned,
          lifetimeSpent: 0,
          createdAt: now,
          updatedAt: now,
        });
      }

      await db.insert("gabinetLoyaltyTransactions", {
        organizationId: String(args.organizationId),
        patientId: args.patientId,
        type: "earn",
        points: loyaltyPointsAwarded,
        reason: `Package purchase: ${pkg.name as string}`,
        referenceType: "packageUsage",
        referenceId: usageId,
        balanceAfter: newBalance,
        createdBy: String(authResult.userId),
        createdAt: now,
      });
    }

    return usageId;
  },
});

export const _purchaseSideEffects = internalMutation({
  args: {
    usageId: v.string(),
    organizationId: v.id("organizations"),
    packageId: v.string(),
    packageName: v.string(),
    patientId: v.string(),
    paidAmount: v.number(),
    paymentMethod: v.optional(v.string()),
    loyaltyPointsAwarded: v.number(),
    createdBy: v.string(),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    await publishActivityEnvelope(ctx, {
      organizationId: args.organizationId,
      action: "package_assigned",
      performedBy: args.createdBy as Id<"users">,
      module: "gabinet",
      summary: `Assigned package ${args.packageName} to patient`,
      occurredAt: args.createdAt,
      actor: {
        type: "user",
        userId: args.createdBy as Id<"users">,
      },
      payload: {
        usageId: args.usageId,
        packageId: args.packageId,
        patientId: args.patientId,
        paidAmount: args.paidAmount,
        paymentMethod: args.paymentMethod,
      },
      eventKey: `gabinet:package:${args.usageId}:package_assigned`,
      targets: [
        {
          entityType: "gabinetPackage",
          entityId: args.packageId,
        },
        {
          entityType: "gabinetPatient",
          entityId: args.patientId,
        },
      ],
    });
  },
});

export const usePackageTreatment = action({
  args: {
    organizationId: v.id("organizations"),
    usageId: v.string(),
    treatmentId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_packages", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    const usage = await db.get("gabinetPackageUsage", args.usageId);
    if (!usage || String(usage.organizationId) !== String(args.organizationId)) throw new Error("Package usage not found");
    if ((usage.status as string) !== "active") throw new Error("Package is not active");
    if (usage.expiresAt && (usage.expiresAt as number) < Date.now()) throw new Error("Package has expired");

    const treatmentsUsed = usage.treatmentsUsed as Array<{ treatmentId: string; usedCount: number; totalCount: number }>;
    const treatmentEntry = treatmentsUsed.find((t) => t.treatmentId === args.treatmentId);
    if (!treatmentEntry) throw new Error("Treatment not in package");
    if (treatmentEntry.usedCount >= treatmentEntry.totalCount) throw new Error("Treatment usage exhausted");

    const updatedTreatments = treatmentsUsed.map((t) =>
      t.treatmentId === args.treatmentId
        ? { ...t, usedCount: t.usedCount + 1 }
        : t
    );

    const allUsed = updatedTreatments.every((t) => t.usedCount >= t.totalCount);

    await db.patch("gabinetPackageUsage", args.usageId, {
      treatmentsUsed: updatedTreatments,
      status: allUsed ? "completed" : "active",
      updatedAt: Date.now(),
    });
  },
});

// --- Batch usage: consume multiple treatments from a package in one visit ---

export const usePackageTreatmentsBatch = action({
  args: {
    organizationId: v.id("organizations"),
    usageId: v.string(),
    items: v.array(
      v.object({
        treatmentId: v.string(),
        quantity: v.number(),
      }),
    ),
    appointmentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_packages", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    if (args.items.length === 0) throw new Error("No treatments to record");

    const db = createSupabaseDb();

    const usage = await db.get("gabinetPackageUsage", args.usageId);
    if (!usage || String(usage.organizationId) !== String(args.organizationId)) throw new Error("Package usage not found");
    if ((usage.status as string) !== "active") throw new Error("Package is not active");
    if (usage.expiresAt && (usage.expiresAt as number) < Date.now()) throw new Error("Package has expired");

    const treatmentsUsed = usage.treatmentsUsed as Array<{ treatmentId: string; usedCount: number; totalCount: number }>;

    // Validate all items before applying any
    for (const item of args.items) {
      if (item.quantity < 1) throw new Error("Quantity must be at least 1");
      const entry = treatmentsUsed.find((t) => t.treatmentId === item.treatmentId);
      if (!entry) throw new Error(`Treatment ${item.treatmentId} not in package`);
      if (entry.usedCount + item.quantity > entry.totalCount) {
        throw new Error(
          `Not enough remaining for treatment ${item.treatmentId}: ${entry.totalCount - entry.usedCount} left, ${item.quantity} requested`,
        );
      }
    }

    // Apply all increments
    const updatedTreatments = treatmentsUsed.map((t) => {
      const item = args.items.find((i) => i.treatmentId === t.treatmentId);
      if (!item) return t;
      return { ...t, usedCount: t.usedCount + item.quantity };
    });

    const allUsed = updatedTreatments.every((t) => t.usedCount >= t.totalCount);

    await db.patch("gabinetPackageUsage", args.usageId, {
      treatmentsUsed: updatedTreatments,
      status: allUsed ? "completed" : "active",
      updatedAt: Date.now(),
    });

    // Log activity via internalMutation
    try {
      await ctx.runMutation(internal.gabinet.packages._batchUsageSideEffects, {
        organizationId: args.organizationId,
        packageId: String(usage.packageId),
        totalUsed: args.items.reduce((sum, i) => sum + i.quantity, 0),
        createdBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[packages.usePackageTreatmentsBatch] Side effects FAILED:", e);
    }
  },
});

export const _batchUsageSideEffects = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    packageId: v.string(),
    totalUsed: v.number(),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    const pkg = await ctx.db.get(args.packageId as Id<"gabinetTreatmentPackages">);
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetPackage",
      entityId: args.packageId as Id<"gabinetTreatmentPackages">,
      action: "updated",
      description: `Used ${args.totalUsed} treatment(s) from package ${pkg?.name ?? ""}`,
      performedBy: args.createdBy as Id<"users">,
    });
  },
});

export const getActiveUsageCounts = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_packages", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const activeUsages = await ctx.db
      .query("gabinetPackageUsage")
      .withIndex("by_orgAndStatus", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "active")
      )
      .collect();

    const counts: Record<string, number> = {};
    for (const u of activeUsages) {
      counts[u.packageId] = (counts[u.packageId] ?? 0) + 1;
    }
    return counts;
  },
});

export const getPatientPackages = action({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.string(),
  },
  handler: async (ctx, args): Promise<Array<Record<string, unknown>>> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runQuery(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "gabinet_packages",
      action: "view",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    return (await db
      .query("gabinetPackageUsage")
      .eq("organizationId", String(args.organizationId))
      .eq("patientId", args.patientId)
      .collect()) as Array<Record<string, unknown>>;
  },
});

// --- Enriched package usage details (with treatment names, package name, progress) ---

export const getPatientPackagesEnriched = query({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.id("gabinetPatients"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_packages", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const usages = await ctx.db
      .query("gabinetPackageUsage")
      .withIndex("by_orgAndPatient", (q) =>
        q.eq("organizationId", args.organizationId).eq("patientId", args.patientId),
      )
      .collect();

    // Collect unique package and treatment IDs
    const packageIds = [...new Set(usages.map((u) => u.packageId))];
    const treatmentIds = [
      ...new Set(usages.flatMap((u) => u.treatmentsUsed.map((t) => t.treatmentId))),
    ];

    const [packages, treatments] = await Promise.all([
      Promise.all(packageIds.map((id) => ctx.db.get(id))),
      Promise.all(treatmentIds.map((id) => ctx.db.get(id))),
    ]);

    const pkgMap = new Map(packages.filter(Boolean).map((p) => [p!._id, p!]));
    const treatmentMap = new Map(treatments.filter(Boolean).map((t) => [t!._id, t!]));

    return usages.map((u) => {
      const pkg = pkgMap.get(u.packageId);
      const enrichedTreatments = u.treatmentsUsed.map((t) => {
        const tr = treatmentMap.get(t.treatmentId);
        return {
          ...t,
          treatmentName: tr?.name ?? null,
        };
      });
      const totalUsed = enrichedTreatments.reduce((s, t) => s + t.usedCount, 0);
      const totalCount = enrichedTreatments.reduce((s, t) => s + t.totalCount, 0);
      return {
        ...u,
        packageName: pkg?.name ?? null,
        treatmentsUsed: enrichedTreatments,
        totalUsed,
        totalCount,
        progressPercent: totalCount > 0 ? Math.round((totalUsed / totalCount) * 100) : 0,
      };
    });
  },
});

// --- Enriched active usage counts with per-treatment breakdown ---

export const getActiveUsageDetails = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_packages", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const activeUsages = await ctx.db
      .query("gabinetPackageUsage")
      .withIndex("by_orgAndStatus", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "active"),
      )
      .collect();

    // Group by packageId with aggregated treatment progress
    const byPackage: Record<
      string,
      {
        count: number;
        treatmentProgress: Record<
          string,
          { usedCount: number; totalCount: number }
        >;
      }
    > = {};

    for (const u of activeUsages) {
      if (!byPackage[u.packageId]) {
        byPackage[u.packageId] = { count: 0, treatmentProgress: {} };
      }
      byPackage[u.packageId].count += 1;
      for (const t of u.treatmentsUsed) {
        const key = t.treatmentId;
        if (!byPackage[u.packageId].treatmentProgress[key]) {
          byPackage[u.packageId].treatmentProgress[key] = {
            usedCount: 0,
            totalCount: 0,
          };
        }
        byPackage[u.packageId].treatmentProgress[key].usedCount += t.usedCount;
        byPackage[u.packageId].treatmentProgress[key].totalCount += t.totalCount;
      }
    }

    return byPackage;
  },
});
