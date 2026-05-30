import { query, internalMutation, action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import type { FormDocumentRow } from "../_helpers/supabaseRows";

// ---------------------------------------------------------------------------
// Internal mutation — store intercepted email (called from sending actions)
// ---------------------------------------------------------------------------

export const store = internalMutation({
  args: {
    from: v.string(),
    to: v.string(),
    subject: v.string(),
    html: v.string(),
    source: v.string(),
    metadata: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("devEmails", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

// ---------------------------------------------------------------------------
// Public query — list intercepted emails (newest first)
// ---------------------------------------------------------------------------

export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const emails = await ctx.db
      .query("devEmails")
      .withIndex("by_createdAt")
      .order("desc")
      .take(args.limit ?? 50);
    return emails;
  },
});

// ---------------------------------------------------------------------------
// Public query — get single email by ID
// ---------------------------------------------------------------------------

export const getById = query({
  args: { id: v.id("devEmails") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// ---------------------------------------------------------------------------
// Public action — find a formDocument with signing token for testing.
// Reads from Supabase since `formDocuments` is Supabase-primary now.
// ---------------------------------------------------------------------------

export const findSignableDocument = action({
  args: {},
  handler: async (): Promise<Array<{
    _id: string;
    title: string;
    status: string;
    signingToken: string;
    organizationId: string;
    entityType: string;
    entityId: string;
    signingEmailSentAt: number | undefined;
  }>> => {
    const db = createSupabaseDb();
    const docs = (await db
      .query("formDocuments")
      .order("createdAt", false)
      .take(20)
      .collect()) as FormDocumentRow[];
    const withToken = docs.filter((d) => d.signingToken);
    return withToken.map((d) => ({
      _id: String(d._id),
      title: d.title,
      status: d.status,
      signingToken: d.signingToken as string,
      organizationId: String(d.organizationId),
      entityType: d.entityType,
      entityId: d.entityId,
      signingEmailSentAt: d.signingEmailSentAt ?? undefined,
    }));
  },
});

// ---------------------------------------------------------------------------
// Public action — trigger signing email for an existing document (DEV ONLY)
// ---------------------------------------------------------------------------

export const triggerSigningEmail = action({
  args: {
    documentId: v.id("formDocuments"),
    recipientEmail: v.string(),
    recipientName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(
      internal.documents.signing.sendSigningEmailInternal as any,
      {
        documentId: args.documentId,
        recipientEmail: args.recipientEmail,
        recipientName: args.recipientName,
      },
    );
    return "ok";
  },
});

// ---------------------------------------------------------------------------
// Internal mutation — clear all dev emails
// ---------------------------------------------------------------------------

export const clearAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("devEmails").collect();
    for (const email of all) {
      await ctx.db.delete(email._id);
    }
    return all.length;
  },
});
