import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { v } from "convex/values";
import { calculateLoyaltyTier } from "./_helpers/loyaltyTier";
import type { GabinetLoyaltyTier } from "../schema";

// Dual-write refs removed — Supabase is now primary for loyalty writes

export const getBalance = action({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const db = createSupabaseDb();
    return await db
      .query("gabinetLoyaltyPoints")
      .eq("organizationId", String(args.organizationId))
      .eq("patientId", args.patientId)
      .first();
  },
});

export const getTransactions = action({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const db = createSupabaseDb();
    return await db
      .query("gabinetLoyaltyTransactions")
      .eq("organizationId", String(args.organizationId))
      .eq("patientId", args.patientId)
      .collect();
  },
});

async function getOrCreateLoyalty(
  db: ReturnType<typeof createSupabaseDb>,
  organizationId: string,
  patientId: string
) {
  const existing = await db
    .query("gabinetLoyaltyPoints")
    .eq("organizationId", organizationId)
    .eq("patientId", patientId)
    .first();

  if (existing) return existing;

  const now = Date.now();
  const id = await db.insert("gabinetLoyaltyPoints", {
    organizationId,
    patientId,
    balance: 0,
    lifetimeEarned: 0,
    lifetimeSpent: 0,
    createdAt: now,
    updatedAt: now,
  });
  return await db.get("gabinetLoyaltyPoints", id);
}

export const earnPoints = action({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.string(),
    points: v.number(),
    reason: v.string(),
    referenceType: v.optional(v.string()),
    referenceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const now = Date.now();
    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);

    // Self-heal: if the organization row is missing from Supabase (can happen
    // for orgs created before the Supabase migration or during a failed async
    // sync), upsert it now so the gabinet_loyalty_points FK constraint doesn't fire.
    const client = db.raw();
    const { data: existingOrg } = await client
      .from("organizations")
      .select("id")
      .eq("id", orgIdStr)
      .maybeSingle();
    if (!existingOrg) {
      const org = await ctx.runQuery(internal.supabase.backfill._getOrganization, {
        organizationId: orgIdStr,
      });
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

    const loyalty = await getOrCreateLoyalty(db, orgIdStr, args.patientId);
    const newBalance = (loyalty!.balance as number) + args.points;
    const newLifetimeEarned = (loyalty!.lifetimeEarned as number) + args.points;

    let tierDefs: { tier: GabinetLoyaltyTier; threshold: number }[] | undefined;
    try {
      const orgTiers = await db
        .query("gabinetLoyaltyTiers")
        .eq("organizationId", orgIdStr)
        .collect();
      if (orgTiers.length > 0) {
        tierDefs = orgTiers.map((t) => ({
          tier: t.tier as GabinetLoyaltyTier,
          threshold: t.threshold as number,
        }));
      }
    } catch {
      // fall back to hardcoded defaults
    }

    await db.patch("gabinetLoyaltyPoints", String(loyalty!._id), {
      balance: newBalance,
      lifetimeEarned: newLifetimeEarned,
      tier: calculateLoyaltyTier(newLifetimeEarned, tierDefs),
      updatedAt: now,
    });

    await db.insert("gabinetLoyaltyTransactions", {
      organizationId: orgIdStr,
      patientId: args.patientId,
      type: "earn",
      points: args.points,
      reason: args.reason,
      referenceType: args.referenceType ?? null,
      referenceId: args.referenceId ?? null,
      balanceAfter: newBalance,
      createdBy: String(authResult.userId),
      createdAt: now,
    });

    return newBalance;
  },
});

export const spendPoints = action({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.string(),
    points: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const now = Date.now();
    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);

    // Self-heal: if the organization row is missing from Supabase, upsert it now
    // so the gabinet_loyalty_transactions FK constraint doesn't fire.
    const clientSpend = db.raw();
    const { data: existingOrgSpend } = await clientSpend
      .from("organizations")
      .select("id")
      .eq("id", orgIdStr)
      .maybeSingle();
    if (!existingOrgSpend) {
      const org = await ctx.runQuery(internal.supabase.backfill._getOrganization, {
        organizationId: orgIdStr,
      });
      if (org) {
        await clientSpend.from("organizations").upsert(
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

    const loyalty = await getOrCreateLoyalty(db, orgIdStr, args.patientId);
    if ((loyalty!.balance as number) < args.points) throw new Error("Insufficient loyalty points");

    const newBalance = (loyalty!.balance as number) - args.points;
    const newLifetimeSpent = (loyalty!.lifetimeSpent as number) + args.points;

    let spendTierDefs: { tier: GabinetLoyaltyTier; threshold: number }[] | undefined;
    try {
      const orgTiersSpend = await db
        .query("gabinetLoyaltyTiers")
        .eq("organizationId", orgIdStr)
        .collect();
      if (orgTiersSpend.length > 0) {
        spendTierDefs = orgTiersSpend.map((t) => ({
          tier: t.tier as GabinetLoyaltyTier,
          threshold: t.threshold as number,
        }));
      }
    } catch {
      // fall back to hardcoded defaults
    }

    await db.patch("gabinetLoyaltyPoints", String(loyalty!._id), {
      balance: newBalance,
      lifetimeSpent: newLifetimeSpent,
      tier: calculateLoyaltyTier(loyalty!.lifetimeEarned as number, spendTierDefs),
      updatedAt: now,
    });

    await db.insert("gabinetLoyaltyTransactions", {
      organizationId: orgIdStr,
      patientId: args.patientId,
      type: "spend",
      points: args.points,
      reason: args.reason,
      balanceAfter: newBalance,
      createdBy: String(authResult.userId),
      createdAt: now,
    });

    return newBalance;
  },
});

export const adjustPoints = action({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.string(),
    points: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const now = Date.now();
    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);

    // Self-heal: if the organization row is missing from Supabase, upsert it now
    // so the gabinet_loyalty_transactions FK constraint doesn't fire.
    const clientAdjust = db.raw();
    const { data: existingOrgAdjust } = await clientAdjust
      .from("organizations")
      .select("id")
      .eq("id", orgIdStr)
      .maybeSingle();
    if (!existingOrgAdjust) {
      const org = await ctx.runQuery(internal.supabase.backfill._getOrganization, {
        organizationId: orgIdStr,
      });
      if (org) {
        await clientAdjust.from("organizations").upsert(
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

    const loyalty = await getOrCreateLoyalty(db, orgIdStr, args.patientId);
    const newBalance = (loyalty!.balance as number) + args.points;
    const newLifetimeEarned = args.points > 0
      ? (loyalty!.lifetimeEarned as number) + args.points
      : (loyalty!.lifetimeEarned as number);
    const newLifetimeSpent = args.points < 0
      ? (loyalty!.lifetimeSpent as number) + Math.abs(args.points)
      : (loyalty!.lifetimeSpent as number);

    let adjustTierDefs: { tier: GabinetLoyaltyTier; threshold: number }[] | undefined;
    try {
      const orgTiersAdjust = await db
        .query("gabinetLoyaltyTiers")
        .eq("organizationId", orgIdStr)
        .collect();
      if (orgTiersAdjust.length > 0) {
        adjustTierDefs = orgTiersAdjust.map((t) => ({
          tier: t.tier as GabinetLoyaltyTier,
          threshold: t.threshold as number,
        }));
      }
    } catch {
      // fall back to hardcoded defaults
    }

    await db.patch("gabinetLoyaltyPoints", String(loyalty!._id), {
      balance: newBalance,
      lifetimeEarned: newLifetimeEarned,
      lifetimeSpent: newLifetimeSpent,
      tier: calculateLoyaltyTier(newLifetimeEarned, adjustTierDefs),
      updatedAt: now,
    });

    await db.insert("gabinetLoyaltyTransactions", {
      organizationId: orgIdStr,
      patientId: args.patientId,
      type: "adjust",
      points: args.points,
      reason: args.reason,
      balanceAfter: newBalance,
      createdBy: String(authResult.userId),
      createdAt: now,
    });

    return newBalance;
  },
});
