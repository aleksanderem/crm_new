/**
 * Patient portal isolation — verifies that a patient's session token
 * cannot be used to read appointments, documents, packages, or loyalty
 * data belonging to a different patient, even within the same organisation.
 *
 * The patient portal uses gabinetPortalSessions (independent of orgPermissions)
 * and derives patientId server-side from the session token. There is no
 * user-supplied patientId parameter; all portal read handlers filter data by
 * the patientId bound to the presented session. These tests lock in that
 * design so future changes cannot accidentally expose cross-patient data.
 */

import { afterEach, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createTestCtx,
  seedTestUser,
  seedGabinetPrereqs,
} from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

afterEach(async () => {
  // Let any scheduler-spawned callbacks settle before the next test resets
  // the convex-test instance.
  await new Promise((resolve) => setTimeout(resolve, 0));
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Seed an active portal session for a patient in the Supabase mock. */
async function seedActiveSession(
  patientId: string,
  organizationId: string,
  token: string,
): Promise<void> {
  const db = createSupabaseDb();
  const now = Date.now();
  await db.insert("gabinetPortalSessions", {
    patientId,
    organizationId,
    tokenHash: token,
    isActive: true,
    lastAccessedAt: now,
    createdAt: now,
    expiresAt: now + 30 * 24 * 60 * 60 * 1000,
  });
}

/**
 * Seed a second patient (patient B) directly into the Supabase mock.
 * Returns the generated patient ID.
 */
async function seedPatientB(
  organizationId: string,
  userId: string,
): Promise<string> {
  const db = createSupabaseDb();
  const now = Date.now();
  return db.insert("gabinetPatients", {
    organizationId,
    firstName: "Anna",
    lastName: "Nowak",
    email: "anna@example.com",
    isActive: true,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });
}

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe("patient portal isolation — cross-patient data access", () => {
  test("getMyAppointments: patient A token returns no appointments belonging to patient B", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId: patientAId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    const patientBId = await seedPatientB(
      String(organizationId),
      String(userId),
    );

    const db = createSupabaseDb();
    const now = Date.now();

    // Seed an appointment belonging to patient B in the same org.
    await db.insert("gabinetAppointments", {
      organizationId: String(organizationId),
      patientId: patientBId,
      date: "2026-12-01",
      startTime: "10:00",
      endTime: "10:30",
      status: "scheduled",
      createdBy: String(userId),
      createdAt: now,
      updatedAt: now,
    });

    const tokenA = "isolation-appts-patient-a";
    await seedActiveSession(String(patientAId), String(organizationId), tokenA);

    const result = await t.withIdentity(identity).action(
      api.gabinet.patientPortal.getMyAppointments,
      { tokenHash: tokenA },
    );

    expect(result).toHaveLength(0);
  });

  test("getMyPackages: patient A token returns no packages belonging to patient B", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId: patientAId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    const patientBId = await seedPatientB(
      String(organizationId),
      String(userId),
    );

    const db = createSupabaseDb();
    const now = Date.now();

    const packageId = await db.insert("gabinetTreatmentPackages", {
      organizationId: String(organizationId),
      name: "Patient B Package",
      totalSessions: 5,
      price: 500,
      isActive: true,
      createdBy: String(userId),
      createdAt: now,
      updatedAt: now,
    });

    await db.insert("gabinetPackageUsage", {
      organizationId: String(organizationId),
      patientId: patientBId,
      packageId,
      status: "active",
      purchasedAt: now,
      paidAmount: 500,
      treatmentsUsed: [],
      createdAt: now,
      updatedAt: now,
    });

    const tokenA = "isolation-pkgs-patient-a";
    await seedActiveSession(String(patientAId), String(organizationId), tokenA);

    const result = await t.withIdentity(identity).action(
      api.gabinet.patientPortal.getMyPackages,
      { tokenHash: tokenA },
    );

    expect(result).toHaveLength(0);
  });

  test("getMyLoyaltyBalance: patient A token returns null, not patient B's balance", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId: patientAId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    const patientBId = await seedPatientB(
      String(organizationId),
      String(userId),
    );

    const db = createSupabaseDb();
    const now = Date.now();

    await db.insert("gabinetLoyaltyPoints", {
      organizationId: String(organizationId),
      patientId: patientBId,
      balance: 1500,
      lifetimeEarned: 2000,
      lifetimeSpent: 500,
      tier: "gold",
      createdAt: now,
      updatedAt: now,
    });

    const tokenA = "isolation-loyalty-patient-a";
    await seedActiveSession(String(patientAId), String(organizationId), tokenA);

    const result = await t.withIdentity(identity).action(
      api.gabinet.patientPortal.getMyLoyaltyBalance,
      { tokenHash: tokenA },
    );

    // Patient A has no loyalty row — result must be null, not patient B's balance.
    expect(result).toBeNull();
  });

  test("getMyLoyaltyTransactions: patient A token returns no transactions belonging to patient B", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId: patientAId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    const patientBId = await seedPatientB(
      String(organizationId),
      String(userId),
    );

    const db = createSupabaseDb();
    const now = Date.now();

    await db.insert("gabinetLoyaltyTransactions", {
      organizationId: String(organizationId),
      patientId: patientBId,
      type: "earn",
      points: 100,
      reason: "appointment",
      createdAt: now,
    });

    const tokenA = "isolation-tx-patient-a";
    await seedActiveSession(String(patientAId), String(organizationId), tokenA);

    const result = await t.withIdentity(identity).action(
      api.gabinet.patientPortal.getMyLoyaltyTransactions,
      { tokenHash: tokenA },
    );

    expect(result).toHaveLength(0);
  });

  test("listByPatientToken: patient A token returns no documents belonging to patient B", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId: patientAId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    const patientBId = await seedPatientB(
      String(organizationId),
      String(userId),
    );

    const db = createSupabaseDb();
    const now = Date.now();

    // A document linked directly to patient B in the same org.
    await db.insert("formDocuments", {
      organizationId: String(organizationId),
      entityType: "patient",
      entityId: patientBId,
      title: "Consent Form B",
      status: "sent",
      createdAt: now,
      updatedAt: now,
    });

    const tokenA = "isolation-docs-patient-a";
    await seedActiveSession(String(patientAId), String(organizationId), tokenA);

    const result = await t.withIdentity(identity).action(
      api.documents.documents.listByPatientToken,
      { tokenHash: tokenA },
    );

    expect(result).toHaveLength(0);
  });

  test("getMyProfile: patient A token returns patient A's profile, not patient B's", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId: patientAId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    // Ensure patient B exists in the same org to make the test meaningful.
    await seedPatientB(String(organizationId), String(userId));

    const tokenA = "isolation-profile-patient-a";
    await seedActiveSession(String(patientAId), String(organizationId), tokenA);

    const result = await t.withIdentity(identity).action(
      api.gabinet.patientPortal.getMyProfile,
      { tokenHash: tokenA },
    );

    // seedGabinetPrereqs seeds patient A with jan@example.com.
    expect(result.email).toBe("jan@example.com");
    expect(result.email).not.toBe("anna@example.com");
  });

  test("expired session token is rejected regardless of patient data", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId: patientAId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    const db = createSupabaseDb();
    const now = Date.now();

    // Seed an expired session for patient A.
    await db.insert("gabinetPortalSessions", {
      patientId: String(patientAId),
      organizationId: String(organizationId),
      tokenHash: "expired-token-isolation",
      isActive: true,
      lastAccessedAt: now,
      createdAt: now,
      expiresAt: now - 1000, // already expired
    });

    await expect(
      t.withIdentity(identity).action(
        api.gabinet.patientPortal.getMyAppointments,
        { tokenHash: "expired-token-isolation" },
      ),
    ).rejects.toThrow(/invalid|expired/i);
  });

  test("inactive session token is rejected regardless of patient data", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId: patientAId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    const db = createSupabaseDb();
    const now = Date.now();

    // Seed an inactive (logged-out) session for patient A.
    await db.insert("gabinetPortalSessions", {
      patientId: String(patientAId),
      organizationId: String(organizationId),
      tokenHash: "inactive-token-isolation",
      isActive: false,
      lastAccessedAt: now,
      createdAt: now,
      expiresAt: now + 30 * 24 * 60 * 60 * 1000,
    });

    await expect(
      t.withIdentity(identity).action(
        api.gabinet.patientPortal.getMyAppointments,
        { tokenHash: "inactive-token-isolation" },
      ),
    ).rejects.toThrow(/invalid|expired/i);
  });
});
