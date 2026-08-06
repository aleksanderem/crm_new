import { action, query, internalAction, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";

// ---------------------------------------------------------------------------
// SMS Config (authenticated, org-scoped)
// ---------------------------------------------------------------------------

export const getConfig = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const config = await ctx.db
      .query("orgSmsConfig")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .unique();
    if (!config) return null;
    // Never return the raw API token to the client
    return {
      _id: config._id,
      provider: config.provider,
      senderId: config.senderId,
      fromNumber: config.fromNumber,
      isActive: config.isActive,
      hasToken: !!config.apiToken,
      hasSecret: !!config.apiSecret,
    };
  },
});

export const saveConfig = action({
  args: {
    organizationId: v.id("organizations"),
    provider: v.union(v.literal("smsapi"), v.literal("twilio")),
    apiToken: v.string(),
    apiSecret: v.optional(v.string()),
    senderId: v.optional(v.string()),
    fromNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const now = Date.now();

    const existing = await db
      .query("orgSmsConfig")
      .eq("organizationId", String(args.organizationId))
      .first();

    if (existing) {
      await db.patch("orgSmsConfig", existing._id as string, {
        provider: args.provider,
        apiToken: args.apiToken,
        apiSecret: args.apiSecret ?? null,
        senderId: args.senderId ?? null,
        fromNumber: args.fromNumber ?? null,
        updatedAt: now,
      });
      return existing._id as string;
    }

    const configId = await db.insert("orgSmsConfig", {
      organizationId: String(args.organizationId),
      provider: args.provider,
      apiToken: args.apiToken,
      apiSecret: args.apiSecret ?? null,
      senderId: args.senderId ?? null,
      fromNumber: args.fromNumber ?? null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    return configId;
  },
});

// ---------------------------------------------------------------------------
// Toggle active state
// ---------------------------------------------------------------------------

export const toggleActive = action({
  args: {
    organizationId: v.id("organizations"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const config = await db
      .query("orgSmsConfig")
      .eq("organizationId", String(args.organizationId))
      .first();
    if (!config) throw new Error("SMS config not found");

    await db.patch("orgSmsConfig", config._id as string, {
      isActive: args.isActive,
      updatedAt: Date.now(),
    });
  },
});

// ---------------------------------------------------------------------------
// Send OTP via SMS (action — makes HTTP calls)
// ---------------------------------------------------------------------------

export const sendOtpSms = action({
  args: {
    organizationId: v.id("organizations"),
    phone: v.string(),
    code: v.string(),
  },
  handler: async (ctx, args) => {
    // Load SMS config via internal query
    const config = await ctx.runQuery(internal.sms.getConfigInternal, {
      organizationId: args.organizationId,
    });
    if (!config) throw new Error("SMS not configured for this organization");
    if (!config.isActive) throw new Error("SMS is disabled for this organization");

    const message = `Twój kod weryfikacyjny: ${args.code}. Ważny 10 minut.`;

    if (config.provider === "smsapi") {
      await sendViaSmsapi(config.apiToken, args.phone, message, config.senderId);
    } else if (config.provider === "twilio") {
      if (!config.apiSecret || !config.fromNumber) {
        throw new Error("Twilio requires API secret and phone number");
      }
      await sendViaTwilio(config.apiToken, config.apiSecret, config.fromNumber, args.phone, message);
    }

    return { sent: true };
  },
});

/** Internal query to get full SMS config (with secrets) — only callable from internal functions. */
export const getConfigInternal = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orgSmsConfig")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .unique();
  },
});

function normalizePhoneNumber(phone: string): string {
  const trimmed = phone.trim();
  const withoutWhitespace = trimmed.replace(/\s+/g, "");
  const normalizedPrefix = withoutWhitespace.startsWith("00")
    ? `+${withoutWhitespace.slice(2)}`
    : withoutWhitespace;

  if (normalizedPrefix.startsWith("+")) {
    return `+${normalizedPrefix.slice(1).replace(/\D/g, "")}`;
  }

  const digits = normalizedPrefix.replace(/\D/g, "");
  if (!digits) return trimmed;
  if (digits.length === 9) return `+48${digits}`;
  if (digits.startsWith("48") && digits.length === 11) return `+${digits}`;
  return `+${digits}`;
}

export const getConfigForInbound = internalQuery({
  args: {
    provider: v.union(v.literal("smsapi"), v.literal("twilio")),
    recipient: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.provider === "twilio") {
      return await ctx.db
        .query("orgSmsConfig")
        .withIndex("by_providerAndFromNumber", (q) =>
          q
            .eq("provider", args.provider)
            .eq("fromNumber", normalizePhoneNumber(args.recipient)),
        )
        .unique();
    }

    return await ctx.db
      .query("orgSmsConfig")
      .withIndex("by_providerAndSenderId", (q) =>
        q.eq("provider", args.provider).eq("senderId", args.recipient),
      )
      .unique();
  },
});

// ---------------------------------------------------------------------------
// Provider implementations
// ---------------------------------------------------------------------------

async function sendViaSmsapi(
  token: string,
  to: string,
  message: string,
  senderId?: string,
): Promise<{ providerMessageId?: string; metadata?: string }> {
  const params = new URLSearchParams({
    to: to.replace(/\s/g, ""),
    message,
    format: "json",
  });
  if (senderId) params.set("from", senderId);

  const res = await fetch("https://api.smsapi.pl/sms.do", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`SMSAPI error: ${res.status} ${text}`);
  }

  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = undefined;
  }

  const messageId =
    typeof parsed === "object" &&
    parsed !== null &&
    "list" in parsed &&
    Array.isArray((parsed as { list?: unknown[] }).list) &&
    typeof (parsed as { list?: Array<{ id?: unknown }> }).list?.[0]?.id ===
      "string"
      ? ((parsed as { list?: Array<{ id?: string }> }).list?.[0]?.id ?? undefined)
      : undefined;

  return {
    providerMessageId: messageId,
    metadata: text || undefined,
  };
}

async function sendViaTwilio(
  accountSid: string,
  authToken: string,
  from: string,
  to: string,
  message: string,
): Promise<{ providerMessageId?: string; metadata?: string }> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const auth = btoa(`${accountSid}:${authToken}`);

  const params = new URLSearchParams({
    To: to.replace(/\s/g, ""),
    From: from,
    Body: message,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Twilio error: ${res.status} ${text}`);
  }

  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = undefined;
  }

  return {
    providerMessageId:
      typeof parsed === "object" && parsed !== null && "sid" in parsed
        ? ((parsed as { sid?: string }).sid ?? undefined)
        : undefined,
    metadata: text || undefined,
  };
}

// ---------------------------------------------------------------------------
// sendSigningLinkSms — internal action to deliver a document-signing URL via SMS
// ---------------------------------------------------------------------------

export const sendSigningLinkSms = internalAction({
  args: {
    organizationId: v.id("organizations"),
    phone: v.string(),
    signerName: v.string(),
    documentTitle: v.string(),
    organizationName: v.string(),
    token: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const config = await ctx.runQuery(internal.sms.getConfigInternal, {
      organizationId: args.organizationId,
    });
    if (!config || !config.isActive) {
      console.warn("[sms.sendSigningLinkSms] SMS not configured or inactive — skipping");
      return { sent: false };
    }

    const APP_URL = process.env.APP_URL ?? "https://app.example.com";
    const signingUrl = `${APP_URL}/sign/${args.token}`;
    const expiryDate = new Date(args.expiresAt).toLocaleDateString("pl-PL");
    const message = `${args.organizationName} prosi o podpisanie dokumentu „${args.documentTitle}". Link: ${signingUrl} (ważny do: ${expiryDate})`;

    if (config.provider === "smsapi") {
      await sendViaSmsapi(config.apiToken, args.phone, message, config.senderId ?? undefined);
    } else if (config.provider === "twilio") {
      if (!config.apiSecret || !config.fromNumber) {
        throw new Error("Twilio requires API secret and phone number");
      }
      await sendViaTwilio(config.apiToken, config.apiSecret, config.fromNumber, args.phone, message);
    }

    return { sent: true };
  },
});

// ---------------------------------------------------------------------------
// sendAppointmentSms — internal action for appointment lifecycle SMS
// ---------------------------------------------------------------------------

export const sendAppointmentSms = internalAction({
  args: {
    organizationId: v.id("organizations"),
    phone: v.string(),
    message: v.string(),
    eventId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const config = await ctx.runQuery(internal.sms.getConfigInternal, {
      organizationId: args.organizationId,
    });

    if (!config || !config.isActive) return null;

    try {
      let result: { providerMessageId?: string; metadata?: string } | null = null;

      if (config.provider === "smsapi") {
        result = await sendViaSmsapi(
          config.apiToken,
          args.phone,
          args.message,
          config.senderId,
        );
      } else if (config.provider === "twilio") {
        if (!config.apiSecret || !config.fromNumber) return null;
        result = await sendViaTwilio(
          config.apiToken,
          config.apiSecret,
          config.fromNumber,
          args.phone,
          args.message,
        );
      }

      if (args.eventId) {
        await ctx.runMutation(internal.gabinet.appointmentSms.markEventProcessed, {
          eventId: args.eventId,
          providerMessageId: result?.providerMessageId,
          metadata: result?.metadata,
        });
      }

      return result;
    } catch (error) {
      if (args.eventId) {
        await ctx.runMutation(internal.gabinet.appointmentSms.markEventFailed, {
          eventId: args.eventId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    }
  },
});

// ---------------------------------------------------------------------------
// requestOtp — orchestrates createOtp mutation + SMS/email delivery
// ---------------------------------------------------------------------------

export const requestOtp = action({
  args: { token: v.string() },
  handler: async (ctx, args): Promise<{ sent: boolean; method: string }> => {
    // Create OTP (this validates the token and returns code + delivery info)
    const result = await ctx.runAction(api.signatureRequests.createOtp, {
      token: args.token,
    });

    const verificationMethod = String(result.verificationMethod ?? "");
    const organizationId = String(result.organizationId ?? "");
    const signerPhone =
      typeof result.signerPhone === "string" ? result.signerPhone : undefined;
    const signerEmail =
      typeof result.signerEmail === "string" ? result.signerEmail : undefined;

    if (verificationMethod === "sms") {
      if (!signerPhone) throw new Error("No phone number for SMS delivery");
      await ctx.runAction(api.sms.sendOtpSms, {
        organizationId: organizationId as never,
        phone: signerPhone,
        code: result.code,
      });
    } else if (verificationMethod === "email_otp") {
      if (!signerEmail) throw new Error("No email address for OTP delivery");
      await ctx.runAction(api.signingEmails.sendOtpEmail, {
        signerEmail,
        code: result.code,
      });
    }

    return { sent: true, method: verificationMethod };
  },
});
