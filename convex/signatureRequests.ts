import { action, internalAction, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { createSupabaseDb } from "./_helpers/supabaseDb";

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
// Public read action
// ---------------------------------------------------------------------------

/** Public action — no auth required. Validates token and returns signing context. */
export const getByToken = action({
  args: { token: v.string() },
  handler: async (_ctx, args) => {
    const db = createSupabaseDb();

    const request = await db.query("signatureRequests")
      .eq("token", args.token)
      .first();

    if (!request) return null;
    if (request.status !== "pending") return { expired: true };
    if (Date.now() > (request.expiresAt as number)) return { expired: true };

    const org = await db.get("organizations", request.organizationId as string);

    return {
      expired: false,
      request: {
        _id: request._id as string,
        slotId: request.slotId as string,
        signerName: request.signerName as string | undefined,
        signerEmail: request.signerEmail as string | undefined,
        signerPhone: request.signerPhone
          ? (request.signerPhone as string).replace(/(\+\d{2}\s?\d{3})\s?\d{3}\s?(\d{3})/, "$1 *** $2")
          : undefined,
        verificationMethod: request.verificationMethod as string,
        status: request.status as string,
      },
      document: {
        title: (request.documentTitle as string) ?? "",
        renderedContent: request.renderedContent as string | undefined,
        status: "pending_signature",
      },
      organization: org ? { name: org.name as string } : undefined,
    };
  },
});

/** List signature requests for a document instance (authenticated). */
export const listByInstance = action({
  args: { instanceId: v.string() },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();

    const requests = await db.query("signatureRequests")
      .eq("instanceId", args.instanceId)
      .collect();

    if (requests.length === 0) return [];

    await ctx.runAction(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: String(requests[0].organizationId),
    });

    return requests;
  },
});

// ---------------------------------------------------------------------------
// Actions (Supabase-primary)
// ---------------------------------------------------------------------------

export const sendForSigning = action({
  args: {
    organizationId: v.string(),
    documentTitle: v.string(),
    renderedContent: v.optional(v.string()),
    documentCreatedBy: v.optional(v.string()),
    instanceId: v.optional(v.string()),
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
    await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();
    const now = Date.now();
    const expiresAt = now + EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    const createdTokens: Array<{ slotId: string; token: string; requestId: string }> = [];
    const signersForEmail: Array<{
      slotId: string;
      signerEmail?: string;
      signerName?: string;
      signerPhone?: string;
      verificationMethod: string;
    }> = [];

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

      let signerName = signer.signerName;
      let signerEmail = signer.signerEmail;
      if (signer.signerType === "internal" && signer.signerUserId) {
        try {
          const userData = await ctx.runAction(internal.signatureRequests._resolveUser, {
            userId: signer.signerUserId,
          });
          signerName = signerName || userData.name || "";
          signerEmail = signerEmail || userData.email || "";
        } catch (e) {
          console.error("[signatureRequests.sendForSigning] User resolution FAILED:", e);
        }
      }

      const slotLabel = signerName || signerEmail || "Sygnatariusz";

      const requestId = await db.insert("signatureRequests", {
        organizationId: args.organizationId,
        instanceId: args.instanceId ?? null,
        documentTitle: args.documentTitle,
        renderedContent: args.renderedContent ?? null,
        documentCreatedBy: args.documentCreatedBy ?? null,
        slotLabel,
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
      signersForEmail.push({
        slotId: signer.slotId,
        signerEmail,
        signerName,
        signerPhone: signer.signerPhone,
        verificationMethod: signer.verificationMethod,
      });
    }

    try {
      const orgData = await db.get("organizations", args.organizationId);
      await ctx.runMutation(internal.signatureRequests._sendSigningEmails, {
        organizationId: args.organizationId,
        orgName: (orgData?.name as string) ?? "Organizacja",
        instanceTitle: args.documentTitle,
        createdTokens: JSON.stringify(createdTokens),
        signatures: JSON.stringify(signersForEmail),
        expiresAt,
      });
    } catch (e) {
      console.error("[signatureRequests.sendForSigning] Email side effects FAILED:", e);
    }

    return createdTokens;
  },
});

export const _resolveUser = internalAction({
  args: { userId: v.string() },
  handler: async (_ctx, args) => {
    const db = createSupabaseDb();
    const user = await db.get("users", args.userId);
    return {
      name: (user?.name as string) ?? "",
      email: (user?.email as string) ?? "",
    };
  },
});

export const _sendSigningEmails = internalMutation({
  args: {
    organizationId: v.string(),
    orgName: v.string(),
    instanceTitle: v.string(),
    createdTokens: v.string(),
    signatures: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const orgName = args.orgName;
    const tokens = JSON.parse(args.createdTokens) as Array<{ slotId: string; token: string; requestId: string }>;
    const sigs = JSON.parse(args.signatures) as any[];

    for (const ct of tokens) {
      const sig = sigs.find((s: any) => s.slotId === ct.slotId);
      if (sig?.signerEmail) {
        await ctx.scheduler.runAfter(0, internal.signingEmails.sendSigningRequestEmail, {
          signerName: sig.signerName ?? sig.signerEmail,
          signerEmail: sig.signerEmail,
          documentTitle: args.instanceTitle,
          organizationName: orgName,
          token: ct.token,
          expiresAt: args.expiresAt,
          organizationId: args.organizationId,
        });
      }
      if (sig?.signerPhone && sig?.verificationMethod === "sms") {
        await ctx.scheduler.runAfter(0, internal.sms.sendSigningLinkSms, {
          organizationId: args.organizationId,
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

    // Atomic compare-and-swap: only update if status is still pending.
    // Prevents a concurrent second request from signing the same slot.
    const updated = await db.patchConditional(
      "signatureRequests",
      request._id as string,
      { status: "signed", signedAt: now, signatureData: args.signatureData },
      { status: "pending" },
    );
    if (!updated) throw new Error("This signing request has already been used");

    // Determine if all slots for this document are now signed by querying siblings.
    let allSigned = true;
    if (request.instanceId) {
      const allRequests = await db.query("signatureRequests")
        .eq("instanceId", String(request.instanceId))
        .collect();
      // The CAS update above committed before this query, so the current row shows "signed".
      allSigned = allRequests.every((r: any) => r.status === "signed");
    }

    // Notify document author via side effects
    try {
      let authorEmail: string | undefined;
      let authorName: string | undefined;
      const documentCreatedBy = request.documentCreatedBy ? String(request.documentCreatedBy) : null;
      if (documentCreatedBy) {
        const authorUser = await db.get("users", documentCreatedBy);
        authorEmail = authorUser?.email as string | undefined;
        authorName = (authorUser?.name as string) ?? authorEmail;
      }
      await ctx.runMutation(internal.signatureRequests._notifyAuthor, {
        authorEmail,
        authorName,
        documentTitle: (request.documentTitle as string) ?? "",
        signerName: (request.signerName as string) ?? (request.signerEmail as string) ?? "Sygnatariusz",
        slotLabel: (request.slotLabel as string) ?? "",
        allSigned,
      });
    } catch (e) {
      console.error("[signatureRequests.signExternal] Author notification FAILED:", e);
    }

    // Audit log: record the signing event. Best-effort — a log failure must
    // never roll back a successfully completed signature.
    const auditUserId = request.documentCreatedBy ? String(request.documentCreatedBy) : null;
    if (auditUserId) {
      try {
        await db.insert("auditLog", {
          organizationId: String(request.organizationId),
          userId: auditUserId,
          action: "document.signed",
          entityType: "signatureRequest",
          entityId: String(request._id),
          details: JSON.stringify({
            requestId: String(request._id),
            slotId: String(request.slotId),
            signerName: (request.signerName as string) || undefined,
            signerEmail: (request.signerEmail as string) || undefined,
            verificationMethod: String(request.verificationMethod),
            allSigned,
          }),
          createdAt: now,
        });
      } catch (err) {
        console.error("[signatureRequests.signExternal] audit log write failed", err);
      }
    }

    return { success: true, allSigned };
  },
});

export const _notifyAuthor = internalMutation({
  args: {
    authorEmail: v.optional(v.string()),
    authorName: v.optional(v.string()),
    documentTitle: v.string(),
    signerName: v.string(),
    slotLabel: v.string(),
    allSigned: v.boolean(),
  },
  handler: async (ctx, args) => {
    if (!args.authorEmail) return;
    await ctx.scheduler.runAfter(0, internal.signingEmails.sendSlotSignedNotification, {
      authorEmail: args.authorEmail,
      authorName: args.authorName ?? args.authorEmail,
      documentTitle: args.documentTitle,
      signerName: args.signerName,
      slotLabel: args.slotLabel,
      allSigned: args.allSigned,
    });
  },
});

export const createOtp = internalAction({
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

    await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: String(request.organizationId) },
    );

    const now = Date.now();
    const expiresAt = now + EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    // Expire old request
    await db.patch("signatureRequests", args.requestId, { status: "expired" });

    // Create new one, copying all embedded document metadata from the original
    const token = generateToken();
    const newId = await db.insert("signatureRequests", {
      organizationId: String(request.organizationId),
      instanceId: request.instanceId ? String(request.instanceId) : null,
      documentTitle: (request.documentTitle as string) ?? "",
      renderedContent: request.renderedContent as string | null ?? null,
      documentCreatedBy: request.documentCreatedBy as string | null ?? null,
      slotLabel: request.slotLabel as string | null ?? null,
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

    const orgData = await db.get("organizations", String(request.organizationId));
    try {
      await ctx.runMutation(internal.signatureRequests._sendSigningEmails, {
        organizationId: String(request.organizationId),
        orgName: (orgData?.name as string) ?? "Organizacja",
        instanceTitle: (request.documentTitle as string) ?? "",
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
