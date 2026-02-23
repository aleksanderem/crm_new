import { query, mutation } from "../_generated/server";
import { v } from "convex/values";

function hashString(str: string): string {
  // Simple hash for OTP/token — in production, use crypto.subtle
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateToken(): string {
  return crypto.randomUUID() + "-" + crypto.randomUUID();
}

export const sendPortalOtp = mutation({
  args: {
    email: v.string(),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    // Find patient by email in this org
    const patient = await ctx.db
      .query("gabinetPatients")
      .withIndex("by_orgAndEmail", (q) =>
        q.eq("organizationId", args.organizationId).eq("email", args.email)
      )
      .first();

    if (!patient) {
      // Don't reveal whether patient exists
      return { success: true };
    }

    const otp = generateOtp();
    const token = generateToken();
    const now = Date.now();

    // Create or reuse session
    const existingSession = await ctx.db
      .query("gabinetPortalSessions")
      .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
      .first();

    if (existingSession) {
      await ctx.db.patch(existingSession._id, {
        otpHash: hashString(otp),
        otpExpiresAt: now + 10 * 60 * 1000, // 10 minutes
        tokenHash: hashString(token),
        isActive: false,
        lastAccessedAt: now,
      });
    } else {
      await ctx.db.insert("gabinetPortalSessions", {
        patientId: patient._id,
        organizationId: args.organizationId,
        tokenHash: hashString(token),
        otpHash: hashString(otp),
        otpExpiresAt: now + 10 * 60 * 1000,
        isActive: false,
        lastAccessedAt: now,
        createdAt: now,
        expiresAt: now + 30 * 24 * 60 * 60 * 1000, // 30 days
      });
    }

    // In production, send OTP via email. For now, log it.
    console.log(`[Patient Portal OTP] ${args.email}: ${otp}`);

    return { success: true, _devOtp: otp, _devToken: token };
  },
});

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

    if (!patient) throw new Error("Invalid credentials");

    const session = await ctx.db
      .query("gabinetPortalSessions")
      .withIndex("by_patient", (q) => q.eq("patientId", patient._id))
      .first();

    if (!session) throw new Error("No pending OTP");
    if (!session.otpHash || !session.otpExpiresAt) throw new Error("No pending OTP");
    if (Date.now() > session.otpExpiresAt) throw new Error("OTP expired");
    if (session.otpHash !== hashString(args.otp)) throw new Error("Invalid OTP");

    const now = Date.now();
    await ctx.db.patch(session._id, {
      isActive: true,
      otpHash: undefined,
      otpExpiresAt: undefined,
      lastAccessedAt: now,
      expiresAt: now + 30 * 24 * 60 * 60 * 1000,
    });

    return {
      sessionToken: session.tokenHash,
      patientId: patient._id,
      patientName: `${patient.firstName} ${patient.lastName}`,
    };
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
