import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { verifyOrgAccess } from "../_helpers/auth";
import { resolveScope, EntityType } from "./scopeResolver";
import { resolveComponentsInContent } from "./resolveComponents";

// ── Queries ──────────────────────────────────────────────────────────────────

/**
 * Resolve entity scope data for the frontend before rendering the form.
 * Returns the flat scope map so the UI can pre-fill the SurveyJS form.
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
 * Returns { prefilledData, missingFields, scopeData } so the frontend
 * can show which fields are auto-filled and which require manual input.
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

    // Flatten scope data to dot-notation for template variable resolution.
    // Field names in templates ARE the variable paths (e.g. "patient.firstName"),
    // so no binding transformation is needed.
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

    // Resolve component blocks in the template content for preview
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

// ── Mutations ────────────────────────────────────────────────────────────────

/**
 * Create a formDocument with filled data from the completed SurveyJS form.
 */
export const generateDocument = mutation({
  args: {
    organizationId: v.id("organizations"),
    templateId: v.id("formTemplates"),
    entityType: v.string(),
    entityId: v.string(),
    responseData: v.string(), // JSON stringified survey results
    title: v.optional(v.string()),
    hasClientFields: v.optional(v.boolean()), // true if template has FormFieldNodes with filledBy:"client"
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);

    const template = await ctx.db.get(args.templateId);
    if (!template || template.organizationId !== args.organizationId)
      throw new Error("Template not found");

    const now = Date.now();
    const title = args.title ?? template.name;

    // Determine initial status based on per-field filledBy attributes:
    // - hasClientFields=true → client still needs to fill their fields → "draft"
    // - hasClientFields=false + requiresSignature → "pending_signature"
    // - hasClientFields=false + !requiresSignature → "completed"
    const hasClient = args.hasClientFields === true;

    let status: "draft" | "pending_signature" | "completed";
    if (hasClient) {
      status = "draft";
    } else if (template.requiresSignature) {
      status = "pending_signature";
    } else {
      status = "completed";
    }

    // Generate signing token if client needs to interact (fill fields or sign)
    let signingToken: string | undefined;
    let signingTokenExpiresAt: number | undefined;
    if (hasClient || template.requiresSignature) {
      signingToken = crypto.randomUUID();
      signingTokenExpiresAt = now + 48 * 60 * 60 * 1000; // 48 hours
    }

    const docId = await ctx.db.insert("formDocuments", {
      organizationId: args.organizationId,
      templateId: args.templateId,
      title,
      responseData: args.responseData,
      entityType: args.entityType,
      entityId: args.entityId,
      status,
      signingToken,
      signingTokenExpiresAt,
      createdBy: user._id,
      createdAt: now,
      updatedAt: now,
    });

    // Send signing/filling email to client if token was generated
    if (signingToken) {
      const scopeData = await resolveScope(
        ctx,
        args.organizationId,
        args.entityType as EntityType,
        args.entityId,
      );
      // Resolve signer email from scope — patient or contact entity
      const patientData = scopeData.patient as
        | Record<string, unknown>
        | undefined;
      const contactData = scopeData.contact as
        | Record<string, unknown>
        | undefined;
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
            documentId: docId,
            recipientEmail: signerEmail,
            recipientName: signerName,
          },
        );
      }
    }

    // TODO: Log activity on the entity (Phase 7)

    return { documentId: docId, status, signingToken };
  },
});
