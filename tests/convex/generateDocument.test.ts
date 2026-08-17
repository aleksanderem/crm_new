import { afterEach, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

describe("documents.generate.generateDocument — scopeEntities", () => {
  async function setup() {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const db = createSupabaseDb();
    const now = Date.now();

    // Seed a minimal template (requiresSignature: false avoids the side-effects
    // branch and the scheduler noise that comes with it)
    const templateId = "tmpl-uuid-001";
    await db.insert("formTemplates", {
      _id: templateId,
      organizationId: String(organizationId),
      name: "Test Template",
      category: "intake",
      formJson: "{}",
      modules: ["gabinet"],
      entityTypes: ["appointment"],
      requiresSignature: false,
      version: 1,
      isActive: true,
      createdBy: String(userId),
      createdAt: now,
      updatedAt: now,
    });

    const patientId = "patient-uuid-001";
    const appointmentId = "appt-uuid-001";

    await db.insert("gabinetAppointments", {
      _id: appointmentId,
      organizationId: String(organizationId),
      patientId,
      treatmentId: null,
      employeeId: String(userId),
      date: "2026-07-08",
      startTime: "09:00",
      endTime: "09:30",
      status: "scheduled",
      isRecurring: false,
      createdBy: String(userId),
      createdAt: now,
      updatedAt: now,
    });

    return {
      t,
      organizationId,
      userId,
      identity,
      db,
      now,
      templateId,
      patientId,
      appointmentId,
    };
  }

  test("sets scopeEntities.patient when entityType is appointment and appointment has a patientId", async () => {
    const { t, organizationId, identity, db, templateId, patientId, appointmentId } =
      await setup();

    const result = await t.withIdentity(identity).action(
      api.documents.generate.generateDocument,
      {
        organizationId,
        templateId,
        entityType: "appointment",
        entityId: appointmentId,
        responseData: JSON.stringify({ formFieldValues: {} }),
      },
    );

    expect(result.documentId).toBeDefined();

    const doc = await db.get("formDocuments", result.documentId);
    expect(doc).not.toBeNull();
    expect(doc!.scopeEntities).toEqual({ patient: patientId });
    expect(doc!.entityType).toBe("appointment");
    expect(doc!.entityId).toBe(appointmentId);
  });

  test("leaves scopeEntities null when appointment has no patientId", async () => {
    const { t, organizationId, userId, identity, db, now, templateId } = await setup();

    const noPatientApptId = "appt-uuid-no-patient";
    await db.insert("gabinetAppointments", {
      _id: noPatientApptId,
      organizationId: String(organizationId),
      patientId: null,
      treatmentId: null,
      employeeId: String(userId),
      date: "2026-07-08",
      startTime: "10:00",
      endTime: "10:30",
      status: "scheduled",
      isRecurring: false,
      createdBy: String(userId),
      createdAt: now,
      updatedAt: now,
    });

    const result = await t.withIdentity(identity).action(
      api.documents.generate.generateDocument,
      {
        organizationId,
        templateId,
        entityType: "appointment",
        entityId: noPatientApptId,
        responseData: JSON.stringify({ formFieldValues: {} }),
      },
    );

    const doc = await db.get("formDocuments", result.documentId);
    expect(doc).not.toBeNull();
    expect(doc!.scopeEntities).toBeNull();
  });

  test("downgrades status from pending_signature to draft when patient has no email", async () => {
    const { t, organizationId, userId, identity, db, now, appointmentId } = await setup();

    // Template that requires signature
    const sigTemplateId = "tmpl-sig-uuid-001";
    await db.insert("formTemplates", {
      _id: sigTemplateId,
      organizationId: String(organizationId),
      name: "Signature Required Template",
      category: "consent",
      formJson: "{}",
      modules: ["gabinet"],
      entityTypes: ["appointment"],
      requiresSignature: true,
      version: 1,
      isActive: true,
      createdBy: String(userId),
      createdAt: now,
      updatedAt: now,
    });

    // Patient with no email
    const patientId = "patient-no-email-001";
    await db.insert("gabinetPatients", {
      _id: patientId,
      organizationId: String(organizationId),
      firstName: "Jan",
      lastName: "Kowalski",
      // email intentionally omitted
      createdBy: String(userId),
      createdAt: now,
      updatedAt: now,
    });

    const noEmailApptId = "appt-no-email-001";
    await db.insert("gabinetAppointments", {
      _id: noEmailApptId,
      organizationId: String(organizationId),
      patientId,
      treatmentId: null,
      employeeId: String(userId),
      date: "2026-07-09",
      startTime: "11:00",
      endTime: "11:30",
      status: "scheduled",
      isRecurring: false,
      createdBy: String(userId),
      createdAt: now,
      updatedAt: now,
    });

    const result = await t.withIdentity(identity).action(
      api.documents.generate.generateDocument,
      {
        organizationId,
        templateId: sigTemplateId,
        entityType: "appointment",
        entityId: noEmailApptId,
        responseData: JSON.stringify({ formFieldValues: {} }),
      },
    );

    // Status must be "draft", not "pending_signature", because there is no
    // email to deliver the signing link.
    expect(result.status).toBe("draft");

    const doc = await db.get("formDocuments", result.documentId);
    expect(doc).not.toBeNull();
    expect(doc!.status).toBe("draft");
    // Signing token is still generated so staff can resend once email is added
    expect(doc!.signingToken).toBeTruthy();
    // No expiry when there is no email
    expect(doc!.signingTokenExpiresAt).toBeNull();
  });

  test("leaves scopeEntities null for non-appointment entityType", async () => {
    const { t, organizationId, identity, db, templateId, patientId } = await setup();

    const result = await t.withIdentity(identity).action(
      api.documents.generate.generateDocument,
      {
        organizationId,
        templateId,
        entityType: "patient",
        entityId: patientId,
        responseData: JSON.stringify({ formFieldValues: {} }),
      },
    );

    const doc = await db.get("formDocuments", result.documentId);
    expect(doc).not.toBeNull();
    expect(doc!.scopeEntities).toBeNull();
  });
});
