import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import type { SupabaseRow } from "../_helpers/supabaseRows";

type StockLevelRow = SupabaseRow<"productStockLevels">;

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

async function loadLookups(organizationId: string) {
  const db = createSupabaseDb();
  const [tagRows, categoryRows] = await Promise.all([
    db.query("tagDefinitions").eq("organizationId", organizationId).collect(),
    db.query("categoryDefinitions").eq("organizationId", organizationId).collect(),
  ]);
  const tagMap = new Map<string, string>(
    (tagRows as Array<{ _id: string; name: string; isDeleted?: boolean }>)
      .filter((t) => !t.isDeleted)
      .map((t) => [t._id, t.name]),
  );
  const categoryMap = new Map<string, string>(
    (categoryRows as Array<{ _id: string; name: string; isDeleted?: boolean }>)
      .filter((c) => !c.isDeleted)
      .map((c) => [c._id, c.name]),
  );
  return { tagMap, categoryMap };
}

function resolveTagIds(
  tagIds: string[] | null | undefined,
  legacyTags: string[] | null | undefined,
  tagMap: Map<string, string>,
): string {
  if (tagIds && tagIds.length > 0) {
    return tagIds.map((id) => tagMap.get(id) ?? id).join("; ");
  }
  return ((legacyTags as string[] | null) ?? []).join("; ");
}

function resolveCategoryId(
  categoryId: string | null | undefined,
  categoryMap: Map<string, string>,
): string {
  if (!categoryId) return "";
  return categoryMap.get(categoryId) ?? categoryId;
}

export const exportContacts = action({
  args: { organizationId: v.string() },
  handler: async (ctx, args) => {
    await requireOrgAdminAction(ctx, args.organizationId);

    const db = createSupabaseDb();
    const [contacts, { tagMap, categoryMap }] = await Promise.all([
      db.query("contacts").eq("organizationId", args.organizationId).collect(),
      loadLookups(args.organizationId),
    ]);

    return contacts.map((c) => ({
      firstName: c.firstName,
      lastName: c.lastName ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      title: c.title ?? "",
      source: c.source ?? "",
      tags: resolveTagIds(c.tagIds as string[] | null, c.tags as string[] | null, tagMap),
      category: resolveCategoryId(c.categoryId as string | null, categoryMap),
      notes: c.notes ?? "",
      createdAt: new Date(c.createdAt as number).toISOString(),
    }));
  },
});

export const exportCompanies = action({
  args: { organizationId: v.string() },
  handler: async (ctx, args) => {
    await requireOrgAdminAction(ctx, args.organizationId);

    const db = createSupabaseDb();
    const [companies, { tagMap, categoryMap }] = await Promise.all([
      db.query("companies").eq("organizationId", args.organizationId).collect(),
      loadLookups(args.organizationId),
    ]);

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
      tags: resolveTagIds(c.tagIds as string[] | null, c.tags as string[] | null, tagMap),
      category: resolveCategoryId(c.categoryId as string | null, categoryMap),
      notes: c.notes ?? "",
      createdAt: new Date(c.createdAt as number).toISOString(),
    }));
  },
});

export const exportLeads = action({
  args: { organizationId: v.string() },
  handler: async (ctx, args) => {
    await requireOrgAdminAction(ctx, args.organizationId);

    const db = createSupabaseDb();
    const [leads, { tagMap, categoryMap }] = await Promise.all([
      db.query("leads").eq("organizationId", args.organizationId).collect(),
      loadLookups(args.organizationId),
    ]);

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
      tags: resolveTagIds(l.tagIds as string[] | null, l.tags as string[] | null, tagMap),
      category: resolveCategoryId(l.categoryId as string | null, categoryMap),
      createdAt: new Date(l.createdAt as number).toISOString(),
    }));
  },
});

export const exportPatients = action({
  args: { organizationId: v.string() },
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

type StockSummary = { currentQty: number; avgCost: number | null };

async function loadStockMap(organizationId: string): Promise<Map<string, StockSummary>> {
  const db = createSupabaseDb();
  const levels = await db
    .query<StockLevelRow>("productStockLevels")
    .eq("organizationId", organizationId)
    .collect();

  const map = new Map<string, StockSummary>();
  for (const row of levels) {
    const key = String(row.productId);
    const existing = map.get(key);
    const qty = Number(row.quantity);
    const cost = row.avgCost != null ? Number(row.avgCost) : null;
    if (!existing) {
      map.set(key, { currentQty: qty, avgCost: cost });
    } else {
      // Weighted average across locations for avgCost
      const totalQty = existing.currentQty + qty;
      let newAvgCost: number | null = null;
      if (existing.avgCost != null && cost != null && totalQty > 0) {
        newAvgCost = (existing.currentQty * existing.avgCost + qty * cost) / totalQty;
      } else if (existing.avgCost != null) {
        newAvgCost = existing.avgCost;
      } else if (cost != null) {
        newAvgCost = cost;
      }
      map.set(key, { currentQty: totalQty, avgCost: newAvgCost });
    }
  }
  return map;
}

export const exportProducts = action({
  args: { organizationId: v.string() },
  handler: async (ctx, args) => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const [products, { tagMap, categoryMap }, stockMap] = await Promise.all([
      db.query("products").eq("organizationId", args.organizationId).collect(),
      loadLookups(args.organizationId),
      loadStockMap(args.organizationId),
    ]);

    return products.map((p) => {
      const stock = stockMap.get(String(p._id));
      return {
        name: p.name,
        sku: p.sku ?? "",
        unitPrice: p.unitPrice.toString(),
        taxRate: p.taxExempt ? "ZW" : p.taxRate != null ? p.taxRate.toString() : "",
        isActive: p.isActive ? "Yes" : "No",
        description: p.description ?? "",
        manufacturer: p.manufacturer ?? "",
        catalogNumber: p.catalogNumber ?? "",
        purchasePrice: p.purchasePrice != null ? p.purchasePrice.toString() : "",
        salePrice: p.salePrice != null ? p.salePrice.toString() : "",
        salePriceNet: (() => {
          if (p.salePrice == null) return "";
          if (p.taxExempt || p.taxRate == null) return p.salePrice.toString();
          return (Math.round((p.salePrice / (1 + (p.taxRate as number) / 100)) * 100) / 100).toString();
        })(),
        trackStock: p.trackStock ? "Yes" : "No",
        stockUnit: p.stockUnit ?? "",
        minStock: p.minStock != null ? p.minStock.toString() : "",
        stockNote: p.stockNote ?? "",
        productSection: p.productSection ?? "",
        currentQty: p.trackStock && stock != null ? stock.currentQty.toString() : "",
        avgCost: p.trackStock && stock?.avgCost != null ? stock.avgCost.toString() : "",
        tags: resolveTagIds(p.tagIds as string[] | null, null, tagMap),
        category: resolveCategoryId(p.categoryId as string | null, categoryMap),
        createdAt: new Date(p.createdAt).toISOString(),
      };
    });
  },
});
