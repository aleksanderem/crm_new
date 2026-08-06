// Product inventory backend (#1700 PR-A).
//
// "Foundation" layer: lets callers read current stock for a product, adjust it
// manually with a reason + audit row, and page through the movement history.
// Higher-level integrations (Gabinet visit settle deducting stock, CRM deal
// close deducting stock) come in later phases and will call `applyMovement`
// from their own actions instead of going through `adjustStock`.

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import type { SupabaseRow } from "./_helpers/supabaseRows";

type StockLevelRow = SupabaseRow<"productStockLevels">;
type StockMovementRow = SupabaseRow<"productStockMovements">;
type ProductRow = SupabaseRow<"products">;

const REASON_VALIDATOR = v.union(
  v.literal("initial"),
  v.literal("warehouse_receive"),
  v.literal("manual_adjust"),
  v.literal("inventory_adjustment"),
  v.literal("appointment_use"),
  v.literal("appointment_return"),
  v.literal("deal_close"),
  v.literal("deal_reopen"),
  v.literal("transfer_in"),
  v.literal("transfer_out"),
  v.literal("other"),
);

export interface ProductStockSummary {
  productId: string;
  trackStock: boolean;
  total: number;
  byLocation: Array<{ locationId: string | null; quantity: number }>;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getStockSummary = action({
  args: {
    organizationId: v.id("organizations"),
    productId: v.string(),
  },
  handler: async (ctx, args): Promise<ProductStockSummary> => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_inventory", action: "view" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    return await loadStockSummary(args.productId, args.organizationId);
  },
});

export const listMovements = action({
  args: {
    organizationId: v.id("organizations"),
    productId: v.optional(v.string()),
    reason: v.optional(REASON_VALIDATOR),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<StockMovementRow[]> => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_inventory", action: "view" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const limit = Math.max(1, Math.min(args.limit ?? 100, 500));
    let query = db
      .query<StockMovementRow>("productStockMovements")
      .eq("organizationId", String(args.organizationId));
    if (args.productId) {
      query = query.eq("productId", args.productId);
    }
    if (args.reason) {
      query = query.eq("reason", args.reason);
    }
    return await query.order("createdAt", false).take(limit).collect();
  },
});

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export const adjustStock = action({
  args: {
    organizationId: v.id("organizations"),
    productId: v.string(),
    locationId: v.optional(v.union(v.id("gabinetLocations"), v.null())),
    delta: v.optional(v.number()),
    setTo: v.optional(v.number()),
    reason: v.optional(REASON_VALIDATOR),
    note: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args): Promise<{ movementId: string; balanceAfter: number; warning: string | null }> => {
    const auth = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_inventory", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    if (args.delta === undefined && args.setTo === undefined) {
      throw new Error("adjustStock requires either `delta` or `setTo`");
    }
    if (args.delta !== undefined && args.setTo !== undefined) {
      throw new Error("adjustStock accepts only one of `delta` or `setTo`");
    }

    const result = await applyMovementInternal({
      organizationId: String(args.organizationId),
      productId: args.productId,
      locationId: args.locationId ?? null,
      delta: args.delta,
      setTo: args.setTo,
      reason: args.reason ?? "manual_adjust",
      note: args.note ?? null,
      performedBy: String(auth.userId),
    });

    return result;
  },
});

// ---------------------------------------------------------------------------
// Shared helper — also re-exported for later phases (PR-C/D)
// ---------------------------------------------------------------------------

interface ApplyMovementParams {
  organizationId: string;
  productId: string;
  locationId: string | null;
  delta?: number;
  setTo?: number;
  reason: StockMovementRow["reason"];
  sourceType?: string | null;
  sourceId?: string | null;
  note?: string | null;
  unitPrice?: number | null;
  lotNumber?: string | null;
  expiryDate?: string | null;
  performedBy: string;
}

export async function applyMovementInternal(
  params: ApplyMovementParams,
): Promise<{ movementId: string; balanceAfter: number; warning: string | null }> {
  const db = createSupabaseDb();

  const product = await db.get<ProductRow>("products", params.productId);
  if (!product || String(product.organizationId) !== params.organizationId) {
    throw new Error("Product not found");
  }

  const existing = await db
    .query<StockLevelRow>("productStockLevels")
    .eq("productId", params.productId)
    .collect();
  const matchKey = (row: StockLevelRow) =>
    (row.locationId ?? null) === (params.locationId ?? null);
  const level = existing.find(matchKey);

  const trackStock = !!product.trackStock;
  const previousBalance = level ? Number(level.quantity) : 0;
  let resolvedDelta: number;
  let newBalance: number;
  if (params.setTo !== undefined) {
    newBalance = params.setTo;
    resolvedDelta = newBalance - previousBalance;
  } else {
    resolvedDelta = params.delta ?? 0;
    newBalance = previousBalance + resolvedDelta;
  }

  let warning: string | null = null;
  if (trackStock && newBalance < 0) {
    // Warn-and-allow (#1700): negative stock is permitted but the caller is
    // expected to surface this in the UI so staff can correct it.
    warning = "negative_stock";
  }

  // Weighted average net purchase price — updated only on warehouse receipts
  // with a known net price. Guards: no update on manual adjustments,
  // appointment use, etc. Division by zero prevented by the previousBalance ≤ 0
  // branch which resets to the new delivery price outright.
  let newAvgCost: number | null = null;
  if (
    (params.reason === "warehouse_receive" || params.reason === "initial") &&
    params.unitPrice != null &&
    resolvedDelta > 0
  ) {
    const existingAvgCost =
      level?.avgCost != null ? Number(level.avgCost) : null;
    if (!level || previousBalance <= 0 || existingAvgCost == null) {
      newAvgCost = params.unitPrice;
    } else {
      const denom = previousBalance + resolvedDelta;
      newAvgCost =
        (previousBalance * existingAvgCost + resolvedDelta * params.unitPrice) /
        denom;
    }
  }

  const now = Date.now();

  if (trackStock) {
    if (level) {
      await db.patch("productStockLevels", String(level._id), {
        quantity: newBalance,
        ...(newAvgCost !== null ? { avgCost: newAvgCost } : {}),
        updatedAt: now,
      });
    } else {
      await db.insert("productStockLevels", {
        organizationId: params.organizationId,
        productId: params.productId,
        locationId: params.locationId,
        quantity: newBalance,
        ...(newAvgCost !== null ? { avgCost: newAvgCost } : {}),
        updatedAt: now,
      });
    }
  }

  const snapshotPrice =
    params.unitPrice != null
      ? params.unitPrice
      : product.purchasePrice ?? null;

  const movementId = await db.insert("productStockMovements", {
    organizationId: params.organizationId,
    productId: params.productId,
    locationId: params.locationId,
    delta: resolvedDelta,
    balanceAfter: trackStock ? newBalance : null,
    reason: params.reason,
    sourceType: params.sourceType ?? null,
    sourceId: params.sourceId ?? null,
    note: params.note ?? null,
    unitPrice: snapshotPrice,
    ...(newAvgCost !== null ? { avgCostAfter: newAvgCost } : {}),
    ...(params.lotNumber ? { lotNumber: params.lotNumber } : {}),
    ...(params.expiryDate ? { expiryDate: params.expiryDate } : {}),
    performedBy: params.performedBy,
    createdAt: now,
  });

  return { movementId, balanceAfter: newBalance, warning };
}

// ---------------------------------------------------------------------------
// FEFO lot selection — used by appointment settlement to deduct lot stock in
// First-Expired-First-Out order. Returns batches sorted by expiry_date ASC
// (null expiry last) with quantity > 0. Scoped to the given locationId so that
// lot balances at location A are not consumed by appointments at location B.
// ---------------------------------------------------------------------------

export interface FefoLot {
  lotNumber: string;
  expiryDate: string | null;
  quantity: number;
}

export async function selectFefoLotsForProduct(
  productId: string,
  organizationId: string,
  locationId: string | null,
): Promise<FefoLot[]> {
  const db = createSupabaseDb();

  // Pull every movement that carries a lot_number for this product at this location.
  // warehouse_receive rows are positive; appointment_use rows are negative.
  // Summing deltas gives net quantity remaining per lot at the location.
  let query = db.raw()
    .from("product_stock_movements")
    .select("lot_number, expiry_date, delta")
    .eq("organization_id", organizationId)
    .eq("product_id", productId)
    .not("lot_number", "is", null);

  if (locationId !== null) {
    query = query.eq("location_id", locationId);
  } else {
    query = query.is("location_id", null);
  }

  const { data, error } = await query;

  if (error) throw new Error(`selectFefoLotsForProduct: ${error.message}`);

  type Row = { lot_number: string; expiry_date: string | null; delta: number };
  const rows = (data ?? []) as Row[];

  const map = new Map<string, FefoLot>();
  for (const row of rows) {
    const key = `${row.lot_number}::${row.expiry_date ?? ""}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += Number(row.delta);
    } else {
      map.set(key, {
        lotNumber: row.lot_number,
        expiryDate: row.expiry_date,
        quantity: Number(row.delta),
      });
    }
  }

  const batches = Array.from(map.values()).filter((b) => b.quantity > 0);

  // Sort FEFO: earliest expiry first, lots without expiry date last.
  batches.sort((a, b) => {
    if (a.expiryDate === null && b.expiryDate === null) return 0;
    if (a.expiryDate === null) return 1;
    if (b.expiryDate === null) return -1;
    return a.expiryDate < b.expiryDate ? -1 : a.expiryDate > b.expiryDate ? 1 : 0;
  });

  return batches;
}

async function loadStockSummary(
  productId: string,
  organizationId: string,
): Promise<ProductStockSummary> {
  const db = createSupabaseDb();
  const product = await db.get<ProductRow>("products", productId);
  if (!product || String(product.organizationId) !== organizationId) {
    throw new Error("Product not found");
  }
  const levels = await db
    .query<StockLevelRow>("productStockLevels")
    .eq("productId", productId)
    .collect();
  const byLocation = levels.map((row) => ({
    locationId: row.locationId ? String(row.locationId) : null,
    quantity: Number(row.quantity),
  }));
  const total = byLocation.reduce((sum, row) => sum + row.quantity, 0);
  return {
    productId,
    trackStock: !!product.trackStock,
    total,
    byLocation,
  };
}
