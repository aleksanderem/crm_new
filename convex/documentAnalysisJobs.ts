// Generic document-analysis job actions (#3026).
//
// Provides createJob / runJob / getJob for any analysis kind registered in
// convex/_ai/registry.ts. Auth pattern mirrors convex/documents/templates.ts:create —
// uses internal._helpers.authAction.verifyOrgAccess, which returns { userId, role, … }.

import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { getAnalysisKind } from "./_ai/registry";
import { analyzeDocument, getDocumentTransport } from "./_ai/documentAnalyzer";
import type { DocumentPage } from "./_ai/documentAnalyzer";

const pagesValidator = v.array(
  v.object({
    storageId: v.string(),
    mimeType: v.string(),
    position: v.number(),
  }),
);

// ---------------------------------------------------------------------------
// createJob
// ---------------------------------------------------------------------------

export const createJob = action({
  args: {
    organizationId: v.id("organizations"),
    kind: v.string(),
    pages: pagesValidator,
    context: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<string> => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    if (!getAnalysisKind(args.kind)) {
      throw new Error(`Unknown analysis kind: ${args.kind}`);
    }

    if (args.pages.length === 0) throw new Error("No pages to analyze");

    const db = createSupabaseDb();
    const now = Date.now();
    const jobId = await db.insert("documentAnalysisJobs", {
      organizationId: String(args.organizationId),
      kind: args.kind,
      pages: args.pages,
      context: args.context ?? null,
      status: "pending",
      resultJson: null,
      errorMessage: null,
      createdBy: String(authResult.userId),
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    });

    return String(jobId);
  },
});

// ---------------------------------------------------------------------------
// runJob
// ---------------------------------------------------------------------------

export const runJob = action({
  args: {
    organizationId: v.id("organizations"),
    jobId: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ status: "ok"; resultJson: string } | { status: "error"; errorMessage: string }> => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const job = await db.get("documentAnalysisJobs", args.jobId);
    if (!job || String(job.organizationId) !== String(args.organizationId)) {
      throw new Error("Analysis job not found");
    }

    const kind = getAnalysisKind(String(job.kind));
    if (!kind) throw new Error(`Unknown analysis kind: ${job.kind}`);

    await db.patch("documentAnalysisJobs", args.jobId, {
      status: "running",
      updatedAt: Date.now(),
    });

    const pages = (job.pages as DocumentPage[])
      .slice()
      .sort((a, b) => a.position - b.position);

    let context: Record<string, unknown> | undefined;
    if (typeof job.context === "string" && job.context) {
      try {
        context = JSON.parse(job.context) as Record<string, unknown>;
      } catch {
        context = undefined;
      }
    }

    const transport = await getDocumentTransport(
      (id: string) => ctx.storage.get(id as unknown as Id<"_storage">),
    );
    const res = await analyzeDocument(transport, kind, pages, context);
    const now = Date.now();

    if (res.status === "ok") {
      const resultJson = JSON.stringify(res.data);
      await db.patch("documentAnalysisJobs", args.jobId, {
        status: "ok",
        resultJson,
        errorMessage: null,
        completedAt: now,
        updatedAt: now,
      });
      return { status: "ok", resultJson };
    }

    let errorMessage: string;
    switch (res.status) {
      case "not_implemented":
        errorMessage = "AI analysis provider is not configured";
        break;
      case "no_pages":
        errorMessage = "No pages to analyze";
        break;
      case "unsupported_format":
        errorMessage = `Unsupported file format: ${res.mimeType}`;
        break;
      default:
        errorMessage = (res as { message: string }).message;
    }

    await db.patch("documentAnalysisJobs", args.jobId, {
      status: "error",
      errorMessage,
      completedAt: now,
      updatedAt: now,
    });
    return { status: "error", errorMessage };
  },
});

// ---------------------------------------------------------------------------
// getJob
// ---------------------------------------------------------------------------

export const getJob = action({
  args: {
    organizationId: v.id("organizations"),
    jobId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const job = await db.get("documentAnalysisJobs", args.jobId);
    if (!job || String(job.organizationId) !== String(args.organizationId)) {
      return null;
    }

    return {
      _id: String(job._id ?? args.jobId),
      kind: String(job.kind),
      status: String(job.status),
      resultJson: (job.resultJson as string | null) ?? null,
      errorMessage: (job.errorMessage as string | null) ?? null,
      createdAt: Number(job.createdAt),
      completedAt: (job.completedAt as number | null) ?? null,
    };
  },
});
