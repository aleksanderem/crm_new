import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { verifyOrgAccess } from "./_helpers/auth";

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

    // Load the document instance (read-only data for the signing page)
    const instance = await ctx.db.get(request.instanceId);
    if (!instance) return null;

    // Load organization name
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
// Mutations
// ---------------------------------------------------------------------------

/**
 * Send a document for signing. Creates signature requests for each slot,
 * updates instance signatures with signer info, and transitions to pending_signature.
 */
export const sendForSigning = mutation({
  args: {
    instanceId: v.id("documentInstances"),
    signers: v.array(v.object({
      slotId: v.string(),
      signerType: v.union(v.literal("internal"), v.literal("external")),
      signerUserId: v.optional(v.id("users")),
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
    const instance = await ctx.db.get(args.instanceId);
    if (!instance) throw new Error("Document not found");
    if (instance.status !== "approved" && instance.status !== "draft") {
      throw new Error("Document must be approved or draft to send for signing");
    }
    await verifyOrgAccess(ctx, instance.organizationId);

    const now = Date.now();
    const expiresAt = now + EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    const createdTokens: Array<{ slotId: string; token: string; requestId: string }> = [];

    // Update signatures array with signer info
    const updatedSignatures = [...instance.signatures];

    for (const signer of args.signers) {
      // Validate signer data
      if (signer.signerType === "external" && !signer.signerEmail) {
        throw new Error(`Email required for external signer on slot ${signer.slotId}`);
      }
      if (signer.verificationMethod === "sms" && !signer.signerPhone) {
        throw new Error(`Phone required for SMS verification on slot ${signer.slotId}`);
      }
      if (signer.signerType === "internal" && !signer.signerUserId) {
        throw new Error(`User ID required for internal signer on slot ${signer.slotId}`);
      }

      // Generate unique token
      const token = generateToken();

      // Resolve signer name for internal users
      let signerName = signer.signerName;
      let signerEmail = signer.signerEmail;
      if (signer.signerType === "internal" && signer.signerUserId) {
        const user = await ctx.db.get(signer.signerUserId);
        if (user) {
          signerName = signerName || user.name || "";
          signerEmail = signerEmail || user.email || "";
        }
      }

      // Create signature request
      const requestId = await ctx.db.insert("signatureRequests", {
        organizationId: instance.organizationId,
        instanceId: args.instanceId,
        slotId: signer.slotId,
        token,
        signerEmail,
        signerName,
        signerPhone: signer.signerPhone,
        signerUserId: signer.signerUserId,
        verificationMethod: signer.verificationMethod,
        status: "pending",
        expiresAt,
        createdAt: now,
      });

      createdTokens.push({ slotId: signer.slotId, token, requestId: requestId as string });

      // Update the corresponding signature slot, or add a new one
      const slotIndex = updatedSignatures.findIndex((s) => s.slotId === signer.slotId);
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
        // Dynamically-added signer — create a new signature slot
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
    await ctx.db.patch(args.instanceId, {
      signatures: updatedSignatures,
      status: "pending_signature",
      updatedAt: now,
    });

    // Schedule email notifications for each signer
    const org = await ctx.db.get(instance.organizationId);
    const orgName = org?.name ?? "Organizacja";

    for (const ct of createdTokens) {
      const sig = updatedSignatures.find((s) => s.slotId === ct.slotId);
      if (sig?.signerEmail) {
        await ctx.scheduler.runAfter(0, api.signingEmails.sendSigningRequestEmail, {
          signerName: sig.signerName ?? sig.signerEmail,
          signerEmail: sig.signerEmail,
          documentTitle: instance.title,
          organizationName: orgName,
          token: ct.token,
          expiresAt: expiresAt,
        });
      }
    }

    return createdTokens;
  },
});

/**
 * Sign a document externally via token (no auth required).
 * For click verification: just provide signatureData.
 * For SMS/email OTP: must verify OTP first, then sign.
 */
export const signExternal = mutation({
  args: {
    token: v.string(),
    signatureData: v.string(), // "acknowledged" or base64 PNG
  },
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("signatureRequests")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (!request) throw new Error("Invalid signing link");
    if (request.status !== "pending") throw new Error("This signing request has already been used");
    if (Date.now() > request.expiresAt) throw new Error("This signing link has expired");

    // For SMS/email_otp verification, OTP must be verified first
    if (request.verificationMethod === "sms" || request.verificationMethod === "email_otp") {
      if (!request.otpHash) throw new Error("OTP verification required before signing");
      // Check that OTP was verified (we set otpAttempts to -1 on successful verification)
      if (request.otpAttempts !== -1) throw new Error("OTP not yet verified");
    }

    const now = Date.now();

    // Mark request as signed
    await ctx.db.patch(request._id, {
      status: "signed",
      signedAt: now,
    });

    // Update the document instance signature
    const instance = await ctx.db.get(request.instanceId);
    if (!instance) throw new Error("Document not found");

    const signatures = [...instance.signatures];
    const slotIndex = signatures.findIndex((s) => s.slotId === request.slotId);
    if (slotIndex === -1) throw new Error("Signature slot not found");

    signatures[slotIndex] = {
      ...signatures[slotIndex],
      signatureData: args.signatureData,
      signedByName: request.signerName ?? "",
      signedAt: now,
    };

    // Check if all slots are signed
    const allSigned = signatures.every((s) => s.signatureData);

    await ctx.db.patch(instance._id, {
      signatures,
      status: allSigned ? "signed" : "pending_signature",
      updatedAt: now,
    });

    // Notify document author
    const author = await ctx.db.get(instance.createdBy);
    if (author?.email) {
      await ctx.scheduler.runAfter(0, api.signingEmails.sendSlotSignedNotification, {
        authorEmail: author.email,
        authorName: author.name ?? author.email,
        documentTitle: instance.title,
        signerName: request.signerName ?? request.signerEmail ?? "Sygnatariusz",
        slotLabel: signatures[slotIndex].slotLabel,
        allSigned,
      });
    }

    return { success: true, allSigned };
  },
});

/**
 * Request an OTP code to be sent. Returns the plain code for the action layer
 * to send via SMS/email. Stores hash in the request.
 */
export const createOtp = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("signatureRequests")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (!request) throw new Error("Invalid signing link");
    if (request.status !== "pending") throw new Error("Request already used");
    if (Date.now() > request.expiresAt) throw new Error("Link expired");

    // Rate limit: don't allow new OTP if one was sent less than 60 seconds ago
    if (request.otpSentAt && Date.now() - request.otpSentAt < 60_000) {
      throw new Error("Please wait before requesting a new code");
    }

    const code = generateOtpCode();
    const otpHash = await hashString(code);

    await ctx.db.patch(request._id, {
      otpHash,
      otpSentAt: Date.now(),
      otpAttempts: 0,
    });

    // Return code + delivery info so the action layer can send it
    return {
      code,
      verificationMethod: request.verificationMethod,
      signerPhone: request.signerPhone,
      signerEmail: request.signerEmail,
      organizationId: request.organizationId,
    };
  },
});

/** Verify an OTP code. */
export const verifyOtp = mutation({
  args: {
    token: v.string(),
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("signatureRequests")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (!request) throw new Error("Invalid signing link");
    if (request.status !== "pending") throw new Error("Request already used");
    if (!request.otpHash || !request.otpSentAt) throw new Error("No OTP was sent");

    // Check expiry
    if (Date.now() - request.otpSentAt > OTP_EXPIRY_MS) {
      throw new Error("Code expired. Please request a new one.");
    }

    // Check attempts
    const attempts = request.otpAttempts ?? 0;
    if (attempts >= MAX_OTP_ATTEMPTS) {
      throw new Error("Too many attempts. Please request a new code.");
    }

    // Verify hash
    const inputHash = await hashString(args.code);
    if (inputHash !== request.otpHash) {
      await ctx.db.patch(request._id, { otpAttempts: attempts + 1 });
      throw new Error("Invalid code. Please try again.");
    }

    // Mark as verified (otpAttempts = -1 signals verified)
    await ctx.db.patch(request._id, { otpAttempts: -1 });

    return { verified: true };
  },
});

/** Resend signing request (generate new token, expire old one). */
export const resend = mutation({
  args: { requestId: v.id("signatureRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Request not found");
    await verifyOrgAccess(ctx, request.organizationId);

    const now = Date.now();
    const expiresAt = now + EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    // Expire old request
    await ctx.db.patch(request._id, { status: "expired" });

    // Create new one
    const token = generateToken();
    const newId = await ctx.db.insert("signatureRequests", {
      organizationId: request.organizationId,
      instanceId: request.instanceId,
      slotId: request.slotId,
      token,
      signerEmail: request.signerEmail,
      signerName: request.signerName,
      signerPhone: request.signerPhone,
      signerUserId: request.signerUserId,
      verificationMethod: request.verificationMethod,
      status: "pending",
      expiresAt,
      createdAt: now,
    });

    return { requestId: newId, token };
  },
});
