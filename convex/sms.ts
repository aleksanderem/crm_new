import { action, query, mutation, internalAction, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { verifyOrgAccess } from "./_helpers/auth";

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

export const saveConfig = mutation({
  args: {
    organizationId: v.id("organizations"),
    provider: v.union(v.literal("smsapi"), v.literal("twilio")),
    apiToken: v.string(),
    apiSecret: v.optional(v.string()),
    senderId: v.optional(v.string()),
    fromNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("orgSmsConfig")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        provider: args.provider,
        apiToken: args.apiToken,
        apiSecret: args.apiSecret,
        senderId: args.senderId,
        fromNumber: args.fromNumber,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("orgSmsConfig", {
      organizationId: args.organizationId,
      provider: args.provider,
      apiToken: args.apiToken,
      apiSecret: args.apiSecret,
      senderId: args.senderId,
      fromNumber: args.fromNumber,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

// ---------------------------------------------------------------------------
// Toggle active state
// ---------------------------------------------------------------------------

export const toggleActive = mutation({
  args: {
    organizationId: v.id("organizations"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const config = await ctx.db
      .query("orgSmsConfig")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .unique();
    if (!config) throw new Error("SMS config not found");
    await ctx.db.patch(config._id, {
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
// sendAppointmentSms — internal action for appointment lifecycle SMS
// ---------------------------------------------------------------------------

export const sendAppointmentSms = internalAction({
  args: {
    organizationId: v.id("organizations"),
    phone: v.string(),
    message: v.string(),
    eventId: v.optional(v.id("appointmentSmsEvents")),
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
    const result: {
      code: string;
      verificationMethod: string;
      signerPhone?: string;
      signerEmail?: string;
      organizationId: string;
    } = await ctx.runMutation(api.signatureRequests.createOtp, {
      token: args.token,
    });

    if (result.verificationMethod === "sms") {
      if (!result.signerPhone) throw new Error("No phone number for SMS delivery");
      await ctx.runAction(api.sms.sendOtpSms, {
        organizationId: result.organizationId as never,
        phone: result.signerPhone,
        code: result.code,
      });
    }
    // email_otp: TODO — will use Resend in Phase E

    return { sent: true, method: result.verificationMethod };
  },
});
