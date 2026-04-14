import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { getValidAccessToken } from "../google/_helpers";
import { Resend } from "resend";
import { RESEND_API_KEY, RESEND_FROM, SITE_URL, DEV_INTERCEPT_EMAILS } from "@cvx/env";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAppUrl(): string {
  return SITE_URL ?? process.env.APP_URL ?? "http://localhost:5173";
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/** Format a timestamp to Polish date string, e.g. "20 marca 2026, godz. 14:30" */
function formatDatePl(ts: number): string {
  const d = new Date(ts);
  const months = [
    "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
    "lipca", "sierpnia", "września", "października", "listopada", "grudnia",
  ];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = d.getHours().toString().padStart(2, "0");
  const minutes = d.getMinutes().toString().padStart(2, "0");
  return `${day} ${month} ${year}, godz. ${hours}:${minutes}`;
}

// ---------------------------------------------------------------------------
// Internal query — fetch document + context for the email action
// ---------------------------------------------------------------------------

export const getDocumentForEmail = internalQuery({
  args: { documentId: v.id("formDocuments") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) return null;

    const org = await ctx.db.get(doc.organizationId);
    const template = await ctx.db.get(doc.templateId);

    // Fetch appointment + treatment context if available
    let appointmentDate: string | undefined;
    let treatmentName: string | undefined;
    if (doc.entityType === "appointment" && doc.entityId) {
      const appointment = await ctx.db.get(
        doc.entityId as Id<"gabinetAppointments">,
      );
      if (appointment) {
        if (appointment.date) {
          const ts = new Date(`${appointment.date}T${appointment.startTime ?? "00:00"}`).getTime();
          appointmentDate = !isNaN(ts) ? formatDatePl(ts) : appointment.date;
        }
        if (appointment.treatmentId) {
          const treatment = await ctx.db.get(appointment.treatmentId);
          if (treatment) {
            treatmentName = treatment.name;
          }
        }
      }
    }

    // Determine if this is a document-type template with form fields (draft status)
    const needsFormFill = doc.status === "draft" && template?.templateType === "document";

    // Look up org's default email account for sender info
    const emailAccounts = await ctx.db
      .query("emailAccounts")
      .withIndex("by_org", (q) => q.eq("organizationId", doc.organizationId))
      .collect();
    const defaultAccount = emailAccounts.find((a) => a.isDefault) ?? emailAccounts[0];

    return {
      organizationId: doc.organizationId,
      title: doc.title,
      signingToken: doc.signingToken,
      organizationName: org?.name ?? "Organizacja",
      appointmentDate,
      treatmentName,
      needsFormFill,
      senderEmail: defaultAccount?.fromEmail,
      senderName: defaultAccount?.fromName,
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
// Internal action — send signing email via Gmail (preferred) or Resend fallback
// ---------------------------------------------------------------------------

export const sendSigningEmailInternal = internalAction({
  args: {
    documentId: v.id("formDocuments"),
    recipientEmail: v.string(),
    recipientName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(
      internal.documents.signing.getDocumentForEmail as any,
      { documentId: args.documentId },
    );

    if (!data || !data.signingToken) {
      console.warn(
        `[signing] Cannot send email — document ${args.documentId} not found or has no signing token`,
      );
      return;
    }

    const signingUrl = `${getAppUrl()}/sign/form/${data.signingToken}`;

    // Context-aware messaging
    const ctaText = data.needsFormFill
      ? "Wypełnij i podpisz dokument"
      : "Podpisz dokument";
    const ctaDescription = data.needsFormFill
      ? "Kliknij przycisk powyżej, aby wypełnić formularz i podpisać dokument."
      : "Kliknij przycisk powyżej, aby przejść do strony podpisywania dokumentu.";
    const subjectAction = data.needsFormFill
      ? "do wypełnienia i podpisania"
      : "do podpisania";

    // Build appointment/treatment context line
    const contextLines: string[] = [];
    if (data.treatmentName) {
      contextLines.push(`<strong>Zabieg:</strong> ${escapeHtml(data.treatmentName)}`);
    }
    if (data.appointmentDate) {
      contextLines.push(`<strong>Termin wizyty:</strong> ${escapeHtml(data.appointmentDate)}`);
    }
    const contextBlock =
      contextLines.length > 0
        ? `<div style="background: #f9fafb; border-radius: 8px; padding: 12px 16px; margin: 16px 0;">
            ${contextLines.map((l) => `<p style="margin: 4px 0; font-size: 14px; color: #333;">${l}</p>`).join("")}
           </div>`
        : "";

    const subject = `Dokument ${subjectAction} — "${data.title}"`;
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">Dokument ${subjectAction}</h2>
        ${args.recipientName ? `<p>Cześć ${escapeHtml(args.recipientName)},</p>` : "<p>Dzień dobry,</p>"}
        <p><strong>${escapeHtml(data.organizationName)}</strong> przesyła Ci dokument do zapoznania się${data.needsFormFill ? ", wypełnienia" : ""} i podpisania:</p>
        <p style="font-size: 18px; font-weight: 600; color: #111;">${escapeHtml(data.title)}</p>
        ${contextBlock}
        <p>
          <a href="${signingUrl}"
             style="display: inline-block; padding: 12px 24px; background: #7C6AE8; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 500;">
            ${ctaText}
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">
          ${ctaDescription}
          Link jest ważny przez 48 godzin.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="color: #999; font-size: 12px;">
          Jeśli nie spodziewałeś(-aś) się tej wiadomości, możesz ją zignorować.
        </p>
      </div>
    `;

    // --- Dev email interception ---
    if (DEV_INTERCEPT_EMAILS === "true") {
      const fromAddress = data.senderEmail
        ? (data.senderName ? `${data.senderName} <${data.senderEmail}>` : data.senderEmail)
        : "noreply@dev.local";
      await ctx.runMutation(internal.dev.emails.store, {
        from: fromAddress,
        to: args.recipientEmail,
        subject,
        html,
        source: "signing",
        metadata: JSON.stringify({
          documentId: args.documentId,
          recipientName: args.recipientName,
          signingUrl,
          organizationName: data.organizationName,
          treatmentName: data.treatmentName,
          appointmentDate: data.appointmentDate,
          needsFormFill: data.needsFormFill,
        }),
      });
      console.log("[signing] DEV_INTERCEPT: Email stored to devEmails instead of sending →", args.recipientEmail);
      await ctx.runMutation(internal.documents.signing.markSigningEmailSent, {
        documentId: args.documentId,
      });
      return;
    }

    try {
      // Try sending via Gmail OAuth (tenant's configured connection)
      const googleToken = await getValidAccessToken(ctx, data.organizationId);

      if (googleToken && data.senderEmail) {
        const fromAddress = data.senderName
          ? `${data.senderName} <${data.senderEmail}>`
          : data.senderEmail;

        // Build RFC 2822 MIME message
        let rawMessage = `From: ${fromAddress}\r\n`;
        rawMessage += `To: ${args.recipientEmail}\r\n`;
        rawMessage += `Subject: ${subject}\r\n`;
        rawMessage += `Content-Type: text/html; charset=utf-8\r\n`;
        rawMessage += `\r\n`;
        rawMessage += html;

        const encoded = btoa(unescape(encodeURIComponent(rawMessage)))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");

        const response = await fetch(
          "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${googleToken.accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ raw: encoded }),
          },
        );

        if (!response.ok) {
          const errText = await response.text();
          console.error("[signing] Gmail send failed:", errText);
          throw new Error("Gmail send failed — falling back to Resend");
        }

        console.log("[signing] Signing email sent via Gmail to", args.recipientEmail);

        await ctx.runMutation(
          internal.documents.signing.markSigningEmailSent,
          { documentId: args.documentId },
        );
        return;
      }

      // Fallback: send via Resend
      if (!RESEND_API_KEY) {
        console.warn("[signing] No Gmail connection and RESEND_API_KEY not set — cannot send signing email");
        return;
      }

      const resend = new Resend(RESEND_API_KEY);
      const fromAddress = data.senderEmail && data.senderName
        ? `${data.senderName} <${data.senderEmail}>`
        : data.senderEmail
          ? data.senderEmail
          : (RESEND_FROM ?? "noreply@example.com");
      const toAddress = args.recipientName
        ? `${args.recipientName} <${args.recipientEmail}>`
        : args.recipientEmail;

      await resend.emails.send({
        from: fromAddress,
        to: toAddress,
        subject,
        html,
      });

      console.log("[signing] Signing email sent via Resend to", args.recipientEmail);

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
