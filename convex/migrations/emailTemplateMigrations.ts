import { internalMutation } from "../_generated/server";

/** Migration 1: Copy emailLayouts data into emailBrandConfig */
export const migrateLayoutsToBrandConfig = internalMutation({
  handler: async (ctx) => {
    const layouts = await ctx.db.query("emailLayouts").collect();
    let migrated = 0;
    for (const layout of layouts) {
      const existing = await ctx.db
        .query("emailBrandConfig" as any)
        .withIndex("by_org", (q: any) => q.eq("organizationId", layout.organizationId))
        .first();
      if (existing) continue;

      await ctx.db.insert("emailBrandConfig" as any, {
        organizationId: layout.organizationId,
        primaryColor: layout.primaryColor ?? "#2563eb",
        backgroundColor: layout.backgroundColor,
        contentBackgroundColor: layout.contentBackgroundColor,
        textColor: "#1f2937",
        secondaryTextColor: "#6b7280",
        accentColor: "#7c3aed",
        logoUrl: layout.logoUrl,
        companyName: layout.companyName,
        footerText: layout.footerText,
        createdBy: layout.updatedBy,
        createdAt: layout.updatedAt,
        updatedBy: layout.updatedBy,
        updatedAt: layout.updatedAt,
      });
      migrated++;
    }
    return { migrated };
  },
});

/** Migration 2: Extract requiredSources from variables array */
export const migrateVariablesToRequiredSources = internalMutation({
  handler: async (ctx) => {
    const templates = await ctx.db.query("emailTemplates").collect();
    let migrated = 0;
    for (const tmpl of templates) {
      if ((tmpl as any).requiredSources && (tmpl as any).requiredSources.length > 0) continue;
      if (!tmpl.variables || tmpl.variables.length === 0) continue;

      const sources = [...new Set(tmpl.variables.map((v: { source: string }) => v.source))];
      await ctx.db.patch(tmpl._id, { requiredSources: sources } as any);
      migrated++;
    }
    return { migrated };
  },
});

/** Migration 3: Extract renderedHtml from GrapesJS body JSON */
export const migrateBodyToRenderedHtml = internalMutation({
  handler: async (ctx) => {
    const templates = await ctx.db
      .query("emailTemplates")
      .filter((q) => q.eq(q.field("renderedHtml" as any), undefined))
      .take(100);
    let migrated = 0;
    for (const tmpl of templates) {
      if (!tmpl.body) continue;
      let html = tmpl.body;
      try {
        const parsed = JSON.parse(tmpl.body);
        if (parsed.html) html = parsed.html;
      } catch {
        // body is already raw HTML, use as-is
      }
      await ctx.db.patch(tmpl._id, { renderedHtml: html } as any);
      migrated++;
    }
    return { migrated };
  },
});

/** Migration 4: Add templateSlug to emailEventBindings for locale-aware lookup */
export const migrateEventBindingsToSlug = internalMutation({
  handler: async (ctx) => {
    const bindings = await ctx.db.query("emailEventBindings").collect();
    let migrated = 0;
    for (const binding of bindings) {
      if ((binding as any).templateSlug) continue;
      const template = await ctx.db.get(binding.templateId);
      if ((template as any)?.slug) {
        await ctx.db.patch(binding._id, { templateSlug: (template as any).slug } as any);
        migrated++;
      }
    }
    return { migrated };
  },
});
