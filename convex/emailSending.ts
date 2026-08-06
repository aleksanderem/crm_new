import { internalAction, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Resend } from "resend";
import { RESEND_API_KEY, RESEND_FROM } from "@cvx/env";
import { buildEmailHtml } from "./mail/emailShell";
import { createSupabaseDb } from "./_helpers/supabaseDb";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * URL placeholder keys (flat form, after dot-prefix stripping) used by stored
 * system email templates seeded in convex/emailTemplateSeed.ts. Callers that
 * emit events for these templates SHOULD pass actual URL values in the
 * variables payload (e.g. a freshly minted verification or invitation URL).
 *
 * When a caller omits one of these, sendTemplateEmail substitutes an empty
 * string so the placeholder does not render as literal "{{current_user.…_url}}"
 * text in the recipient's inbox.
 */
export const SYSTEM_URL_PLACEHOLDER_KEYS = [
  "verification_url",
  "reset_url",
  "invitation_url",
  "signing_url",
  "portal_url",
] as const;

/**
 * Replace {{key}} placeholders in a string with provided variable values.
 * Supports flat keys ({{patientName}}) and any dot-notation prefixed keys
 * ({{patient.name}}, {{event.patientName}}, {{current_user.email}}).
 * The source prefix is stripped before lookup in the variables map.
 */
export function substituteVariables(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => {
    const trimmed = key.trim();
    // Exact match first
    if (variables[trimmed] !== undefined) return variables[trimmed];
    // Try stripping any source prefix (e.g., "patient.name" -> "name", "event.patientName" -> "patientName")
    const dotIndex = trimmed.indexOf(".");
    if (dotIndex > 0) {
      const flatKey = trimmed.slice(dotIndex + 1);
      if (variables[flatKey] !== undefined) return variables[flatKey];
    }
    return `{{${trimmed}}}`;
  });
}

function buildHtml(
  bodyContent: string,
  layout: {
    backgroundColor: string;
    contentBackgroundColor: string;
    logoUrl?: string;
    companyName?: string;
    footerText?: string;
  } | null,
): string {
  if (!layout) return bodyContent;

  const {
    backgroundColor,
    contentBackgroundColor,
    logoUrl,
    companyName,
    footerText,
  } = layout;

  const logoHtml = logoUrl
    ? `<div style="text-align:center;padding:16px 0;"><img src="${logoUrl}" alt="${companyName ?? ""}" style="max-height:48px;" /></div>`
    : companyName
      ? `<div style="text-align:center;padding:16px 0;font-weight:600;font-size:18px;">${companyName}</div>`
      : "";

  const footerHtml = footerText
    ? `<div style="text-align:center;padding:16px;color:#6b7280;font-size:12px;">${footerText}</div>`
    : "";

  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:${backgroundColor};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:${backgroundColor};min-height:100vh;"><tr><td align="center" style="padding:32px 16px;"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${contentBackgroundColor};border-radius:8px;overflow:hidden;">${logoHtml ? `<tr><td>${logoHtml}</td></tr>` : ""}<tr><td style="padding:24px;">${bodyContent}</td></tr>${footerHtml ? `<tr><td style="background:#f9fafb;">${footerHtml}</td></tr>` : ""}</table></td></tr></table></body></html>`;
}

// ---------------------------------------------------------------------------
// Internal query — load template + layout in one round trip
// ---------------------------------------------------------------------------

export const getTemplateAndLayout = internalQuery({
  args: {
    templateId: v.string(),
    organizationId: v.id("organizations"),
  },
  handler: async (_ctx, args) => {
    const db = createSupabaseDb();
    const template = await db.get("emailTemplates", args.templateId);
    if (!template || String(template.organizationId) !== String(args.organizationId))
      return null;
    return { template };
  },
});

// ---------------------------------------------------------------------------
// Internal action — send a single email from a stored template
// ---------------------------------------------------------------------------

/**
 * Send an email using a stored email template with variable substitution.
 * Wraps the rendered HTML in the org's email layout if one exists.
 * Updates the emailEventLog entry when done (sent or failed).
 */
export const sendTemplateEmail = internalAction({
  args: {
    logId: v.string(),
    templateId: v.string(),
    organizationId: v.id("organizations"),
    recipientEmail: v.string(),
    recipientName: v.optional(v.string()),
    /** JSON string: Record<string, string> of variable key → value */
    variables: v.string(),
    bindingId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(
      internal.emailSending.getTemplateAndLayout,
      {
        templateId: args.templateId,
        organizationId: args.organizationId,
      },
    );

    if (!data) {
      await ctx.runAction(internal.emailEvents.updateLogStatus, {
        logId: args.logId,
        status: "failed",
        bindingId: args.bindingId,
        templateId: args.templateId,
        renderedBody: args.variables,
        errorMessage:
          "Template not found or belongs to a different organization",
      });
      return;
    }

    const { template } = data;

    const db = createSupabaseDb();

    // Load brand config (new) — preferred over legacy layout, read from Supabase
    const brandConfig = await db
      .query("emailBrandConfig")
      .eq("organizationId", String(args.organizationId))
      .first();

    // Legacy layout fallback from Supabase
    const layout = await db
      .query("emailLayouts")
      .eq("organizationId", String(args.organizationId))
      .first();

    let variables: Record<string, string> = {};
    try {
      variables = JSON.parse(args.variables) as Record<string, string>;
    } catch {
      // Proceed with empty variables — subject/body placeholders remain visible
    }

    // Default system URL placeholders to empty string when the caller did not
    // supply them, so seeded templates referencing e.g. {{current_user.verification_url}}
    // don't render the literal placeholder text in the recipient's email.
    for (const key of SYSTEM_URL_PLACEHOLDER_KEYS) {
      if (variables[key] === undefined) {
        variables[key] = "";
      }
    }

    const subject = substituteVariables(template.subject, variables);

    // Prefer renderedHtml (new TipTap pipeline) over body (legacy GrapesJS)
    let rawBodyHtml: string;
    if (template.renderedHtml) {
      rawBodyHtml = template.renderedHtml;
    } else {
      rawBodyHtml = template.body;
      try {
        const parsed = JSON.parse(template.body);
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          typeof parsed.html === "string"
        ) {
          rawBodyHtml = parsed.html;
        }
      } catch {
        // Not JSON — already raw HTML
      }
    }

    const bodyHtml = substituteVariables(rawBodyHtml, variables);

    let html: string;
    if (brandConfig) {
      html = buildEmailHtml(bodyHtml, {
        primaryColor: brandConfig.primaryColor,
        backgroundColor: brandConfig.backgroundColor,
        contentBackgroundColor: brandConfig.contentBackgroundColor,
        textColor: brandConfig.textColor,
        secondaryTextColor: brandConfig.secondaryTextColor,
        accentColor: brandConfig.accentColor,
        logoUrl: brandConfig.logoUrl ?? undefined,
        companyName: brandConfig.companyName ?? undefined,
        footerText: brandConfig.footerText ?? undefined,
        socialLinks: brandConfig.socialLinks ?? undefined,
      });
    } else {
      html = buildHtml(bodyHtml, layout);
    }

    if (!RESEND_API_KEY) {
      console.warn("[emailSending] RESEND_API_KEY not set — skipping send");
      await ctx.runAction(internal.emailEvents.updateLogStatus, {
        logId: args.logId,
        status: "failed",
        bindingId: args.bindingId,
        templateId: args.templateId,
        renderedSubject: subject,
        renderedBody: html,
        errorMessage: "RESEND_API_KEY not configured",
      });
      return;
    }

    const resend = new Resend(RESEND_API_KEY);
    const fromAddress = RESEND_FROM ?? "noreply@example.com";
    const toAddress = args.recipientName
      ? `${args.recipientName} <${args.recipientEmail}>`
      : args.recipientEmail;

    const sendLogBase = {
      organizationId: args.organizationId,
      source: "event_trigger" as const,
      provider: "resend" as const,
      templateId: String(args.templateId),
      recipientEmail: args.recipientEmail,
      recipientName: args.recipientName,
      fromEmail: fromAddress,
      subject,
    };

    try {
      await resend.emails.send({
        from: fromAddress,
        to: toAddress,
        subject,
        html,
      });

      await ctx.runAction(internal.emailEvents.updateLogStatus, {
        logId: args.logId,
        status: "sent",
        bindingId: args.bindingId,
        templateId: args.templateId,
        renderedSubject: subject,
        renderedBody: html,
      });
      await ctx.runMutation(internal.emailSendLog.record, {
        ...sendLogBase,
        status: "sent",
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown send error";
      await ctx.runAction(internal.emailEvents.updateLogStatus, {
        logId: args.logId,
        status: "failed",
        bindingId: args.bindingId,
        templateId: args.templateId,
        renderedSubject: subject,
        renderedBody: html,
        errorMessage,
      });
      await ctx.runMutation(internal.emailSendLog.record, {
        ...sendLogBase,
        status: "failed",
        errorMessage,
      });
    }
  },
});
