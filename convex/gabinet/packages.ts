import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { verifyOrgAccess } from "../_helpers/auth";
import { checkPermission } from "../_helpers/permissions";
import { logActivity } from "../_helpers/activities";

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
