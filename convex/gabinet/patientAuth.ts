import { query, action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { validatePortalSessionSupabase } from "../_helpers/portalSession";
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
// Actions / Queries
// ---------------------------------------------------------------------------

export const sendPortalOtp = action({
  args: {
    email: v.string(),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const db = createSupabaseDb();

    // Look up patient by org + email in Supabase
    const patient = await db.query("gabinetPatients")
      .eq("organizationId", String(args.organizationId))
      .eq("email", args.email)
      .first();

    if (!patient) {
      return { success: true };
    }

    const patientId = String(patient._id);
    const now = Date.now();
    const otp = generateOtp();
    const token = generateToken();
    const otpHash = await sha256(otp);

    // Check for existing session in Supabase
    const existingSession = await db.query("gabinetPortalSessions")
      .eq("patientId", patientId)
      .first();

    if (existingSession) {
      const windowStart = (existingSession.otpSendWindowStart as number) ?? 0;
      const sendCount = (existingSession.otpSendCount as number) ?? 0;

      if (now - windowStart < OTP_SEND_WINDOW_MS && sendCount >= OTP_SEND_LIMIT) {
        throw new Error("Too many OTP requests. Please try again later.");
      }

      const windowExpired = now - windowStart >= OTP_SEND_WINDOW_MS;

      await db.patch("gabinetPortalSessions", String(existingSession._id), {
        otpHash,
        otpExpiresAt: now + 10 * 60 * 1000,
        tokenHash: token,
        isActive: false,
        lastAccessedAt: now,
        verifyFailCount: 0,
        lockedUntil: null,
        otpSendCount: windowExpired ? 1 : sendCount + 1,
        otpSendWindowStart: windowExpired ? now : windowStart,
      });
    } else {
      await db.insert("gabinetPortalSessions", {
        patientId,
        organizationId: String(args.organizationId),
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

    // Send OTP via email — delegate to internalAction for @cvx/email
    try {
      await ctx.runAction(
        internal.gabinet.patientAuth._sendOtpEmail,
        {
          email: args.email,
          organizationId: args.organizationId,
          otp,
          patientId,
          patientName: `${patient.firstName} ${patient.lastName}`,
        },
      );
    } catch (e) {
      console.error("[sendPortalOtp] Email send FAILED:", e);
    }

    return { success: true };
  },
});

/**
 * Internal: send the OTP email via @cvx/email. Implemented as an action
 * because sendEmail() performs an outbound `fetch` (Resend HTTP API) which
 * is only allowed in Convex actions, and so that we can pass the action
 * ctx as `log.ctx` to mirror the send into emailSendLog.
 */
export const _sendOtpEmail = internalAction({
  args: {
    email: v.string(),
    organizationId: v.id("organizations"),
    otp: v.string(),
    patientId: v.string(),
    patientName: v.string(),
  },
  handler: async (ctx, args) => {
    if (AUTH_RESEND_KEY) {
      const db = createSupabaseDb();
      const org = await db.get("organizations", String(args.organizationId));
      const orgName = (org?.name as string | undefined) ?? "Portal Klienta";
      const subject = `Twój kod weryfikacyjny - ${orgName}`;
      await sendEmail({
        to: args.email,
        subject,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <h2 style="margin: 0 0 16px; color: #1a1a1a;">Kod weryfikacyjny</h2>
            <p style="margin: 0 0 24px; color: #666;">
              Twój jednorazowy kod do zalogowania się do portalu klienta:
            </p>
            <div style="background: #f5f5f5; border-radius: 8px; padding: 24px; text-align: center;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1a1a1a;">${args.otp}</span>
            </div>
            <p style="margin: 24px 0 0; color: #888; font-size: 14px;">
              Kod jest ważny przez 10 minut. Jeśli nie prosiłeś o ten kod, zignoruj tę wiadomość.
            </p>
          </div>
        `,
        text: `Twój kod weryfikacyjny: ${args.otp}\n\nKod jest ważny przez 10 minut.`,
        log: {
          ctx,
          organizationId: args.organizationId,
          source: "system",
          recipientName: args.patientName,
          relatedEntityType: "gabinetPatient",
          relatedEntityId: args.patientId,
        },
      });
    } else {
      console.warn("[Patient Portal OTP] Resend not configured, logging OTP to console");
      console.log(`[Patient Portal OTP] ${args.email}: ${args.otp}`);
    }
  },
});

/**
 * Verify an OTP code. Returns a result object instead of throwing so that
 * fail-count / lockout state is always persisted.
 */
export const verifyPortalOtp = action({
  args: {
    email: v.string(),
    organizationId: v.id("organizations"),
    otp: v.string(),
  },
  handler: async (_ctx, args) => {
    const db = createSupabaseDb();

    const patient = await db.query("gabinetPatients")
      .eq("organizationId", String(args.organizationId))
      .eq("email", args.email)
      .first();

    if (!patient) {
      return { success: false as const, error: "Invalid credentials" };
    }

    const patientId = String(patient._id);

    const session = await db.query("gabinetPortalSessions")
      .eq("patientId", patientId)
      .first();

    if (!session) {
      return { success: false as const, error: "No pending OTP" };
    }

    const now = Date.now();
    const sessionId = String(session._id);

    if (session.lockedUntil && now < (session.lockedUntil as number)) {
      return { success: false as const, error: "Too many failed attempts. Account is temporarily locked." };
    }

    if (!session.otpHash || !session.otpExpiresAt) {
      return { success: false as const, error: "No pending OTP" };
    }

    if (now > (session.otpExpiresAt as number)) {
      return { success: false as const, error: "OTP expired" };
    }

    const otpHash = await sha256(args.otp);

    if (session.otpHash !== otpHash) {
      const failCount = ((session.verifyFailCount as number) ?? 0) + 1;
      const locked = failCount >= VERIFY_ATTEMPT_LIMIT;

      await db.patch("gabinetPortalSessions", sessionId, {
        verifyFailCount: failCount,
        ...(locked
          ? { lockedUntil: now + LOCKOUT_DURATION_MS, otpHash: null, otpExpiresAt: null }
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
    await db.patch("gabinetPortalSessions", sessionId, {
      isActive: true,
      otpHash: null,
      otpExpiresAt: null,
      lastAccessedAt: now,
      expiresAt: now + 30 * 24 * 60 * 60 * 1000,
      verifyFailCount: 0,
      lockedUntil: null,
    });

    return {
      success: true as const,
      sessionToken: session.tokenHash as string,
      patientId: patient._id as string,
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

// `gabinetPortalSessions` is Supabase-only since the dual-write cleanup, so
// this must be an action that reads from Supabase. A Convex `query` over
// `ctx.db` would never see rows written by the OTP flow (#540).
export const getPortalSession = action({
  args: {
    tokenHash: v.string(),
  },
  handler: async (_ctx, args): Promise<{
    patientId: string;
    organizationId: string;
    patientName: string;
    patientEmail: string | undefined;
  } | null> => {
    const db = createSupabaseDb();

    let validated: { patientId: string; organizationId: string };
    try {
      validated = await validatePortalSessionSupabase(db, args.tokenHash);
    } catch {
      return null;
    }

    const patient = await db.get("gabinetPatients", validated.patientId);
    if (!patient) return null;

    return {
      patientId: validated.patientId,
      organizationId: validated.organizationId,
      patientName: `${patient.firstName} ${patient.lastName}`,
      patientEmail: (patient.email as string | null) ?? undefined,
    };
  },
});

export const logoutPortal = action({
  args: {
    tokenHash: v.string(),
  },
  handler: async (_ctx, args) => {
    const db = createSupabaseDb();

    const session = await db.query("gabinetPortalSessions")
      .eq("tokenHash", args.tokenHash)
      .first();

    if (session) {
      await db.patch("gabinetPortalSessions", String(session._id), { isActive: false });
    }
  },
});
