import { query, action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { verifyOrgAccess } from "./_helpers/auth";
import { logActivity } from "./_helpers/activities";
import { checkPermission } from "./_helpers/permissions";
import { Id } from "./_generated/dataModel";
import type { SupabaseRow } from "./_helpers/supabaseRows";
import { applyMovementInternal } from "./inventory";

type DealProductRow = SupabaseRow<"dealProducts">;
type ProductRow = SupabaseRow<"products">;

export interface DealProductWithProduct extends DealProductRow {
  product: ProductRow | null;
}

// Dual-write refs removed — Supabase is now primary for product writes

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "products", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const result = await ctx.db
      .query("products")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .paginate(args.paginationOpts);
    if (perm.scope === "own") {
      return { ...result, page: result.page.filter((r) => r.createdBy === user._id) };
    }
    return result;
  },
});

export const getById = query({
  args: {
    organizationId: v.id("organizations"),
    productId: v.id("products"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "products", "view");
    if (!perm.allowed) throw new Error("Permission denied");

    const product = await ctx.db.get(args.productId);
    if (!product || product.organizationId !== args.organizationId) {
      throw new Error("Product not found");
    }
    if (perm.scope === "own" && product.createdBy !== user._id) {
      throw new Error("Permission denied");
    }

    return product;
  },
});

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
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
      internal._helpers.authAction.checkPermission,
      { organizationId: args.organizationId, feature: "products", action: "create" },
    ) as { allowed: boolean; scope: string };
    if (!perm.allowed) throw new Error("Permission denied");

    const now = Date.now();
    const db = createSupabaseDb();

    const trackStock = args.trackStock ?? false;
    const productId = await db.insert("products", {
      organizationId: String(args.organizationId),
      name: args.name,
      sku: args.sku,
      unitPrice: args.unitPrice,
      taxRate: args.taxExempt ? null : args.taxRate ?? null,
      taxExempt: args.taxExempt ?? null,
      isActive: args.isActive,
      description: args.description ?? null,
      tagIds: args.tagIds ?? null,
      categoryId: args.categoryId ?? null,
      trackStock,
      stockUnit: args.stockUnit ?? null,
      productSection: args.productSection ?? null,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

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
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
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
    const patchPayload: Record<string, unknown> = { ...updates, updatedAt: Date.now() };
    if (updates.taxExempt === true) {
      patchPayload.taxRate = null;
    }
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
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
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

    // Remove deal-product associations via internalMutation (needs ctx.db)
    await ctx.runMutation(internal.products._removeDealProducts, {
      productId: args.productId,
    });

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

export const _removeDealProducts = internalMutation({
  args: { productId: v.string() },
  handler: async (ctx, args) => {
    const dealProducts = await ctx.db
      .query("dealProducts")
      .withIndex("by_product", (q) => q.eq("productId", args.productId as Id<"products">))
      .collect();
    for (const dp of dealProducts) {
      await ctx.db.delete(dp._id);
    }
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
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
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
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const perm = await ctx.runQuery(internal._helpers.authAction.checkPermission, {
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
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
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
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const perm = await ctx.runQuery(
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
