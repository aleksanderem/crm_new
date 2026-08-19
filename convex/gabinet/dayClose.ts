/**
 * Gabinet: End-of-day cash register closure (issue #4156).
 *
 * Two tables:
 *   gabinetCashTransactions — manual deposits/withdrawals during the day
 *   gabinetDayCloses        — end-of-day closure snapshot (one per date)
 *
 * Write path: Convex actions → Supabase via service-role client.
 * Read path: React Query hooks → Supabase RLS client (see use-supabase-day-close.ts).
 *
 * R2B extension (issue #5575): createDayClose now accepts an optional cash
 * split — cashNextOpening (stays in register) + cashToSafe (moved to Sejf).
 * If cashToSafe > 0 and a locationId is provided, exactly one transfer_in
 * movement is written to gabinet_safe_movements, linked via
 * reference_day_close_id for idempotency.
 */

import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { logAudit } from "../auditLog";
import { nanoid } from "nanoid";

// Returns the UTC timestamp (ms) of midnight on the given YYYY-MM-DD date in
// Europe/Warsaw. Handles both CET (UTC+1) and CEST (UTC+2) automatically so
// payment queries use local-day boundaries, not UTC-day boundaries.
function warsawMidnightToUtcMs(dateStr: string): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  const utcMidnight = Date.UTC(year, month - 1, day);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(utcMidnight));
  const pMap = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const h = parseInt(pMap.hour) % 24; // guard against "24" at midnight
  const m = parseInt(pMap.minute);
  const s = parseInt(pMap.second);
  // UTC midnight is (h hours + m min + s sec) ahead of Warsaw midnight, so
  // Warsaw midnight = UTC midnight minus that offset.
  return utcMidnight - (h * 3_600_000 + m * 60_000 + s * 1_000);
}

// ---------------------------------------------------------------------------
// Cash Transactions
// ---------------------------------------------------------------------------

export const createCashTransaction = action({
  args: {
    organizationId: v.string(),
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

    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: authResult.userId,
      action: "cash_transaction_created",
      entityType: "gabinetCashTransaction",
      entityId: id,
      details: `Created ${args.type} of ${args.amount}${args.reason ? `: ${args.reason}` : ""}`,
    });

    return { id };
  },
});

export const deleteCashTransaction = action({
  args: {
    organizationId: v.string(),
    transactionId: v.string(),
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

    const { error } = await client
      .from("gabinet_cash_transactions")
      .delete()
      .eq("id", args.transactionId)
      .eq("organization_id", String(args.organizationId));

    if (error) throw new Error(`deleteCashTransaction: ${error.message}`);

    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: authResult.userId,
      action: "cash_transaction_deleted",
      entityType: "gabinetCashTransaction",
      entityId: args.transactionId,
      details: `Deleted cash transaction`,
    });
  },
});

// ---------------------------------------------------------------------------
// Day Close
// ---------------------------------------------------------------------------

export const createDayClose = action({
  args: {
    organizationId: v.string(),
    locationId: v.optional(v.string()),
    date: v.string(), // YYYY-MM-DD
    cashOpeningBalance: v.float64(),
    cashCounted: v.float64(),
    // R2B: optional cash split. If provided, cashNextOpening + cashToSafe must
    // equal cashCounted. Both must be non-negative. cashToSafe must not exceed
    // cashCounted. If cashToSafe > 0, a transfer_in movement is created in the
    // safe for the given location (locationId is required in this case).
    cashNextOpening: v.optional(v.float64()),
    cashToSafe: v.optional(v.float64()),
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

    // Validate cash split when provided.
    const hasSplit =
      args.cashNextOpening !== undefined || args.cashToSafe !== undefined;
    if (hasSplit) {
      const nextOpening = args.cashNextOpening ?? 0;
      const toSafe = args.cashToSafe ?? 0;

      if (nextOpening < 0 || toSafe < 0) {
        throw new Error("cashNextOpening and cashToSafe must be non-negative");
      }
      if (toSafe > args.cashCounted) {
        throw new Error("cashToSafe cannot exceed cashCounted");
      }
      const splitSum = Math.round((nextOpening + toSafe) * 100) / 100;
      const counted = Math.round(args.cashCounted * 100) / 100;
      if (splitSum !== counted) {
        throw new Error(
          `cashNextOpening (${nextOpening}) + cashToSafe (${toSafe}) must equal cashCounted (${counted})`,
        );
      }
      if (toSafe > 0 && !args.locationId) {
        throw new Error(
          "locationId is required when cashToSafe > 0 (safe is per-location)",
        );
      }
    }

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
      // Idempotency: if day was already closed, check if the safe transfer
      // still needs to be created (e.g. action was interrupted after writing
      // the day close but before writing the safe movement).
      const dayCloseId = (existing as { id: string }).id;
      if (args.cashToSafe && args.cashToSafe > 0 && args.locationId) {
        const { data: existingMovement } = await client
          .from("gabinet_safe_movements")
          .select("id")
          .eq("reference_day_close_id", dayCloseId)
          .maybeSingle();
        if (!existingMovement) {
          await createSafeMovement(
            ctx,
            client,
            dayCloseId,
            args.organizationId,
            args.locationId,
            args.cashToSafe,
            authResult.userId,
            args.date,
          );
        }
      }
      throw new Error("Day already closed for this date and location");
    }

    // Fetch completed payments for the day using Europe/Warsaw midnight boundaries
    // so clinics running past local midnight are correctly captured regardless of
    // the UTC+1/UTC+2 offset.
    const startTs = warsawMidnightToUtcMs(args.date);
    const [yr, mo, dy] = args.date.split("-").map(Number);
    const nextDate = new Date(Date.UTC(yr, mo - 1, dy + 1)).toISOString().slice(0, 10);
    const endTs = warsawMidnightToUtcMs(nextDate) - 1;

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
      cash_next_opening: args.cashNextOpening ?? null,
      cash_to_safe: args.cashToSafe ?? null,
      notes: args.notes ?? null,
      closed_by: authResult.userId,
      closed_at: now,
      created_at: now,
      updated_at: now,
    });

    if (error) throw new Error(`createDayClose: ${error.message}`);

    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: authResult.userId,
      action: "day_close_created",
      entityType: "gabinetDayClose",
      entityId: id,
      details: `Day closed for ${args.date}, total collected: ${totalCollected}, discrepancy: ${cashDiscrepancy}` +
        (args.cashNextOpening !== undefined
          ? `; cashNextOpening: ${args.cashNextOpening}, cashToSafe: ${args.cashToSafe ?? 0}`
          : ""),
    });

    // Create safe movement if cashToSafe > 0 (idempotent: checked by
    // reference_day_close_id before inserting).
    if (args.cashToSafe && args.cashToSafe > 0 && args.locationId) {
      // Guard: verify no movement already exists (handles concurrent retries).
      const { data: existingMovement } = await client
        .from("gabinet_safe_movements")
        .select("id")
        .eq("reference_day_close_id", id)
        .maybeSingle();
      if (!existingMovement) {
        await createSafeMovement(
          ctx,
          client,
          id,
          args.organizationId,
          args.locationId,
          args.cashToSafe,
          authResult.userId,
          args.date,
        );
      }
    }

    return { id, cashExpected, cashDiscrepancy, totalCollected, paymentSummary: summary };
  },
});

// ---------------------------------------------------------------------------
// Internal helper — creates one transfer_in movement in gabinet_safe_movements
// and writes the corresponding audit log entry.
// ---------------------------------------------------------------------------

async function createSafeMovement(
  ctx: Parameters<typeof logAudit>[0],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  dayCloseId: string,
  organizationId: string,
  locationId: string,
  amount: number,
  userId: string,
  date: string,
): Promise<void> {
  const movementId = nanoid();
  const now = Date.now();

  const { error } = await client.from("gabinet_safe_movements").insert({
    id: movementId,
    organization_id: String(organizationId),
    location_id: locationId,
    type: "transfer_in",
    amount,
    description: `Zamknięcie dnia ${date} — transfer do Sejfu`,
    reference_day_close_id: dayCloseId,
    created_by: userId,
    created_at: now,
  });

  if (error) throw new Error(`createSafeMovement: ${error.message}`);

  await logAudit(ctx, {
    organizationId,
    userId,
    action: "safe_transfer_in",
    entityType: "gabinetSafeMovement",
    entityId: movementId,
    details: `Day-close safe transfer: ${amount} PLN; location: ${locationId}; dayClose: ${dayCloseId}; date: ${date}`,
  });
}
