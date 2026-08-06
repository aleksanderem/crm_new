import { query, action } from "./_generated/server";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";
import type { GenericQueryCtx } from "convex/server";
import type { DataModel } from "./_generated/dataModel";
import {
  ALL_DATA_SOURCES,
  getDataSourcesForModule,
  PLATFORM_DATA_SOURCES,
} from "./documentDataSources";
import type { DataSourceResolverContext } from "./documentDataSources";

// Dual-write refs removed — Supabase is now primary for email template writes

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const emailTemplateVariableValidator = v.object({
  key: v.string(),
  label: v.string(),
  source: v.string(),
});

const allSourceMap = new Map(ALL_DATA_SOURCES.map((s) => [s.key, s]));

/**
 * Resolve all {{source.field}} variables in a template string.
 * Uses the full data source registry — works with CRM, Gabinet, and platform sources.
 */
export async function renderTemplateString(
  ctx: GenericQueryCtx<DataModel>,
  template: string,
  sourceInstances: Record<string, string | null>,
  rctx: DataSourceResolverContext,
): Promise<string> {
  const resolvedValues: Record<string, string> = {};

  for (const [sourceKey, instanceId] of Object.entries(sourceInstances)) {
    const sourceDef = allSourceMap.get(sourceKey);
    if (!sourceDef) continue;
    const values = await sourceDef.resolve(ctx, instanceId, rctx);
    for (const [field, value] of Object.entries(values)) {
      resolvedValues[`${sourceKey}.${field}`] = value;
    }
  }

  // Also resolve platform sources that don't need an instanceId
  for (const src of PLATFORM_DATA_SOURCES) {
    if (sourceInstances[src.key] !== undefined) continue;
    const values = await src.resolve(ctx, null, rctx);
    for (const [field, value] of Object.entries(values)) {
      resolvedValues[`${src.key}.${field}`] = value;
    }
  }

  return template.replace(/\{\{([^}]+)\}\}/g, (_match, varKey: string) => {
    const trimmed = varKey.trim();
    return resolvedValues[trimmed] ?? `{{${trimmed}}}`;
  });
}

/**
 * List available variable sources and their fields for the UI variable picker.
 * When module is provided, returns platform sources + module-specific sources.
 * When omitted, returns ALL sources across all modules.
 */
export const listVariableSources = query({
  args: {
    module: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const sources = args.module
      ? getDataSourcesForModule(args.module)
      : ALL_DATA_SOURCES;
    return sources.map((s) => ({
      key: s.key,
      label: s.label,
      module: s.module,
      fields: s.fields.map((f) => ({
        key: f.key,
        label: f.label,
      })),
    }));
  },
});

/**
 * Render a template with actual entity data.
 * Accepts entity IDs from any module (CRM contacts/companies/leads,
 * Gabinet patients/employees/appointments). The resolver uses the
 * full data source registry to resolve variables.
 */
export const renderTemplate = query({
  args: {
    organizationId: v.id("organizations"),
    templateId: v.id("emailTemplates"),
    // CRM entities
    contactId: v.optional(v.id("contacts")),
    companyId: v.optional(v.id("companies")),
    leadId: v.optional(v.id("leads")),
    // Gabinet entities (Supabase-primary — strings, not Convex Ids)
    patientId: v.optional(v.string()),
    employeeId: v.optional(v.string()),
    appointmentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);

    const template = await ctx.db.get(args.templateId);
    if (!template || template.organizationId !== args.organizationId) {
      throw new Error("Email template not found");
    }

    const sourceInstances: Record<string, string | null> = {};
    if (args.contactId) sourceInstances.contact = args.contactId;
    if (args.companyId) sourceInstances.company = args.companyId;
    if (args.leadId) sourceInstances.lead = args.leadId;
    if (args.patientId) sourceInstances.patient = args.patientId;
    if (args.employeeId) sourceInstances.employee = args.employeeId;
    if (args.appointmentId) sourceInstances.appointment = args.appointmentId;

    const rctx: DataSourceResolverContext = {
      orgId: args.organizationId as string,
      userId: user._id as string,
    };

    const renderedSubject = await renderTemplateString(
      ctx,
      template.subject,
      sourceInstances,
      rctx,
    );
    const renderedBody = await renderTemplateString(
      ctx,
      template.body,
      sourceInstances,
      rctx,
    );

    return {
      subject: renderedSubject,
      body: renderedBody,
    };
  },
});

// ---------------------------------------------------------------------------
// Actions (Supabase-primary)
// ---------------------------------------------------------------------------

export const create = action({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    subject: v.string(),
    body: v.string(),
    category: v.optional(v.string()),
    module: v.optional(v.string()),
    eventType: v.optional(v.string()),
    variables: v.array(emailTemplateVariableValidator),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const now = Date.now();
    const db = createSupabaseDb();

    const templateId = await db.insert("emailTemplates", {
      organizationId: String(args.organizationId),
      name: args.name,
      subject: args.subject,
      body: args.body,
      category: args.category ?? null,
      module: args.module ?? null,
      eventType: args.eventType ?? null,
      variables: args.variables,
      createdBy: String(authResult.userId),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    return templateId;
  },
});

export const update = action({
  args: {
    organizationId: v.id("organizations"),
    templateId: v.string(),
    name: v.optional(v.string()),
    subject: v.optional(v.string()),
    body: v.optional(v.string()),
    category: v.optional(v.string()),
    module: v.optional(v.string()),
    eventType: v.optional(v.string()),
    variables: v.optional(v.array(emailTemplateVariableValidator)),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();

    const template = await db.get("emailTemplates", args.templateId);
    if (!template || String(template.organizationId) !== String(args.organizationId)) {
      throw new Error("Email template not found");
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) updates.name = args.name;
    if (args.subject !== undefined) updates.subject = args.subject;
    if (args.body !== undefined) updates.body = args.body;
    if (args.category !== undefined) updates.category = args.category;
    if (args.module !== undefined) updates.module = args.module;
    if (args.eventType !== undefined) updates.eventType = args.eventType;
    if (args.variables !== undefined) updates.variables = args.variables;
    if (args.isActive !== undefined) updates.isActive = args.isActive;

    await db.patch("emailTemplates", args.templateId, updates);

    return args.templateId;
  },
});

export const archive = action({
  args: {
    organizationId: v.id("organizations"),
    templateId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();

    const template = await db.get("emailTemplates", args.templateId);
    if (!template || String(template.organizationId) !== String(args.organizationId)) {
      throw new Error("Email template not found");
    }

    await db.patch("emailTemplates", args.templateId, {
      isActive: false,
      updatedAt: Date.now(),
    });

    return args.templateId;
  },
});

export const remove = action({
  args: {
    organizationId: v.id("organizations"),
    templateId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();

    const template = await db.get("emailTemplates", args.templateId);
    if (!template || String(template.organizationId) !== String(args.organizationId)) {
      throw new Error("Email template not found");
    }

    await db.delete("emailTemplates", args.templateId);

    return args.templateId;
  },
});
