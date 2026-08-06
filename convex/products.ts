import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";
import { logActivity } from "./_helpers/activities";
import { Id } from "./_generated/dataModel";
import type { SupabaseRow } from "./_helpers/supabaseRows";
import { applyMovementInternal } from "./inventory";

type DealProductRow = SupabaseRow<"dealProducts">;
type ProductRow = SupabaseRow<"products">;

export interface DealProductWithProduct extends DealProductRow {
  product: ProductRow | null;
}

// Dual-write refs removed — Supabase is now primary for product writes
// list and getById were removed: they used legacy ctx.db reads and returned empty results
// since product data lives in Supabase. Use useSupabaseProductsList hook instead.

export const create = action({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    sku: v.string(),
    unitPrice: v.number(),
    taxRate: v.optional(v.union(v.number(), v.null())),
    taxExempt: v.optional(v.union(v.boolean(), v.null())),
    isActive: v.boolean(),
    description: v.optional(v.union(v.string(), v.null())),
    tagIds: v.optional(v.union(v.array(v.string()), v.null())),
    categoryId: v.optional(v.union(v.string(), v.null())),
    trackStock: v.optional(v.union(v.boolean(), v.null())),
    stockUnit: v.optional(v.union(v.string(), v.null())),
    initialStock: v.optional(v.union(v.number(), v.null())),
    productSection: v.optional(v.union(v.string(), v.null())),
    minStock: v.optional(v.union(v.number(), v.null())),
    manufacturer: v.optional(v.union(v.string(), v.null())),
    catalogNumber: v.optional(v.union(v.string(), v.null())),
    stockNote: v.optional(v.union(v.string(), v.null())),
    purchasePrice: v.optional(v.union(v.number(), v.null())),
    salePrice: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "products", action: "create" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const now = Date.now();
    const db = createSupabaseDb();

    const trackStock = args.trackStock ?? false;

    const insertRow: Record<string, unknown> = {
      organizationId: String(args.organizationId),
      name: args.name,
      sku: args.sku,
      unitPrice: args.unitPrice,
      taxRate: args.taxExempt === true ? null : args.taxRate ?? null,
      isActive: args.isActive,
      description: args.description ?? null,
      tagIds: args.tagIds ?? null,
      categoryId: args.categoryId ?? null,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    };
    // migration 00006
    if (args.taxExempt === true) insertRow.taxExempt = true;
    // migration 00013
    insertRow.trackStock = trackStock;
    if (args.stockUnit != null) insertRow.stockUnit = args.stockUnit;
    // migration 00019
    if (args.productSection != null) insertRow.productSection = args.productSection;
    // migration 00020
    if (args.minStock != null) insertRow.minStock = args.minStock;
    if (args.manufacturer != null) insertRow.manufacturer = args.manufacturer;
    if (args.catalogNumber != null) insertRow.catalogNumber = args.catalogNumber;
    if (args.stockNote != null) insertRow.stockNote = args.stockNote;
    // migration 00050
    if (args.purchasePrice != null) insertRow.purchasePrice = args.purchasePrice;
    // migration 00066
    if (args.salePrice != null) insertRow.salePrice = args.salePrice;

    const productId = await db.insert("products", insertRow);

    // Seed an initial stock movement when the product opts into tracking with
    // a non-zero starting balance. We do this even if trackStock=false but the
    // user provided an initial number, so the history reflects the intent.
    const initial = args.initialStock ?? null;
    if (initial !== null && initial !== 0) {
      try {
        await applyMovementInternal({
          organizationId: String(args.organizationId),
          productId,
          locationId: null,
          delta: initial,
          reason: "initial",
          unitPrice: args.purchasePrice ?? undefined,
          performedBy: String(authResult.userId),
        });
      } catch (e) {
        console.error("[products.create] initial stock seed FAILED:", e);
      }
    }

    try {
      await ctx.runMutation(internal.products._createSideEffects, {
        productId,
        organizationId: args.organizationId,
        name: args.name,
        createdBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[products.create] Side effects FAILED for product", productId, ":", e);
    }

    return productId;
  },
});

export const _createSideEffects = internalMutation({
  args: {
    productId: v.string(),
    organizationId: v.id("organizations"),
    name: v.string(),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "product",
      entityId: args.productId,
      action: "created",
      description: `Created product "${args.name}"`,
      performedBy: args.createdBy as Id<"users">,
    });
  },
});

export const update = action({
  args: {
    organizationId: v.id("organizations"),
    productId: v.string(),
    name: v.optional(v.string()),
    sku: v.optional(v.string()),
    unitPrice: v.optional(v.number()),
    taxRate: v.optional(v.union(v.number(), v.null())),
    taxExempt: v.optional(v.union(v.boolean(), v.null())),
    description: v.optional(v.union(v.string(), v.null())),
    tagIds: v.optional(v.union(v.array(v.string()), v.null())),
    categoryId: v.optional(v.union(v.string(), v.null())),
    trackStock: v.optional(v.union(v.boolean(), v.null())),
    stockUnit: v.optional(v.union(v.string(), v.null())),
    productSection: v.optional(v.union(v.string(), v.null())),
    minStock: v.optional(v.union(v.number(), v.null())),
    manufacturer: v.optional(v.union(v.string(), v.null())),
    catalogNumber: v.optional(v.union(v.string(), v.null())),
    stockNote: v.optional(v.union(v.string(), v.null())),
    purchasePrice: v.optional(v.union(v.number(), v.null())),
    salePrice: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "products", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    const product = await db.get("products", args.productId);
    if (!product || String(product.organizationId) !== String(args.organizationId)) {
      throw new Error("Product not found");
    }
    if (perm.scope === "own" && String(product.createdBy) !== String(authResult.userId)) {
      throw new Error("Permission denied: you can only edit your own records");
    }

    const { organizationId, productId, ...updates } = args;

    const patchPayload: Record<string, unknown> = { updatedAt: Date.now() };

    if (updates.name !== undefined) patchPayload.name = updates.name;
    if (updates.sku !== undefined) patchPayload.sku = updates.sku;
    if (updates.unitPrice !== undefined) patchPayload.unitPrice = updates.unitPrice;
    if (updates.description !== undefined) patchPayload.description = updates.description;
    if (updates.tagIds !== undefined) patchPayload.tagIds = updates.tagIds;
    if (updates.categoryId !== undefined) patchPayload.categoryId = updates.categoryId;
    if (updates.taxRate !== undefined && updates.taxExempt !== true) patchPayload.taxRate = updates.taxRate;

    if (updates.taxExempt === true) {
      patchPayload.taxExempt = true;
      patchPayload.taxRate = null;
    } else if (updates.taxExempt === false) {
      patchPayload.taxExempt = false;
    }
    if (updates.trackStock !== undefined) patchPayload.trackStock = updates.trackStock;
    if (updates.stockUnit !== undefined) patchPayload.stockUnit = updates.stockUnit;
    if (updates.productSection !== undefined) patchPayload.productSection = updates.productSection;
    if (updates.minStock !== undefined) patchPayload.minStock = updates.minStock;
    if (updates.manufacturer !== undefined) patchPayload.manufacturer = updates.manufacturer;
    if (updates.catalogNumber !== undefined) patchPayload.catalogNumber = updates.catalogNumber;
    if (updates.stockNote !== undefined) patchPayload.stockNote = updates.stockNote;
    if (updates.purchasePrice != null) patchPayload.purchasePrice = updates.purchasePrice;
    if (updates.salePrice != null) patchPayload.salePrice = updates.salePrice;

    await db.patch("products", productId, patchPayload);

    try {
      await ctx.runMutation(internal.products._updateSideEffects, {
        productId,
        organizationId,
        name: (product.name as string) ?? "",
        updatedBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[products.update] Side effects FAILED for product", productId, ":", e);
    }

    return productId;
  },
});

export const _updateSideEffects = internalMutation({
  args: {
    productId: v.string(),
    organizationId: v.id("organizations"),
    name: v.string(),
    updatedBy: v.string(),
  },
  handler: async (ctx, args) => {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "product",
      entityId: args.productId,
      action: "updated",
      description: `Updated product "${args.name}"`,
      performedBy: args.updatedBy as Id<"users">,
    });
  },
});

export const remove = action({
  args: {
    organizationId: v.id("organizations"),
    productId: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "products", action: "delete" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    const product = await db.get("products", args.productId);
    if (!product || String(product.organizationId) !== String(args.organizationId)) {
      throw new Error("Product not found");
    }
    if (perm.scope === "own" && String(product.createdBy) !== String(authResult.userId)) {
      throw new Error("Permission denied: you can only delete your own records");
    }

    // Remove deal-product associations from Supabase before deleting the product
    const { error: assocError } = await db.raw()
      .from("deal_products")
      .delete()
      .eq("product_id", args.productId);
    if (assocError) throw new Error(`Failed to remove deal-product associations: ${assocError.message}`);

    // Delete from Supabase
    await db.delete("products", args.productId);

    try {
      await ctx.runMutation(internal.products._removeSideEffects, {
        productId: args.productId,
        organizationId: args.organizationId,
        name: (product.name as string) ?? "",
        deletedBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[products.remove] Side effects FAILED for product", args.productId, ":", e);
    }

    return args.productId;
  },
});

export const _removeSideEffects = internalMutation({
  args: {
    productId: v.string(),
    organizationId: v.id("organizations"),
    name: v.string(),
    deletedBy: v.string(),
  },
  handler: async (ctx, args) => {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "product",
      entityId: args.productId,
      action: "deleted",
      description: `Deleted product "${args.name}"`,
      performedBy: args.deletedBy as Id<"users">,
    });
  },
});

export const toggleActive = action({
  args: {
    organizationId: v.id("organizations"),
    productId: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "products", action: "edit" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    const product = await db.get("products", args.productId);
    if (!product || String(product.organizationId) !== String(args.organizationId)) {
      throw new Error("Product not found");
    }
    if (perm.scope === "own" && String(product.createdBy) !== String(authResult.userId)) {
      throw new Error("Permission denied: you can only edit your own records");
    }

    const newIsActive = !product.isActive;
    await db.patch("products", args.productId, {
      isActive: newIsActive,
      updatedAt: Date.now(),
    });

    try {
      await ctx.runMutation(internal.products._toggleActiveSideEffects, {
        productId: args.productId,
        organizationId: args.organizationId,
        name: (product.name as string) ?? "",
        wasActive: !!product.isActive,
        updatedBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[products.toggleActive] Side effects FAILED for product", args.productId, ":", e);
    }

    return args.productId;
  },
});

export const _toggleActiveSideEffects = internalMutation({
  args: {
    productId: v.string(),
    organizationId: v.id("organizations"),
    name: v.string(),
    wasActive: v.boolean(),
    updatedBy: v.string(),
  },
  handler: async (ctx, args) => {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "product",
      entityId: args.productId,
      action: "updated",
      description: `${args.wasActive ? "Deactivated" : "Activated"} product "${args.name}"`,
      performedBy: args.updatedBy as Id<"users">,
    });
  },
});

export const listByDeal = action({
  args: {
    organizationId: v.id("organizations"),
    dealId: v.string(),
  },
  handler: async (ctx, args): Promise<DealProductWithProduct[]> => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runAction(internal._helpers.authAction.checkPermission, {
      organizationId: args.organizationId,
      feature: "products",
      action: "view",
    }) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();
    const dealProducts = await db
      .query<DealProductRow>("dealProducts")
      .eq("dealId", args.dealId)
      .collect();

    const products = await Promise.all(
      dealProducts.map(async (dp) => {
        const product = await db
          .get<ProductRow>("products", String(dp.productId))
          .catch(() => null);
        return { ...dp, product };
      }),
    );

    return products;
  },
});

export const addToDeal = action({
  args: {
    organizationId: v.id("organizations"),
    dealId: v.string(),
    productId: v.string(),
    quantity: v.number(),
    unitPrice: v.number(),
    discount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "products", action: "create" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    // Verify deal and product exist in Supabase
    const deal = await db.get("leads", args.dealId);
    if (!deal || String(deal.organizationId) !== String(args.organizationId)) {
      throw new Error("Deal not found");
    }

    const product = await db.get("products", args.productId);
    if (!product || String(product.organizationId) !== String(args.organizationId)) {
      throw new Error("Product not found");
    }

    const now = Date.now();
    const dealProductId = await db.insert("dealProducts", {
      organizationId: String(args.organizationId),
      dealId: args.dealId,
      productId: args.productId,
      quantity: args.quantity,
      unitPrice: args.unitPrice,
      discount: args.discount ?? null,
      createdAt: now,
    });

    try {
      await ctx.runMutation(internal.products._addToDealSideEffects, {
        organizationId: args.organizationId,
        dealId: args.dealId,
        productName: (product.name as string) ?? "",
        addedBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[products.addToDeal] Side effects FAILED:", e);
    }

    return dealProductId;
  },
});

export const _addToDealSideEffects = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    dealId: v.string(),
    productName: v.string(),
    addedBy: v.string(),
  },
  handler: async (ctx, args) => {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "lead",
      entityId: args.dealId,
      action: "updated",
      description: `Added product "${args.productName}" to deal`,
      performedBy: args.addedBy as Id<"users">,
    });
  },
});

export const removeFromDeal = action({
  args: {
    organizationId: v.id("organizations"),
    dealProductId: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runAction(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "products", action: "delete" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const db = createSupabaseDb();

    const dealProduct = await db.get("dealProducts", args.dealProductId);
    if (!dealProduct || String(dealProduct.organizationId) !== String(args.organizationId)) {
      throw new Error("Deal product not found");
    }

    // Get product name before deletion for activity log
    const product = await db.get("products", String(dealProduct.productId));

    await db.delete("dealProducts", args.dealProductId);

    try {
      await ctx.runMutation(internal.products._removeFromDealSideEffects, {
        organizationId: args.organizationId,
        dealId: String(dealProduct.dealId),
        productName: (product?.name as string) ?? "unknown",
        removedBy: String(authResult.userId),
      });
    } catch (e) {
      console.error("[products.removeFromDeal] Side effects FAILED:", e);
    }

    return args.dealProductId;
  },
});

export const _removeFromDealSideEffects = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    dealId: v.string(),
    productName: v.string(),
    removedBy: v.string(),
  },
  handler: async (ctx, args) => {
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "lead",
      entityId: args.dealId,
      action: "updated",
      description: `Removed product "${args.productName}" from deal`,
      performedBy: args.removedBy as Id<"users">,
    });
  },
});
