import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { sendEmail } from "@cvx/email";
import { AUTH_RESEND_KEY } from "@cvx/env";

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateOtp(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(100000 + (arr[0] % 900000));
}

function generateToken(): string {
  return crypto.randomUUID() + "-" + crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Rate-limit constants
// ---------------------------------------------------------------------------

const OTP_SEND_LIMIT = 5;
const OTP_SEND_WINDOW_MS = 15 * 60 * 1000; // 15 min
const VERIFY_ATTEMPT_LIMIT = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 min

// ---------------------------------------------------------------------------
// Mutations / Queries
// ---------------------------------------------------------------------------

export const sendPortalOtp = mutation({
  args: {
    email: v.string(),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const patient = await ctx.db
      .query("gabinetPatients")
      .withIndex("by_orgAndEmail", (q) =>
        q.eq("organizationId", args.organizationId).eq("email", args.email)
      )
      .first();

    if (!patient) {
      return { success: true };
    }

    const now = Date.now();
    const otp = generateOtp();
    const token = generateToken();
    const otpHash = await sha256(otp);

    const existingSession = await ctx.db
      .query("gabinetPortalSessions")
      .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
      .first();

    if (existingSession) {
      const windowStart = existingSession.otpSendWindowStart ?? 0;
      const sendCount = existingSession.otpSendCount ?? 0;

      if (now - windowStart < OTP_SEND_WINDOW_MS && sendCount >= OTP_SEND_LIMIT) {
        throw new Error("Too many OTP requests. Please try again later.");
      }

      const windowExpired = now - windowStart >= OTP_SEND_WINDOW_MS;

      await ctx.db.patch(existingSession._id, {
        otpHash,
        otpExpiresAt: now + 10 * 60 * 1000,
        tokenHash: token,
        isActive: false,
        lastAccessedAt: now,
        verifyFailCount: 0,
        lockedUntil: undefined,
        otpSendCount: windowExpired ? 1 : sendCount + 1,
        otpSendWindowStart: windowExpired ? now : windowStart,
      });
    } else {
      await ctx.db.insert("gabinetPortalSessions", {
        patientId: patient._id,
        organizationId: args.organizationId,
        tokenHash: token,
        otpHash,
        otpExpiresAt: now + 10 * 60 * 1000,
        isActive: false,
        lastAccessedAt: now,
        createdAt: now,
        expiresAt: now + 30 * 24 * 60 * 60 * 1000,
        otpSendCount: 1,
        otpSendWindowStart: now,
      });
    }

    // Send OTP via email (fallback to console if Resend not configured)
    if (AUTH_RESEND_KEY) {
      const org = await ctx.db.get(args.organizationId);
      const orgName = org?.name ?? "Portal Pacjenta";
      await sendEmail({
        to: args.email,
        subject: `Twój kod weryfikacyjny - ${orgName}`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <h2 style="margin: 0 0 16px; color: #1a1a1a;">Kod weryfikacyjny</h2>
            <p style="margin: 0 0 24px; color: #666;">
              Twój jednorazowy kod do zalogowania się do portalu pacjenta:
            </p>
            <div style="background: #f5f5f5; border-radius: 8px; padding: 24px; text-align: center;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1a1a1a;">${otp}</span>
            </div>
            <p style="margin: 24px 0 0; color: #888; font-size: 14px;">
              Kod jest ważny przez 10 minut. Jeśli nie prosiłeś o ten kod, zignoruj tę wiadomość.
            </p>
          </div>
        `,
        text: `Twój kod weryfikacyjny: ${otp}\n\nKod jest ważny przez 10 minut.`,
      });
    } else {
      console.warn("[Patient Portal OTP] Resend not configured, logging OTP to console");
      console.log(`[Patient Portal OTP] ${args.email}: ${otp}`);
    }

    return { success: true };
  },
});

/**
 * Verify an OTP code. Returns a result object instead of throwing so that
 * fail-count / lockout state is always persisted (Convex rolls back on throw).
 */
export const verifyPortalOtp = mutation({
  args: {
    email: v.string(),
    organizationId: v.id("organizations"),
    otp: v.string(),
  },
  handler: async (ctx, args) => {
    const patient = await ctx.db
      .query("gabinetPatients")
      .withIndex("by_orgAndEmail", (q) =>
        q.eq("organizationId", args.organizationId).eq("email", args.email)
      )
      .first();

    if (!patient) {
      return { success: false as const, error: "Invalid credentials" };
    }

    const session = await ctx.db
      .query("gabinetPortalSessions")
      .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
      .first();

    if (!session) {
      return { success: false as const, error: "No pending OTP" };
    }

    const now = Date.now();

    if (session.lockedUntil && now < session.lockedUntil) {
      return { success: false as const, error: "Too many failed attempts. Account is temporarily locked." };
    }

    if (!session.otpHash || !session.otpExpiresAt) {
      return { success: false as const, error: "No pending OTP" };
    }

    if (now > session.otpExpiresAt) {
      return { success: false as const, error: "OTP expired" };
    }

    const otpHash = await sha256(args.otp);

    if (session.otpHash !== otpHash) {
      const failCount = (session.verifyFailCount ?? 0) + 1;
      const locked = failCount >= VERIFY_ATTEMPT_LIMIT;

      await ctx.db.patch(session._id, {
        verifyFailCount: failCount,
        ...(locked
          ? { lockedUntil: now + LOCKOUT_DURATION_MS, otpHash: undefined, otpExpiresAt: undefined }
          : {}),
      });

      return {
        success: false as const,
        error: locked
          ? "Too many failed attempts. Account is temporarily locked."
          : "Invalid OTP",
      };
    }

    // Success — activate session, clear OTP, reset counters
    await ctx.db.patch(session._id, {
      isActive: true,
      otpHash: undefined,
      otpExpiresAt: undefined,
      lastAccessedAt: now,
      expiresAt: now + 30 * 24 * 60 * 60 * 1000,
      verifyFailCount: 0,
      lockedUntil: undefined,
    });

    return {
      success: true as const,
      sessionToken: session.tokenHash,
      patientId: patient._id,
      patientName: `${patient.firstName} ${patient.lastName}`,
    };
  },
});

export const getOrgBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    return org ? { _id: org._id, name: org.name } : null;
  },
});

export const getPortalSession = query({
  args: {
    tokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("gabinetPortalSessions")
      .withIndex("by_token", (q) => q.eq("tokenHash", args.tokenHash))
      .first();

    if (!session || !session.isActive || Date.now() > session.expiresAt) {
      return null;
    }

    const patient = await ctx.db.get(session.patientId);
    if (!patient) return null;

    return {
      patientId: patient._id,
      organizationId: session.organizationId,
      patientName: `${patient.firstName} ${patient.lastName}`,
      patientEmail: patient.email,
    };
  },
});

export const logoutPortal = mutation({
  args: {
    tokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("gabinetPortalSessions")
      .withIndex("by_token", (q) => q.eq("tokenHash", args.tokenHash))
      .first();

    if (session) {
      await ctx.db.patch(session._id, { isActive: false });
    }
  },
});
