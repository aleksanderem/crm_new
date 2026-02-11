import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireOrgAdmin } from "./_helpers/auth";

export const exportContacts = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);

    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    return contacts.map((c) => ({
      firstName: c.firstName,
      lastName: c.lastName ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      title: c.title ?? "",
      source: c.source ?? "",
      tags: (c.tags ?? []).join("; "),
      notes: c.notes ?? "",
      createdAt: new Date(c.createdAt).toISOString(),
    }));
  },
});

export const exportCompanies = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);

    const companies = await ctx.db
      .query("companies")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    return companies.map((c) => ({
      name: c.name,
      domain: c.domain ?? "",
      industry: c.industry ?? "",
      size: c.size ?? "",
      website: c.website ?? "",
      phone: c.phone ?? "",
      street: c.address?.street ?? "",
      city: c.address?.city ?? "",
      state: c.address?.state ?? "",
      zip: c.address?.zip ?? "",
      country: c.address?.country ?? "",
      tags: (c.tags ?? []).join("; "),
      notes: c.notes ?? "",
      createdAt: new Date(c.createdAt).toISOString(),
    }));
  },
});

export const exportLeads = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);

    const leads = await ctx.db
      .query("leads")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    return leads.map((l) => ({
      title: l.title,
      value: l.value?.toString() ?? "",
      currency: l.currency ?? "",
      status: l.status,
      priority: l.priority ?? "",
      expectedCloseDate: l.expectedCloseDate
        ? new Date(l.expectedCloseDate).toISOString()
        : "",
      source: l.source ?? "",
      notes: l.notes ?? "",
      tags: (l.tags ?? []).join("; "),
      createdAt: new Date(l.createdAt).toISOString(),
    }));
  },
});

export const exportProducts = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requireOrgAdmin(ctx, args.organizationId);

    const products = await ctx.db
      .query("products")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    return products.map((p) => ({
      name: p.name,
      sku: p.sku,
      unitPrice: p.unitPrice.toString(),
      taxRate: p.taxRate.toString(),
      isActive: p.isActive ? "Yes" : "No",
      description: p.description ?? "",
      createdAt: new Date(p.createdAt).toISOString(),
    }));
  },
});
