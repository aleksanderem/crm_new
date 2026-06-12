import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { logAudit } from "./auditLog";
import { logActivity } from "./_helpers/activities";
import { createNotificationDirect } from "./notifications";

const paymentMethodValidator = v.union(
  v.literal("cash"),
  v.literal("card"),
  v.literal("transfer"),
  v.literal("package"),
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

    const paymentId = await db.insert("payments", {
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
      creditEarned,
      creditApplied,
      kind: "payment",
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

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
      creditEarned: -args.amount,
      creditApplied: null,
      kind: "credit_refund",
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
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
 * request in the audit log and notifies every owner/admin in the org with a
 * link back to the patient. The admin then approves by clicking through and
 * executing `refundCredit` from the UI.
 *
 * Note: email delivery and a single-click email-link approval flow are
 * tracked as a follow-up. The notification-based flow ships first so refund
 * gating works end-to-end immediately.
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

    await ctx.runMutation(internal.payments._requestRefundAuthSideEffects, {
      organizationId: args.organizationId,
      requesterId: authResult.userId,
      requesterName: authResult.userName ?? authResult.userEmail ?? "Pracownik",
      patientId: args.patientId,
      patientLabel,
      amount: args.amount,
      notes: args.notes,
    });

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

    const adminIds = memberships
      .filter((m) => m.role === "owner" || m.role === "admin")
      .map((m) => m.userId);

    const message = `${args.requesterName} prosi o autoryzację zwrotu ${args.amount.toFixed(2)} zł z salda klienta ${args.patientLabel}${args.notes ? ` (${args.notes})` : ""}.`;
    const link = `/dashboard/gabinet/patients/${args.patientId}?tab=payments`;

    for (const userId of adminIds) {
      await createNotificationDirect(ctx, {
        organizationId: args.organizationId,
        userId,
        type: "refund_authorization_requested",
        title: "Prośba o autoryzację zwrotu",
        message,
        link,
      });
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
  },
});

/** Revenue summary for a time range */
export const getRevenueSummary = action({
  args: {
    organizationId: v.id("organizations"),
    startDate: v.number(),
    endDate: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const payments = await db
      .query<{
        amount: number;
        paymentMethod: string;
        paidAt: number | null;
      }>("payments")
      .eq("organizationId", String(args.organizationId))
      .eq("status", "completed")
      .gte("paidAt", args.startDate)
      .lte("paidAt", args.endDate)
      .collect();

    const total = payments.reduce((sum, p) => sum + p.amount, 0);
    const count = payments.length;

    const byMethod: Record<string, { count: number; total: number }> = {};
    for (const p of payments) {
      if (!byMethod[p.paymentMethod]) {
        byMethod[p.paymentMethod] = { count: 0, total: 0 };
      }
      byMethod[p.paymentMethod].count++;
      byMethod[p.paymentMethod].total += p.amount;
    }

    return { total, count, byMethod };
  },
});
