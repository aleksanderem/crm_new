import { action, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { logActivity } from "../_helpers/activities";
import { logError } from "../_helpers/logged";
import { publishActivityEnvelope } from "../_helpers/activityEnvelope";
import { Id } from "../_generated/dataModel";
import type {
  GabinetPackageUsageRow,
  GabinetTreatmentPackageRow,
  SupabasePaginationResult,
} from "../_helpers/supabaseRows";

// Dual-write refs removed — Supabase is now primary for package writes

export const list = action({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (
    ctx,
    args,
  ): Promise<SupabasePaginationResult<GabinetTreatmentPackageRow>> => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
      organizationId: args.organizationId,
    });
    const perm = (await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "gabinet_packages",
        action: "view",
      },
    )) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);
    const userIdStr = String(authResult.userId);

    let page = (await db
      .query("gabinetTreatmentPackages")
      .eq("organizationId", orgIdStr)
      .order("createdAt", false)
      .collect()) as GabinetTreatmentPackageRow[];
    if (perm.scope === "own") {
      page = page.filter((r) => String(r.createdBy) === userIdStr);
    }
    return { page, isDone: true, continueCursor: "" };
  },
});

export const listActive = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<GabinetTreatmentPackageRow[]> => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
      organizationId: args.organizationId,
    });
    const perm = (await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "gabinet_packages",
        action: "view",
      },
    )) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);
    const userIdStr = String(authResult.userId);

    let results = (await db
      .query("gabinetTreatmentPackages")
      .eq("organizationId", orgIdStr)
      .eq("isActive", true)
      .collect()) as GabinetTreatmentPackageRow[];
    if (perm.scope === "own") {
      results = results.filter((r) => String(r.createdBy) === userIdStr);
    }
    return results;
  },
});

export const getById = action({
  args: {
    organizationId: v.id("organizations"),
    packageId: v.string(),
  },
  handler: async (ctx, args): Promise<GabinetTreatmentPackageRow> => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
      organizationId: args.organizationId,
    });
    const perm = (await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "gabinet_packages",
        action: "view",
      },
    )) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    const pkg = await db.get("gabinetTreatmentPackages", args.packageId);
    if (!pkg || String(pkg.organizationId) !== String(args.organizationId)) {
      throw new Error("Package not found");
    }
    if (
      perm.scope === "own" &&
      String(pkg.createdBy) !== String(authResult.userId)
    ) {
      throw new Error("Permission denied: you can only view your own records");
    }
    return pkg;
  },
});

export const create = action({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    description: v.optional(v.union(v.string(), v.null())),
    treatments: v.array(
      v.object({
        treatmentId: v.string(),
        quantity: v.number(),
      }),
    ),
    totalPrice: v.number(),
    currency: v.optional(v.union(v.string(), v.null())),
    discountPercent: v.optional(v.union(v.number(), v.null())),
    validityDays: v.optional(v.union(v.number(), v.null())),
    loyaltyPointsAwarded: v.optional(v.union(v.number(), v.null())),
    autoGeneratedForTreatmentId: v.optional(v.union(v.string(), v.null())),
    tagIds: v.optional(v.union(v.array(v.string()), v.null())),
    categoryId: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    try {
      const authResult = await ctx.runQuery(
        internal._helpers.authAction.verifyOrgAccess,
        { organizationId: args.organizationId },
      );
      await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
        organizationId: args.organizationId,
      });
      const perm = (await ctx.runQuery(
        internal._helpers.authAction.checkPermission,
        {
          organizationId: args.organizationId,
          feature: "gabinet_packages",
          action: "create",
        },
      )) as { allowed: boolean; scope: string };
      if (!perm.allowed) throw new Error("Permission denied");

      const now = Date.now();
      const db = createSupabaseDb();
      const orgIdStr = String(args.organizationId);

      // Self-heal: if the organization row is missing from Supabase (can happen
      // for orgs created before the Supabase migration or during a failed async
      // sync), upsert it now so the gabinet_treatment_packages FK constraint doesn't fire.
      const client = db.raw();
      const { data: existingOrg } = await client
        .from("organizations")
        .select("id")
        .eq("id", orgIdStr)
        .maybeSingle();
      if (!existingOrg) {
        const org = await ctx.runQuery(
          internal.supabase.backfill._getOrganization,
          {
            organizationId: orgIdStr,
          },
        );
        if (org) {
          await client.from("organizations").upsert(
            {
              id: orgIdStr,
              name: org.name,
              slug: org.slug,
              owner_id: String(org.ownerId),
              logo: org.logo ?? null,
              website: org.website ?? null,
              created_at: org.createdAt ?? now,
              updated_at: org.updatedAt ?? now,
            },
            { onConflict: "id" },
          );
        }
      }

      const packageId = await db.insert("gabinetTreatmentPackages", {
        organizationId: orgIdStr,
        name: args.name,
        description: args.description ?? null,
        treatments: args.treatments,
        totalPrice: args.totalPrice,
        currency: args.currency ?? null,
        discountPercent: args.discountPercent ?? null,
        validityDays: args.validityDays ?? null,
        loyaltyPointsAwarded: args.loyaltyPointsAwarded ?? null,
        autoGeneratedForTreatmentId: args.autoGeneratedForTreatmentId ?? null,
        isActive: true,
        tagIds: args.tagIds ?? null,
        categoryId: args.categoryId ?? null,
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
        console.error(
          "[packages.create] Side effects FAILED for package",
          packageId,
          ":",
          e,
        );
      }

      return packageId;
    } catch (err) {
      await logError(ctx, err, {
        scope: "gabinet.packages",
        fnName: "create",
        argsJson: JSON.stringify({
          organizationId: args.organizationId,
          name: args.name,
          treatmentsCount: args.treatments?.length,
          totalPrice: args.totalPrice,
          currency: args.currency,
          discountPercent: args.discountPercent,
          validityDays: args.validityDays,
          loyaltyPointsAwarded: args.loyaltyPointsAwarded,
        }),
        organizationId: args.organizationId,
      });
      throw err;
    }
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
    description: v.optional(v.union(v.string(), v.null())),
    treatments: v.optional(
      v.array(
        v.object({
          treatmentId: v.string(),
          quantity: v.number(),
        }),
      ),
    ),
    totalPrice: v.optional(v.number()),
    currency: v.optional(v.union(v.string(), v.null())),
    discountPercent: v.optional(v.union(v.number(), v.null())),
    validityDays: v.optional(v.union(v.number(), v.null())),
    loyaltyPointsAwarded: v.optional(v.union(v.number(), v.null())),
    isActive: v.optional(v.boolean()),
    tagIds: v.optional(v.union(v.array(v.string()), v.null())),
    categoryId: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    try {
      const authResult = await ctx.runQuery(
        internal._helpers.authAction.verifyOrgAccess,
        { organizationId: args.organizationId },
      );
      await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
        organizationId: args.organizationId,
      });
      const perm = (await ctx.runQuery(
        internal._helpers.authAction.checkPermission,
        {
          organizationId: args.organizationId,
          feature: "gabinet_packages",
          action: "edit",
        },
      )) as { allowed: boolean; scope: string };
      if (!perm.allowed) throw new Error("Permission denied");

      const db = createSupabaseDb();

      const pkg = await db.get("gabinetTreatmentPackages", args.packageId);
      if (!pkg || String(pkg.organizationId) !== String(args.organizationId))
        throw new Error("Package not found");
      if (
        perm.scope === "own" &&
        String(pkg.createdBy) !== String(authResult.userId)
      ) {
        throw new Error(
          "Permission denied: you can only edit your own records",
        );
      }

      const { organizationId, packageId, ...updates } = args;
      await db.patch("gabinetTreatmentPackages", packageId, {
        ...updates,
        updatedAt: Date.now(),
      });

      return packageId;
    } catch (err) {
      await logError(ctx, err, {
        scope: "gabinet.packages",
        fnName: "update",
        argsJson: JSON.stringify({
          organizationId: args.organizationId,
          packageId: args.packageId,
          updatedFields: Object.keys(args).filter(
            (k) => k !== "organizationId" && k !== "packageId",
          ),
          treatmentsCount: args.treatments?.length,
        }),
        organizationId: args.organizationId,
      });
      throw err;
    }
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
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
      organizationId: args.organizationId,
    });
    const perm = (await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "gabinet_packages",
        action: "delete",
      },
    )) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    const pkg = await db.get("gabinetTreatmentPackages", args.packageId);
    if (!pkg || String(pkg.organizationId) !== String(args.organizationId))
      throw new Error("Package not found");
    if (
      perm.scope === "own" &&
      String(pkg.createdBy) !== String(authResult.userId)
    ) {
      throw new Error(
        "Permission denied: you can only delete your own records",
      );
    }

    await db.patch("gabinetTreatmentPackages", args.packageId, {
      isActive: false,
      updatedAt: Date.now(),
    });
  },
});

// --- Package Usage ---

export const purchaseTreatment = action({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.string(),
    treatmentId: v.string(),
    sessionCount: v.number(),
    paidAmount: v.number(),
    paymentMethod: v.optional(v.string()),
    soldByEmployeeId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<string> => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
      organizationId: args.organizationId,
    });
    const perm = (await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "gabinet_packages",
        action: "create",
      },
    )) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    if (args.sessionCount < 1)
      throw new Error("Session count must be at least 1");

    const now = Date.now();
    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);
    const userIdStr = String(authResult.userId);

    const treatment = await db.get("gabinetTreatments", args.treatmentId);
    if (!treatment || String(treatment.organizationId) !== orgIdStr) {
      throw new Error("Treatment not found");
    }

    let autoPackage = await db
      .query("gabinetTreatmentPackages")
      .eq("organizationId", orgIdStr)
      .eq("autoGeneratedForTreatmentId", args.treatmentId)
      .first();

    if (!autoPackage) {
      const treatmentName = (treatment.name as string) ?? "Treatment";
      const treatmentPrice = (treatment.price as number) ?? 0;
      const treatmentCurrency = (treatment.currency as string | null) ?? null;
      const defaultQuantity =
        (treatment.treatmentCount as number | undefined) ?? 1;

      const packageId = await db.insert("gabinetTreatmentPackages", {
        organizationId: orgIdStr,
        name: `${treatmentName} (${defaultQuantity}x)`,
        treatments: [
          { treatmentId: args.treatmentId, quantity: defaultQuantity },
        ],
        totalPrice: treatmentPrice * defaultQuantity,
        currency: treatmentCurrency,
        isActive: true,
        autoGeneratedForTreatmentId: args.treatmentId,
        createdBy: userIdStr,
        createdAt: now,
        updatedAt: now,
      });
      autoPackage = await db.get("gabinetTreatmentPackages", packageId);
      if (!autoPackage) throw new Error("Failed to create treatment package");
    }

    const usageId = await db.insert("gabinetPackageUsage", {
      organizationId: orgIdStr,
      patientId: args.patientId,
      packageId: String(autoPackage._id),
      purchasedAt: now,
      status: "active",
      treatmentsUsed: [
        {
          treatmentId: args.treatmentId,
          usedCount: 0,
          totalCount: args.sessionCount,
        },
      ],
      paidAmount: args.paidAmount,
      paymentMethod: args.paymentMethod ?? null,
      soldByEmployeeId: args.soldByEmployeeId ?? null,
      createdBy: userIdStr,
      createdAt: now,
      updatedAt: now,
    });

    try {
      await ctx.runMutation(
        internal.gabinet.packages._purchaseTreatmentSideEffects,
        {
          usageId,
          organizationId: args.organizationId,
          treatmentId: args.treatmentId,
          treatmentName: (treatment.name as string) ?? "",
          patientId: args.patientId,
          paidAmount: args.paidAmount,
          paymentMethod: args.paymentMethod,
          createdBy: userIdStr,
          createdAt: now,
        },
      );
    } catch (e) {
      console.error(
        "[packages.purchaseTreatment] Side effects FAILED for usage",
        usageId,
        ":",
        e,
      );
    }

    return usageId;
  },
});

export const _purchaseTreatmentSideEffects = internalMutation({
  args: {
    usageId: v.string(),
    organizationId: v.id("organizations"),
    treatmentId: v.string(),
    treatmentName: v.string(),
    patientId: v.string(),
    paidAmount: v.number(),
    paymentMethod: v.optional(v.string()),
    createdBy: v.string(),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    await publishActivityEnvelope(ctx, {
      organizationId: args.organizationId,
      action: "package_assigned",
      performedBy: args.createdBy as Id<"users">,
      module: "gabinet",
      summary: `Sold treatment ${args.treatmentName} to patient`,
      occurredAt: args.createdAt,
      actor: {
        type: "user",
        userId: args.createdBy as Id<"users">,
      },
      payload: {
        usageId: args.usageId,
        treatmentId: args.treatmentId,
        patientId: args.patientId,
        paidAmount: args.paidAmount,
        paymentMethod: args.paymentMethod,
      },
      eventKey: `gabinet:treatment:${args.usageId}:treatment_sold`,
      targets: [
        {
          entityType: "gabinetTreatment",
          entityId: args.treatmentId,
        },
        {
          entityType: "gabinetPatient",
          entityId: args.patientId,
        },
      ],
    });
  },
});

function generateVoucherCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "GIFT-";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export const purchasePackage = action({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.optional(v.string()),
    packageId: v.string(),
    paidAmount: v.number(),
    paymentMethod: v.optional(v.string()),
    isGift: v.optional(v.boolean()),
    giftRecipientName: v.optional(v.string()),
    giftRecipientPhone: v.optional(v.string()),
    giftRecipientEmail: v.optional(v.string()),
    soldByEmployeeId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
      organizationId: args.organizationId,
    });
    const perm = (await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "gabinet_packages",
        action: "create",
      },
    )) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const isGift = args.isGift === true;
    if (!isGift && !args.patientId)
      throw new Error("patientId is required for non-gift packages");

    const now = Date.now();
    const db = createSupabaseDb();

    const pkg = await db.get("gabinetTreatmentPackages", args.packageId);
    if (!pkg || String(pkg.organizationId) !== String(args.organizationId))
      throw new Error("Package not found");

    const pkgValidityDays = pkg.validityDays as number | null | undefined;
    const expiresAt = pkgValidityDays
      ? now + pkgValidityDays * 24 * 60 * 60 * 1000
      : null;

    const pkgTreatments = pkg.treatments as Array<{
      treatmentId: string;
      variantId?: string;
      quantity: number;
    }>;
    const treatmentsUsed = pkgTreatments.map((t) => ({
      treatmentId: t.treatmentId,
      ...(t.variantId ? { variantId: t.variantId } : {}),
      usedCount: 0,
      totalCount: t.quantity,
    }));

    // Generate a unique voucher code for gift packages, retrying on collision
    let voucherCode: string | null = null;
    if (isGift) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generateVoucherCode();
        const existing = await db
          .query("gabinetPackageUsage")
          .eq("organizationId", String(args.organizationId))
          .eq("voucherCode", candidate)
          .first();
        if (!existing) {
          voucherCode = candidate;
          break;
        }
      }
      if (!voucherCode)
        throw new Error("Could not generate unique voucher code");
    }

    const usageId = await db.insert("gabinetPackageUsage", {
      organizationId: String(args.organizationId),
      patientId: args.patientId ?? null,
      packageId: args.packageId,
      purchasedAt: now,
      expiresAt,
      status: isGift ? "unassigned" : "active",
      treatmentsUsed,
      paidAmount: args.paidAmount,
      paymentMethod: args.paymentMethod ?? null,
      isGift: isGift || null,
      voucherCode,
      giftRecipientName: args.giftRecipientName ?? null,
      giftRecipientPhone: args.giftRecipientPhone ?? null,
      giftRecipientEmail: args.giftRecipientEmail ?? null,
      soldByEmployeeId: args.soldByEmployeeId ?? null,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    // Side effects: activity envelope
    try {
      await ctx.runMutation(internal.gabinet.packages._purchaseSideEffects, {
        usageId,
        organizationId: args.organizationId,
        packageId: args.packageId,
        packageName: (pkg.name as string) ?? "",
        patientId: args.patientId,
        paidAmount: args.paidAmount,
        paymentMethod: args.paymentMethod,
        loyaltyPointsAwarded:
          (pkg.loyaltyPointsAwarded as number | undefined) ?? 0,
        createdBy: String(authResult.userId),
        createdAt: now,
      });
    } catch (e) {
      console.error(
        "[packages.purchasePackage] Side effects FAILED for usage",
        usageId,
        ":",
        e,
      );
    }

    // Award loyalty points only when assigned to a real patient
    const loyaltyPointsAwarded =
      (pkg.loyaltyPointsAwarded as number | undefined) ?? 0;
    if (loyaltyPointsAwarded > 0 && args.patientId) {
      const loyalty = await db
        .query("gabinetLoyaltyPoints")
        .eq("organizationId", String(args.organizationId))
        .eq("patientId", args.patientId)
        .first();

      const newBalance =
        ((loyalty?.balance as number) ?? 0) + loyaltyPointsAwarded;
      const newLifetimeEarned =
        ((loyalty?.lifetimeEarned as number) ?? 0) + loyaltyPointsAwarded;

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
    patientId: v.optional(v.string()),
    paidAmount: v.number(),
    paymentMethod: v.optional(v.string()),
    loyaltyPointsAwarded: v.number(),
    createdBy: v.string(),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    const targets: Array<{ entityType: string; entityId: string }> = [
      { entityType: "gabinetPackage", entityId: args.packageId },
    ];
    if (args.patientId) {
      targets.push({ entityType: "gabinetPatient", entityId: args.patientId });
    }

    await publishActivityEnvelope(ctx, {
      organizationId: args.organizationId,
      action: "package_assigned",
      performedBy: args.createdBy as Id<"users">,
      module: "gabinet",
      summary: args.patientId
        ? `Assigned package ${args.packageName} to patient`
        : `Sold package ${args.packageName} as gift`,
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
      targets,
    });
  },
});

export const usePackageTreatment = action({
  args: {
    organizationId: v.id("organizations"),
    usageId: v.string(),
    treatmentId: v.string(),
    variantId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
      organizationId: args.organizationId,
    });
    const perm = (await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "gabinet_packages",
        action: "edit",
      },
    )) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    const usage = await db.get("gabinetPackageUsage", args.usageId);
    if (!usage || String(usage.organizationId) !== String(args.organizationId))
      throw new Error("Package usage not found");
    if ((usage.status as string) !== "active")
      throw new Error("Package is not active");
    if (usage.expiresAt && (usage.expiresAt as number) < Date.now())
      throw new Error("Package has expired");

    const treatmentsUsed = usage.treatmentsUsed as Array<{
      treatmentId: string;
      variantId?: string;
      usedCount: number;
      totalCount: number;
    }>;
    const treatmentEntry = treatmentsUsed.find(
      (t) =>
        t.treatmentId === args.treatmentId &&
        (args.variantId == null || t.variantId === args.variantId),
    );
    if (!treatmentEntry) throw new Error("Treatment not in package");
    if (treatmentEntry.usedCount >= treatmentEntry.totalCount)
      throw new Error("Treatment usage exhausted");

    const updatedTreatments = treatmentsUsed.map((t) =>
      t.treatmentId === args.treatmentId &&
      (args.variantId == null || t.variantId === args.variantId)
        ? { ...t, usedCount: t.usedCount + 1 }
        : t,
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
        variantId: v.optional(v.string()),
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
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
      organizationId: args.organizationId,
    });
    const perm = (await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "gabinet_packages",
        action: "edit",
      },
    )) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    if (args.items.length === 0) throw new Error("No treatments to record");

    const db = createSupabaseDb();

    const usage = await db.get("gabinetPackageUsage", args.usageId);
    if (!usage || String(usage.organizationId) !== String(args.organizationId))
      throw new Error("Package usage not found");
    if ((usage.status as string) !== "active")
      throw new Error("Package is not active");
    if (usage.expiresAt && (usage.expiresAt as number) < Date.now())
      throw new Error("Package has expired");

    const treatmentsUsed = usage.treatmentsUsed as Array<{
      treatmentId: string;
      variantId?: string;
      usedCount: number;
      totalCount: number;
    }>;

    const matchesItem = (
      t: { treatmentId: string; variantId?: string },
      item: { treatmentId: string; variantId?: string },
    ) =>
      t.treatmentId === item.treatmentId &&
      (item.variantId == null || t.variantId === item.variantId);

    // Validate all items before applying any
    for (const item of args.items) {
      if (item.quantity < 1) throw new Error("Quantity must be at least 1");
      const entry = treatmentsUsed.find((t) => matchesItem(t, item));
      if (!entry)
        throw new Error(`Treatment ${item.treatmentId} not in package`);
      if (entry.usedCount + item.quantity > entry.totalCount) {
        throw new Error(
          `Not enough remaining for treatment ${item.treatmentId}: ${entry.totalCount - entry.usedCount} left, ${item.quantity} requested`,
        );
      }
    }

    // Apply all increments
    const updatedTreatments = treatmentsUsed.map((t) => {
      const item = args.items.find((i) => matchesItem(t, i));
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
      console.error(
        "[packages.usePackageTreatmentsBatch] Side effects FAILED:",
        e,
      );
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
    const pkg = await ctx.db.get(
      args.packageId as Id<"gabinetTreatmentPackages">,
    );
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

export const getActiveUsageCounts = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<Record<string, number>> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
      organizationId: args.organizationId,
    });
    const perm = (await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "gabinet_packages",
        action: "view",
      },
    )) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    const activeUsages = (await db
      .query("gabinetPackageUsage")
      .eq("organizationId", String(args.organizationId))
      .eq("status", "active")
      .collect()) as GabinetPackageUsageRow[];

    const counts: Record<string, number> = {};
    for (const u of activeUsages) {
      const key = String(u.packageId);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  },
});

export const getPatientPackages = action({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.string(),
  },
  handler: async (ctx, args): Promise<GabinetPackageUsageRow[]> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
      organizationId: args.organizationId,
    });
    const perm = (await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "gabinet_packages",
        action: "view",
      },
    )) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    return (await db
      .query("gabinetPackageUsage")
      .eq("organizationId", String(args.organizationId))
      .eq("patientId", args.patientId)
      .collect()) as GabinetPackageUsageRow[];
  },
});

// --- Enriched package usage details (with treatment names, package name, progress) ---

export const getPatientPackagesEnriched = action({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
      organizationId: args.organizationId,
    });
    const perm = (await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "gabinet_packages",
        action: "view",
      },
    )) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const usages = (await db
      .query("gabinetPackageUsage")
      .eq("organizationId", String(args.organizationId))
      .eq("patientId", args.patientId)
      .collect()) as GabinetPackageUsageRow[];

    const packageIds = [...new Set(usages.map((u) => String(u.packageId)))];
    const treatmentIds = [
      ...new Set(
        usages.flatMap((u) =>
          (u.treatmentsUsed ?? []).map((t) => String(t.treatmentId)),
        ),
      ),
    ];

    const [packages, treatments] = await Promise.all([
      db.getMany("gabinetTreatmentPackages", packageIds),
      db.getMany("gabinetTreatments", treatmentIds),
    ]);

    const pkgMap = new Map(packages.map((p) => [String(p._id), p]));
    const treatmentMap = new Map(treatments.map((t) => [String(t._id), t]));

    return usages.map((u) => {
      const pkg = pkgMap.get(String(u.packageId));
      const enrichedTreatments = (u.treatmentsUsed ?? []).map((t) => {
        const tr = treatmentMap.get(String(t.treatmentId));
        return {
          ...t,
          treatmentName: tr?.name ?? null,
        };
      });
      const totalUsed = enrichedTreatments.reduce((s, t) => s + t.usedCount, 0);
      const totalCount = enrichedTreatments.reduce(
        (s, t) => s + t.totalCount,
        0,
      );
      return {
        ...u,
        packageName: pkg?.name ?? null,
        treatmentsUsed: enrichedTreatments,
        totalUsed,
        totalCount,
        progressPercent:
          totalCount > 0 ? Math.round((totalUsed / totalCount) * 100) : 0,
      };
    });
  },
});

// --- Enriched active usage counts with per-treatment breakdown ---

export const assignGiftPackage = action({
  args: {
    organizationId: v.id("organizations"),
    usageId: v.string(),
    patientId: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
      organizationId: args.organizationId,
    });
    const perm = (await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "gabinet_packages",
        action: "edit",
      },
    )) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const usage = await db.get("gabinetPackageUsage", args.usageId);
    if (
      !usage ||
      String(usage.organizationId) !== String(args.organizationId)
    ) {
      throw new Error("Package usage not found");
    }
    if (!(usage.isGift as boolean)) throw new Error("Package is not a gift");
    if ((usage.status as string) !== "unassigned")
      throw new Error("Package is already assigned");

    const now = Date.now();
    await db.patch("gabinetPackageUsage", args.usageId, {
      patientId: args.patientId,
      status: "active",
      updatedAt: now,
    });

    // Award loyalty points that were deferred at purchase time
    const pkg = await db.get(
      "gabinetTreatmentPackages",
      String(usage.packageId),
    );
    const loyaltyPointsAwarded =
      (pkg?.loyaltyPointsAwarded as number | undefined) ?? 0;
    if (loyaltyPointsAwarded > 0) {
      const loyalty = await db
        .query("gabinetLoyaltyPoints")
        .eq("organizationId", String(args.organizationId))
        .eq("patientId", args.patientId)
        .first();

      const newBalance =
        ((loyalty?.balance as number) ?? 0) + loyaltyPointsAwarded;
      const newLifetimeEarned =
        ((loyalty?.lifetimeEarned as number) ?? 0) + loyaltyPointsAwarded;

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
        reason: `Gift package assigned: ${(pkg?.name as string) ?? ""}`,
        referenceType: "packageUsage",
        referenceId: args.usageId,
        balanceAfter: newBalance,
        createdBy: String(authResult.userId),
        createdAt: now,
      });
    }
  },
});

export const getActiveUsageDetails = action({
  args: { organizationId: v.id("organizations") },
  handler: async (
    ctx,
    args,
  ): Promise<
    Record<
      string,
      {
        count: number;
        treatmentProgress: Record<
          string,
          { usedCount: number; totalCount: number }
        >;
      }
    >
  > => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
      organizationId: args.organizationId,
    });
    const perm = (await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "gabinet_packages",
        action: "view",
      },
    )) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    const activeUsages = (await db
      .query("gabinetPackageUsage")
      .eq("organizationId", String(args.organizationId))
      .eq("status", "active")
      .collect()) as GabinetPackageUsageRow[];

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
      const packageKey = String(u.packageId);
      if (!byPackage[packageKey]) {
        byPackage[packageKey] = { count: 0, treatmentProgress: {} };
      }
      byPackage[packageKey].count += 1;
      for (const t of u.treatmentsUsed ?? []) {
        const key = String(t.treatmentId);
        if (!byPackage[packageKey].treatmentProgress[key]) {
          byPackage[packageKey].treatmentProgress[key] = {
            usedCount: 0,
            totalCount: 0,
          };
        }
        byPackage[packageKey].treatmentProgress[key].usedCount += t.usedCount;
        byPackage[packageKey].treatmentProgress[key].totalCount += t.totalCount;
      }
    }

    return byPackage;
  },
});
