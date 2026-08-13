// Dedicated internal actions for appointment-driven stock movements.
// Consolidates FEFO lot selection + multi-movement deduction so callers
// (e.g. gabinet/appointments.ts updateStatus) delegate the full inventory
// write sequence rather than reimplementing it inline.

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { applyMovementInternal, selectFefoLotsForProduct } from "../inventory";

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
