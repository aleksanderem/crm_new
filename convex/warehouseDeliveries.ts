// Warehouse deliveries backend (#2961).
//
// Manages goods-receipt documents: a delivery header with supplier / invoice
// metadata plus line items (one per product).  Posting a draft delivery writes
// one product_stock_movements row per item via applyMovementInternal and
// stamps the resulting movement_id back onto each item for cross-linking.
//
// Status lifecycle: draft → posted (one-way, irreversible from this layer).

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { applyMovementInternal } from "./inventory";
import type { SupabaseRow } from "./_helpers/supabaseRows";

type DeliveryRow = SupabaseRow<"warehouseDeliveries">;
type DeliveryItemRow = SupabaseRow<"warehouseDeliveryItems">;

function computeTotals(
  items: Array<{ quantity: number; unitPrice?: number | null; unitPriceGross?: number | null }>,
): { net: number | null; gross: number | null } {
  let net = 0, gross = 0;
  let hasNet = false, hasGross = false;
  for (const item of items) {
    if (item.unitPrice != null) {
      net += item.quantity * item.unitPrice;
      hasNet = true;
    }
    if (item.unitPriceGross != null) {
      gross += item.quantity * item.unitPriceGross;
      hasGross = true;
    }
  }
  return { net: hasNet ? net : null, gross: hasGross ? gross : null };
}

export interface DeliveryWithItems {
  delivery: DeliveryRow;
  items: DeliveryItemRow[];
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const listDeliveries = action({
  args: {
    organizationId: v.id("organizations"),
    status: v.optional(v.union(v.literal("draft"), v.literal("posted"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<DeliveryRow[]> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_inventory", action: "view" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const limit = Math.max(1, Math.min(args.limit ?? 50, 200));
    let query = db
      .query<DeliveryRow>("warehouseDeliveries")
      .eq("organizationId", String(args.organizationId));
    if (args.status) {
      query = query.eq("status", args.status);
    }
    return await query.order("createdAt", false).take(limit).collect();
  },
});

export const getDelivery = action({
  args: {
    organizationId: v.id("organizations"),
    deliveryId: v.string(),
  },
  handler: async (ctx, args): Promise<DeliveryWithItems> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_inventory", action: "view" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const delivery = await db.get<DeliveryRow>("warehouseDeliveries", args.deliveryId);
    if (!delivery || String(delivery.organizationId) !== String(args.organizationId)) {
      throw new Error("Delivery not found");
    }
    const items = await db
      .query<DeliveryItemRow>("warehouseDeliveryItems")
      .eq("deliveryId", args.deliveryId)
      .collect();
    return { delivery, items };
  },
});

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export const createDelivery = action({
  args: {
    organizationId: v.id("organizations"),
    supplierName: v.optional(v.string()),
    invoiceNumber: v.optional(v.string()),
    deliveryDate: v.optional(v.string()),
    locationId: v.optional(v.id("gabinetLocations")),
    notes: v.optional(v.string()),
    items: v.array(v.object({
      productId: v.string(),
      quantity: v.number(),
      unitPrice: v.optional(v.number()),
      vatRate: v.optional(v.number()),
      vatCode: v.optional(v.string()),
      unitPriceGross: v.optional(v.number()),
      lineValueNet: v.optional(v.number()),
      lineValueGross: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args): Promise<{ deliveryId: string }> => {
    const auth = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_inventory", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    if (args.items.length === 0) {
      throw new Error("Delivery must have at least one item");
    }

    const db = createSupabaseDb();
    const now = Date.now();

    const { net: totalValue, gross: totalValueGross } = computeTotals(args.items);

    const deliveryId = await db.insert("warehouseDeliveries", {
      organizationId: String(args.organizationId),
      supplierName: args.supplierName ?? null,
      invoiceNumber: args.invoiceNumber ?? null,
      deliveryDate: args.deliveryDate ?? null,
      locationId: args.locationId ?? null,
      notes: args.notes ?? null,
      status: "draft",
      totalValue,
      totalValueGross,
      createdBy: String(auth.userId),
      createdAt: now,
      updatedAt: now,
    });

    for (const item of args.items) {
      await db.insert("warehouseDeliveryItems", {
        organizationId: String(args.organizationId),
        deliveryId,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice ?? null,
        vatRate: item.vatRate ?? null,
        vatCode: item.vatCode ?? null,
        unitPriceGross: item.unitPriceGross ?? null,
        lineValueNet: item.lineValueNet ?? null,
        lineValueGross: item.lineValueGross ?? null,
        movementId: null,
        createdAt: now,
      });
    }

    return { deliveryId };
  },
});

export const updateDelivery = action({
  args: {
    organizationId: v.id("organizations"),
    deliveryId: v.string(),
    supplierName: v.optional(v.string()),
    invoiceNumber: v.optional(v.string()),
    deliveryDate: v.optional(v.string()),
    locationId: v.optional(v.id("gabinetLocations")),
    notes: v.optional(v.string()),
    items: v.optional(v.array(v.object({
      productId: v.string(),
      quantity: v.number(),
      unitPrice: v.optional(v.number()),
      vatRate: v.optional(v.number()),
      vatCode: v.optional(v.string()),
      unitPriceGross: v.optional(v.number()),
      lineValueNet: v.optional(v.number()),
      lineValueGross: v.optional(v.number()),
    }))),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_inventory", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const delivery = await db.get<DeliveryRow>("warehouseDeliveries", args.deliveryId);
    if (!delivery || String(delivery.organizationId) !== String(args.organizationId)) {
      throw new Error("Delivery not found");
    }
    if (delivery.status !== "draft") {
      throw new Error("Only draft deliveries can be edited");
    }

    const headerPatch: Record<string, unknown> = {
      supplierName: args.supplierName ?? null,
      invoiceNumber: args.invoiceNumber ?? null,
      deliveryDate: args.deliveryDate ?? null,
      locationId: args.locationId ?? null,
      notes: args.notes ?? null,
      updatedAt: Date.now(),
    };

    if (args.items !== undefined) {
      if (args.items.length === 0) {
        throw new Error("Delivery must have at least one item");
      }
      const { net: totalValue, gross: totalValueGross } = computeTotals(args.items);
      headerPatch.totalValue = totalValue;
      headerPatch.totalValueGross = totalValueGross;

      const existing = await db
        .query<DeliveryItemRow>("warehouseDeliveryItems")
        .eq("deliveryId", args.deliveryId)
        .collect();
      for (const item of existing) {
        await db.delete("warehouseDeliveryItems", String(item._id));
      }
      const now = Date.now();
      for (const item of args.items) {
        await db.insert("warehouseDeliveryItems", {
          organizationId: String(args.organizationId),
          deliveryId: args.deliveryId,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice ?? null,
          vatRate: item.vatRate ?? null,
          vatCode: item.vatCode ?? null,
          unitPriceGross: item.unitPriceGross ?? null,
          lineValueNet: item.lineValueNet ?? null,
          lineValueGross: item.lineValueGross ?? null,
          movementId: null,
          createdAt: now,
        });
      }
    }

    await db.patch("warehouseDeliveries", args.deliveryId, headerPatch);
  },
});

export const cancelDelivery = action({
  args: {
    organizationId: v.id("organizations"),
    deliveryId: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_inventory", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const delivery = await db.get<DeliveryRow>("warehouseDeliveries", args.deliveryId);
    if (!delivery || String(delivery.organizationId) !== String(args.organizationId)) {
      throw new Error("Delivery not found");
    }
    if (delivery.status !== "draft") {
      throw new Error("Only draft deliveries can be cancelled");
    }

    const items = await db
      .query<DeliveryItemRow>("warehouseDeliveryItems")
      .eq("deliveryId", args.deliveryId)
      .collect();
    for (const item of items) {
      await db.delete("warehouseDeliveryItems", String(item._id));
    }
    await db.delete("warehouseDeliveries", args.deliveryId);
  },
});

export const postDelivery = action({
  args: {
    organizationId: v.id("organizations"),
    deliveryId: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ movementsCreated: number }> => {
    const auth = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "gabinet_inventory", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const delivery = await db.get<DeliveryRow>("warehouseDeliveries", args.deliveryId);
    if (!delivery || String(delivery.organizationId) !== String(args.organizationId)) {
      throw new Error("Delivery not found");
    }
    if (delivery.status === "posted") {
      throw new Error("Delivery is already posted");
    }

    const items = await db
      .query<DeliveryItemRow>("warehouseDeliveryItems")
      .eq("deliveryId", args.deliveryId)
      .collect();

    const locationId = delivery.locationId ? String(delivery.locationId) : null;
    const noteText = args.note
      ?? (delivery.invoiceNumber ? `Delivery ${delivery.invoiceNumber}` : null);

    for (const item of items) {
      const { movementId } = await applyMovementInternal({
        organizationId: String(args.organizationId),
        productId: String(item.productId),
        locationId,
        delta: Number(item.quantity),
        reason: "warehouse_receive",
        sourceType: "warehouse_delivery",
        sourceId: args.deliveryId,
        note: noteText,
        unitPrice: item.unitPrice != null ? Number(item.unitPrice) : undefined,
        performedBy: String(auth.userId),
      });
      await db.patch("warehouseDeliveryItems", String(item._id), { movementId });
    }

    await db.patch("warehouseDeliveries", args.deliveryId, {
      status: "posted",
      updatedAt: Date.now(),
    });

    return { movementsCreated: items.length };
  },
});
