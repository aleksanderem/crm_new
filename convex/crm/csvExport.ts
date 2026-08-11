import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { createSupabaseDb } from "../_helpers/supabaseDb";

async function requireOrgAdminAction(
  ctx: { runAction: Function },
  organizationId: string,
) {
  const { role } = await ctx.runAction(
    internal._helpers.authAction.verifyOrgAccess,
    { organizationId },
  );
  if (role !== "owner" && role !== "admin") {
    throw new Error("Admin access required");
  }
}

export const exportContacts = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requireOrgAdminAction(ctx, args.organizationId);

    const db = createSupabaseDb();
    const contacts = await db
      .query("contacts")
      .eq("organizationId", args.organizationId)
      .collect();

    return contacts.map((c) => ({
      firstName: c.firstName,
      lastName: c.lastName ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      title: c.title ?? "",
      source: c.source ?? "",
      tags: ((c.tags as string[] | null) ?? []).join("; "),
      notes: c.notes ?? "",
      createdAt: new Date(c.createdAt as number).toISOString(),
    }));
  },
});

export const exportCompanies = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requireOrgAdminAction(ctx, args.organizationId);

    const db = createSupabaseDb();
    const companies = await db
      .query("companies")
      .eq("organizationId", args.organizationId)
      .collect();

    return companies.map((c) => ({
      name: c.name,
      domain: c.domain ?? "",
      industry: c.industry ?? "",
      size: c.size ?? "",
      website: c.website ?? "",
      phone: c.phone ?? "",
      street: (c.address as { street?: string } | null)?.street ?? "",
      city: (c.address as { city?: string } | null)?.city ?? "",
      state: (c.address as { state?: string } | null)?.state ?? "",
      zip: (c.address as { zip?: string } | null)?.zip ?? "",
      country: (c.address as { country?: string } | null)?.country ?? "",
      tags: ((c.tags as string[] | null) ?? []).join("; "),
      notes: c.notes ?? "",
      createdAt: new Date(c.createdAt as number).toISOString(),
    }));
  },
});

export const exportLeads = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requireOrgAdminAction(ctx, args.organizationId);

    const db = createSupabaseDb();
    const leads = await db
      .query("leads")
      .eq("organizationId", args.organizationId)
      .collect();

    return leads.map((l) => ({
      title: l.title,
      value: l.value?.toString() ?? "",
      currency: l.currency ?? "",
      status: l.status,
      priority: l.priority ?? "",
      expectedCloseDate: l.expectedCloseDate
        ? new Date(l.expectedCloseDate as number).toISOString()
        : "",
      source: l.source ?? "",
      notes: l.notes ?? "",
      tags: ((l.tags as string[] | null) ?? []).join("; "),
      createdAt: new Date(l.createdAt as number).toISOString(),
    }));
  },
});

export const exportPatients = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await requireOrgAdminAction(ctx, args.organizationId);

    const db = createSupabaseDb();
    const patients = await db
      .query("gabinetPatients")
      .eq("organizationId", args.organizationId)
      .collect();

    return patients.map((p) => ({
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email ?? "",
      phone: p.phone ?? "",
      pesel: p.pesel ?? "",
      dateOfBirth: p.dateOfBirth ?? "",
      gender: p.gender ?? "",
      bloodType: p.bloodType ?? "",
      allergies: p.allergies ?? "",
      status: p.isActive ? "active" : "inactive",
      referralSource: p.referralSource ?? "",
      createdAt: new Date(p.createdAt as number).toISOString(),
    }));
  },
});

export const exportProducts = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const products = await db
      .query("products")
      .eq("organizationId", args.organizationId)
      .collect();

    return products.map((p) => ({
      name: p.name,
      sku: p.sku ?? "",
      unitPrice: p.unitPrice.toString(),
      taxRate: p.taxExempt ? "ZW" : p.taxRate != null ? p.taxRate.toString() : "",
      isActive: p.isActive ? "Yes" : "No",
      description: p.description ?? "",
      createdAt: new Date(p.createdAt).toISOString(),
    }));
  },
});
