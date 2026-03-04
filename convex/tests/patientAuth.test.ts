import { expect, test, describe } from "vitest";
import { createHash } from "crypto";
import { api } from "../_generated/api";
import { createTestCtx, seedTestUser, seedGabinetPrereqs } from "../_test_helpers";

/** SHA-256 helper matching what the production code uses. */
function sha256Sync(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Seed a patient and return everything needed for OTP tests. */
async function setupPatient() {
  const t = createTestCtx();
  const { organizationId, userId, identity } = await seedTestUser(t);
  const { patientId } = await seedGabinetPrereqs(t, organizationId, userId);
  return { t, organizationId, userId, identity, patientId };
}

// ---------------------------------------------------------------------------
// sendPortalOtp
// ---------------------------------------------------------------------------
describe("sendPortalOtp", () => {
  test("does not leak OTP or token in response", async () => {
    const { t, organizationId, identity } = await setupPatient();

    const result = await t.withIdentity(identity).mutation(
      api.gabinet.patientAuth.sendPortalOtp,
      { email: "jan@example.com", organizationId },
    );

    expect(result).toEqual({ success: true });
    expect(result).not.toHaveProperty("_devOtp");
    expect(result).not.toHaveProperty("_devToken");
  });

  test("stores OTP as SHA-256 hash (64-char hex)", async () => {
    const { t, organizationId, identity } = await setupPatient();

    await t.withIdentity(identity).mutation(
      api.gabinet.patientAuth.sendPortalOtp,
      { email: "jan@example.com", organizationId },
    );

    const session = await t.run(async (ctx) =>
      ctx.db.query("gabinetPortalSessions").first(),
    );

    expect(session).not.toBeNull();
    expect(session!.otpHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("rate-limits after 5 sends within 15-minute window", async () => {
    const { t, organizationId, identity } = await setupPatient();
    const args = { email: "jan@example.com", organizationId };

    for (let i = 0; i < 5; i++) {
      await t.withIdentity(identity).mutation(
        api.gabinet.patientAuth.sendPortalOtp,
        args,
      );
    }

    await expect(
      t.withIdentity(identity).mutation(
        api.gabinet.patientAuth.sendPortalOtp,
        args,
      ),
    ).rejects.toThrow(/too many/i);
  });

  test("allows sending again after the rate-limit window resets", async () => {
    const { t, organizationId, identity, patientId } = await setupPatient();
    const args = { email: "jan@example.com", organizationId };

    for (let i = 0; i < 5; i++) {
      await t.withIdentity(identity).mutation(
        api.gabinet.patientAuth.sendPortalOtp,
        args,
      );
    }

    // Simulate window expiry
    await t.run(async (ctx) => {
      const session = await ctx.db
        .query("gabinetPortalSessions")
        .withIndex("by_patient", (q) => q.eq("patientId", patientId))
        .first();
      if (session) {
        await ctx.db.patch(session._id, {
          otpSendWindowStart: Date.now() - 16 * 60 * 1000,
        });
      }
    });

    const result = await t.withIdentity(identity).mutation(
      api.gabinet.patientAuth.sendPortalOtp,
      args,
    );
    expect(result).toEqual({ success: true });
  });

  test("returns success even when patient does not exist (no user enumeration)", async () => {
    const { t, organizationId, identity } = await setupPatient();

    const result = await t.withIdentity(identity).mutation(
      api.gabinet.patientAuth.sendPortalOtp,
      { email: "nonexistent@example.com", organizationId },
    );

    expect(result).toEqual({ success: true });
  });
});

// ---------------------------------------------------------------------------
// verifyPortalOtp
// ---------------------------------------------------------------------------
describe("verifyPortalOtp", () => {
  test("accepts correct OTP and returns session token", async () => {
    const { t, organizationId, identity, patientId } = await setupPatient();

    const knownOtp = "654321";
    const knownOtpHash = sha256Sync(knownOtp);
    const knownToken = "test-token-aaaabbbb-cccc-dddd-eeee-ffffffffffff";
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("gabinetPortalSessions", {
        patientId,
        organizationId,
        tokenHash: knownToken,
        otpHash: knownOtpHash,
        otpExpiresAt: now + 10 * 60 * 1000,
        isActive: false,
        lastAccessedAt: now,
        createdAt: now,
        expiresAt: now + 30 * 24 * 60 * 60 * 1000,
      });
    });

    const result = await t.withIdentity(identity).mutation(
      api.gabinet.patientAuth.verifyPortalOtp,
      { email: "jan@example.com", organizationId, otp: knownOtp },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.sessionToken).toBe(knownToken);
      expect(result.patientId).toBe(patientId);
    }
  });

  test("rejects wrong OTP", async () => {
    const { t, organizationId, identity, patientId } = await setupPatient();

    const knownOtpHash = sha256Sync("654321");
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("gabinetPortalSessions", {
        patientId,
        organizationId,
        tokenHash: "some-token",
        otpHash: knownOtpHash,
        otpExpiresAt: now + 10 * 60 * 1000,
        isActive: false,
        lastAccessedAt: now,
        createdAt: now,
        expiresAt: now + 30 * 24 * 60 * 60 * 1000,
      });
    });

    const result = await t.withIdentity(identity).mutation(
      api.gabinet.patientAuth.verifyPortalOtp,
      { email: "jan@example.com", organizationId, otp: "000000" },
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/invalid/i);
    }
  });

  test("rejects expired OTP", async () => {
    const { t, organizationId, identity, patientId } = await setupPatient();

    const knownOtpHash = sha256Sync("654321");
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("gabinetPortalSessions", {
        patientId,
        organizationId,
        tokenHash: "some-token",
        otpHash: knownOtpHash,
        otpExpiresAt: now - 1000,
        isActive: false,
        lastAccessedAt: now,
        createdAt: now,
        expiresAt: now + 30 * 24 * 60 * 60 * 1000,
      });
    });

    const result = await t.withIdentity(identity).mutation(
      api.gabinet.patientAuth.verifyPortalOtp,
      { email: "jan@example.com", organizationId, otp: "654321" },
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/expired/i);
    }
  });

  test("OTP is invalidated after successful verification (one-time use)", async () => {
    const { t, organizationId, identity, patientId } = await setupPatient();

    const knownOtp = "654321";
    const knownOtpHash = sha256Sync(knownOtp);
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("gabinetPortalSessions", {
        patientId,
        organizationId,
        tokenHash: "token-for-reuse-test",
        otpHash: knownOtpHash,
        otpExpiresAt: now + 10 * 60 * 1000,
        isActive: false,
        lastAccessedAt: now,
        createdAt: now,
        expiresAt: now + 30 * 24 * 60 * 60 * 1000,
      });
    });

    // First verification succeeds
    const first = await t.withIdentity(identity).mutation(
      api.gabinet.patientAuth.verifyPortalOtp,
      { email: "jan@example.com", organizationId, otp: knownOtp },
    );
    expect(first.success).toBe(true);

    // Second verification with same OTP must fail (OTP consumed)
    const second = await t.withIdentity(identity).mutation(
      api.gabinet.patientAuth.verifyPortalOtp,
      { email: "jan@example.com", organizationId, otp: knownOtp },
    );
    expect(second.success).toBe(false);
  });

  test("locks out after 5 failed verification attempts", async () => {
    const { t, organizationId, identity, patientId } = await setupPatient();

    const knownOtp = "654321";
    const knownOtpHash = sha256Sync(knownOtp);
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("gabinetPortalSessions", {
        patientId,
        organizationId,
        tokenHash: "token-for-lockout-test",
        otpHash: knownOtpHash,
        otpExpiresAt: now + 10 * 60 * 1000,
        isActive: false,
        lastAccessedAt: now,
        createdAt: now,
        expiresAt: now + 30 * 24 * 60 * 60 * 1000,
      });
    });

    // 5 bad attempts — each persists the fail count
    for (let i = 0; i < 5; i++) {
      const r = await t.withIdentity(identity).mutation(
        api.gabinet.patientAuth.verifyPortalOtp,
        { email: "jan@example.com", organizationId, otp: "000000" },
      );
      expect(r.success).toBe(false);
    }

    // 6th attempt — even with the correct OTP — must be locked out
    const locked = await t.withIdentity(identity).mutation(
      api.gabinet.patientAuth.verifyPortalOtp,
      { email: "jan@example.com", organizationId, otp: knownOtp },
    );
    expect(locked.success).toBe(false);
    if (!locked.success) {
      expect(locked.error).toMatch(/locked|too many/i);
    }
  });

  test("lockout expires after cooldown period", async () => {
    const { t, organizationId, identity, patientId } = await setupPatient();

    const knownOtp = "654321";
    const knownOtpHash = sha256Sync(knownOtp);
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("gabinetPortalSessions", {
        patientId,
        organizationId,
        tokenHash: "token-for-lockout-expiry",
        otpHash: knownOtpHash,
        otpExpiresAt: now + 10 * 60 * 1000,
        isActive: false,
        lastAccessedAt: now,
        createdAt: now,
        expiresAt: now + 30 * 24 * 60 * 60 * 1000,
        lockedUntil: now - 1000,
        verifyFailCount: 5,
      });
    });

    const result = await t.withIdentity(identity).mutation(
      api.gabinet.patientAuth.verifyPortalOtp,
      { email: "jan@example.com", organizationId, otp: knownOtp },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.sessionToken).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// getPortalSession
// ---------------------------------------------------------------------------
describe("getPortalSession", () => {
  test("returns session for valid active token", async () => {
    const { t, organizationId, identity, patientId } = await setupPatient();

    const token = "valid-session-token-for-test";
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("gabinetPortalSessions", {
        patientId,
        organizationId,
        tokenHash: token,
        isActive: true,
        lastAccessedAt: now,
        createdAt: now,
        expiresAt: now + 30 * 24 * 60 * 60 * 1000,
      });
    });

    const session = await t.withIdentity(identity).query(
      api.gabinet.patientAuth.getPortalSession,
      { tokenHash: token },
    );

    expect(session).not.toBeNull();
    expect(session!.patientId).toBe(patientId);
  });

  test("returns null for inactive session", async () => {
    const { t, organizationId, identity, patientId } = await setupPatient();

    const token = "inactive-session-token";
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("gabinetPortalSessions", {
        patientId,
        organizationId,
        tokenHash: token,
        isActive: false,
        lastAccessedAt: now,
        createdAt: now,
        expiresAt: now + 30 * 24 * 60 * 60 * 1000,
      });
    });

    const session = await t.withIdentity(identity).query(
      api.gabinet.patientAuth.getPortalSession,
      { tokenHash: token },
    );

    expect(session).toBeNull();
  });

  test("returns null for expired session", async () => {
    const { t, organizationId, identity, patientId } = await setupPatient();

    const token = "expired-session-token";
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("gabinetPortalSessions", {
        patientId,
        organizationId,
        tokenHash: token,
        isActive: true,
        lastAccessedAt: now,
        createdAt: now,
        expiresAt: now - 1000,
      });
    });

    const session = await t.withIdentity(identity).query(
      api.gabinet.patientAuth.getPortalSession,
      { tokenHash: token },
    );

    expect(session).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Full auth flow integration
// ---------------------------------------------------------------------------
describe("full OTP auth flow", () => {
  test("send → verify → getSession → logout", async () => {
    const { t, organizationId, identity, patientId } = await setupPatient();

    const knownOtp = "987654";
    const knownOtpHash = sha256Sync(knownOtp);
    const knownToken = "integration-test-token-" + Date.now();
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("gabinetPortalSessions", {
        patientId,
        organizationId,
        tokenHash: knownToken,
        otpHash: knownOtpHash,
        otpExpiresAt: now + 10 * 60 * 1000,
        isActive: false,
        lastAccessedAt: now,
        createdAt: now,
        expiresAt: now + 30 * 24 * 60 * 60 * 1000,
      });
    });

    // Verify OTP
    const verifyResult = await t.withIdentity(identity).mutation(
      api.gabinet.patientAuth.verifyPortalOtp,
      { email: "jan@example.com", organizationId, otp: knownOtp },
    );
    expect(verifyResult.success).toBe(true);
    if (verifyResult.success) {
      expect(verifyResult.sessionToken).toBe(knownToken);
      expect(verifyResult.patientId).toBe(patientId);
    }

    // Get session (should be active)
    const session = await t.withIdentity(identity).query(
      api.gabinet.patientAuth.getPortalSession,
      { tokenHash: knownToken },
    );
    expect(session).not.toBeNull();
    expect(session!.patientId).toBe(patientId);

    // Logout
    await t.withIdentity(identity).mutation(
      api.gabinet.patientAuth.logoutPortal,
      { tokenHash: knownToken },
    );

    // Session should now be inactive
    const afterLogout = await t.withIdentity(identity).query(
      api.gabinet.patientAuth.getPortalSession,
      { tokenHash: knownToken },
    );
    expect(afterLogout).toBeNull();
  });
});
