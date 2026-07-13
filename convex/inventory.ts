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
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runQuery(
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
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runQuery(
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
    const auth = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
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

  const now = Date.now();

  if (trackStock) {
    if (level) {
      await db.patch("productStockLevels", String(level._id), {
        quantity: newBalance,
        updatedAt: now,
      });
    } else {
      await db.insert("productStockLevels", {
        organizationId: params.organizationId,
        productId: params.productId,
        locationId: params.locationId,
        quantity: newBalance,
        updatedAt: now,
      });
    }
  }

  const snapshotPrice =
    params.unitPrice != null
      ? params.unitPrice
      : (product.purchasePrice as number | null | undefined) ?? null;

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
    performedBy: params.performedBy,
    createdAt: now,
  });

  return { movementId, balanceAfter: newBalance, warning };
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
