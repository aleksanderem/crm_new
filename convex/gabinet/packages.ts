import { query, mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { verifyOrgAccess } from "../_helpers/auth";
import { checkPermission } from "../_helpers/permissions";
import { logActivity } from "../_helpers/activities";
import { publishActivityEnvelope } from "../_helpers/activityEnvelope";

// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const writePackageRef = internal.supabase.gabinet.packages.writePackageToSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const updatePackageRef = internal.supabase.gabinet.packages.updatePackageInSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const deletePackageRef = internal.supabase.gabinet.packages.deletePackageFromSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const writeUsageRef = internal.supabase.gabinet.packages.writePackageUsageToSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const updateUsageRef = internal.supabase.gabinet.packages.updatePackageUsageInSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const writeLoyaltyRef = internal.supabase.gabinet.loyalty.writeLoyaltyPointsToSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const updateLoyaltyRef = internal.supabase.gabinet.loyalty.updateLoyaltyPointsInSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const writeTxnRef = internal.supabase.gabinet.loyalty.writeLoyaltyTransactionToSupabase;

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_packages", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const result = await ctx.db
      .query("gabinetTreatmentPackages")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .paginate(args.paginationOpts);
    if (perm.scope === "own") {
      return { ...result, page: result.page.filter((r) => r.createdBy === user._id) };
    }
    return result;
  },
});

export const listActive = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_packages", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const results = await ctx.db
      .query("gabinetTreatmentPackages")
      .withIndex("by_orgAndActive", (q) =>
        q.eq("organizationId", args.organizationId).eq("isActive", true)
      )
      .collect();
    if (perm.scope === "own") {
      return results.filter((r) => r.createdBy === user._id);
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

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.string()),
    treatments: v.array(v.object({
      treatmentId: v.id("gabinetTreatments"),
      quantity: v.number(),
    })),
    totalPrice: v.number(),
    currency: v.optional(v.string()),
    discountPercent: v.optional(v.number()),
    validityDays: v.optional(v.number()),
    loyaltyPointsAwarded: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_packages", "create");
    if (!perm.allowed) throw new Error("Permission denied");
    const now = Date.now();

    const id = await ctx.db.insert("gabinetTreatmentPackages", {
      ...args,
      isActive: true,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetPackage",
      entityId: id,
      action: "created",
      description: `Created package ${args.name}`,
      performedBy: user._id,
    });

    // Dual-write: replicate to Supabase
    await ctx.scheduler.runAfter(0, writePackageRef, {
      packageId: id,
      organizationId: args.organizationId,
      name: args.name,
      description: args.description,
      treatments: args.treatments,
      totalPrice: args.totalPrice,
      currency: args.currency,
      discountPercent: args.discountPercent,
      validityDays: args.validityDays,
      isActive: true,
      loyaltyPointsAwarded: args.loyaltyPointsAwarded,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    return id;
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    packageId: v.id("gabinetTreatmentPackages"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    treatments: v.optional(v.array(v.object({
      treatmentId: v.id("gabinetTreatments"),
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
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_packages", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const pkg = await ctx.db.get(args.packageId);
    if (!pkg || pkg.organizationId !== args.organizationId) throw new Error("Package not found");
    if (perm.scope === "own" && pkg.createdBy !== user._id) {
      throw new Error("Permission denied: you can only edit your own records");
    }

    const { organizationId, packageId, ...updates } = args;
    await ctx.db.patch(packageId, { ...updates, updatedAt: Date.now() });

    // Dual-write: replicate to Supabase
    await ctx.scheduler.runAfter(0, updatePackageRef, {
      packageId,
      organizationId,
      name: args.name,
      description: args.description,
      treatments: args.treatments,
      totalPrice: args.totalPrice,
      currency: args.currency,
      discountPercent: args.discountPercent,
      validityDays: args.validityDays,
      isActive: args.isActive,
      loyaltyPointsAwarded: args.loyaltyPointsAwarded,
      updatedAt: Date.now(),
    });

    return packageId;
  },
});

export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    packageId: v.id("gabinetTreatmentPackages"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_packages", "delete");
    if (!perm.allowed) throw new Error("Permission denied");

    const pkg = await ctx.db.get(args.packageId);
    if (!pkg || pkg.organizationId !== args.organizationId) throw new Error("Package not found");
    if (perm.scope === "own" && pkg.createdBy !== user._id) {
      throw new Error("Permission denied: you can only delete your own records");
    }

    // Dual-write: replicate soft-delete to Supabase BEFORE Convex patch (Knowledge #4)
    await ctx.scheduler.runAfter(0, deletePackageRef, {
      packageId: args.packageId,
      organizationId: args.organizationId,
    });

    await ctx.db.patch(args.packageId, { isActive: false, updatedAt: Date.now() });
  },
});

// --- Package Usage ---

export const purchasePackage = mutation({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.id("gabinetPatients"),
    packageId: v.id("gabinetTreatmentPackages"),
    paidAmount: v.number(),
    paymentMethod: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_packages", "create");
    if (!perm.allowed) throw new Error("Permission denied");
    const now = Date.now();

    const pkg = await ctx.db.get(args.packageId);
    if (!pkg || pkg.organizationId !== args.organizationId) throw new Error("Package not found");

    const expiresAt = pkg.validityDays
      ? now + pkg.validityDays * 24 * 60 * 60 * 1000
      : undefined;

    const treatmentsUsed = pkg.treatments.map((t) => ({
      treatmentId: t.treatmentId,
      usedCount: 0,
      totalCount: t.quantity,
    }));

    const usageId = await ctx.db.insert("gabinetPackageUsage", {
      organizationId: args.organizationId,
      patientId: args.patientId,
      packageId: args.packageId,
      purchasedAt: now,
      expiresAt,
      status: "active",
      treatmentsUsed,
      paidAmount: args.paidAmount,
      paymentMethod: args.paymentMethod,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    await publishActivityEnvelope(ctx, {
      organizationId: args.organizationId,
      action: "package_assigned",
      performedBy: user._id,
      module: "gabinet",
      summary: `Assigned package ${pkg.name} to patient`,
      occurredAt: now,
      actor: {
        type: "user",
        userId: user._id,
      },
      payload: {
        usageId,
        packageId: args.packageId,
        patientId: args.patientId,
        paidAmount: args.paidAmount,
        paymentMethod: args.paymentMethod,
      },
      eventKey: `gabinet:package:${usageId}:package_assigned`,
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

    // Award loyalty points for purchase
    if (pkg.loyaltyPointsAwarded && pkg.loyaltyPointsAwarded > 0) {
      const loyalty = await ctx.db
        .query("gabinetLoyaltyPoints")
        .withIndex("by_orgAndPatient", (q) =>
          q.eq("organizationId", args.organizationId).eq("patientId", args.patientId)
        )
        .first();

      const newBalance = (loyalty?.balance ?? 0) + pkg.loyaltyPointsAwarded;
      const newLifetimeEarned = (loyalty?.lifetimeEarned ?? 0) + pkg.loyaltyPointsAwarded;

      if (loyalty) {
        await ctx.db.patch(loyalty._id, {
          balance: newBalance,
          lifetimeEarned: newLifetimeEarned,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("gabinetLoyaltyPoints", {
          organizationId: args.organizationId,
          patientId: args.patientId,
          balance: newBalance,
          lifetimeEarned: newLifetimeEarned,
          lifetimeSpent: 0,
          createdAt: now,
          updatedAt: now,
        });
      }

      await ctx.db.insert("gabinetLoyaltyTransactions", {
        organizationId: args.organizationId,
        patientId: args.patientId,
        type: "earn",
        points: pkg.loyaltyPointsAwarded,
        reason: `Package purchase: ${pkg.name}`,
        referenceType: "packageUsage",
        referenceId: usageId,
        balanceAfter: newBalance,
        createdBy: user._id,
        createdAt: now,
      });

      // Dual-write: replicate loyalty points to Supabase
      if (loyalty) {
        await ctx.scheduler.runAfter(0, updateLoyaltyRef, {
          loyaltyId: loyalty._id,
          organizationId: args.organizationId,
          balance: newBalance,
          lifetimeEarned: newLifetimeEarned,
          updatedAt: now,
        });
      }
      // Note: if loyalty was just created (else branch above), we rely on the
      // writeLoyaltyRef call below to handle it via the loyaltyPointsId.
    }

    // Dual-write: replicate package usage to Supabase
    await ctx.scheduler.runAfter(0, writeUsageRef, {
      usageId,
      organizationId: args.organizationId,
      patientId: args.patientId,
      packageId: args.packageId,
      purchasedAt: now,
      expiresAt,
      status: "active",
      treatmentsUsed: treatmentsUsed,
      paidAmount: args.paidAmount,
      paymentMethod: args.paymentMethod,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    // Dual-write: replicate loyalty records to Supabase (for newly created records)
    if (pkg.loyaltyPointsAwarded && pkg.loyaltyPointsAwarded > 0) {
      const loyaltyFresh = await ctx.db
        .query("gabinetLoyaltyPoints")
        .withIndex("by_orgAndPatient", (q) =>
          q.eq("organizationId", args.organizationId).eq("patientId", args.patientId)
        )
        .first();

      if (loyaltyFresh) {
        // Upsert the loyalty points record
        await ctx.scheduler.runAfter(0, writeLoyaltyRef, {
          loyaltyId: loyaltyFresh._id,
          organizationId: args.organizationId,
          patientId: args.patientId,
          balance: loyaltyFresh.balance,
          lifetimeEarned: loyaltyFresh.lifetimeEarned,
          lifetimeSpent: loyaltyFresh.lifetimeSpent,
          createdAt: loyaltyFresh.createdAt,
          updatedAt: loyaltyFresh.updatedAt,
        });
      }

      // Find and replicate the transaction
      const txns = await ctx.db
        .query("gabinetLoyaltyTransactions")
        .withIndex("by_orgAndPatient", (q) =>
          q.eq("organizationId", args.organizationId).eq("patientId", args.patientId)
        )
        .order("desc")
        .first();

      if (txns) {
        await ctx.scheduler.runAfter(0, writeTxnRef, {
          transactionId: txns._id,
          organizationId: args.organizationId,
          patientId: args.patientId,
          type: txns.type,
          points: txns.points,
          reason: txns.reason,
          referenceType: txns.referenceType,
          referenceId: txns.referenceId,
          balanceAfter: txns.balanceAfter,
          createdBy: txns.createdBy,
          createdAt: txns.createdAt,
        });
      }
    }

    return usageId;
  },
});

export const usePackageTreatment = mutation({
  args: {
    organizationId: v.id("organizations"),
    usageId: v.id("gabinetPackageUsage"),
    treatmentId: v.id("gabinetTreatments"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_packages", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const usage = await ctx.db.get(args.usageId);
    if (!usage || usage.organizationId !== args.organizationId) throw new Error("Package usage not found");
    if (usage.status !== "active") throw new Error("Package is not active");
    if (usage.expiresAt && usage.expiresAt < Date.now()) throw new Error("Package has expired");

    const treatmentEntry = usage.treatmentsUsed.find(
      (t) => t.treatmentId === args.treatmentId
    );
    if (!treatmentEntry) throw new Error("Treatment not in package");
    if (treatmentEntry.usedCount >= treatmentEntry.totalCount) throw new Error("Treatment usage exhausted");

    const updatedTreatments = usage.treatmentsUsed.map((t) =>
      t.treatmentId === args.treatmentId
        ? { ...t, usedCount: t.usedCount + 1 }
        : t
    );

    const allUsed = updatedTreatments.every((t) => t.usedCount >= t.totalCount);

    await ctx.db.patch(args.usageId, {
      treatmentsUsed: updatedTreatments,
      status: allUsed ? "completed" : "active",
      updatedAt: Date.now(),
    });

    // Dual-write: replicate usage update to Supabase
    await ctx.scheduler.runAfter(0, updateUsageRef, {
      usageId: args.usageId,
      organizationId: args.organizationId,
      status: allUsed ? "completed" : "active",
      treatmentsUsed: updatedTreatments,
      updatedAt: Date.now(),
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

export const getPatientPackages = query({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.id("gabinetPatients"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_packages", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    return await ctx.db
      .query("gabinetPackageUsage")
      .withIndex("by_orgAndPatient", (q) =>
        q.eq("organizationId", args.organizationId).eq("patientId", args.patientId)
      )
      .collect();
  },
});

// --- Batch usage: consume multiple treatments from a package in one visit ---

export const usePackageTreatmentsBatch = mutation({
  args: {
    organizationId: v.id("organizations"),
    usageId: v.id("gabinetPackageUsage"),
    items: v.array(
      v.object({
        treatmentId: v.id("gabinetTreatments"),
        quantity: v.number(),
      }),
    ),
    appointmentId: v.optional(v.id("gabinetAppointments")),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "gabinet_packages", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    if (args.items.length === 0) throw new Error("No treatments to record");

    const usage = await ctx.db.get(args.usageId);
    if (!usage || usage.organizationId !== args.organizationId) throw new Error("Package usage not found");
    if (usage.status !== "active") throw new Error("Package is not active");
    if (usage.expiresAt && usage.expiresAt < Date.now()) throw new Error("Package has expired");

    // Validate all items before applying any
    for (const item of args.items) {
      if (item.quantity < 1) throw new Error("Quantity must be at least 1");
      const entry = usage.treatmentsUsed.find((t) => t.treatmentId === item.treatmentId);
      if (!entry) throw new Error(`Treatment ${item.treatmentId} not in package`);
      if (entry.usedCount + item.quantity > entry.totalCount) {
        throw new Error(
          `Not enough remaining for treatment ${item.treatmentId}: ${entry.totalCount - entry.usedCount} left, ${item.quantity} requested`,
        );
      }
    }

    // Apply all increments
    const updatedTreatments = usage.treatmentsUsed.map((t) => {
      const item = args.items.find((i) => i.treatmentId === t.treatmentId);
      if (!item) return t;
      return { ...t, usedCount: t.usedCount + item.quantity };
    });

    const allUsed = updatedTreatments.every((t) => t.usedCount >= t.totalCount);

    await ctx.db.patch(args.usageId, {
      treatmentsUsed: updatedTreatments,
      status: allUsed ? "completed" : "active",
      updatedAt: Date.now(),
    });

    // Log activity
    const pkg = await ctx.db.get(usage.packageId);
    const totalUsed = args.items.reduce((sum, i) => sum + i.quantity, 0);
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetPackage",
      entityId: usage.packageId,
      action: "updated",
      description: `Used ${totalUsed} treatment(s) from package ${pkg?.name ?? ""}`,
      performedBy: user._id,
    });

    // Dual-write: replicate usage update to Supabase
    await ctx.scheduler.runAfter(0, updateUsageRef, {
      usageId: args.usageId,
      organizationId: args.organizationId,
      status: allUsed ? "completed" : "active",
      treatmentsUsed: updatedTreatments,
      updatedAt: Date.now(),
    });
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
