import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { verifyOrgAccess } from "../_helpers/auth";
import { resolveScope, applyBindings, EntityType } from "./scopeResolver";

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

    const bindings: Record<string, string> = template.variableBindings
      ? JSON.parse(template.variableBindings)
      : {};

    const prefilledData = applyBindings(bindings, scopeData);

    // Compute missing fields: bindings that didn't resolve to a value
    const missingFields: string[] = [];
    for (const [questionName, fieldPath] of Object.entries(bindings)) {
      if (!(questionName in prefilledData) || prefilledData[questionName] == null) {
        missingFields.push(fieldPath);
      }
    }

    return { prefilledData, missingFields, scopeData };
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
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);

    const template = await ctx.db.get(args.templateId);
    if (!template || template.organizationId !== args.organizationId)
      throw new Error("Template not found");

    const now = Date.now();
    const title = args.title ?? template.name;

    // Determine initial status based on signature requirement
    const status = template.requiresSignature ? "pending_signature" as const : "completed" as const;

    // Generate signing token if signature is needed
    let signingToken: string | undefined;
    let signingTokenExpiresAt: number | undefined;
    if (template.requiresSignature) {
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

    // If signature required, try to send signing email to the relevant entity
    if (template.requiresSignature && signingToken) {
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
