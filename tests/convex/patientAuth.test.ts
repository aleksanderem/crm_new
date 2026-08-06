import { afterEach, beforeEach, expect, test, describe, vi } from "vitest";
import { createHash } from "crypto";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser, seedGabinetPrereqs } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

// Make `AUTH_RESEND_KEY` truthy so `_sendOtpEmail` takes the real send path
// (and exercises the emailSendLog instrumentation contract). The other env
// values come through unchanged.
vi.mock("@cvx/env", async () => {
  const actual = await vi.importActual<typeof import("@cvx/env")>("@cvx/env");
  return { ...actual, AUTH_RESEND_KEY: "test-resend-key" };
});

// Resend HTTP call inside `sendEmail()` — stub fetch globally so every OTP
// send in this file completes quickly with a "sent" outcome.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ id: "resend-test-id" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as unknown as typeof fetch,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

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

/**
 * Seed a portal session row directly into the (in-memory) Supabase store,
 * which is where the patientAuth actions read from. The convex-test ctx.db
 * is not the source of truth for portal sessions any more.
 */
async function seedPortalSession(
  patientId: string,
  organizationId: string,
  overrides: Record<string, unknown>,
) {
  const db = createSupabaseDb();
  const now = Date.now();
  await db.insert("gabinetPortalSessions", {
    patientId,
    organizationId,
    isActive: false,
    lastAccessedAt: now,
    createdAt: now,
    expiresAt: now + 30 * 24 * 60 * 60 * 1000,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// sendPortalOtp
// ---------------------------------------------------------------------------
describe("sendPortalOtp", () => {
  test("does not leak OTP or token in response", async () => {
    const { t, organizationId, identity } = await setupPatient();

    const result = await t.withIdentity(identity).action(
      api.gabinet.patientAuth.sendPortalOtp,
      { email: "jan@example.com", organizationId },
    );

    expect(result).toEqual({ success: true });
    expect(result).not.toHaveProperty("_devOtp");
    expect(result).not.toHaveProperty("_devToken");
  });

  test("stores OTP as SHA-256 hash (64-char hex)", async () => {
    const { t, organizationId, identity, patientId } = await setupPatient();

    await t.withIdentity(identity).action(
      api.gabinet.patientAuth.sendPortalOtp,
      { email: "jan@example.com", organizationId },
    );

    const db = createSupabaseDb();
    const session = await db
      .query("gabinetPortalSessions")
      .eq("patientId", String(patientId))
      .first();

    expect(session).not.toBeNull();
    expect(session!.otpHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("rate-limits after 5 sends within 15-minute window", async () => {
    const { t, organizationId, identity } = await setupPatient();
    const args = { email: "jan@example.com", organizationId };

    for (let i = 0; i < 5; i++) {
      await t.withIdentity(identity).action(
        api.gabinet.patientAuth.sendPortalOtp,
        args,
      );
    }

    await expect(
      t.withIdentity(identity).action(
        api.gabinet.patientAuth.sendPortalOtp,
        args,
      ),
    ).rejects.toThrow(/too many/i);
  });

  test("allows sending again after the rate-limit window resets", async () => {
    const { t, organizationId, identity, patientId } = await setupPatient();
    const args = { email: "jan@example.com", organizationId };

    for (let i = 0; i < 5; i++) {
      await t.withIdentity(identity).action(
        api.gabinet.patientAuth.sendPortalOtp,
        args,
      );
    }

    // Simulate window expiry via the Supabase mock (action writes there).
    const db = createSupabaseDb();
    const session = await db
      .query("gabinetPortalSessions")
      .eq("patientId", String(patientId))
      .first();
    expect(session).not.toBeNull();
    await db.patch("gabinetPortalSessions", String(session!._id), {
      otpSendWindowStart: Date.now() - 16 * 60 * 1000,
    });

    const result = await t.withIdentity(identity).action(
      api.gabinet.patientAuth.sendPortalOtp,
      args,
    );
    expect(result).toEqual({ success: true });
  });

  test("returns success even when patient does not exist (no user enumeration)", async () => {
    const { t, organizationId, identity } = await setupPatient();

    const result = await t.withIdentity(identity).action(
      api.gabinet.patientAuth.sendPortalOtp,
      { email: "nonexistent@example.com", organizationId },
    );

    expect(result).toEqual({ success: true });
  });

  // Locks in the instrumentation contract added in #1267: every OTP send
  // mirrors into `emailSendLog` with source="system" and the patient as the
  // related entity, so it shows up under /dashboard/settings/mail → Logs.
  test("writes an emailSendLog row when AUTH_RESEND_KEY is set", async () => {
    const { t, organizationId, identity, patientId } = await setupPatient();

    await t.withIdentity(identity).action(
      api.gabinet.patientAuth.sendPortalOtp,
      { email: "jan@example.com", organizationId },
    );

    const logs = await t.run(async (ctx) => {
      return await ctx.db
        .query("emailSendLog")
        .filter((q) => q.eq(q.field("organizationId"), organizationId))
        .collect();
    });

    expect(logs).toHaveLength(1);
    const [row] = logs;
    expect(row.status).toBe("sent");
    expect(row.provider).toBe("resend");
    expect(row.source).toBe("system");
    expect(row.recipientEmail).toBe("jan@example.com");
    expect(row.recipientName).toBe("Jan Kowalski");
    expect(row.relatedEntityType).toBe("gabinetPatient");
    expect(row.relatedEntityId).toBe(String(patientId));
    expect(row.subject).toMatch(/kod weryfikacyjny/i);
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

    await seedPortalSession(String(patientId), String(organizationId), {
      tokenHash: knownToken,
      otpHash: knownOtpHash,
      otpExpiresAt: now + 10 * 60 * 1000,
    });

    const result = await t.withIdentity(identity).action(
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

    await seedPortalSession(String(patientId), String(organizationId), {
      tokenHash: "some-token",
      otpHash: knownOtpHash,
      otpExpiresAt: now + 10 * 60 * 1000,
    });

    const result = await t.withIdentity(identity).action(
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

    await seedPortalSession(String(patientId), String(organizationId), {
      tokenHash: "some-token",
      otpHash: knownOtpHash,
      otpExpiresAt: now - 1000,
    });

    const result = await t.withIdentity(identity).action(
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

    await seedPortalSession(String(patientId), String(organizationId), {
      tokenHash: "token-for-reuse-test",
      otpHash: knownOtpHash,
      otpExpiresAt: now + 10 * 60 * 1000,
    });

    // First verification succeeds
    const first = await t.withIdentity(identity).action(
      api.gabinet.patientAuth.verifyPortalOtp,
      { email: "jan@example.com", organizationId, otp: knownOtp },
    );
    expect(first.success).toBe(true);

    // Second verification with same OTP must fail (OTP consumed)
    const second = await t.withIdentity(identity).action(
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

    await seedPortalSession(String(patientId), String(organizationId), {
      tokenHash: "token-for-lockout-test",
      otpHash: knownOtpHash,
      otpExpiresAt: now + 10 * 60 * 1000,
    });

    // 5 bad attempts — each persists the fail count
    for (let i = 0; i < 5; i++) {
      const r = await t.withIdentity(identity).action(
        api.gabinet.patientAuth.verifyPortalOtp,
        { email: "jan@example.com", organizationId, otp: "000000" },
      );
      expect(r.success).toBe(false);
    }

    // 6th attempt — even with the correct OTP — must be locked out
    const locked = await t.withIdentity(identity).action(
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

    await seedPortalSession(String(patientId), String(organizationId), {
      tokenHash: "token-for-lockout-expiry",
      otpHash: knownOtpHash,
      otpExpiresAt: now + 10 * 60 * 1000,
      lockedUntil: now - 1000,
      verifyFailCount: 5,
    });

    const result = await t.withIdentity(identity).action(
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
//
// Now an action that reads `gabinetPortalSessions` from Supabase, matching
// where the OTP flow writes (#540). Seed via `seedPortalSession`.
// ---------------------------------------------------------------------------
describe("getPortalSession", () => {
  test("returns session for valid active token", async () => {
    const { t, organizationId, identity, patientId } = await setupPatient();

    const rawToken = "valid-session-token-for-test";
    const tokenHash = sha256Sync(rawToken);
    const now = Date.now();

    await seedPortalSession(String(patientId), String(organizationId), {
      tokenHash,
      isActive: true,
      lastAccessedAt: now,
      createdAt: now,
      expiresAt: now + 30 * 24 * 60 * 60 * 1000,
    });

    const session = await t.withIdentity(identity).action(
      api.gabinet.patientAuth.getPortalSession,
      { tokenHash: rawToken },
    );

    expect(session).not.toBeNull();
    expect(session!.patientId).toBe(String(patientId));
  });

  test("returns null for inactive session", async () => {
    const { t, organizationId, identity, patientId } = await setupPatient();

    const rawToken = "inactive-session-token";
    const tokenHash = sha256Sync(rawToken);
    const now = Date.now();

    await seedPortalSession(String(patientId), String(organizationId), {
      tokenHash,
      isActive: false,
      lastAccessedAt: now,
      createdAt: now,
      expiresAt: now + 30 * 24 * 60 * 60 * 1000,
    });

    const session = await t.withIdentity(identity).action(
      api.gabinet.patientAuth.getPortalSession,
      { tokenHash: rawToken },
    );

    expect(session).toBeNull();
  });

  test("returns null for expired session", async () => {
    const { t, organizationId, identity, patientId } = await setupPatient();

    const rawToken = "expired-session-token";
    const tokenHash = sha256Sync(rawToken);
    const now = Date.now();

    await seedPortalSession(String(patientId), String(organizationId), {
      tokenHash,
      isActive: true,
      lastAccessedAt: now,
      createdAt: now,
      expiresAt: now - 1000,
    });

    const session = await t.withIdentity(identity).action(
      api.gabinet.patientAuth.getPortalSession,
      { tokenHash: rawToken },
    );

    expect(session).toBeNull();
  });

  test("refreshes lastAccessedAt on each valid session access", async () => {
    const { t, organizationId, identity, patientId } = await setupPatient();

    const rawToken = "session-token-for-lastaccessed-test";
    const tokenHash = sha256Sync(rawToken);
    const pastTime = Date.now() - 60_000;

    await seedPortalSession(String(patientId), String(organizationId), {
      tokenHash,
      isActive: true,
      lastAccessedAt: pastTime,
      createdAt: pastTime,
      expiresAt: pastTime + 30 * 24 * 60 * 60 * 1000,
    });

    const before = Date.now();
    const session = await t.withIdentity(identity).action(
      api.gabinet.patientAuth.getPortalSession,
      { tokenHash: rawToken },
    );
    const after = Date.now();

    expect(session).not.toBeNull();

    const db = createSupabaseDb();
    const row = await db.query("gabinetPortalSessions").eq("tokenHash", tokenHash).first();
    expect(row).not.toBeNull();
    expect(row!.lastAccessedAt as number).toBeGreaterThanOrEqual(before);
    expect(row!.lastAccessedAt as number).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------------------
// Full auth flow integration
//
// Verify against the Supabase store (the action layer's source of truth),
// which is also where `getPortalSession` now reads from (#540).
// ---------------------------------------------------------------------------
describe("full OTP auth flow", () => {
  test("send → verify → logout flips session active state", async () => {
    const { t, organizationId, identity, patientId } = await setupPatient();

    const knownOtp = "987654";
    const knownOtpHash = sha256Sync(knownOtp);
    const now = Date.now();

    // Seed a session with OTP hash ready for verification
    await seedPortalSession(String(patientId), String(organizationId), {
      otpHash: knownOtpHash,
      otpExpiresAt: now + 10 * 60 * 1000,
    });

    // Verify OTP — generates a fresh session token, stores its SHA-256 hash,
    // and returns the raw token to the client (as per the #3824 fix).
    const verifyResult = await t.withIdentity(identity).action(
      api.gabinet.patientAuth.verifyPortalOtp,
      { email: "jan@example.com", organizationId, otp: knownOtp },
    );
    expect(verifyResult.success).toBe(true);
    if (!verifyResult.success) return;

    const sessionToken = verifyResult.sessionToken;
    const sessionTokenHash = sha256Sync(sessionToken);
    expect(verifyResult.patientId).toBe(patientId);

    // Session should now be active; look it up by the stored hash
    const db = createSupabaseDb();
    const afterVerify = await db
      .query("gabinetPortalSessions")
      .eq("tokenHash", sessionTokenHash)
      .first();
    expect(afterVerify).not.toBeNull();
    expect(afterVerify!.isActive).toBe(true);

    // Logout receives the raw token, hashes it internally, deactivates the session
    await t.withIdentity(identity).action(
      api.gabinet.patientAuth.logoutPortal,
      { tokenHash: sessionToken },
    );

    const afterLogout = await db
      .query("gabinetPortalSessions")
      .eq("tokenHash", sessionTokenHash)
      .first();
    expect(afterLogout).not.toBeNull();
    expect(afterLogout!.isActive).toBe(false);
  });
});
