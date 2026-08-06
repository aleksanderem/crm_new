import { afterEach, describe, expect, test } from "vitest";
import { internal } from "../../convex/_generated/api";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";
import {
  createTestCtx,
  seedTestUser,
  seedGabinetPrereqs,
} from "../../convex/_test_helpers";

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

const THIRTEEN_MONTHS_MS = 13 * 30 * 24 * 60 * 60 * 1000;

describe("gabinet/patients._purgeExpiredPatients — GDPR retention cron", () => {
  test("anonymizes an inactive patient past the retention cutoff", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);
    const { patientId } = await seedGabinetPrereqs(t, organizationId, userId);

    const orgIdStr = String(organizationId);
    const userIdStr = String(userId);
    const patientIdStr = String(patientId);
    const db = createSupabaseDb();

    // Seed retention policy and owner membership in the Supabase mock
    await db.insert("orgSettings", {
      organizationId: orgIdStr,
      patientRetentionMonths: 12,
      allowCustomLostReason: false,
      lostReasonRequired: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await db.insert("teamMemberships", {
      organizationId: orgIdStr,
      userId: userIdStr,
      role: "owner",
      joinedAt: Date.now(),
    });

    // Mark patient inactive and backdate past the 12-month retention cutoff
    await db.patch("gabinetPatients", patientIdStr, {
      isActive: false,
      updatedAt: Date.now() - THIRTEEN_MONTHS_MS,
    });

    await t.action(internal.gabinet.patients._purgeExpiredPatients, {});

    const patient = await db.get("gabinetPatients", patientIdStr);
    expect(patient?.firstName).toBe("ANONIMOWY");
    expect(String(patient?.email ?? "")).toContain("gdpr.invalid");
    expect(patient?.phone).toBeNull();
    expect(patient?.pesel).toBeNull();
  });

  test("writes an audit log entry with action gdpr_patient_erased", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);
    const { patientId } = await seedGabinetPrereqs(t, organizationId, userId);

    const orgIdStr = String(organizationId);
    const userIdStr = String(userId);
    const patientIdStr = String(patientId);
    const db = createSupabaseDb();

    await db.insert("orgSettings", {
      organizationId: orgIdStr,
      patientRetentionMonths: 12,
      allowCustomLostReason: false,
      lostReasonRequired: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await db.insert("teamMemberships", {
      organizationId: orgIdStr,
      userId: userIdStr,
      role: "owner",
      joinedAt: Date.now(),
    });

    await db.patch("gabinetPatients", patientIdStr, {
      isActive: false,
      updatedAt: Date.now() - THIRTEEN_MONTHS_MS,
    });

    await t.action(internal.gabinet.patients._purgeExpiredPatients, {});

    const auditEntries = await t.run(async (ctx) =>
      ctx.db
        .query("auditLog")
        .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
        .collect(),
    );

    const erasureEntry = auditEntries.find((e) => e.action === "gdpr_patient_erased");
    expect(erasureEntry).toBeDefined();
    expect(erasureEntry?.entityId).toBe(patientIdStr);
  });

  test("skips active patients regardless of age", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);
    const { patientId } = await seedGabinetPrereqs(t, organizationId, userId);

    const orgIdStr = String(organizationId);
    const userIdStr = String(userId);
    const patientIdStr = String(patientId);
    const db = createSupabaseDb();

    await db.insert("orgSettings", {
      organizationId: orgIdStr,
      patientRetentionMonths: 12,
      allowCustomLostReason: false,
      lostReasonRequired: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await db.insert("teamMemberships", {
      organizationId: orgIdStr,
      userId: userIdStr,
      role: "owner",
      joinedAt: Date.now(),
    });

    // Patient remains active — backdate updatedAt but keep isActive: true
    await db.patch("gabinetPatients", patientIdStr, {
      isActive: true,
      updatedAt: Date.now() - THIRTEEN_MONTHS_MS,
    });

    await t.action(internal.gabinet.patients._purgeExpiredPatients, {});

    const patient = await db.get("gabinetPatients", patientIdStr);
    expect(patient?.firstName).toBe("Jan");
  });

  test("skips inactive patients still within the retention window", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);
    const { patientId } = await seedGabinetPrereqs(t, organizationId, userId);

    const orgIdStr = String(organizationId);
    const userIdStr = String(userId);
    const patientIdStr = String(patientId);
    const db = createSupabaseDb();

    await db.insert("orgSettings", {
      organizationId: orgIdStr,
      patientRetentionMonths: 12,
      allowCustomLostReason: false,
      lostReasonRequired: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await db.insert("teamMemberships", {
      organizationId: orgIdStr,
      userId: userIdStr,
      role: "owner",
      joinedAt: Date.now(),
    });

    // Inactive but only 6 months old — within the 12-month retention window
    await db.patch("gabinetPatients", patientIdStr, {
      isActive: false,
      updatedAt: Date.now() - 6 * 30 * 24 * 60 * 60 * 1000,
    });

    await t.action(internal.gabinet.patients._purgeExpiredPatients, {});

    const patient = await db.get("gabinetPatients", patientIdStr);
    expect(patient?.firstName).toBe("Jan");
  });

  test("is a no-op when no org has retention configured", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);
    const { patientId } = await seedGabinetPrereqs(t, organizationId, userId);

    const patientIdStr = String(patientId);
    const db = createSupabaseDb();

    // No orgSettings seeded — no retention policy anywhere
    await db.patch("gabinetPatients", patientIdStr, {
      isActive: false,
      updatedAt: Date.now() - THIRTEEN_MONTHS_MS,
    });

    await t.action(internal.gabinet.patients._purgeExpiredPatients, {});

    const patient = await db.get("gabinetPatients", patientIdStr);
    expect(patient?.firstName).toBe("Jan");
  });

  test("skips already-anonymized patients (idempotent)", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);
    const { patientId } = await seedGabinetPrereqs(t, organizationId, userId);

    const orgIdStr = String(organizationId);
    const userIdStr = String(userId);
    const patientIdStr = String(patientId);
    const db = createSupabaseDb();

    await db.insert("orgSettings", {
      organizationId: orgIdStr,
      patientRetentionMonths: 12,
      allowCustomLostReason: false,
      lostReasonRequired: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await db.insert("teamMemberships", {
      organizationId: orgIdStr,
      userId: userIdStr,
      role: "owner",
      joinedAt: Date.now(),
    });

    // Pre-anonymize the patient (simulates a prior GDPR erasure)
    const anonSuffix = patientIdStr.slice(-6).toUpperCase();
    await db.patch("gabinetPatients", patientIdStr, {
      firstName: "ANONIMOWY",
      lastName: `#${anonSuffix}`,
      isActive: false,
      updatedAt: Date.now() - THIRTEEN_MONTHS_MS,
    });

    // Should not throw and should not re-process the already-anonymized patient
    await t.action(internal.gabinet.patients._purgeExpiredPatients, {});

    const patient = await db.get("gabinetPatients", patientIdStr);
    expect(patient?.firstName).toBe("ANONIMOWY");
    expect(patient?.lastName).toBe(`#${anonSuffix}`);
  });
});
