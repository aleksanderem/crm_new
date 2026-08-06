import { internalAction } from "../_generated/server";
import { createSupabaseDb } from "../_helpers/supabaseDb";

type EmailLayoutRow = {
  _id: string;
  organizationId: string;
  primaryColor: string | null;
  backgroundColor: string | null;
  contentBackgroundColor: string | null;
  logoUrl: string | null;
  companyName: string | null;
  footerText: string | null;
  updatedBy: string | null;
  updatedAt: number | null;
};

type EmailTemplateRow = {
  _id: string;
  slug: string | null;
  body: string | null;
  renderedHtml: string | null;
  variables: Array<{ source: string }> | null;
  requiredSources: string[] | null;
};

type EmailEventBindingRow = {
  _id: string;
  templateId: string;
  templateSlug: string | null;
};

/** Migration 1: Copy emailLayouts data into emailBrandConfig */
export const migrateLayoutsToBrandConfig = internalAction({
  args: {},
  handler: async (_ctx) => {
    const db = createSupabaseDb();
    const layouts = (await db.query("emailLayouts").collect()) as EmailLayoutRow[];
    let migrated = 0;
    for (const layout of layouts) {
      const existing = await db
        .query("emailBrandConfig")
        .eq("organizationId", layout.organizationId)
        .first();
      if (existing) continue;

      await db.insert("emailBrandConfig", {
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
export const migrateVariablesToRequiredSources = internalAction({
  args: {},
  handler: async (_ctx) => {
    const db = createSupabaseDb();
    const templates = (await db.query("emailTemplates").collect()) as EmailTemplateRow[];
    let migrated = 0;
    for (const tmpl of templates) {
      if (tmpl.requiredSources && tmpl.requiredSources.length > 0) continue;
      if (!tmpl.variables || tmpl.variables.length === 0) continue;

      const sources = [...new Set(tmpl.variables.map((v) => v.source))];
      await db.patch("emailTemplates", tmpl._id, { requiredSources: sources });
      migrated++;
    }
    return { migrated };
  },
});

/** Migration 3: Extract renderedHtml from GrapesJS body JSON */
export const migrateBodyToRenderedHtml = internalAction({
  args: {},
  handler: async (_ctx) => {
    const db = createSupabaseDb();
    const templates = (await db
      .query("emailTemplates")
      .or("rendered_html.is.null")
      .take(100)
      .collect()) as EmailTemplateRow[];
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
      await db.patch("emailTemplates", tmpl._id, { renderedHtml: html });
      migrated++;
    }
    return { migrated };
  },
});

/** Migration 4: Add templateSlug to emailEventBindings for locale-aware lookup */
export const migrateEventBindingsToSlug = internalAction({
  args: {},
  handler: async (_ctx) => {
    const db = createSupabaseDb();
    const bindings = (await db.query("emailEventBindings").collect()) as EmailEventBindingRow[];
    let migrated = 0;
    for (const binding of bindings) {
      if (binding.templateSlug) continue;
      const template = (await db.get(
        "emailTemplates",
        binding.templateId,
      )) as EmailTemplateRow | null;
      if (template?.slug) {
        await db.patch("emailEventBindings", binding._id, { templateSlug: template.slug });
        migrated++;
      }
    }
    return { migrated };
  },
});
