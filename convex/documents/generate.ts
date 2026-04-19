import { query, action, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { verifyOrgAccess } from "../_helpers/auth";
import { resolveScope, EntityType } from "./scopeResolver";
import { resolveComponentsInContent } from "./resolveComponents";
import { Id } from "../_generated/dataModel";

// Dual-write refs removed — Supabase is now primary for document writes

// ── Queries ──────────────────────────────────────────────────────────────────

/**
 * Resolve entity scope data for the frontend before rendering the form.
 */
export const resolveEntityScope = query({
  args: {
    organizationId: v.id("organizations"),
    entityType: v.string(),
    entityId: v.string(),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    return await resolveScope(
      ctx,
      args.organizationId,
      args.entityType as EntityType,
      args.entityId,
    );
  },
});

/**
 * Preview pre-filled data for a specific template + entity combination.
 */
export const previewDocumentData = query({
  args: {
    organizationId: v.id("organizations"),
    templateId: v.id("formTemplates"),
    entityType: v.string(),
    entityId: v.string(),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const template = await ctx.db.get(args.templateId);
    if (!template || template.organizationId !== args.organizationId)
      throw new Error("Template not found");

    const scopeData = await resolveScope(
      ctx,
      args.organizationId,
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

    const resolvedContentJson = await resolveComponentsInContent(
      ctx,
      template.contentJson,
    );

    return {
      prefilledData,
      scopeData,
      templateType: (template.templateType ?? "document") as "document",
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
