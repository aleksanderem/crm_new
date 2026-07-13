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
import type { Id } from "./_generated/dataModel";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { applyMovementInternal } from "./inventory";
import type { SupabaseRow } from "./_helpers/supabaseRows";

type DeliveryRow = SupabaseRow<"warehouseDeliveries">;
type DeliveryItemRow = SupabaseRow<"warehouseDeliveryItems">;

// Throws if the same (productId, lotNumber) pair appears more than once within
// a single delivery. Cross-delivery duplicates are allowed per issue #2989.
function checkDuplicateLot(
  items: Array<{ productId: string; lotNumber?: string | null }>,
): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (!item.lotNumber) continue;
    const key = `${item.productId}::${item.lotNumber}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate LOT "${item.lotNumber}" for the same product within this delivery`);
    }
    seen.add(key);
  }
}

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

export interface InvoicePageUrl {
  url: string | null;
  mimeType: string;
  position: number;
}

export interface DeliveryWithUrls {
  delivery: DeliveryRow;
  items: DeliveryItemRow[];
  invoicePageUrls: InvoicePageUrl[];
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
  handler: async (ctx, args): Promise<DeliveryWithUrls> => {
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

    const rawPages = Array.isArray(delivery.invoicePages)
      ? (delivery.invoicePages as Array<{ storageId: string; mimeType: string; position: number }>)
          .slice()
          .sort((a, b) => a.position - b.position)
      : [];
    const invoicePageUrls: InvoicePageUrl[] = await Promise.all(
      rawPages.map(async (p) => ({
        url: await ctx.storage.getUrl(p.storageId as unknown as Id<"_storage">),
        mimeType: p.mimeType,
        position: p.position,
      })),
    );

    return { delivery, items, invoicePageUrls };
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
      lotNumber: v.optional(v.string()),
      expiryDate: v.optional(v.string()),
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

    // Block duplicate LOT within the same delivery (same product + same lot number)
    checkDuplicateLot(args.items);

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
        lotNumber: item.lotNumber ?? null,
        expiryDate: item.expiryDate ?? null,
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
      lotNumber: v.optional(v.string()),
      expiryDate: v.optional(v.string()),
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
      checkDuplicateLot(args.items);
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
          lotNumber: item.lotNumber ?? null,
          expiryDate: item.expiryDate ?? null,
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

    const invoicePages = Array.isArray(delivery.invoicePages)
      ? (delivery.invoicePages as Array<{ storageId: string }>)
      : [];
    for (const page of invoicePages) {
      await ctx.storage.delete(page.storageId as unknown as Id<"_storage">);
    }

    await db.delete("warehouseDeliveries", args.deliveryId);
  },
});

// Creates a draft delivery pre-linked to uploaded invoice pages (#3016).
// Unlike createDelivery, items are not required — the invoice content will be
// filled in manually or via OCR in a subsequent step.
export const createDeliveryFromInvoice = action({
  args: {
    organizationId: v.id("organizations"),
    pages: v.array(v.object({
      storageId: v.string(),
      mimeType: v.string(),
      position: v.number(),
    })),
    supplierName: v.optional(v.string()),
    invoiceNumber: v.optional(v.string()),
    deliveryDate: v.optional(v.string()),
    locationId: v.optional(v.id("gabinetLocations")),
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

    if (args.pages.length === 0) {
      throw new Error("At least one invoice page is required");
    }

    const db = createSupabaseDb();
    const now = Date.now();

    const deliveryId = await db.insert("warehouseDeliveries", {
      organizationId: String(args.organizationId),
      supplierName: args.supplierName ?? null,
      invoiceNumber: args.invoiceNumber ?? null,
      deliveryDate: args.deliveryDate ?? null,
      locationId: args.locationId ?? null,
      notes: null,
      status: "draft",
      totalValue: null,
      totalValueGross: null,
      invoicePages: args.pages,
      createdBy: String(auth.userId),
      createdAt: now,
      updatedAt: now,
    });

    return { deliveryId };
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
        lotNumber: item.lotNumber ? String(item.lotNumber) : undefined,
        expiryDate: item.expiryDate ? String(item.expiryDate) : undefined,
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
