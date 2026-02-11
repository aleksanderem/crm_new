import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireOrgAdmin } from "./_helpers/auth";

export const batchCreateContacts = mutation({
  args: {
    organizationId: v.id("organizations"),
    records: v.array(
      v.object({
        firstName: v.string(),
        lastName: v.optional(v.string()),
        email: v.optional(v.string()),
        phone: v.optional(v.string()),
        title: v.optional(v.string()),
        source: v.optional(v.string()),
        tags: v.optional(v.array(v.string())),
        notes: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.organizationId);
    const now = Date.now();
    let created = 0;
    const errors: { row: number; error: string }[] = [];

    for (let i = 0; i < args.records.length; i++) {
      const record = args.records[i];
      try {
        if (!record.firstName?.trim()) {
          errors.push({ row: i, error: "firstName is required" });
          continue;
        }
        await ctx.db.insert("contacts", {
          organizationId: args.organizationId,
          firstName: record.firstName.trim(),
          lastName: record.lastName?.trim(),
          email: record.email?.trim(),
          phone: record.phone?.trim(),
          title: record.title?.trim(),
          source: record.source?.trim(),
          tags: record.tags,
          notes: record.notes?.trim(),
          createdBy: user._id,
          createdAt: now,
          updatedAt: now,
        });
        created++;
      } catch (e: any) {
        errors.push({ row: i, error: e.message ?? "Unknown error" });
      }
    }

    return { created, errors };
  },
});

export const batchCreateCompanies = mutation({
  args: {
    organizationId: v.id("organizations"),
    records: v.array(
      v.object({
        name: v.string(),
        domain: v.optional(v.string()),
        industry: v.optional(v.string()),
        size: v.optional(v.string()),
        website: v.optional(v.string()),
        phone: v.optional(v.string()),
        street: v.optional(v.string()),
        city: v.optional(v.string()),
        state: v.optional(v.string()),
        zip: v.optional(v.string()),
        country: v.optional(v.string()),
        notes: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.organizationId);
    const now = Date.now();
    let created = 0;
    const errors: { row: number; error: string }[] = [];

    for (let i = 0; i < args.records.length; i++) {
      const record = args.records[i];
      try {
        if (!record.name?.trim()) {
          errors.push({ row: i, error: "name is required" });
          continue;
        }
        const hasAddress =
          record.street || record.city || record.state || record.zip || record.country;
        await ctx.db.insert("companies", {
          organizationId: args.organizationId,
          name: record.name.trim(),
          domain: record.domain?.trim(),
          industry: record.industry?.trim(),
          size: record.size?.trim(),
          website: record.website?.trim(),
          phone: record.phone?.trim(),
          address: hasAddress
            ? {
                street: record.street?.trim(),
                city: record.city?.trim(),
                state: record.state?.trim(),
                zip: record.zip?.trim(),
                country: record.country?.trim(),
              }
            : undefined,
          notes: record.notes?.trim(),
          createdBy: user._id,
          createdAt: now,
          updatedAt: now,
        });
        created++;
      } catch (e: any) {
        errors.push({ row: i, error: e.message ?? "Unknown error" });
      }
    }

    return { created, errors };
  },
});

export const batchCreateLeads = mutation({
  args: {
    organizationId: v.id("organizations"),
    records: v.array(
      v.object({
        title: v.string(),
        value: v.optional(v.number()),
        currency: v.optional(v.string()),
        status: v.optional(v.string()),
        priority: v.optional(v.string()),
        source: v.optional(v.string()),
        notes: v.optional(v.string()),
        tags: v.optional(v.array(v.string())),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.organizationId);
    const now = Date.now();
    let created = 0;
    const errors: { row: number; error: string }[] = [];

    const validStatuses = ["open", "won", "lost", "archived"] as const;
    const validPriorities = ["low", "medium", "high", "urgent"] as const;

    for (let i = 0; i < args.records.length; i++) {
      const record = args.records[i];
      try {
        if (!record.title?.trim()) {
          errors.push({ row: i, error: "title is required" });
          continue;
        }
        const status = validStatuses.includes(record.status as any)
          ? (record.status as (typeof validStatuses)[number])
          : "open";
        const priority = validPriorities.includes(record.priority as any)
          ? (record.priority as (typeof validPriorities)[number])
          : undefined;

        await ctx.db.insert("leads", {
          organizationId: args.organizationId,
          title: record.title.trim(),
          value: record.value,
          currency: record.currency?.trim(),
          status,
          priority,
          source: record.source?.trim(),
          notes: record.notes?.trim(),
          tags: record.tags,
          createdBy: user._id,
          createdAt: now,
          updatedAt: now,
        });
        created++;
      } catch (e: any) {
        errors.push({ row: i, error: e.message ?? "Unknown error" });
      }
    }

    return { created, errors };
  },
});

export const batchCreateProducts = mutation({
  args: {
    organizationId: v.id("organizations"),
    records: v.array(
      v.object({
        name: v.string(),
        sku: v.string(),
        unitPrice: v.number(),
        taxRate: v.optional(v.number()),
        isActive: v.optional(v.boolean()),
        description: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { user } = await requireOrgAdmin(ctx, args.organizationId);
    const now = Date.now();
    let created = 0;
    const errors: { row: number; error: string }[] = [];

    for (let i = 0; i < args.records.length; i++) {
      const record = args.records[i];
      try {
        if (!record.name?.trim() || !record.sku?.trim()) {
          errors.push({ row: i, error: "name and sku are required" });
          continue;
        }
        await ctx.db.insert("products", {
          organizationId: args.organizationId,
          name: record.name.trim(),
          sku: record.sku.trim(),
          unitPrice: record.unitPrice,
          taxRate: record.taxRate ?? 0,
          isActive: record.isActive ?? true,
          description: record.description?.trim(),
          createdBy: user._id,
          createdAt: now,
          updatedAt: now,
        });
        created++;
      } catch (e: any) {
        errors.push({ row: i, error: e.message ?? "Unknown error" });
      }
    }

    return { created, errors };
  },
});
