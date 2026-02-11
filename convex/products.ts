import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { verifyOrgAccess } from "./_helpers/auth";
import { logActivity } from "./_helpers/activities";

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    if (args.search) {
      const results = await ctx.db
        .query("products")
        .withSearchIndex("search_products", (q) =>
          q.search("name", args.search!).eq("organizationId", args.organizationId)
        )
        .take(50);
      return { page: results, isDone: true, continueCursor: "" };
    }

    return await ctx.db
      .query("products")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getById = query({
  args: {
    organizationId: v.id("organizations"),
    productId: v.id("products"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const product = await ctx.db.get(args.productId);
    if (!product || product.organizationId !== args.organizationId) {
      throw new Error("Product not found");
    }

    return product;
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    sku: v.string(),
    unitPrice: v.number(),
    taxRate: v.number(),
    isActive: v.boolean(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const now = Date.now();

    const productId = await ctx.db.insert("products", {
      ...args,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "product",
      entityId: productId,
      action: "created",
      description: `Created product "${args.name}"`,
      performedBy: user._id,
    });

    return productId;
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    productId: v.id("products"),
    name: v.optional(v.string()),
    sku: v.optional(v.string()),
    unitPrice: v.optional(v.number()),
    taxRate: v.optional(v.number()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);

    const product = await ctx.db.get(args.productId);
    if (!product || product.organizationId !== args.organizationId) {
      throw new Error("Product not found");
    }

    const { organizationId, productId, ...updates } = args;
    await ctx.db.patch(productId, { ...updates, updatedAt: Date.now() });

    await logActivity(ctx, {
      organizationId,
      entityType: "product",
      entityId: productId,
      action: "updated",
      description: `Updated product "${product.name}"`,
      performedBy: user._id,
    });

    return productId;
  },
});

export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    productId: v.id("products"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);

    const product = await ctx.db.get(args.productId);
    if (!product || product.organizationId !== args.organizationId) {
      throw new Error("Product not found");
    }

    // Remove deal-product associations
    const dealProducts = await ctx.db
      .query("dealProducts")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();
    for (const dp of dealProducts) {
      await ctx.db.delete(dp._id);
    }

    await ctx.db.delete(args.productId);

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "product",
      entityId: args.productId,
      action: "deleted",
      description: `Deleted product "${product.name}"`,
      performedBy: user._id,
    });

    return args.productId;
  },
});

export const toggleActive = mutation({
  args: {
    organizationId: v.id("organizations"),
    productId: v.id("products"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);

    const product = await ctx.db.get(args.productId);
    if (!product || product.organizationId !== args.organizationId) {
      throw new Error("Product not found");
    }

    await ctx.db.patch(args.productId, {
      isActive: !product.isActive,
      updatedAt: Date.now(),
    });

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "product",
      entityId: args.productId,
      action: "updated",
      description: `${product.isActive ? "Deactivated" : "Activated"} product "${product.name}"`,
      performedBy: user._id,
    });

    return args.productId;
  },
});

export const listByDeal = query({
  args: {
    organizationId: v.id("organizations"),
    dealId: v.id("leads"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const dealProducts = await ctx.db
      .query("dealProducts")
      .withIndex("by_deal", (q) => q.eq("dealId", args.dealId))
      .collect();

    const products = await Promise.all(
      dealProducts.map(async (dp) => {
        const product = await ctx.db.get(dp.productId);
        return { ...dp, product };
      })
    );

    return products;
  },
});

export const addToDeal = mutation({
  args: {
    organizationId: v.id("organizations"),
    dealId: v.id("leads"),
    productId: v.id("products"),
    quantity: v.number(),
    unitPrice: v.number(),
    discount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);

    const deal = await ctx.db.get(args.dealId);
    if (!deal || deal.organizationId !== args.organizationId) {
      throw new Error("Deal not found");
    }

    const product = await ctx.db.get(args.productId);
    if (!product || product.organizationId !== args.organizationId) {
      throw new Error("Product not found");
    }

    const dealProductId = await ctx.db.insert("dealProducts", {
      organizationId: args.organizationId,
      dealId: args.dealId,
      productId: args.productId,
      quantity: args.quantity,
      unitPrice: args.unitPrice,
      discount: args.discount,
      createdAt: Date.now(),
    });

    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "lead",
      entityId: args.dealId,
      action: "updated",
      description: `Added product "${product.name}" to deal`,
      performedBy: user._id,
    });

    return dealProductId;
  },
});

export const removeFromDeal = mutation({
  args: {
    organizationId: v.id("organizations"),
    dealProductId: v.id("dealProducts"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);

    const dealProduct = await ctx.db.get(args.dealProductId);
    if (!dealProduct || dealProduct.organizationId !== args.organizationId) {
      throw new Error("Deal product not found");
    }

    await ctx.db.delete(args.dealProductId);

    const product = await ctx.db.get(dealProduct.productId);
    await logActivity(ctx, {
      organizationId: args.organizationId,
      entityType: "lead",
      entityId: dealProduct.dealId,
      action: "updated",
      description: `Removed product "${product?.name ?? "unknown"}" from deal`,
      performedBy: user._id,
    });

    return args.dealProductId;
  },
});
