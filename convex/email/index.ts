import { AUTH_EMAIL, AUTH_RESEND_KEY } from "@cvx/env";
import { ERRORS } from "~/errors";
import { z } from "zod";
import type { GenericActionCtx } from "convex/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const ResendSuccessSchema = z.object({
  id: z.string(),
});
const ResendErrorSchema = z.union([
  z.object({
    name: z.string(),
    message: z.string(),
    statusCode: z.number(),
  }),
  z.object({
    name: z.literal("UnknownError"),
    message: z.literal("Unknown Error"),
    statusCode: z.literal(500),
    cause: z.any(),
  }),
]);

export type EmailSendLogContext = {
  ctx: GenericActionCtx<any>;
  organizationId: Id<"organizations">;
  source:
    | "signing"
    | "automation"
    | "manual_compose"
    | "auto_generate"
    | "event_trigger"
    | "system";
  templateId?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  idempotencyKey?: string;
  triggeredBy?: Id<"users">;
  recipientName?: string;
};

export type SendEmailOptions = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  // Optional per-call overrides. If unset, falls back to AUTH_EMAIL env.
  from?: string;
  replyTo?: string;
  // Optional logging context. When set, every send attempt (sent or failed)
  // is mirrored to the per-org emailSendLog table so it shows up under
  // /dashboard/settings/mail → Logs.
  log?: EmailSendLogContext;
};

async function writeLog(
  log: EmailSendLogContext | undefined,
  data: {
    status: "sent" | "failed";
    provider: "resend";
    errorMessage?: string;
    recipientEmail: string;
    fromEmail?: string;
    subject?: string;
  },
) {
  if (!log) return;
  try {
    await log.ctx.runMutation(internal.emailSendLog.record, {
      organizationId: log.organizationId,
      source: log.source,
      templateId: log.templateId,
      provider: data.provider,
      status: data.status,
      errorMessage: data.errorMessage,
      recipientEmail: data.recipientEmail,
      recipientName: log.recipientName,
      fromEmail: data.fromEmail,
      subject: data.subject,
      relatedEntityType: log.relatedEntityType,
      relatedEntityId: log.relatedEntityId,
      idempotencyKey: log.idempotencyKey,
      triggeredBy: log.triggeredBy,
    });
  } catch (e) {
    console.error("[sendEmail] failed to write emailSendLog:", e);
  }
}

export async function sendEmail(options: SendEmailOptions) {
  const { log, ...sendOptions } = options;
  const firstRecipient = Array.isArray(sendOptions.to) ? sendOptions.to[0] : sendOptions.to;

  if (!AUTH_RESEND_KEY) {
    await writeLog(log, {
      status: "failed",
      provider: "resend",
      errorMessage: `Resend - ${ERRORS.ENVS_NOT_INITIALIZED}`,
      recipientEmail: firstRecipient,
      subject: sendOptions.subject,
    });
    throw new Error(`Resend - ${ERRORS.ENVS_NOT_INITIALIZED}`);
  }

  const { from: fromOverride, replyTo, ...rest } = sendOptions;
  const from = fromOverride ?? AUTH_EMAIL ?? "Convex SaaS <onboarding@resend.dev>";
  const email = {
    from,
    ...rest,
    ...(replyTo ? { reply_to: replyTo } : {}),
  };

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AUTH_RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(email),
  });

  const data = await response.json();
  const parsedData = ResendSuccessSchema.safeParse(data);

  if (response.ok && parsedData.success) {
    await writeLog(log, {
      status: "sent",
      provider: "resend",
      recipientEmail: firstRecipient,
      fromEmail: from,
      subject: sendOptions.subject,
    });
    return { status: "success", data: parsedData } as const;
  } else {
    const parsedErrorResult = ResendErrorSchema.safeParse(data);
    const errorMessage = parsedErrorResult.success
      ? `${parsedErrorResult.data.name}: ${parsedErrorResult.data.message}`
      : ERRORS.AUTH_EMAIL_NOT_SENT;
    if (parsedErrorResult.success) {
      console.error(parsedErrorResult.data);
    } else {
      console.error(data);
    }
    await writeLog(log, {
      status: "failed",
      provider: "resend",
      errorMessage,
      recipientEmail: firstRecipient,
      fromEmail: from,
      subject: sendOptions.subject,
    });
    throw new Error(ERRORS.AUTH_EMAIL_NOT_SENT);
  }
}
