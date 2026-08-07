/**
 * Gabinet: End-of-day cash register closure (issue #4156).
 *
 * Two tables:
 *   gabinetCashTransactions — manual deposits/withdrawals during the day
 *   gabinetDayCloses        — end-of-day closure snapshot (one per date)
 *
 * Write path: Convex actions → Supabase via service-role client.
 * Read path: React Query hooks → Supabase RLS client (see use-supabase-day-close.ts).
 */

import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { nanoid } from "nanoid";

// ---------------------------------------------------------------------------
// Cash Transactions
// ---------------------------------------------------------------------------

export const createCashTransaction = action({
  args: {
    organizationId: v.id("organizations"),
    locationId: v.optional(v.string()),
    date: v.string(), // YYYY-MM-DD
    type: v.union(v.literal("deposit"), v.literal("withdrawal")),
    amount: v.float64(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    ) as { userId: string };
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "gabinet_reports",
        action: "edit",
      },
    ) as { allowed: boolean };
    if (!perm.allowed) throw new Error("Permission denied");

    if (args.amount <= 0) throw new Error("Amount must be positive");

    const now = Date.now();
    const id = nanoid();
    const db = createSupabaseDb();
    const client = db.raw();

    const { error } = await client.from("gabinet_cash_transactions").insert({
      id,
      organization_id: String(args.organizationId),
      location_id: args.locationId ?? null,
      date: args.date,
      type: args.type,
      amount: args.amount,
      reason: args.reason ?? null,
      created_by: authResult.userId,
      created_at: now,
      updated_at: now,
    });

    if (error) throw new Error(`createCashTransaction: ${error.message}`);
    return { id };
  },
});

export const deleteCashTransaction = action({
  args: {
    organizationId: v.id("organizations"),
    transactionId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "gabinet_reports",
        action: "edit",
      },
    ) as { allowed: boolean };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const client = db.raw();

    const { error } = await client
      .from("gabinet_cash_transactions")
      .delete()
      .eq("id", args.transactionId)
      .eq("organization_id", String(args.organizationId));

    if (error) throw new Error(`deleteCashTransaction: ${error.message}`);
  },
});

// ---------------------------------------------------------------------------
// Day Close
// ---------------------------------------------------------------------------

export const createDayClose = action({
  args: {
    organizationId: v.id("organizations"),
    locationId: v.optional(v.string()),
    date: v.string(), // YYYY-MM-DD
    cashOpeningBalance: v.float64(),
    cashCounted: v.float64(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    ) as { userId: string };
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "gabinet_reports",
        action: "edit",
      },
    ) as { allowed: boolean };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const client = db.raw();

    // Check for existing close on this date (org + location + date unique).
    let existingQuery = client
      .from("gabinet_day_closes")
      .select("id")
      .eq("organization_id", String(args.organizationId))
      .eq("date", args.date);
    existingQuery = args.locationId
      ? existingQuery.eq("location_id", args.locationId)
      : existingQuery.is("location_id", null);
    const { data: existing } = await existingQuery.limit(1).maybeSingle();

    if (existing) {
      throw new Error("Day already closed for this date and location");
    }

    // Fetch completed payments for the day.
    const startTs = new Date(args.date + "T00:00:00.000Z").getTime();
    const endTs = new Date(args.date + "T23:59:59.999Z").getTime();

    let paymentsQuery = client
      .from("payments")
      .select("amount, payment_method")
      .eq("organization_id", String(args.organizationId))
      .eq("status", "completed")
      .not("paid_at", "is", null)
      .gte("paid_at", startTs)
      .lte("paid_at", endTs);

    if (args.locationId) {
      const { data: apptIds } = await client
        .from("gabinet_appointments")
        .select("id")
        .eq("organization_id", String(args.organizationId))
        .eq("location_id", args.locationId)
        .eq("date", args.date);
      const ids = ((apptIds ?? []) as { id: string }[]).map((a) => a.id);
      if (ids.length === 0) {
        paymentsQuery = paymentsQuery.is("appointment_id", null);
      } else {
        paymentsQuery = paymentsQuery.in("appointment_id", ids);
      }
    }

    const { data: payments } = await paymentsQuery;

    // Build payment method summary (exclude gratis/barter from totals).
    const summary: Record<string, number> = {};
    let totalCollected = 0;
    let cashFromPayments = 0;

    for (const p of (payments ?? []) as {
      amount: number;
      payment_method: string;
    }[]) {
      const method = (p.payment_method as string) ?? "other";
      if (method === "gratis" || method === "barter") continue;
      const amount = Number(p.amount);
      summary[method] = Math.round(((summary[method] ?? 0) + amount) * 100) / 100;
      totalCollected = Math.round((totalCollected + amount) * 100) / 100;
      if (method === "cash" || method.startsWith("cash")) {
        cashFromPayments = Math.round((cashFromPayments + amount) * 100) / 100;
      }
    }

    // Fetch cash transactions for the day.
    let txQuery = client
      .from("gabinet_cash_transactions")
      .select("type, amount")
      .eq("organization_id", String(args.organizationId))
      .eq("date", args.date);

    if (args.locationId) {
      txQuery = txQuery.eq("location_id", args.locationId);
    }

    const { data: txRows } = await txQuery;

    let cashDeposits = 0;
    let cashWithdrawals = 0;
    for (const tx of (txRows ?? []) as { type: string; amount: number }[]) {
      if (tx.type === "deposit") {
        cashDeposits = Math.round((cashDeposits + Number(tx.amount)) * 100) / 100;
      } else {
        cashWithdrawals = Math.round((cashWithdrawals + Number(tx.amount)) * 100) / 100;
      }
    }

    const cashExpected =
      Math.round(
        (args.cashOpeningBalance + cashFromPayments + cashDeposits - cashWithdrawals) * 100,
      ) / 100;
    const cashDiscrepancy = Math.round((args.cashCounted - cashExpected) * 100) / 100;

    const now = Date.now();
    const id = nanoid();

    const { error } = await client.from("gabinet_day_closes").insert({
      id,
      organization_id: String(args.organizationId),
      location_id: args.locationId ?? null,
      date: args.date,
      payment_summary: summary,
      total_collected: totalCollected,
      cash_from_payments: cashFromPayments,
      cash_opening_balance: args.cashOpeningBalance,
      cash_deposits: cashDeposits,
      cash_withdrawals: cashWithdrawals,
      cash_expected: cashExpected,
      cash_counted: args.cashCounted,
      cash_discrepancy: cashDiscrepancy,
      notes: args.notes ?? null,
      closed_by: authResult.userId,
      closed_at: now,
      created_at: now,
      updated_at: now,
    });

    if (error) throw new Error(`createDayClose: ${error.message}`);
    return { id, cashExpected, cashDiscrepancy, totalCollected, paymentSummary: summary };
  },
});
