import { action, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { resolveScope, EntityType, ScopeData } from "./scopeResolver";
import { resolveScopeSupabase } from "./scopeResolver_supabase";
import { Id } from "../_generated/dataModel";

// Dual-write refs removed — Supabase is now primary for document writes

// ── Queries ──────────────────────────────────────────────────────────────────

/**
 * Resolve entity scope data for the frontend before rendering the form.
 */
export const resolveEntityScope = action({
  args: {
    organizationId: v.id("organizations"),
    entityType: v.string(),
    entityId: v.string(),
  },
  handler: async (ctx, args): Promise<ScopeData> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });
    const db = createSupabaseDb();
    return await resolveScopeSupabase(
      db,
      String(args.organizationId),
      args.entityType as EntityType,
      args.entityId,
    );
  },
});

/**
 * Preview pre-filled data for a specific template + entity combination.
 */
export const previewDocumentData = action({
  args: {
    organizationId: v.id("organizations"),
    templateId: v.string(),
    entityType: v.string(),
    entityId: v.string(),
  },
  handler: async (ctx, args): Promise<{
    prefilledData: Record<string, string>;
    scopeData: ScopeData;
    templateType: "document";
    contentJson: string;
  }> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const template = await db.get("formTemplates", args.templateId);
    if (!template || String(template.organizationId) !== String(args.organizationId))
      throw new Error("Template not found");

    const scopeData = await resolveScopeSupabase(
      db,
      String(args.organizationId),
      args.entityType as EntityType,
      args.entityId,
    );

    const prefilledData: Record<string, string> = {};
    for (const [entityType, fields] of Object.entries(scopeData)) {
      if (typeof fields !== "object" || fields === null) continue;
      for (const [key, value] of Object.entries(
        fields as Record<string, unknown>,
      )) {
        if (value !== null && value !== undefined) {
          prefilledData[`${entityType}.${key}`] = String(value);
        }
      }
    }

    // Content resolution was previously done via ctx.db reads. Since we're
    // in an action now and resolveComponentsInContent expects QueryCtx, we
    // pass the template contentJson through as-is. Component resolution can
    // happen at render time instead.
    const resolvedContentJson = (template.contentJson as string) ?? "";

    return {
      prefilledData,
      scopeData,
      templateType: ((template.templateType as string) ?? "document") as "document",
      contentJson: resolvedContentJson,
    };
  },
});

// ── Actions (Supabase-primary) ─────────────────────────────────────────────

export const generateDocument = action({
  args: {
    organizationId: v.id("organizations"),
    templateId: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    responseData: v.string(),
    title: v.optional(v.string()),
    hasClientFields: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    // Read template from Supabase
    const db = createSupabaseDb();
    const template = await db.get("formTemplates", args.templateId);
    if (!template || String(template.organizationId) !== String(args.organizationId))
      throw new Error("Template not found");

    const now = Date.now();
    const title = args.title ?? (template.name as string);

    const hasClient = args.hasClientFields === true;

    let status: "draft" | "pending_signature" | "completed";
    if (hasClient) {
      status = "draft";
    } else if (template.requiresSignature) {
      status = "pending_signature";
    } else {
      status = "completed";
    }

    // Generate signing token if client needs to interact
    let signingToken: string | undefined;
    let signingTokenExpiresAt: number | undefined;
    if (hasClient || template.requiresSignature) {
      signingToken = crypto.randomUUID();
      signingTokenExpiresAt = now + 48 * 60 * 60 * 1000;
    }

    const docId = await db.insert("formDocuments", {
      organizationId: String(args.organizationId),
      templateId: args.templateId,
      title,
      responseData: args.responseData,
      entityType: args.entityType,
      entityId: args.entityId,
      status,
      signingToken: signingToken ?? null,
      signingTokenExpiresAt: signingTokenExpiresAt ?? null,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
    });

    // Send signing/filling email via side effects (needs Convex db for scope resolution)
    if (signingToken) {
      try {
        await ctx.runMutation(internal.documents.generate._generateSideEffects, {
          documentId: docId,
          organizationId: args.organizationId,
          entityType: args.entityType,
          entityId: args.entityId,
        });
      } catch (e) {
        console.error("[generate.generateDocument] Side effects FAILED:", e);
      }
    }

    return { documentId: docId, status, signingToken };
  },
});

export const _generateSideEffects = internalMutation({
  args: {
    documentId: v.string(),
    organizationId: v.id("organizations"),
    entityType: v.string(),
    entityId: v.string(),
  },
  handler: async (ctx, args) => {
    const scopeData = await resolveScope(
      ctx,
      args.organizationId,
      args.entityType as EntityType,
      args.entityId,
    );

    const patientData = scopeData.patient as Record<string, unknown> | undefined;
    const contactData = scopeData.contact as Record<string, unknown> | undefined;
    const signerEmail =
      (patientData?.email as string | undefined) ??
      (contactData?.email as string | undefined);
    const signerName =
      (patientData?.firstName as string | undefined) ??
      (contactData?.firstName as string | undefined);

    if (signerEmail) {
      await ctx.scheduler.runAfter(
        0,
        internal.documents.signing.sendSigningEmailInternal,
        {
          documentId: args.documentId as Id<"formDocuments">,
          recipientEmail: signerEmail,
          recipientName: signerName,
        },
      );
    }
  },
});
