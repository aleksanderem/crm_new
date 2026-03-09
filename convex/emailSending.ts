import { internalAction, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Resend } from "resend";
import { RESEND_API_KEY, RESEND_FROM } from "@cvx/env";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Replace {{key}} placeholders in a string with provided variable values.
 * Supports both flat keys ({{patientName}}) and prefixed keys ({{event.patientName}}).
 * The "event." prefix is stripped before lookup in the variables map.
 */
function substituteVariables(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key: string) => {
    const trimmed = key.trim();
    // Try exact match first, then strip "event." prefix
    if (variables[trimmed] !== undefined) return variables[trimmed];
    if (trimmed.startsWith("event.")) {
      const flatKey = trimmed.slice(6);
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
    templateId: v.id("emailTemplates"),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (!template || template.organizationId !== args.organizationId)
      return null;

    const layout = await ctx.db
      .query("emailLayouts")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .first();

    return { template, layout };
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
    logId: v.id("emailEventLog"),
    templateId: v.id("emailTemplates"),
    organizationId: v.id("organizations"),
    recipientEmail: v.string(),
    recipientName: v.optional(v.string()),
    /** JSON string: Record<string, string> of variable key → value */
    variables: v.string(),
    bindingId: v.optional(v.id("emailEventBindings")),
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
      await ctx.runMutation(internal.emailEvents.updateLogStatus, {
        logId: args.logId,
        status: "failed",
        bindingId: args.bindingId,
        templateId: args.templateId,
        errorMessage:
          "Template not found or belongs to a different organization",
      });
      return;
    }

    const { template, layout } = data;

    let variables: Record<string, string> = {};
    try {
      variables = JSON.parse(args.variables) as Record<string, string>;
    } catch {
      // Proceed with empty variables — subject/body placeholders remain visible
    }

    const subject = substituteVariables(template.subject, variables);

    // Extract HTML from body — may be raw HTML or JSON {projectData, html} / {mjml, html}
    let rawBodyHtml = template.body;
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

    const bodyHtml = substituteVariables(rawBodyHtml, variables);
    const html = buildHtml(bodyHtml, layout);

    if (!RESEND_API_KEY) {
      console.warn("[emailSending] RESEND_API_KEY not set — skipping send");
      await ctx.runMutation(internal.emailEvents.updateLogStatus, {
        logId: args.logId,
        status: "failed",
        bindingId: args.bindingId,
        templateId: args.templateId,
        errorMessage: "RESEND_API_KEY not configured",
      });
      return;
    }

    const resend = new Resend(RESEND_API_KEY);
    const toAddress = args.recipientName
      ? `${args.recipientName} <${args.recipientEmail}>`
      : args.recipientEmail;

    try {
      await resend.emails.send({
        from: RESEND_FROM ?? "noreply@example.com",
        to: toAddress,
        subject,
        html,
      });

      await ctx.runMutation(internal.emailEvents.updateLogStatus, {
        logId: args.logId,
        status: "sent",
        bindingId: args.bindingId,
        templateId: args.templateId,
      });
    } catch (err) {
      await ctx.runMutation(internal.emailEvents.updateLogStatus, {
        logId: args.logId,
        status: "failed",
        bindingId: args.bindingId,
        templateId: args.templateId,
        errorMessage: err instanceof Error ? err.message : "Unknown send error",
      });
    }
  },
});
