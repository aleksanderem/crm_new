import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { v } from "convex/values";

export const batchCreateContacts = action({
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
    // Require org admin
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    if (!["owner", "admin"].includes((authResult as any).role)) {
      throw new Error("Admin access required");
    }

    const db = createSupabaseDb();
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
        await db.insert("contacts", {
          organizationId: String(args.organizationId),
          firstName: record.firstName.trim(),
          lastName: record.lastName?.trim() ?? null,
          email: record.email?.trim() ?? null,
          phone: record.phone?.trim() ?? null,
          title: record.title?.trim() ?? null,
          source: record.source?.trim() ?? null,
          tags: record.tags ?? null,
          notes: record.notes?.trim() ?? null,
          createdBy: String(authResult.userId),
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

export const batchCreateCompanies = action({
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
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    if (!["owner", "admin"].includes((authResult as any).role)) {
      throw new Error("Admin access required");
    }

    const db = createSupabaseDb();
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
        const address = hasAddress
          ? {
              street: record.street?.trim(),
              city: record.city?.trim(),
              state: record.state?.trim(),
              zip: record.zip?.trim(),
              country: record.country?.trim(),
            }
          : null;
        await db.insert("companies", {
          organizationId: String(args.organizationId),
          name: record.name.trim(),
          domain: record.domain?.trim() ?? null,
          industry: record.industry?.trim() ?? null,
          size: record.size?.trim() ?? null,
          website: record.website?.trim() ?? null,
          phone: record.phone?.trim() ?? null,
          address,
          notes: record.notes?.trim() ?? null,
          createdBy: String(authResult.userId),
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

export const batchCreateLeads = action({
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
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    if (!["owner", "admin"].includes((authResult as any).role)) {
      throw new Error("Admin access required");
    }

    const db = createSupabaseDb();
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
          : null;

        await db.insert("leads", {
          organizationId: String(args.organizationId),
          title: record.title.trim(),
          value: record.value ?? null,
          currency: record.currency?.trim() ?? null,
          status,
          priority,
          source: record.source?.trim() ?? null,
          notes: record.notes?.trim() ?? null,
          tags: record.tags ?? null,
          createdBy: String(authResult.userId),
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

export const batchCreateProducts = action({
  args: {
    organizationId: v.id("organizations"),
    records: v.array(
      v.object({
        name: v.string(),
        sku: v.string(),
        unitPrice: v.number(),
        taxRate: v.optional(v.number()),
        taxExempt: v.optional(v.boolean()),
        isActive: v.optional(v.boolean()),
        description: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    if (!["owner", "admin"].includes((authResult as any).role)) {
      throw new Error("Admin access required");
    }

    const db = createSupabaseDb();
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
        await db.insert("products", {
          organizationId: String(args.organizationId),
          name: record.name.trim(),
          sku: record.sku.trim(),
          unitPrice: record.unitPrice,
          taxRate: record.taxExempt ? null : record.taxRate ?? null,
          taxExempt: record.taxExempt ?? null,
          isActive: record.isActive ?? true,
          description: record.description?.trim() ?? null,
          createdBy: String(authResult.userId),
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
