/**
 * Gabinet: Cash safe (Sejf) movement ledger — issue #5573 (R2A).
 *
 * The safe is a per-location physical cash vault. Its balance is always
 * derived from the immutable movement history:
 *
 *   balance = SUM(amount WHERE type = 'transfer_in')
 *           − SUM(amount WHERE type = 'withdrawal')
 *
 * Two movement types:
 *   transfer_in  — cash moved from the daily register (Kasa) into the safe.
 *                  This is NOT revenue; it is a cash flow between two drawers.
 *   withdrawal   — cash taken out of the safe. Also NOT a business expense by
 *                  default; it is a cash flow. The caller records what it was for
 *                  in the `description` field.
 *
 * Movements are immutable once written. Corrections are new compensating rows.
 * Every write produces an audit log entry.
 */

import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { logAudit } from "../auditLog";
import { nanoid } from "nanoid";

// ---------------------------------------------------------------------------
// transferToSafe
// ---------------------------------------------------------------------------
// Records a transfer_in movement: cash physically moved from the daily
// register into the safe for the given location.

export const transferToSafe = action({
  args: {
    organizationId: v.string(),
    locationId: v.string(),
    amount: v.float64(),
    description: v.optional(v.string()),
    referenceDayCloseId: v.optional(v.string()),
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

    const db = createSupabaseDb();
    const client = db.raw();

    // Verify the location belongs to this org.
    const { data: loc, error: locErr } = await client
      .from("gabinet_locations")
      .select("id")
      .eq("id", args.locationId)
      .eq("organization_id", String(args.organizationId))
      .maybeSingle();
    if (locErr) throw new Error(`transferToSafe location check: ${locErr.message}`);
    if (!loc) throw new Error("Location not found");

    const now = Date.now();
    const id = nanoid();

    const { error } = await client.from("gabinet_safe_movements").insert({
      id,
      organization_id: String(args.organizationId),
      location_id: args.locationId,
      type: "transfer_in",
      amount: args.amount,
      description: args.description ?? null,
      reference_day_close_id: args.referenceDayCloseId ?? null,
      created_by: authResult.userId,
      created_at: now,
    });
    if (error) throw new Error(`transferToSafe: ${error.message}`);

    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: authResult.userId,
      action: "safe_transfer_in",
      entityType: "gabinetSafeMovement",
      entityId: id,
      details: `Transfer to safe: ${args.amount}${args.description ? ` — ${args.description}` : ""}; location: ${args.locationId}${args.referenceDayCloseId ? `; dayClose: ${args.referenceDayCloseId}` : ""}`,
    });

    return { id };
  },
});

// ---------------------------------------------------------------------------
// withdrawFromSafe
// ---------------------------------------------------------------------------
// Records a withdrawal movement. Enforces that the resulting balance cannot
// go negative (i.e. you cannot withdraw more than the current safe balance).

export const withdrawFromSafe = action({
  args: {
    organizationId: v.string(),
    locationId: v.string(),
    amount: v.float64(),
    description: v.optional(v.string()),
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

    const db = createSupabaseDb();
    const client = db.raw();

    // Verify the location belongs to this org.
    const { data: loc, error: locErr } = await client
      .from("gabinet_locations")
      .select("id")
      .eq("id", args.locationId)
      .eq("organization_id", String(args.organizationId))
      .maybeSingle();
    if (locErr) throw new Error(`withdrawFromSafe location check: ${locErr.message}`);
    if (!loc) throw new Error("Location not found");

    // Compute current balance to guard against overdraft.
    const { data: rows, error: balErr } = await client
      .from("gabinet_safe_movements")
      .select("type, amount")
      .eq("organization_id", String(args.organizationId))
      .eq("location_id", args.locationId);
    if (balErr) throw new Error(`withdrawFromSafe balance check: ${balErr.message}`);

    let balance = 0;
    for (const row of (rows ?? []) as { type: string; amount: number }[]) {
      const amt = Number(row.amount);
      if (row.type === "transfer_in") {
        balance = Math.round((balance + amt) * 100) / 100;
      } else {
        balance = Math.round((balance - amt) * 100) / 100;
      }
    }

    if (args.amount > balance) {
      throw new Error(
        `Insufficient safe balance: requested ${args.amount}, available ${balance}`,
      );
    }

    const now = Date.now();
    const id = nanoid();

    const { error } = await client.from("gabinet_safe_movements").insert({
      id,
      organization_id: String(args.organizationId),
      location_id: args.locationId,
      type: "withdrawal",
      amount: args.amount,
      description: args.description ?? null,
      reference_day_close_id: null,
      created_by: authResult.userId,
      created_at: now,
    });
    if (error) throw new Error(`withdrawFromSafe: ${error.message}`);

    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: authResult.userId,
      action: "safe_withdrawal",
      entityType: "gabinetSafeMovement",
      entityId: id,
      details: `Withdrawal from safe: ${args.amount}${args.description ? ` — ${args.description}` : ""}; location: ${args.locationId}; balance after: ${Math.round((balance - args.amount) * 100) / 100}`,
    });

    return { id, balanceAfter: Math.round((balance - args.amount) * 100) / 100 };
  },
});

// ---------------------------------------------------------------------------
// listSafeMovements
// ---------------------------------------------------------------------------
// Returns the movement history for a specific location, newest-first.
// Optionally bounded by a date range (inclusive, as ms timestamps).

export const listSafeMovements = action({
  args: {
    organizationId: v.string(),
    locationId: v.string(),
    fromTs: v.optional(v.float64()),
    toTs: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const client = db.raw();

    let query = client
      .from("gabinet_safe_movements")
      .select("*")
      .eq("organization_id", String(args.organizationId))
      .eq("location_id", args.locationId)
      .order("created_at", { ascending: false });

    if (args.fromTs !== undefined) {
      query = query.gte("created_at", args.fromTs);
    }
    if (args.toTs !== undefined) {
      query = query.lte("created_at", args.toTs);
    }

    const { data, error } = await query;
    if (error) throw new Error(`listSafeMovements: ${error.message}`);
    return data ?? [];
  },
});

// ---------------------------------------------------------------------------
// getSafeBalance
// ---------------------------------------------------------------------------
// Returns the current computed balance for a location's safe:
//   SUM(transfer_in amounts) − SUM(withdrawal amounts)

export const getSafeBalance = action({
  args: {
    organizationId: v.string(),
    locationId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const client = db.raw();

    const { data, error } = await client
      .from("gabinet_safe_movements")
      .select("type, amount")
      .eq("organization_id", String(args.organizationId))
      .eq("location_id", args.locationId);
    if (error) throw new Error(`getSafeBalance: ${error.message}`);

    let totalIn = 0;
    let totalOut = 0;
    for (const row of (data ?? []) as { type: string; amount: number }[]) {
      const amt = Number(row.amount);
      if (row.type === "transfer_in") {
        totalIn = Math.round((totalIn + amt) * 100) / 100;
      } else {
        totalOut = Math.round((totalOut + amt) * 100) / 100;
      }
    }

    const balance = Math.round((totalIn - totalOut) * 100) / 100;
    return { balance, totalIn, totalOut };
  },
});
