// Dedicated actions for appointment-driven and standalone stock movements.
// Consolidates FEFO lot selection + multi-movement deduction so callers
// (e.g. gabinet/appointments.ts updateStatus) delegate the full inventory
// write sequence rather than reimplementing it inline.

import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { applyMovementInternal, selectFefoLotsForProduct } from "../inventory";
import { createSupabaseDb } from "../_helpers/supabaseDb";

// Deduct stock for a single product when an appointment is completed.
// Applies FEFO (First-Expired-First-Out) lot selection internally: if tracked
// lots exist they are drained in ascending expiry order; any remainder (or the
// full quantity when no lots exist) is written as an untracked movement.
// Returns { negativeStock: true } when any deduction pushes the balance below
// zero — callers should surface this as a warning rather than blocking.
export const consumeForAppointment = internalAction({
  args: {
    organizationId: v.string(),
    productId: v.string(),
    locationId: v.union(v.string(), v.null()),
    totalNeeded: v.number(),
    appointmentId: v.string(),
    treatmentId: v.optional(v.string()),
    performedBy: v.string(),
  },
  handler: async (_ctx, args): Promise<{ negativeStock: boolean }> => {
    const baseMovement = {
      organizationId: args.organizationId,
      productId: args.productId,
      locationId: args.locationId,
      reason: "appointment_use" as const,
      sourceType: "appointment",
      sourceId: args.appointmentId,
      treatmentId: args.treatmentId ?? null,
      performedBy: args.performedBy,
    };

    let negativeStock = false;

    const lots = await selectFefoLotsForProduct(
      args.productId,
      args.organizationId,
      args.locationId,
    );

    if (lots.length === 0) {
      const result = await applyMovementInternal({ ...baseMovement, delta: -args.totalNeeded });
      if (result.warning === "negative_stock") negativeStock = true;
    } else {
      let remaining = args.totalNeeded;
      for (const lot of lots) {
        if (remaining <= 0) break;
        const consume = Math.min(lot.quantity, remaining);
        const result = await applyMovementInternal({
          ...baseMovement,
          delta: -consume,
          lotNumber: lot.lotNumber,
          expiryDate: lot.expiryDate ?? undefined,
        });
        if (result.warning === "negative_stock") negativeStock = true;
        remaining -= consume;
      }
      if (remaining > 0) {
        // Lot stock exhausted before covering full quantity; deduct remainder without lot.
        const result = await applyMovementInternal({ ...baseMovement, delta: -remaining });
        if (result.warning === "negative_stock") negativeStock = true;
      }
    }

    return { negativeStock };
  },
});

// Return stock for a single appointment by inverting its original appointment_use
// movements. Preserves per-lot granularity so lot quantities are restored correctly.
// Idempotent: skips if appointment_return movements already exist for this appointment.
export const returnStockForAppointment = internalAction({
  args: {
    organizationId: v.string(),
    appointmentId: v.string(),
    performedBy: v.string(),
  },
  handler: async (_ctx, args): Promise<void> => {
    const db = createSupabaseDb();

    const { data: existingReturns } = await db.raw()
      .from("product_stock_movements")
      .select("id")
      .eq("source_type", "appointment")
      .eq("source_id", args.appointmentId)
      .eq("reason", "appointment_return")
      .limit(1);
    if (Array.isArray(existingReturns) && existingReturns.length > 0) return;

    const { data: useMovements } = await db.raw()
      .from("product_stock_movements")
      .select("product_id, delta, lot_number, expiry_date, location_id, treatment_id")
      .eq("source_type", "appointment")
      .eq("source_id", args.appointmentId)
      .eq("reason", "appointment_use");
    const movements = (useMovements ?? []) as Array<{
      product_id: string;
      delta: number;
      lot_number: string | null;
      expiry_date: string | null;
      location_id: string | null;
      treatment_id: string | null;
    }>;

    for (const mv of movements) {
      try {
        await applyMovementInternal({
          organizationId: args.organizationId,
          productId: mv.product_id,
          locationId: mv.location_id ?? null,
          delta: -Number(mv.delta), // original delta was negative; negating restores stock
          reason: "appointment_return",
          sourceType: "appointment",
          sourceId: args.appointmentId,
          lotNumber: mv.lot_number ?? undefined,
          expiryDate: mv.expiry_date ?? undefined,
          treatmentId: mv.treatment_id ?? undefined,
          performedBy: args.performedBy,
        });
      } catch (e) {
        console.warn(
          "[returnStockForAppointment] stock return failed for product",
          mv.product_id,
          ":",
          e,
        );
      }
    }
  },
});

// Sell a product directly without an appointment.
// Applies FEFO lot selection exactly like consumeForAppointment: if tracked
// lots exist they are drained in ascending expiry order; any remainder is
// written as an untracked movement. Returns { negativeStock: true } when the
// deduction pushes the balance below zero — callers should surface this as a
// warning, not a hard block (warn-and-allow, consistent with #1700 policy).
//
// clientId (optional) — stored as sourceId for later client-history queries.
// paymentMethod (optional) — stored in the dedicated payment_method column.
//   No undefined-client placeholder is created: absence of clientId is valid.
export const sellProductStandalone = action({
  args: {
    organizationId: v.string(),
    productId: v.string(),
    quantity: v.number(),
    salePrice: v.number(),
    locationId: v.union(v.string(), v.null()),
    clientId: v.optional(v.string()),
    paymentMethod: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ negativeStock: boolean }> => {
    const auth = await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_inventory", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    if (args.quantity <= 0) throw new Error("Quantity must be positive");
    if (args.salePrice < 0) throw new Error("Sale price must be non-negative");

    const baseMovement = {
      organizationId: String(args.organizationId),
      productId: args.productId,
      locationId: args.locationId,
      reason: "direct_sale" as const,
      sourceType: "direct_sale",
      sourceId: args.clientId ?? null,
      unitPrice: args.salePrice,
      paymentMethod: args.paymentMethod ?? null,
      performedBy: String(auth.userId),
    };

    let negativeStock = false;

    const lots = await selectFefoLotsForProduct(
      args.productId,
      String(args.organizationId),
      args.locationId,
    );

    if (lots.length === 0) {
      const result = await applyMovementInternal({ ...baseMovement, delta: -args.quantity });
      if (result.warning === "negative_stock") negativeStock = true;
    } else {
      let remaining = args.quantity;
      for (const lot of lots) {
        if (remaining <= 0) break;
        const consume = Math.min(lot.quantity, remaining);
        const result = await applyMovementInternal({
          ...baseMovement,
          delta: -consume,
          lotNumber: lot.lotNumber,
          expiryDate: lot.expiryDate ?? undefined,
        });
        if (result.warning === "negative_stock") negativeStock = true;
        remaining -= consume;
      }
      if (remaining > 0) {
        const result = await applyMovementInternal({ ...baseMovement, delta: -remaining });
        if (result.warning === "negative_stock") negativeStock = true;
      }
    }

    return { negativeStock };
  },
});
