import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { Resend } from "resend";
import { RESEND_API_KEY, RESEND_FROM } from "@cvx/env";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAppUrl(): string {
  const url = process.env.APP_URL;
  if (!url) {
    console.warn("APP_URL env var is not set — signing links will be broken");
  }
  return url ?? "";
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// ---------------------------------------------------------------------------
// Internal query — fetch document + org for the email action
// ---------------------------------------------------------------------------

export const getDocumentForEmail = internalQuery({
  args: { documentId: v.id("formDocuments") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) return null;

    const org = await ctx.db.get(doc.organizationId);
    return {
      title: doc.title,
      signingToken: doc.signingToken,
      organizationName: org?.name ?? "Organizacja",
    };
  },
});

// ---------------------------------------------------------------------------
// Internal mutation — mark email sent timestamp on the document
// ---------------------------------------------------------------------------

export const markSigningEmailSent = internalMutation({
  args: { documentId: v.id("formDocuments") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.documentId, {
      signingEmailSentAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

// ---------------------------------------------------------------------------
// Internal action — send signing email via Resend
// ---------------------------------------------------------------------------

export const sendSigningEmailInternal = internalAction({
  args: {
    documentId: v.id("formDocuments"),
    recipientEmail: v.string(),
    recipientName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(
      internal.documents.signing.getDocumentForEmail,
      { documentId: args.documentId },
    );

    if (!data || !data.signingToken) {
      console.warn(
        `[signing] Cannot send email — document ${args.documentId} not found or has no signing token`,
      );
      return;
    }

    if (!RESEND_API_KEY) {
      console.warn("[signing] RESEND_API_KEY not set — skipping signing email");
      return;
    }

    const signingUrl = `${getAppUrl()}/sign/form/${data.signingToken}`;
    const resend = new Resend(RESEND_API_KEY);
    const toAddress = args.recipientName
      ? `${args.recipientName} <${args.recipientEmail}>`
      : args.recipientEmail;

    try {
      await resend.emails.send({
        from: RESEND_FROM ?? "noreply@example.com",
        to: toAddress,
        subject: `Dokument do podpisania — "${data.title}"`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #333;">Dokument do podpisania</h2>
            ${args.recipientName ? `<p>Cześć ${escapeHtml(args.recipientName)},</p>` : "<p>Dzień dobry,</p>"}
            <p><strong>${escapeHtml(data.organizationName)}</strong> przesyła Ci dokument do zapoznania się i podpisania:</p>
            <p style="font-size: 18px; font-weight: 600; color: #111;">${escapeHtml(data.title)}</p>
            <p>
              <a href="${signingUrl}"
                 style="display: inline-block; padding: 12px 24px; background: #7C6AE8; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500;">
                Podpisz dokument
              </a>
            </p>
            <p style="color: #666; font-size: 14px;">
              Kliknij przycisk powyżej, aby przejść do strony podpisywania dokumentu.
              Link jest ważny przez 48 godzin.
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="color: #999; font-size: 12px;">
              Jeśli nie spodziewałeś(-aś) się tej wiadomości, możesz ją zignorować.
            </p>
          </div>
        `,
      });

      // Mark that we sent the signing email
      await ctx.runMutation(
        internal.documents.signing.markSigningEmailSent,
        { documentId: args.documentId },
      );
    } catch (err) {
      console.error(
        "[signing] Failed to send signing email:",
        err instanceof Error ? err.message : err,
      );
    }
  },
});
