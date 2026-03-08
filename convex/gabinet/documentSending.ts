import { mutation, internalAction, query } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { MutationCtx } from "../_generated/server";
import { verifyOrgAccess } from "../_helpers/auth";
import { Resend } from "resend";

const APP_URL = process.env.APP_URL ?? "https://app.example.com";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateToken(): string {
  return crypto.randomUUID() + "-" + crypto.randomUUID();
}

/**
 * Find or create an active portal session for a patient.
 * Returns the session token that can be embedded in email links.
 */
async function ensurePortalSession(
  ctx: MutationCtx,
  patientId: Id<"gabinetPatients">,
  organizationId: Id<"organizations">,
): Promise<string> {
  const now = Date.now();
  const sessionDuration = 30 * 24 * 60 * 60 * 1000; // 30 days

  const existing = await ctx.db
    .query("gabinetPortalSessions")
    .withIndex("by_patient", (q) => q.eq("patientId", patientId))
    .first();

  if (existing) {
    // Extend and activate the existing session
    const token = generateToken();
    await ctx.db.patch(existing._id, {
      tokenHash: token,
      isActive: true,
      lastAccessedAt: now,
      expiresAt: now + sessionDuration,
    });
    return token;
  }

  // Create a new active session
  const token = generateToken();
  await ctx.db.insert("gabinetPortalSessions", {
    patientId,
    organizationId,
    tokenHash: token,
    isActive: true,
    lastAccessedAt: now,
    createdAt: now,
    expiresAt: now + sessionDuration,
  });
  return token;
}

// ---------------------------------------------------------------------------
// Public mutation — send document to client
// ---------------------------------------------------------------------------

export const sendDocumentToClient = mutation({
  args: {
    organizationId: v.id("organizations"),
    documentId: v.id("gabinetDocuments"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);

    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.organizationId !== args.organizationId) {
      throw new Error("Document not found");
    }
    if (doc.status === "signed") {
      throw new Error("Document is already signed");
    }

    const patient = await ctx.db.get(doc.patientId);
    if (!patient) throw new Error("Patient not found");
    if (!patient.email) throw new Error("Patient has no email address");

    const org = await ctx.db.get(args.organizationId);

    // Set document to pending_signature
    await ctx.db.patch(args.documentId, {
      status: "pending_signature",
      updatedAt: Date.now(),
    });

    // Create or refresh portal session for the patient
    const token = await ensurePortalSession(ctx, doc.patientId, args.organizationId);

    // Schedule email delivery (non-blocking)
    await ctx.scheduler.runAfter(0, internal.gabinet.documentSending.sendDocumentEmail, {
      patientName: `${patient.firstName}${patient.lastName ? " " + patient.lastName : ""}`,
      patientEmail: patient.email,
      documentTitle: doc.title,
      organizationName: org?.name ?? "Salon",
      token,
      documentId: args.documentId,
      sentByUserId: user._id,
    });

    return { sent: true };
  },
});

// ---------------------------------------------------------------------------
// Public query — get share link for a document
// ---------------------------------------------------------------------------

export const getDocumentShareLink = query({
  args: {
    organizationId: v.id("organizations"),
    documentId: v.id("gabinetDocuments"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

    const doc = await ctx.db.get(args.documentId);
    if (!doc || doc.organizationId !== args.organizationId) {
      throw new Error("Document not found");
    }

    const session = await ctx.db
      .query("gabinetPortalSessions")
      .withIndex("by_patient", (q) => q.eq("patientId", doc.patientId))
      .first();

    if (!session || !session.isActive || Date.now() > session.expiresAt) {
      return null;
    }

    return `${APP_URL}/patient/documents?token=${session.tokenHash}&doc=${args.documentId}`;
  },
});

// ---------------------------------------------------------------------------
// Internal action — email delivery
// ---------------------------------------------------------------------------

export const sendDocumentEmail = internalAction({
  args: {
    patientName: v.string(),
    patientEmail: v.string(),
    documentTitle: v.string(),
    organizationName: v.string(),
    token: v.string(),
    documentId: v.id("gabinetDocuments"),
    sentByUserId: v.id("users"),
  },
  handler: async (_ctx, args): Promise<{ sent: boolean }> => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn("RESEND_API_KEY not set — skipping document send email");
      return { sent: false };
    }

    const resend = new Resend(apiKey);
    const portalUrl = `${APP_URL}/patient/documents?token=${args.token}&doc=${args.documentId}`;

    await resend.emails.send({
      from: process.env.RESEND_FROM ?? "noreply@example.com",
      to: args.patientEmail,
      subject: `Dokument do podpisania — "${args.documentTitle}"`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Dokument do podpisania</h2>
          <p>Cześć ${args.patientName},</p>
          <p>Salon <strong>${args.organizationName}</strong> przesyła Ci dokument do zapoznania się i podpisania:</p>
          <p style="font-size: 18px; font-weight: 600; color: #111;">${args.documentTitle}</p>
          <p>
            <a href="${portalUrl}"
               style="display: inline-block; padding: 12px 24px; background: #7C6AE8; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500;">
              Przejdź do dokumentu
            </a>
          </p>
          <p style="color: #666; font-size: 14px;">
            Kliknij przycisk, aby przejść do portalu klienta i podpisać dokument.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="color: #999; font-size: 12px;">
            Jeśli nie spodziewałeś(-aś) się tej wiadomości, możesz ją zignorować.
          </p>
        </div>
      `,
    });

    return { sent: true };
  },
});
