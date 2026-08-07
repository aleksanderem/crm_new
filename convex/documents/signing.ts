import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { createSupabaseDb, type SupabaseDb } from "../_helpers/supabaseDb";
import { createLogger } from "../_helpers/logger";
import { getJunctionTreatmentIds } from "../gabinet/_helpers/junctionTreatments";
import { getValidAccessToken } from "../google/_helpers";
import { Resend } from "resend";
import { sendViaResend, sendViaMailgun } from "../email/providers";
import { RESEND_API_KEY, RESEND_FROM, SITE_URL, DEV_INTERCEPT_EMAILS } from "@cvx/env";

async function markSent(db: SupabaseDb, documentId: string): Promise<void> {
  const now = Date.now();
  await db.patch("formDocuments", documentId, {
    signingEmailSentAt: now,
    updatedAt: now,
  });
}

/** RFC 2047 encoded-word for non-ASCII Subject headers. Without this Gmail
 *  ships the raw UTF-8 bytes and clients (Gmail/Outlook) render `ż`, `ą`, `ę`
 *  as mojibake. Format: `=?UTF-8?B?<base64>?=`. */
function encodeMimeSubject(s: string): string {
  // Skip the wrapping if the subject is pure ASCII — saves bytes and is more
  // readable in raw headers.
  // eslint-disable-next-line no-control-regex
  if (!/[^\x00-\x7F]/.test(s)) return s;
  // btoa needs binary string; encode UTF-8 first.
  const utf8 = unescape(encodeURIComponent(s));
  return `=?UTF-8?B?${btoa(utf8)}?=`;
}

const SIGNING_TOKEN_TTL_MS = 48 * 60 * 60 * 1000; // 48h, matches the email copy

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
// Internal action — send signing email via Gmail (preferred) or Resend fallback
//
// All entity tables (formDocuments, organizations, formTemplates,
// gabinetAppointments, gabinetTreatments, emailAccounts) live in Supabase
// now; their IDs are UUIDs that Convex `ctx.db.get` can't decode, so we read
// everything via the Supabase client.
// ---------------------------------------------------------------------------

export const sendSigningEmailInternal = internalAction({
  args: {
    documentId: v.string(),
    recipientEmail: v.string(),
    recipientName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();
    const log = createLogger("signing", { correlationId: db.correlationId });

    const doc = await db.get("formDocuments", args.documentId);
    if (!doc || !doc.signingToken) {
      console.warn(
        `[signing] Cannot send email — document ${args.documentId} not found or has no signing token`,
      );
      return;
    }

    // Bump the expiry so the link the recipient is about to click is valid
    // for the full window advertised in the email copy ("ważny 48h"). Without
    // this every resend would carry the original (possibly already expired)
    // expiry from the doc creation moment, and the recipient would see
    // "Signing link expired" the second they click.
    const newExpiry = Date.now() + SIGNING_TOKEN_TTL_MS;
    if (
      !doc.signingTokenExpiresAt ||
      (doc.signingTokenExpiresAt as number) < newExpiry
    ) {
      await db.patch("formDocuments", args.documentId, {
        signingTokenExpiresAt: newExpiry,
        updatedAt: Date.now(),
      });
    }

    const organizationId = String(doc.organizationId);
    const org = await db.get("organizations", organizationId);
    const template = doc.templateId
      ? await db.get("formTemplates", String(doc.templateId))
      : null;

    // Fetch appointment + treatment context if available
    let appointmentDate: string | undefined;
    let treatmentName: string | undefined;
    if (doc.entityType === "appointment" && doc.entityId) {
      const appointment = await db.get(
        "gabinetAppointments",
        String(doc.entityId),
      );
      if (appointment) {
        if (appointment.date) {
          const ts = new Date(
            `${appointment.date}T${appointment.startTime ?? "00:00"}`,
          ).getTime();
          appointmentDate = !isNaN(ts) ? formatDatePl(ts) : String(appointment.date);
        }
        const signingJunctionMap = await getJunctionTreatmentIds(db, [String(doc.entityId)]);
        const signingJunctionRows = signingJunctionMap.get(String(doc.entityId)) ?? [];
        const signingTreatmentId = signingJunctionRows[0]?.treatmentId ?? null;
        if (signingTreatmentId) {
          const treatment = await db.get("gabinetTreatments", signingTreatmentId);
          if (treatment) {
            treatmentName = treatment.name as string | undefined;
          }
        }
      }
    }

    const needsFormFill =
      doc.status === "draft" && template?.templateType === "document";

    const emailAccounts = await db
      .query("emailAccounts")
      .eq("organizationId", organizationId)
      .collect();
    const defaultAccount =
      emailAccounts.find((a) => a.isDefault) ?? emailAccounts[0];

    const data = {
      organizationId,
      title: doc.title as string,
      signingToken: doc.signingToken as string,
      organizationName: (org?.name as string | undefined) ?? "Organizacja",
      appointmentDate,
      treatmentName,
      needsFormFill,
      senderEmail: defaultAccount?.fromEmail as string | undefined,
      senderName: defaultAccount?.fromName as string | undefined,
    };

    // Create a single-use redirect stub so the raw signing token never appears
    // in email provider logs (Resend, Gmail) or browser history / Referer headers.
    const stubId = await ctx.runMutation(internal.signingStubs.createStub, {
      token: data.signingToken,
      organizationId: data.organizationId as Id<"organizations">,
      signingTokenExpiresAt: newExpiry,
      destination: "sign_form",
    });
    const signingUrl = `${getAppUrl()}/sign-stub/${stubId}`;

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

    const logBase = {
      organizationId: data.organizationId as Id<"organizations">,
      source: "signing" as const,
      recipientEmail: args.recipientEmail,
      recipientName: args.recipientName,
      subject,
      relatedEntityType: "formDocument",
      relatedEntityId: args.documentId,
    };

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
      await ctx.runMutation(internal.emailSendLog.record, {
        ...logBase,
        provider: "dev_intercept",
        status: "sent",
        fromEmail: fromAddress,
      });
      log.info("DEV_INTERCEPT: email stored to devEmails instead of sending", { recipientEmail: args.recipientEmail });
      await markSent(db, args.documentId);
      return;
    }

    // --- Provider preference order (issue: maile szły z osobistego Gmaila
    //     mimo skonfigurowanego mail_providera typu "Karta") ---
    //
    //   1. `mail_providers.isDefault = true` for the org — the dedicated
    //      transactional sender the user configured in /admin/email-config.
    //      Used to be ignored entirely; signing went straight to Gmail OAuth.
    //   2. Gmail OAuth fallback — only when no default mail provider exists.
    //   3. Env-level Resend last-ditch fallback.
    const defaultProvider: {
      _id: string;
      providerType: string;
      fromEmail: string;
      fromName: string;
      replyToEmail?: string | null;
      apiConfig?: { apiKey?: string; domain?: string; region?: string } | null;
      status: string;
    } | null = await ctx.runAction(
      internal.mailProviders._getActiveDefaultForOrg,
      { organizationId: data.organizationId as Id<"organizations"> },
    );

    if (defaultProvider && (defaultProvider.providerType === "resend" || defaultProvider.providerType === "mailgun")) {
      const apiKey = defaultProvider.apiConfig?.apiKey;
      const providerFrom = defaultProvider.fromName
        ? `${defaultProvider.fromName} <${defaultProvider.fromEmail}>`
        : defaultProvider.fromEmail;
      try {
        if (defaultProvider.providerType === "resend") {
          if (!apiKey) throw new Error("Default Resend provider has no apiKey");
          await sendViaResend(
            {
              to: args.recipientEmail,
              subject,
              html,
              from: providerFrom,
              replyTo: defaultProvider.replyToEmail ?? undefined,
            },
            { apiKey },
          );
        } else {
          const domain = defaultProvider.apiConfig?.domain;
          const region = (defaultProvider.apiConfig?.region ?? "us") as "us" | "eu";
          if (!apiKey || !domain) throw new Error("Default Mailgun provider missing apiKey/domain");
          await sendViaMailgun(
            {
              to: args.recipientEmail,
              subject,
              html,
              from: providerFrom,
              replyTo: defaultProvider.replyToEmail ?? undefined,
            },
            { apiKey, domain, region },
          );
        }
        log.info("signing email sent", { provider: defaultProvider.providerType, fromEmail: defaultProvider.fromEmail, recipientEmail: args.recipientEmail });
        await ctx.runMutation(internal.emailSendLog.record, {
          ...logBase,
          provider: defaultProvider.providerType as "resend" | "mailgun",
          status: "sent",
          fromEmail: providerFrom,
        });
        await markSent(db, args.documentId);
        return;
      } catch (providerErr) {
        const msg = providerErr instanceof Error ? providerErr.message : String(providerErr);
        console.error(
          `[signing] ${defaultProvider.providerType} provider send failed, falling back:`,
          msg,
        );
        await ctx.runMutation(internal.emailSendLog.record, {
          ...logBase,
          provider: defaultProvider.providerType as "resend" | "mailgun",
          status: "failed",
          fromEmail: providerFrom,
          errorMessage: msg.slice(0, 500),
        });
        // fall through to Gmail OAuth / env Resend
      }
    }

    // Try sending via Gmail OAuth (tenant's configured connection)
    const googleToken = await getValidAccessToken(
      ctx,
      data.organizationId as Id<"organizations">,
    );

    let gmailError: string | null = null;

    if (googleToken && data.senderEmail) {
      const fromAddress = data.senderName
        ? `${data.senderName} <${data.senderEmail}>`
        : data.senderEmail;

      // Build RFC 2822 MIME message. Subject goes through RFC 2047
      // encoded-word so Gmail/Outlook render Polish diacritics correctly
      // (previously the raw UTF-8 turned into mojibake in the inbox).
      let rawMessage = `From: ${fromAddress}\r\n`;
      rawMessage += `To: ${args.recipientEmail}\r\n`;
      rawMessage += `Subject: ${encodeMimeSubject(subject)}\r\n`;
      rawMessage += `MIME-Version: 1.0\r\n`;
      rawMessage += `Content-Type: text/html; charset=utf-8\r\n`;
      rawMessage += `\r\n`;
      rawMessage += html;

      const encoded = btoa(unescape(encodeURIComponent(rawMessage)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      let response: Response | null = null;
      try {
        response = await fetch(
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
      } catch (fetchErr) {
        gmailError =
          fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        console.error("[signing] Gmail fetch threw:", gmailError);
        await ctx.runMutation(internal.emailSendLog.record, {
          ...logBase,
          provider: "gmail",
          status: "failed",
          fromEmail: fromAddress,
          errorMessage: `Gmail send failed: ${gmailError.slice(0, 500)}`,
        });
      }

      if (response?.ok) {
        log.info("signing email sent", { provider: "gmail", recipientEmail: args.recipientEmail });
        await ctx.runMutation(internal.emailSendLog.record, {
          ...logBase,
          provider: "gmail",
          status: "sent",
          fromEmail: fromAddress,
        });
        await markSent(db, args.documentId);
        return;
      }

      if (response) {
        const errText = await response.text();
        gmailError = `Gmail send failed (${response.status}): ${errText.slice(0, 500)}`;
        console.error("[signing] Gmail send failed:", errText);
        await ctx.runMutation(internal.emailSendLog.record, {
          ...logBase,
          provider: "gmail",
          status: "failed",
          fromEmail: fromAddress,
          errorMessage: gmailError,
        });
      }
      // fall through to Resend fallback below
    }

    // Resend fallback — used both when no Gmail is configured and when
    // Gmail attempted but failed.
    if (!RESEND_API_KEY) {
      const reason = gmailError
        ? `Gmail send failed and RESEND_API_KEY not set: ${gmailError}`
        : "No Gmail connection and RESEND_API_KEY not set";
      console.warn("[signing]", reason);
      await ctx.runMutation(internal.emailSendLog.record, {
        ...logBase,
        provider: "resend",
        status: "skipped",
        errorMessage: reason,
      });
      throw new Error("Nie udało się wysłać e-maila: brak skonfigurowanego dostawcy poczty");
    }

    const resend = new Resend(RESEND_API_KEY);
    const fromAddress =
      data.senderEmail && data.senderName
        ? `${data.senderName} <${data.senderEmail}>`
        : data.senderEmail
          ? data.senderEmail
          : (RESEND_FROM ?? "noreply@example.com");
    const toAddress = args.recipientName
      ? `${args.recipientName} <${args.recipientEmail}>`
      : args.recipientEmail;

    try {
      await resend.emails.send({
        from: fromAddress,
        to: toAddress,
        subject,
        html,
      });

      log.info("signing email sent", { provider: "resend", recipientEmail: args.recipientEmail });
      await ctx.runMutation(internal.emailSendLog.record, {
        ...logBase,
        provider: "resend",
        status: "sent",
        fromEmail: fromAddress,
      });
      await markSent(db, args.documentId);
    } catch (resendErr) {
      const msg = resendErr instanceof Error ? resendErr.message : String(resendErr);
      await ctx.runMutation(internal.emailSendLog.record, {
        ...logBase,
        provider: "resend",
        status: "failed",
        fromEmail: fromAddress,
        errorMessage: msg,
      });
      console.error("[signing] Failed to send signing email via Resend:", msg);
      throw new Error(`Nie udało się wysłać e-maila: ${msg}`);
    }
  },
});
