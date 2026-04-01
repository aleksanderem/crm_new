import { query, mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { verifyOrgAccess } from "../_helpers/auth";

// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const updateLoyaltyRef = internal.supabase.gabinet.loyalty.updateLoyaltyPointsInSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const writeLoyaltyRef = internal.supabase.gabinet.loyalty.writeLoyaltyPointsToSupabase;
// @ts-ignore — TS2589: deep type instantiation in Convex codegen (known, non-deterministic)
const writeTxnRef = internal.supabase.gabinet.loyalty.writeLoyaltyTransactionToSupabase;

export const getBalance = query({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.id("gabinetPatients"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return await ctx.db
      .query("gabinetLoyaltyPoints")
      .withIndex("by_orgAndPatient", (q) =>
        q.eq("organizationId", args.organizationId).eq("patientId", args.patientId)
      )
      .first();
  },
});

export const getTransactions = query({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.id("gabinetPatients"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return await ctx.db
      .query("gabinetLoyaltyTransactions")
      .withIndex("by_orgAndPatient", (q) =>
        q.eq("organizationId", args.organizationId).eq("patientId", args.patientId)
      )
      .collect();
  },
});

async function getOrCreateLoyalty(
  ctx: any,
  organizationId: any,
  patientId: any
) {
  const existing = await ctx.db
    .query("gabinetLoyaltyPoints")
    .withIndex("by_orgAndPatient", (q: any) =>
      q.eq("organizationId", organizationId).eq("patientId", patientId)
    )
    .first();

  if (existing) return existing;

  const now = Date.now();
  const id = await ctx.db.insert("gabinetLoyaltyPoints", {
    organizationId,
    patientId,
    balance: 0,
    lifetimeEarned: 0,
    lifetimeSpent: 0,
    createdAt: now,
    updatedAt: now,
  });
  return await ctx.db.get(id);
}

export const earnPoints = mutation({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.id("gabinetPatients"),
    points: v.number(),
    reason: v.string(),
    referenceType: v.optional(v.string()),
    referenceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();

    const loyalty = await getOrCreateLoyalty(ctx, args.organizationId, args.patientId);
    const newBalance = loyalty.balance + args.points;

    await ctx.db.patch(loyalty._id, {
      balance: newBalance,
      lifetimeEarned: loyalty.lifetimeEarned + args.points,
      updatedAt: now,
    });

    const txnId = await ctx.db.insert("gabinetLoyaltyTransactions", {
      organizationId: args.organizationId,
      patientId: args.patientId,
      type: "earn",
      points: args.points,
      reason: args.reason,
      referenceType: args.referenceType,
      referenceId: args.referenceId,
      balanceAfter: newBalance,
      createdBy: user._id,
      createdAt: now,
    });

    // Dual-write: replicate loyalty points update to Supabase
    await ctx.scheduler.runAfter(0, writeLoyaltyRef, {
      loyaltyId: loyalty._id,
      organizationId: args.organizationId,
      patientId: args.patientId,
      balance: newBalance,
      lifetimeEarned: loyalty.lifetimeEarned + args.points,
      lifetimeSpent: loyalty.lifetimeSpent,
      createdAt: loyalty.createdAt,
      updatedAt: now,
    });

    // Dual-write: replicate transaction to Supabase
    await ctx.scheduler.runAfter(0, writeTxnRef, {
      transactionId: txnId,
      organizationId: args.organizationId,
      patientId: args.patientId,
      type: "earn",
      points: args.points,
      reason: args.reason,
      referenceType: args.referenceType,
      referenceId: args.referenceId,
      balanceAfter: newBalance,
      createdBy: user._id,
      createdAt: now,
    });

    return newBalance;
  },
});

export const spendPoints = mutation({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.id("gabinetPatients"),
    points: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();

    const loyalty = await getOrCreateLoyalty(ctx, args.organizationId, args.patientId);
    if (loyalty.balance < args.points) throw new Error("Insufficient loyalty points");

    const newBalance = loyalty.balance - args.points;

    await ctx.db.patch(loyalty._id, {
      balance: newBalance,
      lifetimeSpent: loyalty.lifetimeSpent + args.points,
      updatedAt: now,
    });

    const txnId = await ctx.db.insert("gabinetLoyaltyTransactions", {
      organizationId: args.organizationId,
      patientId: args.patientId,
      type: "spend",
      points: args.points,
      reason: args.reason,
      balanceAfter: newBalance,
      createdBy: user._id,
      createdAt: now,
    });

    // Dual-write: replicate loyalty points update to Supabase
    await ctx.scheduler.runAfter(0, updateLoyaltyRef, {
      loyaltyId: loyalty._id,
      organizationId: args.organizationId,
      balance: newBalance,
      lifetimeSpent: loyalty.lifetimeSpent + args.points,
      updatedAt: now,
    });

    // Dual-write: replicate transaction to Supabase
    await ctx.scheduler.runAfter(0, writeTxnRef, {
      transactionId: txnId,
      organizationId: args.organizationId,
      patientId: args.patientId,
      type: "spend",
      points: args.points,
      reason: args.reason,
      balanceAfter: newBalance,
      createdBy: user._id,
      createdAt: now,
    });

    return newBalance;
  },
});

export const adjustPoints = mutation({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.id("gabinetPatients"),
    points: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();

    const loyalty = await getOrCreateLoyalty(ctx, args.organizationId, args.patientId);
    const newBalance = loyalty.balance + args.points;

    await ctx.db.patch(loyalty._id, {
      balance: newBalance,
      lifetimeEarned: args.points > 0 ? loyalty.lifetimeEarned + args.points : loyalty.lifetimeEarned,
      lifetimeSpent: args.points < 0 ? loyalty.lifetimeSpent + Math.abs(args.points) : loyalty.lifetimeSpent,
      updatedAt: now,
    });

    const txnId = await ctx.db.insert("gabinetLoyaltyTransactions", {
      organizationId: args.organizationId,
      patientId: args.patientId,
      type: "adjust",
      points: args.points,
      reason: args.reason,
      balanceAfter: newBalance,
      createdBy: user._id,
      createdAt: now,
    });

    // Dual-write: replicate loyalty points update to Supabase
    await ctx.scheduler.runAfter(0, updateLoyaltyRef, {
      loyaltyId: loyalty._id,
      organizationId: args.organizationId,
      balance: newBalance,
      lifetimeEarned: args.points > 0 ? loyalty.lifetimeEarned + args.points : loyalty.lifetimeEarned,
      lifetimeSpent: args.points < 0 ? loyalty.lifetimeSpent + Math.abs(args.points) : loyalty.lifetimeSpent,
      updatedAt: now,
    });

    // Dual-write: replicate transaction to Supabase
    await ctx.scheduler.runAfter(0, writeTxnRef, {
      transactionId: txnId,
      organizationId: args.organizationId,
      patientId: args.patientId,
      type: "adjust",
      points: args.points,
      reason: args.reason,
      balanceAfter: newBalance,
      createdBy: user._id,
      createdAt: now,
    });

    return newBalance;
  },
});
