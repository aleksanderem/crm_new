import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { v } from "convex/values";

// Dual-write refs removed — Supabase is now primary for loyalty writes

export const getBalance = action({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
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
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
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
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const now = Date.now();
    const db = createSupabaseDb();

    const loyalty = await getOrCreateLoyalty(db, String(args.organizationId), args.patientId);
    const newBalance = (loyalty!.balance as number) + args.points;
    const newLifetimeEarned = (loyalty!.lifetimeEarned as number) + args.points;

    await db.patch("gabinetLoyaltyPoints", String(loyalty!._id), {
      balance: newBalance,
      lifetimeEarned: newLifetimeEarned,
      updatedAt: now,
    });

    await db.insert("gabinetLoyaltyTransactions", {
      organizationId: String(args.organizationId),
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
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const now = Date.now();
    const db = createSupabaseDb();

    const loyalty = await getOrCreateLoyalty(db, String(args.organizationId), args.patientId);
    if ((loyalty!.balance as number) < args.points) throw new Error("Insufficient loyalty points");

    const newBalance = (loyalty!.balance as number) - args.points;
    const newLifetimeSpent = (loyalty!.lifetimeSpent as number) + args.points;

    await db.patch("gabinetLoyaltyPoints", String(loyalty!._id), {
      balance: newBalance,
      lifetimeSpent: newLifetimeSpent,
      updatedAt: now,
    });

    await db.insert("gabinetLoyaltyTransactions", {
      organizationId: String(args.organizationId),
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
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, { organizationId: args.organizationId });
    const now = Date.now();
    const db = createSupabaseDb();

    const loyalty = await getOrCreateLoyalty(db, String(args.organizationId), args.patientId);
    const newBalance = (loyalty!.balance as number) + args.points;
    const newLifetimeEarned = args.points > 0
      ? (loyalty!.lifetimeEarned as number) + args.points
      : (loyalty!.lifetimeEarned as number);
    const newLifetimeSpent = args.points < 0
      ? (loyalty!.lifetimeSpent as number) + Math.abs(args.points)
      : (loyalty!.lifetimeSpent as number);

    await db.patch("gabinetLoyaltyPoints", String(loyalty!._id), {
      balance: newBalance,
      lifetimeEarned: newLifetimeEarned,
      lifetimeSpent: newLifetimeSpent,
      updatedAt: now,
    });

    await db.insert("gabinetLoyaltyTransactions", {
      organizationId: String(args.organizationId),
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
