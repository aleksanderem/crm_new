import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { logAudit } from "./auditLog";
import { logActivity } from "./_helpers/activities";
import { createNotificationDirect } from "./notifications";
import { formatCurrencyPLN } from "./_helpers/formatCurrency";
import { sendEmail } from "@cvx/email";
import { AUTH_RESEND_KEY, SITE_URL } from "@cvx/env";

const paymentMethodValidator = v.union(
  v.literal("cash"),
  v.literal("card"),
  v.literal("transfer"),
  v.literal("package"),
  v.literal("gratis"),
  v.literal("barter"),
  v.literal("other"),
);

const paymentStatusValidator = v.union(
  v.literal("pending"),
  v.literal("completed"),
  v.literal("refunded"),
  v.literal("cancelled"),
);

export const list = action({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
    status: v.optional(paymentStatusValidator),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const { numItems, cursor } = args.paginationOpts;
    const offset = cursor ? Number(cursor) : 0;
    if (!Number.isFinite(offset) || offset < 0) {
      throw new Error("Invalid pagination cursor");
    }

    const db = createSupabaseDb();
    let q = db
      .query("payments")
      .eq("organizationId", String(args.organizationId));
    if (args.status) q = q.eq("status", args.status);

    // Fetch numItems + 1 to detect whether more rows remain.
    const rows = await q
      .order("createdAt", false)
      .range(offset, offset + numItems)
      .collect();

    const hasMore = rows.length > numItems;
    const page = hasMore ? rows.slice(0, numItems) : rows;

    return {
      page,
      isDone: !hasMore,
      continueCursor: hasMore ? String(offset + numItems) : "",
    };
  },
});

export const getByAppointment = action({
  args: {
    organizationId: v.id("organizations"),
    appointmentId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    return await db
      .query("payments")
      .eq("organizationId", String(args.organizationId))
      .eq("appointmentId", args.appointmentId)
      .first();
  },
});

export const listByPackageUsage = action({
  args: {
    organizationId: v.id("organizations"),
    packageUsageId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const rows = await db
      .query("payments")
      .eq("organizationId", String(args.organizationId))
      .eq("packageUsageId", args.packageUsageId)
      .order("createdAt", true)
      .collect();
    return rows;
  },
});

export const create = action({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.optional(v.string()),
    appointmentId: v.optional(v.string()),
    packageUsageId: v.optional(v.string()),
    amount: v.number(),
    currency: v.string(),
    paymentMethod: paymentMethodValidator,
    notes: v.optional(v.string()),
    status: v.optional(paymentStatusValidator),
    // Patient-credit accounting (issue #1059).
    // creditEarned: overpayment portion of `amount` to add to the patient's
    // credit balance. Caller is expected to compute this against the visit
    // price; the backend only sanity-checks that it doesn't exceed `amount`.
    // creditApplied: pre-existing patient credit consumed to settle this
    // visit. Reduces outstanding without contributing to `amount`. Must not
    // exceed the patient's current available balance.
    creditEarned: v.optional(v.number()),
    creditApplied: v.optional(v.number()),
    // Discount applied at point of sale (issue #3383).
    // discountAmount: absolute discount value in the payment currency.
    // discountPercent: percentage discount (0–100).
    discountAmount: v.optional(v.number()),
    discountPercent: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();
    const now = Date.now();
    const status = args.status ?? "completed";

    const creditEarned =
      args.creditEarned !== undefined && args.creditEarned !== 0
        ? args.creditEarned
        : null;
    const creditApplied =
      args.creditApplied !== undefined && args.creditApplied !== 0
        ? args.creditApplied
        : null;

    if (creditEarned !== null) {
      if (!Number.isFinite(creditEarned) || creditEarned < 0) {
        throw new Error("creditEarned must be a non-negative number");
      }
      if (creditEarned > args.amount + 0.005) {
        throw new Error("creditEarned cannot exceed amount");
      }
    }
    if (creditApplied !== null) {
      if (!Number.isFinite(creditApplied) || creditApplied <= 0) {
        throw new Error("creditApplied must be a positive number");
      }
      if (!args.patientId) {
        throw new Error("creditApplied requires a patientId");
      }
      const balance = await computePatientCreditBalance(
        db,
        String(args.organizationId),
        String(args.patientId),
      );
      if (creditApplied > balance + 0.005) {
        throw new Error(
          `creditApplied ${creditApplied} exceeds available balance ${balance}`,
        );
      }
    }

    // Build INSERT defensively — migration 00008 columns (kind, creditEarned,
    // creditApplied) may not exist on pre-00008 environments; only include them
    // when non-null. kind=NULL is treated as "payment" by the DB check
    // constraint, so omitting it is always safe.
    const insertRow: Record<string, unknown> = {
      organizationId: String(args.organizationId),
      patientId: args.patientId ?? null,
      appointmentId: args.appointmentId ?? null,
      packageUsageId: args.packageUsageId ?? null,
      amount: args.amount,
      currency: args.currency,
      paymentMethod: args.paymentMethod,
      status,
      paidAt: status === "completed" ? now : null,
      notes: args.notes ?? null,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    };
    if (creditEarned !== null) insertRow.creditEarned = creditEarned;
    if (creditApplied !== null) insertRow.creditApplied = creditApplied;
    if (args.discountAmount !== undefined && args.discountAmount > 0)
      insertRow.discountAmount = args.discountAmount;
    if (args.discountPercent !== undefined && args.discountPercent > 0)
      insertRow.discountPercent = args.discountPercent;

    const paymentId = await db.insert("payments", insertRow);

    // Side effects (audit log) via internal mutation
    try {
      await ctx.runMutation(internal.payments._createPaymentSideEffects, {
        paymentId,
        organizationId: args.organizationId,
        userId: authResult.userId,
        amount: args.amount,
        currency: args.currency,
      });
    } catch {
      // side effects are best-effort
    }

    return paymentId;
  },
});

/**
 * Available patient credit derived from the `payments` ledger:
 *   sum over completed payments of (creditEarned − creditApplied).
 * Refunded / pending / cancelled rows don't contribute, so reversing a
 * payment with creditEarned > 0 naturally drains the balance.
 */
async function computePatientCreditBalance(
  db: ReturnType<typeof createSupabaseDb>,
  organizationId: string,
  patientId: string,
): Promise<number> {
  const rows = await db
    .query<{
      creditEarned?: number | null;
      creditApplied?: number | null;
    }>("payments")
    .eq("organizationId", organizationId)
    .eq("patientId", patientId)
    .eq("status", "completed")
    .collect();
  let balance = 0;
  for (const r of rows) {
    balance += (r.creditEarned ?? 0) - (r.creditApplied ?? 0);
  }
  return Math.round(balance * 100) / 100;
}

export const getPatientCredit = action({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const rows = await db
      .query("payments")
      .eq("organizationId", String(args.organizationId))
      .eq("patientId", args.patientId)
      .eq("status", "completed")
      .order("createdAt", false)
      .collect();

    let balance = 0;
    const history: Array<{
      _id: string;
      createdAt: number;
      amount: number;
      creditEarned: number;
      creditApplied: number;
      kind: string;
      appointmentId: string | null;
      paymentMethod: string;
      notes: string | null;
    }> = [];
    for (const r of rows) {
      const earned = (r.creditEarned as number | null | undefined) ?? 0;
      const applied = (r.creditApplied as number | null | undefined) ?? 0;
      balance += earned - applied;
      if (earned !== 0 || applied !== 0) {
        history.push({
          _id: String(r._id),
          createdAt: r.createdAt as number,
          amount: r.amount as number,
          creditEarned: earned,
          creditApplied: applied,
          kind: ((r.kind as string | null | undefined) ?? "payment") as string,
          appointmentId: (r.appointmentId as string | null) ?? null,
          paymentMethod: r.paymentMethod as string,
          notes: (r.notes as string | null) ?? null,
        });
      }
    }
    return {
      balance: Math.round(balance * 100) / 100,
      history,
    };
  },
});

/**
 * Refund part or all of a patient's credit balance back to them as cash/card.
 * Inserts a `kind="credit_refund"` ledger row with `creditEarned = -amount`,
 * draining the balance. Admin-only (issue #1059).
 */
export const refundCredit = action({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.string(),
    amount: v.number(),
    paymentMethod: paymentMethodValidator,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    // Issue #1690: refunds are gated by gabinet_payments.refund (separate slot
    // so e.g. reception can record payments but not authorize refunds).
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "gabinet_payments",
        action: "refund",
      },
    );
    if (!perm.allowed) {
      throw new Error(
        "REFUND_NOT_AUTHORIZED: requires gabinet_payments.refund — use requestRefundAuthorization to ask an admin",
      );
    }
    if (!Number.isFinite(args.amount) || args.amount <= 0) {
      throw new Error("Refund amount must be positive");
    }

    const db = createSupabaseDb();
    const balance = await computePatientCreditBalance(
      db,
      String(args.organizationId),
      String(args.patientId),
    );
    if (args.amount > balance + 0.005) {
      throw new Error(
        `Refund amount ${args.amount} exceeds available credit ${balance}`,
      );
    }

    const now = Date.now();
    const paymentId = await db.insert("payments", {
      organizationId: String(args.organizationId),
      patientId: args.patientId,
      appointmentId: null,
      packageUsageId: null,
      amount: args.amount,
      currency: "PLN",
      paymentMethod: args.paymentMethod,
      status: "completed",
      paidAt: now,
      notes: args.notes ?? null,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
      kind: "credit_refund",
      creditEarned: -args.amount,
    });

    try {
      await ctx.runMutation(internal.payments._refundCreditSideEffects, {
        paymentId,
        organizationId: args.organizationId,
        userId: authResult.userId,
        amount: args.amount,
      });
    } catch {
      // side effects are best-effort
    }

    return paymentId;
  },
});

export const update = action({
  args: {
    organizationId: v.id("organizations"),
    paymentId: v.string(),
    amount: v.optional(v.number()),
    paymentMethod: v.optional(paymentMethodValidator),
    notes: v.optional(v.union(v.string(), v.null())),
    discountAmount: v.optional(v.union(v.number(), v.null())),
    discountPercent: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();
    const payment = await db.get("payments", args.paymentId);
    if (!payment || payment.organizationId !== String(args.organizationId)) {
      throw new Error("Payment not found");
    }

    if (payment.status === "refunded" || payment.status === "cancelled") {
      throw new Error(`Cannot edit a ${payment.status} payment`);
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.amount !== undefined) {
      if (!Number.isFinite(args.amount) || args.amount <= 0) {
        throw new Error("Amount must be a positive number");
      }
      updates.amount = args.amount;
    }
    if (args.paymentMethod !== undefined) {
      updates.paymentMethod = args.paymentMethod;
    }
    if (args.notes !== undefined) {
      updates.notes = args.notes;
    }
    if (args.discountAmount !== undefined) {
      updates.discountAmount = args.discountAmount;
    }
    if (args.discountPercent !== undefined) {
      updates.discountPercent = args.discountPercent;
    }

    await db.patch("payments", args.paymentId, updates);

    try {
      await ctx.runMutation(internal.payments._updatePaymentSideEffects, {
        paymentId: args.paymentId,
        organizationId: args.organizationId,
        userId: authResult.userId,
        changes: JSON.stringify(updates),
      });
    } catch {
      // side effects are best-effort
    }

    return args.paymentId;
  },
});

export const markPaid = action({
  args: {
    organizationId: v.id("organizations"),
    paymentId: v.string(),
    paymentMethod: v.optional(paymentMethodValidator),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();
    const payment = await db.get("payments", args.paymentId);
    if (!payment || payment.organizationId !== String(args.organizationId)) {
      throw new Error("Payment not found");
    }

    if (payment.status !== "pending") {
      throw new Error(`Cannot mark ${payment.status} payment as paid`);
    }

    const now = Date.now();
    const updates: Record<string, unknown> = {
      status: "completed",
      paidAt: now,
      updatedAt: now,
    };
    if (args.paymentMethod) updates.paymentMethod = args.paymentMethod;

    await db.patch("payments", args.paymentId, updates);

    // Side effects via internal mutation
    try {
      await ctx.runMutation(internal.payments._markPaidSideEffects, {
        paymentId: args.paymentId,
        organizationId: args.organizationId,
        userId: authResult.userId,
        amount: payment.amount as number,
        currency: payment.currency as string,
        appointmentId: (payment.appointmentId as string) ?? null,
      });
    } catch {
      // side effects are best-effort
    }

    return args.paymentId;
  },
});

export const splitMarkPaid = action({
  args: {
    organizationId: v.id("organizations"),
    paymentId: v.string(),
    firstMethod: paymentMethodValidator,
    firstAmount: v.number(),
    secondMethod: paymentMethodValidator,
    secondAmount: v.number(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    if (args.firstMethod === args.secondMethod) {
      throw new Error("Split methods must differ");
    }
    if (args.firstAmount <= 0 || args.secondAmount <= 0) {
      throw new Error("Split amounts must be positive");
    }

    const db = createSupabaseDb();
    const payment = await db.get("payments", args.paymentId);
    if (!payment || payment.organizationId !== String(args.organizationId)) {
      throw new Error("Payment not found");
    }
    if (payment.status !== "pending") {
      throw new Error(`Cannot mark ${payment.status} payment as paid`);
    }

    const expected = Math.round((payment.amount as number) * 100) / 100;
    const sum = Math.round((args.firstAmount + args.secondAmount) * 100) / 100;
    if (sum !== expected) {
      throw new Error(`Split amounts must sum to ${expected}`);
    }

    const now = Date.now();
    const baseNotes = (payment.notes as string | null) ?? "";
    const appendSplit = (method: string) => {
      if (!baseNotes) return `split: ${method}`;
      return baseNotes.endsWith(")")
        ? `${baseNotes.slice(0, -1)} split: ${method})`
        : `${baseNotes} split: ${method}`;
    };

    await db.patch("payments", args.paymentId, {
      status: "completed",
      paidAt: now,
      amount: args.firstAmount,
      paymentMethod: args.firstMethod,
      notes: appendSplit(args.firstMethod),
      updatedAt: now,
    });

    // Build INSERT defensively — migration 00008 columns (kind, creditEarned,
    // creditApplied) may not exist on pre-00008 environments. A split payment
    // never earns/applies credit, so both are null and we omit them entirely.
    // kind=NULL is treated as "payment" by the DB check constraint.
    const newPaymentId = await db.insert("payments", {
      organizationId: String(args.organizationId),
      patientId: (payment.patientId as string | null) ?? null,
      appointmentId: (payment.appointmentId as string | null) ?? null,
      packageUsageId: (payment.packageUsageId as string | null) ?? null,
      amount: args.secondAmount,
      currency: payment.currency as string,
      paymentMethod: args.secondMethod,
      status: "completed",
      paidAt: now,
      notes: appendSplit(args.secondMethod),
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    try {
      await ctx.runMutation(internal.payments._markPaidSideEffects, {
        paymentId: args.paymentId,
        organizationId: args.organizationId,
        userId: authResult.userId,
        amount: args.firstAmount,
        currency: payment.currency as string,
        appointmentId: (payment.appointmentId as string) ?? null,
      });
      await ctx.runMutation(internal.payments._createPaymentSideEffects, {
        paymentId: newPaymentId,
        organizationId: args.organizationId,
        userId: authResult.userId,
        amount: args.secondAmount,
        currency: payment.currency as string,
      });
    } catch {
      // side effects are best-effort
    }

    return { firstPaymentId: args.paymentId, secondPaymentId: newPaymentId };
  },
});

export const refund = action({
  args: {
    organizationId: v.id("organizations"),
    paymentId: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();
    const payment = await db.get("payments", args.paymentId);
    if (!payment || payment.organizationId !== String(args.organizationId)) {
      throw new Error("Payment not found");
    }

    if (payment.status !== "completed") {
      throw new Error(`Cannot refund a ${payment.status} payment`);
    }

    await db.patch("payments", args.paymentId, {
      status: "refunded",
      notes: args.reason
        ? `${payment.notes ? (payment.notes as string) + "\n" : ""}Refund: ${args.reason}`
        : (payment.notes as string) ?? null,
      updatedAt: Date.now(),
    });

    // Side effects via internal mutation
    try {
      await ctx.runMutation(internal.payments._refundSideEffects, {
        paymentId: args.paymentId,
        organizationId: args.organizationId,
        userId: authResult.userId,
        amount: payment.amount as number,
        reason: args.reason,
      });
    } catch {
      // side effects are best-effort
    }

    return args.paymentId;
  },
});

// --- Internal side-effect mutations ---

export const _createPaymentSideEffects = internalMutation({
  args: {
    paymentId: v.string(),
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    amount: v.number(),
    currency: v.string(),
  },
  handler: async (ctx, args) => {
    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: args.userId,
      action: "payment_created",
      entityType: "payment",
      entityId: args.paymentId as any,
      details: JSON.stringify({ amount: args.amount, currency: args.currency }),
    });
  },
});

export const _updatePaymentSideEffects = internalMutation({
  args: {
    paymentId: v.string(),
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    changes: v.string(),
  },
  handler: async (ctx, args) => {
    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: args.userId,
      action: "payment_updated",
      entityType: "payment",
      entityId: args.paymentId as any,
      details: args.changes,
    });
  },
});

export const _markPaidSideEffects = internalMutation({
  args: {
    paymentId: v.string(),
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    amount: v.number(),
    currency: v.string(),
    appointmentId: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "gabinetAppointment",
      entityId: (args.appointmentId ?? args.paymentId) as any,
      action: "updated",
      description: `Payment of ${args.amount} ${args.currency} marked as paid`,
      performedBy: args.userId,
    });

    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: args.userId,
      action: "payment_completed",
      entityType: "payment",
      entityId: args.paymentId as any,
      details: JSON.stringify({ amount: args.amount }),
    });
  },
});

export const _refundSideEffects = internalMutation({
  args: {
    paymentId: v.string(),
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    amount: v.number(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: args.userId,
      action: "payment_refunded",
      entityType: "payment",
      entityId: args.paymentId as any,
      details: JSON.stringify({ amount: args.amount, reason: args.reason }),
    });
  },
});

export const _refundCreditSideEffects = internalMutation({
  args: {
    paymentId: v.string(),
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: args.userId,
      action: "patient_credit_refunded",
      entityType: "payment",
      entityId: args.paymentId as any,
      details: JSON.stringify({ amount: args.amount }),
    });
  },
});

/**
 * Soft-cancel a payment (issue #1690 — "Usuń wpłatę").
 *
 * Never hard-deletes the row, so credit-history is preserved. Flips the
 * status to "cancelled" which drops the row from balance + outstanding
 * computations (see computePatientCreditBalance which filters on
 * status="completed"). Already-refunded/cancelled rows are rejected.
 */
export const cancel = action({
  args: {
    organizationId: v.id("organizations"),
    paymentId: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "gabinet_payments",
        action: "delete",
      },
    );
    if (!perm.allowed) {
      throw new Error("Not authorized to cancel payments");
    }

    const db = createSupabaseDb();
    const payment = await db.get("payments", args.paymentId);
    if (!payment || payment.organizationId !== String(args.organizationId)) {
      throw new Error("Payment not found");
    }
    if (payment.status === "refunded" || payment.status === "cancelled") {
      throw new Error(`Cannot cancel a ${payment.status} payment`);
    }

    const baseNotes = (payment.notes as string | null) ?? "";
    const newNotes = args.reason
      ? `${baseNotes ? baseNotes + "\n" : ""}Cancelled: ${args.reason}`
      : baseNotes || null;

    await db.patch("payments", args.paymentId, {
      status: "cancelled",
      notes: newNotes,
      updatedAt: Date.now(),
    });

    try {
      await ctx.runMutation(internal.payments._cancelPaymentSideEffects, {
        paymentId: args.paymentId,
        organizationId: args.organizationId,
        userId: authResult.userId,
        amount: payment.amount as number,
        reason: args.reason,
      });
    } catch {
      // side effects are best-effort
    }

    return args.paymentId;
  },
});

export const _cancelPaymentSideEffects = internalMutation({
  args: {
    paymentId: v.string(),
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    amount: v.number(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: args.userId,
      action: "payment_cancelled",
      entityType: "payment",
      entityId: args.paymentId as any,
      details: JSON.stringify({ amount: args.amount, reason: args.reason }),
    });
  },
});

/**
 * Issue #1690: when a staff member without gabinet_payments.refund permission
 * tries to issue a refund, they instead call this action. It records the
 * request in the audit log, posts in-app notifications to every owner/admin,
 * and emails each admin a deep link back to the patient payments tab so they
 * can approve by clicking through and executing `refundCredit` from the UI.
 */
export const requestRefundAuthorization = action({
  args: {
    organizationId: v.id("organizations"),
    patientId: v.string(),
    amount: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    if (!Number.isFinite(args.amount) || args.amount <= 0) {
      throw new Error("Refund amount must be positive");
    }

    // Sanity-check the patient still has enough credit to refund — saves
    // admins from approving impossible requests.
    const db = createSupabaseDb();
    const balance = await computePatientCreditBalance(
      db,
      String(args.organizationId),
      String(args.patientId),
    );
    if (args.amount > balance + 0.005) {
      throw new Error(
        `Refund amount ${args.amount} exceeds available credit ${balance}`,
      );
    }

    const patient = await db.get("gabinetPatients", args.patientId);
    const patientLabel = patient
      ? `${(patient.firstName as string) ?? ""} ${(patient.lastName as string) ?? ""}`.trim() || "Pacjent"
      : "Pacjent";

    const sideEffects = await ctx.runMutation(
      internal.payments._requestRefundAuthSideEffects,
      {
        organizationId: args.organizationId,
        requesterId: authResult.userId,
        requesterName: authResult.userName ?? authResult.userEmail ?? "Pracownik",
        patientId: args.patientId,
        patientLabel,
        amount: args.amount,
        notes: args.notes,
      },
    );

    // Email is best-effort: if Resend is misconfigured or down we still want
    // the in-app notification + audit log to succeed.
    try {
      await ctx.runAction(internal.payments._sendRefundAuthEmails, {
        organizationId: args.organizationId,
        admins: sideEffects.admins,
        requesterName:
          authResult.userName ?? authResult.userEmail ?? "Pracownik",
        patientId: args.patientId,
        patientLabel,
        amount: args.amount,
        notes: args.notes,
      });
    } catch (e) {
      console.error("[requestRefundAuthorization] email send failed:", e);
    }

    return { ok: true };
  },
});

export const _requestRefundAuthSideEffects = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    requesterId: v.id("users"),
    requesterName: v.string(),
    patientId: v.string(),
    patientLabel: v.string(),
    amount: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Notify every owner/admin in the org.
    const memberships = await ctx.db
      .query("teamMemberships")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .collect();

    const admins = memberships.filter(
      (m) => m.role === "owner" || m.role === "admin",
    );

    const message = `${args.requesterName} prosi o autoryzację zwrotu ${formatCurrencyPLN(args.amount, "zł")} z salda klienta ${args.patientLabel}${args.notes ? ` (${args.notes})` : ""}.`;
    const link = `/dashboard/gabinet/patients/${args.patientId}?tab=payments`;

    // Shared requestId so approve/reject can find sibling notifications across
    // every admin and resolve them together (#1722).
    const requestId = `rar_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const metadata = {
      requestId,
      patientId: args.patientId,
      patientLabel: args.patientLabel,
      amount: args.amount,
      notes: args.notes ?? null,
      requesterId: String(args.requesterId),
      requesterName: args.requesterName,
      status: "pending" as const,
    };

    const adminContacts: Array<{ userId: string; email: string; name: string | null }> = [];

    for (const m of admins) {
      await createNotificationDirect(ctx, {
        organizationId: args.organizationId,
        userId: m.userId,
        type: "refund_authorization_requested",
        title: "Prośba o autoryzację zwrotu",
        message,
        link,
        metadata,
      });
      const user = await ctx.db.get(m.userId);
      if (user?.email) {
        adminContacts.push({
          userId: String(m.userId),
          email: user.email,
          name: (user.name as string | undefined) ?? null,
        });
      }
    }

    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: args.requesterId,
      action: "refund_authorization_requested",
      entityType: "payment",
      entityId: args.patientId as any,
      details: JSON.stringify({
        patientId: args.patientId,
        amount: args.amount,
        notes: args.notes,
      }),
    });

    return { admins: adminContacts };
  },
});

/**
 * Email each admin a refund-authorization request with a deep link to the
 * patient payments tab. Best-effort — failures are logged and swallowed by
 * the caller so the in-app notification flow always succeeds. Skipped at
 * runtime when Resend is not configured.
 */
export const _sendRefundAuthEmails = internalAction({
  args: {
    organizationId: v.id("organizations"),
    admins: v.array(
      v.object({
        userId: v.string(),
        email: v.string(),
        name: v.union(v.string(), v.null()),
      }),
    ),
    requesterName: v.string(),
    patientId: v.string(),
    patientLabel: v.string(),
    amount: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!AUTH_RESEND_KEY) {
      console.warn(
        "[_sendRefundAuthEmails] AUTH_RESEND_KEY not set, skipping email",
      );
      return;
    }
    if (args.admins.length === 0) return;

    const db = createSupabaseDb();
    const org = await db.get("organizations", String(args.organizationId));
    const orgName = (org?.name as string | undefined) ?? "Twoja organizacja";

    const path = `/dashboard/gabinet/patients/${args.patientId}?tab=payments`;
    const deepLink = SITE_URL ? `${SITE_URL}${path}` : path;
    const amountLabel = formatCurrencyPLN(args.amount, "zł");
    const subject = `Prośba o autoryzację zwrotu ${amountLabel} — ${orgName}`;
    const notesLine = args.notes
      ? `<p style="margin: 0 0 16px; color: #444;">Uwagi: ${escapeHtml(args.notes)}</p>`
      : "";
    const notesText = args.notes ? `Uwagi: ${args.notes}\n\n` : "";

    const html = `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="margin: 0 0 16px; color: #1a1a1a;">Prośba o autoryzację zwrotu</h2>
        <p style="margin: 0 0 16px; color: #444;">
          <strong>${escapeHtml(args.requesterName)}</strong> prosi o autoryzację zwrotu
          <strong>${amountLabel}</strong> z salda klienta
          <strong>${escapeHtml(args.patientLabel)}</strong>.
        </p>
        ${notesLine}
        <p style="margin: 24px 0;">
          <a href="${deepLink}" style="background: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block; font-weight: 600; font-size: 14px;">
            Otwórz kartę pacjenta
          </a>
        </p>
        <p style="margin: 24px 0 0; color: #888; font-size: 13px;">
          Zatwierdź lub odrzuć zwrot na karcie pacjenta w zakładce „Płatności".
        </p>
      </div>
    `;
    const text = `${args.requesterName} prosi o autoryzację zwrotu ${amountLabel} z salda klienta ${args.patientLabel}.\n\n${notesText}Otwórz kartę pacjenta: ${deepLink}\n`;

    for (const admin of args.admins) {
      try {
        await sendEmail({
          to: admin.email,
          subject,
          html,
          text,
          log: {
            ctx,
            organizationId: args.organizationId,
            source: "system",
            recipientName: admin.name ?? undefined,
            relatedEntityType: "gabinetPatient",
            relatedEntityId: args.patientId,
          },
        });
      } catch (e) {
        console.error(
          `[_sendRefundAuthEmails] failed to send to ${admin.email}:`,
          e,
        );
      }
    }
  },
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Inline approve/reject for refund-authorization notifications (#1722).
 *
 * Each refund request fans out one notification per owner/admin with a
 * shared `metadata.requestId`. The notification bell calls these actions to
 * resolve a request without round-tripping to the patient page. Resolving
 * one admin's notification marks every sibling resolved too, so the others
 * stop seeing the pending CTA the moment the request is handled.
 */

type RefundAuthMetadata = {
  requestId: string;
  patientId: string;
  patientLabel: string;
  amount: number;
  notes: string | null;
  requesterId: string;
  requesterName: string;
  status: "pending" | "approved" | "rejected";
};

export const _loadRefundAuthNotification = internalQuery({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) return null;
    return {
      notificationId: notification._id,
      organizationId: notification.organizationId,
      userId: notification.userId,
      type: notification.type,
      metadata: (notification.metadata ?? null) as RefundAuthMetadata | null,
    };
  },
});

export const approveRefundAuth = action({
  args: {
    organizationId: v.id("organizations"),
    notificationId: v.id("notifications"),
    paymentMethod: v.optional(paymentMethodValidator),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      {
        organizationId: args.organizationId,
        feature: "gabinet_payments",
        action: "refund",
      },
    );
    if (!perm.allowed) {
      throw new Error(
        "REFUND_NOT_AUTHORIZED: requires gabinet_payments.refund",
      );
    }

    const loaded = await ctx.runQuery(
      internal.payments._loadRefundAuthNotification,
      { notificationId: args.notificationId },
    );
    if (!loaded) throw new Error("Notification not found");
    if (loaded.organizationId !== args.organizationId) {
      throw new Error("Notification belongs to a different organization");
    }
    if (loaded.userId !== authResult.userId) {
      throw new Error("Notification belongs to another user");
    }
    if (loaded.type !== "refund_authorization_requested" || !loaded.metadata) {
      throw new Error("Not a refund authorization notification");
    }
    if (loaded.metadata.status !== "pending") {
      throw new Error("Refund request already resolved");
    }

    const meta = loaded.metadata;
    const db = createSupabaseDb();
    const balance = await computePatientCreditBalance(
      db,
      String(args.organizationId),
      meta.patientId,
    );
    if (meta.amount > balance + 0.005) {
      throw new Error(
        `Refund amount ${meta.amount} exceeds available credit ${balance}`,
      );
    }

    // DB-level claim (#1730): atomically transition every sibling notification
    // for this requestId from "pending" → "approved" inside a single Convex
    // transaction. Two admins clicking Approve at the same time both pass the
    // JS-level check above, but only the first claim mutation lands — the
    // second sees status="approved" and throws before we touch Supabase.
    await ctx.runMutation(internal.payments._claimRefundAuthRequest, {
      organizationId: args.organizationId,
      callerId: authResult.userId,
      requestId: meta.requestId,
      decision: "approved",
    });

    const paymentMethod = args.paymentMethod ?? "cash";
    const now = Date.now();
    const paymentId = await db.insert("payments", {
      organizationId: String(args.organizationId),
      patientId: meta.patientId,
      appointmentId: null,
      packageUsageId: null,
      amount: meta.amount,
      currency: "PLN",
      paymentMethod,
      status: "completed",
      paidAt: now,
      notes: meta.notes ?? null,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
      kind: "credit_refund",
      creditEarned: -meta.amount,
    });

    await ctx.runMutation(internal.payments._resolveRefundAuthSideEffects, {
      organizationId: args.organizationId,
      approverId: authResult.userId,
      approverName:
        authResult.userName ?? authResult.userEmail ?? "Administrator",
      requestId: meta.requestId,
      requesterId: meta.requesterId,
      patientId: meta.patientId,
      patientLabel: meta.patientLabel,
      amount: meta.amount,
      decision: "approved",
      paymentId,
    });

    return { paymentId };
  },
});

export const rejectRefundAuth = action({
  args: {
    organizationId: v.id("organizations"),
    notificationId: v.id("notifications"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    // Reject is allowed for any owner/admin who received the notification.
    // We don't gate by gabinet_payments.refund — refusing a request is not
    // the same as authorizing one.
    if (authResult.role !== "owner" && authResult.role !== "admin") {
      throw new Error("Only owners or admins can reject refund requests");
    }

    const loaded = await ctx.runQuery(
      internal.payments._loadRefundAuthNotification,
      { notificationId: args.notificationId },
    );
    if (!loaded) throw new Error("Notification not found");
    if (loaded.organizationId !== args.organizationId) {
      throw new Error("Notification belongs to a different organization");
    }
    if (loaded.userId !== authResult.userId) {
      throw new Error("Notification belongs to another user");
    }
    if (loaded.type !== "refund_authorization_requested" || !loaded.metadata) {
      throw new Error("Not a refund authorization notification");
    }
    if (loaded.metadata.status !== "pending") {
      throw new Error("Refund request already resolved");
    }

    const meta = loaded.metadata;

    // DB-level claim (#1730): see approveRefundAuth for the full rationale.
    // We claim before side effects so two concurrent rejects can't both
    // generate a "rejected" requester notification and audit log entry.
    await ctx.runMutation(internal.payments._claimRefundAuthRequest, {
      organizationId: args.organizationId,
      callerId: authResult.userId,
      requestId: meta.requestId,
      decision: "rejected",
    });

    await ctx.runMutation(internal.payments._resolveRefundAuthSideEffects, {
      organizationId: args.organizationId,
      approverId: authResult.userId,
      approverName:
        authResult.userName ?? authResult.userEmail ?? "Administrator",
      requestId: meta.requestId,
      requesterId: meta.requesterId,
      patientId: meta.patientId,
      patientLabel: meta.patientLabel,
      amount: meta.amount,
      decision: "rejected",
      reason: args.reason,
    });

    return { ok: true };
  },
});

/**
 * Atomic DB-level claim for a refund-authorization request (#1730).
 *
 * Convex runs each mutation as a serializable transaction, so concurrent
 * callers cannot both observe `status === "pending"` here: the second one
 * sees the patched siblings and throws "Refund request already resolved"
 * before the action proceeds to insert a payment row in Supabase.
 *
 * Patches every sibling notification for `requestId` to the final decision
 * status, so any other admin that already had the bell open stops seeing the
 * inline Approve/Reject buttons the moment one of them lands.
 */
export const _claimRefundAuthRequest = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    callerId: v.id("users"),
    requestId: v.string(),
    decision: v.union(v.literal("approved"), v.literal("rejected")),
  },
  handler: async (ctx, args) => {
    const siblings = await ctx.db
      .query("notifications")
      .withIndex("by_orgAndType", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("type", "refund_authorization_requested"),
      )
      .collect();

    const matching = siblings.filter((n) => {
      const meta = n.metadata as RefundAuthMetadata | undefined;
      return meta?.requestId === args.requestId;
    });
    if (matching.length === 0) {
      throw new Error("Refund request notification not found");
    }
    if (
      matching.some(
        (n) => (n.metadata as RefundAuthMetadata).status !== "pending",
      )
    ) {
      throw new Error("Refund request already resolved");
    }

    for (const n of matching) {
      const meta = n.metadata as RefundAuthMetadata;
      await ctx.db.patch(n._id, {
        isRead: true,
        metadata: { ...meta, status: args.decision },
      });
    }
  },
});

export const _resolveRefundAuthSideEffects = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    approverId: v.id("users"),
    approverName: v.string(),
    requestId: v.string(),
    requesterId: v.string(),
    patientId: v.string(),
    patientLabel: v.string(),
    amount: v.number(),
    decision: v.union(v.literal("approved"), v.literal("rejected")),
    paymentId: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Sibling notifications are already patched to the decision status by
    // `_claimRefundAuthRequest` (called from the action before the Supabase
    // insert). This mutation only handles requester notification + audit log.

    // Tell the requester what happened so they don't keep refreshing the
    // patient page wondering whether their request landed.
    const requesterUserId = args.requesterId as Id<"users">;
    const amountLabel = formatCurrencyPLN(args.amount, "zł");
    const title =
      args.decision === "approved"
        ? "Zwrot zatwierdzony"
        : "Zwrot odrzucony";
    const baseMessage =
      args.decision === "approved"
        ? `${args.approverName} zatwierdził(a) zwrot ${amountLabel} dla klienta ${args.patientLabel}.`
        : `${args.approverName} odrzucił(a) prośbę o zwrot ${amountLabel} dla klienta ${args.patientLabel}.`;
    const message = args.reason
      ? `${baseMessage} (${args.reason})`
      : baseMessage;
    await createNotificationDirect(ctx, {
      organizationId: args.organizationId,
      userId: requesterUserId,
      type:
        args.decision === "approved"
          ? "refund_authorization_approved"
          : "refund_authorization_rejected",
      title,
      message,
      link: `/dashboard/gabinet/patients/${args.patientId}?tab=payments`,
    });

    await logAudit(ctx, {
      organizationId: args.organizationId,
      userId: args.approverId,
      action:
        args.decision === "approved"
          ? "refund_authorization_approved"
          : "refund_authorization_rejected",
      entityType: "payment",
      entityId: (args.paymentId ?? args.patientId) as any,
      details: JSON.stringify({
        requestId: args.requestId,
        patientId: args.patientId,
        amount: args.amount,
        paymentId: args.paymentId ?? null,
        reason: args.reason ?? null,
      }),
    });
  },
});
