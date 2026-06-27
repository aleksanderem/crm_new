import { query, action, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { createSupabaseDb } from "./_helpers/supabaseDb";
import { verifyOrgAccess } from "./_helpers/auth";

// Dual-write refs removed — Supabase is now primary for signature request writes

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateOtpCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const num = ((bytes[0] << 16) | (bytes[1] << 8) | bytes[2]) % 1000000;
  return num.toString().padStart(6, "0");
}

async function hashString(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const EXPIRY_DAYS = 7;
const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const MAX_OTP_ATTEMPTS = 3;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Public query — no auth required. Validates token and returns signing context. */
export const getByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("signatureRequests")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (!request) return null;
    if (request.status !== "pending") return { expired: true };
    if (Date.now() > request.expiresAt) return { expired: true };

    const instance = await ctx.db.get(request.instanceId);
    if (!instance) return null;

    const org = await ctx.db.get(request.organizationId);

    return {
      expired: false,
      request: {
        _id: request._id,
        slotId: request.slotId,
        signerName: request.signerName,
        signerEmail: request.signerEmail,
        signerPhone: request.signerPhone
          ? request.signerPhone.replace(/(\+\d{2}\s?\d{3})\s?\d{3}\s?(\d{3})/, "$1 *** $2")
          : undefined,
        verificationMethod: request.verificationMethod,
        status: request.status,
      },
      document: {
        _id: instance._id,
        title: instance.title,
        renderedContent: instance.renderedContent,
        status: instance.status,
      },
      organization: org ? { name: org.name } : undefined,
    };
  },
});

/** List signature requests for a document instance (authenticated). */
export const listByInstance = query({
  args: { instanceId: v.id("documentInstances") },
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.instanceId);
    if (!instance) return [];
    await verifyOrgAccess(ctx, instance.organizationId);

    return await ctx.db
      .query("signatureRequests")
      .withIndex("by_instance", (q) => q.eq("instanceId", args.instanceId))
      .collect();
  },
});

// ---------------------------------------------------------------------------
// Actions (Supabase-primary)
// ---------------------------------------------------------------------------

export const sendForSigning = action({
  args: {
    instanceId: v.string(),
    signers: v.array(v.object({
      slotId: v.string(),
      signerType: v.union(v.literal("internal"), v.literal("external")),
      signerUserId: v.optional(v.string()),
      signerEmail: v.optional(v.string()),
      signerName: v.optional(v.string()),
      signerPhone: v.optional(v.string()),
      verificationMethod: v.union(
        v.literal("click"),
        v.literal("sms"),
        v.literal("email_otp"),
      ),
    })),
  },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();
    const instance = await db.get("documentInstances", args.instanceId);
    if (!instance) throw new Error("Document not found");
    if (instance.status !== "approved" && instance.status !== "draft") {
      throw new Error("Document must be approved or draft to send for signing");
    }

    await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: instance.organizationId as Id<"organizations"> },
    );

    const now = Date.now();
    const expiresAt = now + EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    const createdTokens: Array<{ slotId: string; token: string; requestId: string }> = [];

    let updatedSignatures: any[];
    if (typeof instance.signatures === "string") {
      updatedSignatures = JSON.parse(instance.signatures);
    } else {
      updatedSignatures = [...(instance.signatures as any[])];
    }

    for (const signer of args.signers) {
      if (signer.signerType === "external" && !signer.signerEmail) {
        if (signer.verificationMethod !== "sms" || !signer.signerPhone) {
          throw new Error(`Email required for external signer on slot ${signer.slotId}`);
        }
      }
      if (signer.verificationMethod === "sms" && !signer.signerPhone) {
        throw new Error(`Phone required for SMS verification on slot ${signer.slotId}`);
      }
      if (signer.signerType === "internal" && !signer.signerUserId) {
        throw new Error(`User ID required for internal signer on slot ${signer.slotId}`);
      }

      const token = generateToken();

      // Resolve internal signer names via side effect
      let signerName = signer.signerName;
      let signerEmail = signer.signerEmail;
      if (signer.signerType === "internal" && signer.signerUserId) {
        try {
          const userData = await ctx.runMutation(internal.signatureRequests._resolveUser, {
            userId: signer.signerUserId,
          });
          signerName = signerName || userData.name || "";
          signerEmail = signerEmail || userData.email || "";
        } catch (e) {
          console.error("[signatureRequests.sendForSigning] User resolution FAILED:", e);
        }
      }

      const requestId = await db.insert("signatureRequests", {
        organizationId: String(instance.organizationId),
        instanceId: args.instanceId,
        slotId: signer.slotId,
        token,
        signerEmail: signerEmail ?? null,
        signerName: signerName ?? null,
        signerPhone: signer.signerPhone ?? null,
        signerUserId: signer.signerUserId ?? null,
        verificationMethod: signer.verificationMethod,
        status: "pending",
        expiresAt,
        createdAt: now,
      });

      createdTokens.push({ slotId: signer.slotId, token, requestId });

      const slotIndex = updatedSignatures.findIndex((s: any) => s.slotId === signer.slotId);
      if (slotIndex !== -1) {
        updatedSignatures[slotIndex] = {
          ...updatedSignatures[slotIndex],
          signerType: signer.signerType,
          signerUserId: signer.signerUserId,
          signerEmail,
          signerName,
          signerPhone: signer.signerPhone,
          verificationMethod: signer.verificationMethod,
        };
      } else {
        updatedSignatures.push({
          slotId: signer.slotId,
          slotLabel: signerName || signerEmail || "Sygnatariusz",
          signerType: signer.signerType,
          signerUserId: signer.signerUserId,
          signerEmail,
          signerName,
          signerPhone: signer.signerPhone,
          verificationMethod: signer.verificationMethod,
        });
      }
    }

    // Update instance
    await db.patch("documentInstances", args.instanceId, {
      signatures: JSON.stringify(updatedSignatures),
      status: "pending_signature",
      updatedAt: now,
    });

    // Schedule email notifications via side effects
    try {
      await ctx.runMutation(internal.signatureRequests._sendSigningEmails, {
        organizationId: instance.organizationId as string,
        instanceTitle: instance.title as string,
        createdTokens: JSON.stringify(createdTokens),
        signatures: JSON.stringify(updatedSignatures),
        expiresAt,
      });
    } catch (e) {
      console.error("[signatureRequests.sendForSigning] Email side effects FAILED:", e);
    }

    return createdTokens;
  },
});

export const _resolveUser = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId as Id<"users">);
    return {
      name: user?.name ?? "",
      email: user?.email ?? "",
    };
  },
});

export const _sendSigningEmails = internalMutation({
  args: {
    organizationId: v.string(),
    instanceTitle: v.string(),
    createdTokens: v.string(),
    signatures: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId as Id<"organizations">);
    const orgName = org?.name ?? "Organizacja";
    const tokens = JSON.parse(args.createdTokens) as Array<{ slotId: string; token: string; requestId: string }>;
    const sigs = JSON.parse(args.signatures) as any[];

    for (const ct of tokens) {
      const sig = sigs.find((s: any) => s.slotId === ct.slotId);
      if (sig?.signerEmail) {
        await ctx.scheduler.runAfter(0, api.signingEmails.sendSigningRequestEmail, {
          signerName: sig.signerName ?? sig.signerEmail,
          signerEmail: sig.signerEmail,
          documentTitle: args.instanceTitle,
          organizationName: orgName,
          token: ct.token,
          expiresAt: args.expiresAt,
        });
      }
      if (sig?.signerPhone && sig?.verificationMethod === "sms") {
        await ctx.scheduler.runAfter(0, internal.sms.sendSigningLinkSms, {
          organizationId: args.organizationId as Id<"organizations">,
          phone: sig.signerPhone,
          signerName: sig.signerName ?? sig.signerPhone,
          documentTitle: args.instanceTitle,
          organizationName: orgName,
          token: ct.token,
          expiresAt: args.expiresAt,
        });
      }
    }
  },
});

export const signExternal = action({
  args: {
    token: v.string(),
    signatureData: v.string(),
  },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();

    const request = await db.query("signatureRequests")
      .eq("token", args.token)
      .first();

    if (!request) throw new Error("Invalid signing link");
    if (request.status !== "pending") throw new Error("This signing request has already been used");
    if (Date.now() > (request.expiresAt as number)) throw new Error("This signing link has expired");

    if (request.verificationMethod === "sms" || request.verificationMethod === "email_otp") {
      if (!request.otpHash) throw new Error("OTP verification required before signing");
      if (request.otpAttempts !== -1) throw new Error("OTP not yet verified");
    }

    const now = Date.now();

    // Mark request as signed
    await db.patch("signatureRequests", request._id as string, {
      status: "signed",
      signedAt: now,
    });

    // Update document instance signature
    const instance = await db.get("documentInstances", request.instanceId as string);
    if (!instance) throw new Error("Document not found");

    let signatures: any[];
    if (typeof instance.signatures === "string") {
      signatures = JSON.parse(instance.signatures);
    } else {
      signatures = [...(instance.signatures as any[])];
    }

    const slotIndex = signatures.findIndex((s: any) => s.slotId === request.slotId);
    if (slotIndex === -1) throw new Error("Signature slot not found");

    signatures[slotIndex] = {
      ...signatures[slotIndex],
      signatureData: args.signatureData,
      signedByName: (request.signerName as string) ?? "",
      signedAt: now,
    };

    const allSigned = signatures.every((s: any) => s.signatureData);

    await db.patch("documentInstances", request.instanceId as string, {
      signatures: JSON.stringify(signatures),
      status: allSigned ? "signed" : "pending_signature",
      updatedAt: now,
    });

    // Notify document author via side effects
    try {
      await ctx.runMutation(internal.signatureRequests._notifyAuthor, {
        instanceId: request.instanceId as string,
        signerName: (request.signerName as string) ?? (request.signerEmail as string) ?? "Sygnatariusz",
        slotLabel: signatures[slotIndex].slotLabel ?? "",
        allSigned,
      });
    } catch (e) {
      console.error("[signatureRequests.signExternal] Author notification FAILED:", e);
    }

    return { success: true, allSigned };
  },
});

export const _notifyAuthor = internalMutation({
  args: {
    instanceId: v.string(),
    signerName: v.string(),
    slotLabel: v.string(),
    allSigned: v.boolean(),
  },
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.instanceId as Id<"documentInstances">);
    if (!instance) return;

    const author = await ctx.db.get(instance.createdBy as Id<"users">);
    if (author?.email) {
      await ctx.scheduler.runAfter(0, api.signingEmails.sendSlotSignedNotification, {
        authorEmail: author.email,
        authorName: author.name ?? author.email,
        documentTitle: instance.title as string,
        signerName: args.signerName,
        slotLabel: args.slotLabel,
        allSigned: args.allSigned,
      });
    }
  },
});

export const createOtp = action({
  args: { token: v.string() },
  handler: async (_ctx, args) => {
    const db = createSupabaseDb();

    const request = await db.query("signatureRequests")
      .eq("token", args.token)
      .first();

    if (!request) throw new Error("Invalid signing link");
    if (request.status !== "pending") throw new Error("Request already used");
    if (Date.now() > (request.expiresAt as number)) throw new Error("Link expired");

    if (request.otpSentAt && Date.now() - (request.otpSentAt as number) < 60_000) {
      throw new Error("Please wait before requesting a new code");
    }

    const code = generateOtpCode();
    const otpHash = await hashString(code);

    await db.patch("signatureRequests", request._id as string, {
      otpHash,
      otpSentAt: Date.now(),
      otpAttempts: 0,
    });

    return {
      code,
      verificationMethod: request.verificationMethod,
      signerPhone: request.signerPhone,
      signerEmail: request.signerEmail,
      organizationId: request.organizationId,
    };
  },
});

export const verifyOtp = action({
  args: {
    token: v.string(),
    code: v.string(),
  },
  handler: async (_ctx, args) => {
    const db = createSupabaseDb();

    const request = await db.query("signatureRequests")
      .eq("token", args.token)
      .first();

    if (!request) throw new Error("Invalid signing link");
    if (request.status !== "pending") throw new Error("Request already used");
    if (!request.otpHash || !request.otpSentAt) throw new Error("No OTP was sent");

    if (Date.now() - (request.otpSentAt as number) > OTP_EXPIRY_MS) {
      throw new Error("Code expired. Please request a new one.");
    }

    const attempts = (request.otpAttempts as number) ?? 0;
    if (attempts >= MAX_OTP_ATTEMPTS) {
      throw new Error("Too many attempts. Please request a new code.");
    }

    const inputHash = await hashString(args.code);
    if (inputHash !== request.otpHash) {
      await db.patch("signatureRequests", request._id as string, { otpAttempts: attempts + 1 });
      throw new Error("Invalid code. Please try again.");
    }

    // Mark as verified (otpAttempts = -1 signals verified)
    await db.patch("signatureRequests", request._id as string, { otpAttempts: -1 });

    return { verified: true };
  },
});

export const resend = action({
  args: { requestId: v.string() },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();
    const request = await db.get("signatureRequests", args.requestId);
    if (!request) throw new Error("Request not found");

    await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: request.organizationId as Id<"organizations"> },
    );

    const now = Date.now();
    const expiresAt = now + EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    // Expire old request
    await db.patch("signatureRequests", args.requestId, { status: "expired" });

    // Create new one
    const token = generateToken();
    const newId = await db.insert("signatureRequests", {
      organizationId: String(request.organizationId),
      instanceId: String(request.instanceId),
      slotId: request.slotId,
      token,
      signerEmail: request.signerEmail ?? null,
      signerName: request.signerName ?? null,
      signerPhone: request.signerPhone ?? null,
      signerUserId: request.signerUserId ?? null,
      verificationMethod: request.verificationMethod,
      status: "pending",
      expiresAt,
      createdAt: now,
    });

    // Dispatch email/SMS notification with the new token
    const instance = await db.get("documentInstances", String(request.instanceId));
    try {
      await ctx.runMutation(internal.signatureRequests._sendSigningEmails, {
        organizationId: String(request.organizationId),
        instanceTitle: String(instance?.title ?? ""),
        createdTokens: JSON.stringify([{ slotId: request.slotId, token, requestId: newId }]),
        signatures: JSON.stringify([{
          slotId: request.slotId,
          signerEmail: request.signerEmail,
          signerName: request.signerName,
          signerPhone: request.signerPhone,
          verificationMethod: request.verificationMethod,
        }]),
        expiresAt,
      });
    } catch (e) {
      console.error("[signatureRequests.resend] Notification side effects FAILED:", e);
    }

    return { requestId: newId, token };
  },
});
