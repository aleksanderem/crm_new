import { describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser, seedGabinetPrereqs } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setup() {
  const t = createTestCtx();
  const { organizationId, userId, identity } = await seedTestUser(t);
  const { patientId } = await seedGabinetPrereqs(t, organizationId, userId);
  return { t, organizationId, userId, identity, patientId };
}

/** Minimal TipTap doc JSON with two formField nodes. */
function makeContentJson(fields: Array<{ fieldId: string; fieldType: string; label: string }>) {
  return JSON.stringify({
    type: "doc",
    content: fields.map((f) => ({
      type: "paragraph",
      content: [
        {
          type: "formField",
          attrs: {
            fieldId: f.fieldId,
            fieldType: f.fieldType,
            label: f.label,
            options: "",
            required: false,
            filledBy: "client",
          },
        },
      ],
    })),
  });
}

async function seedIntakeTemplate(
  organizationId: string,
  userId: string,
  contentJson?: string,
) {
  const db = createSupabaseDb();
  const now = Date.now();
  const templateId = await db.insert("formTemplates", {
    organizationId,
    name: "Health Intake",
    category: "intake",
    formJson: "{}",
    contentJson: contentJson ?? null,
    modules: ["gabinet"],
    entityTypes: ["patient"],
    requiresSignature: true,
    version: 1,
    isActive: true,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });
  return templateId;
}

async function seedFormDocument(
  organizationId: string,
  templateId: string,
  patientId: string,
  userId: string,
  overrides: Record<string, unknown> = {},
) {
  const db = createSupabaseDb();
  const now = Date.now();
  const documentId = await db.insert("formDocuments", {
    organizationId,
    templateId,
    title: "Health Intake Form",
    responseData: JSON.stringify({
      html: "<p>intake</p>",
      formFieldValues: {},
    }),
    entityType: "patient",
    entityId: patientId,
    status: "signed",
    signedAt: now,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
  return documentId;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getLatestSignedIntakeByPatient", () => {
  test("returns null when no intake templates exist for the org", async () => {
    const { t, organizationId, identity, patientId } = await setup();

    const result = await t.withIdentity(identity).action(
      api["documents/documents"].getLatestSignedIntakeByPatient,
      { organizationId, patientId: String(patientId) },
    );

    expect(result).toBeNull();
  });

  test("returns null when intake template exists but no documents for patient", async () => {
    const { t, organizationId, userId, identity, patientId } = await setup();
    await seedIntakeTemplate(String(organizationId), String(userId));

    const result = await t.withIdentity(identity).action(
      api["documents/documents"].getLatestSignedIntakeByPatient,
      { organizationId, patientId: String(patientId) },
    );

    expect(result).toBeNull();
  });

  test("returns null for draft/pending_signature documents", async () => {
    const { t, organizationId, userId, identity, patientId } = await setup();
    const templateId = await seedIntakeTemplate(String(organizationId), String(userId));
    await seedFormDocument(String(organizationId), templateId, String(patientId), String(userId), {
      status: "draft",
    });
    await seedFormDocument(String(organizationId), templateId, String(patientId), String(userId), {
      status: "pending_signature",
    });

    const result = await t.withIdentity(identity).action(
      api["documents/documents"].getLatestSignedIntakeByPatient,
      { organizationId, patientId: String(patientId) },
    );

    expect(result).toBeNull();
  });

  test("returns documentId, templateId, templateName and signedAt for a signed intake", async () => {
    const { t, organizationId, userId, identity, patientId } = await setup();
    const templateId = await seedIntakeTemplate(String(organizationId), String(userId));
    const signedAt = Date.now();
    await seedFormDocument(String(organizationId), templateId, String(patientId), String(userId), {
      signedAt,
    });

    const result = await t.withIdentity(identity).action(
      api["documents/documents"].getLatestSignedIntakeByPatient,
      { organizationId, patientId: String(patientId) },
    );

    expect(result).not.toBeNull();
    expect(result!.templateId).toBe(templateId);
    expect(result!.templateName).toBe("Health Intake");
    expect(result!.signedAt).toBe(signedAt);
  });

  test("returns parsed formFieldValues from responseData", async () => {
    const { t, organizationId, userId, identity, patientId } = await setup();
    const templateId = await seedIntakeTemplate(String(organizationId), String(userId));
    await seedFormDocument(String(organizationId), templateId, String(patientId), String(userId), {
      responseData: JSON.stringify({
        html: "<p>intake</p>",
        formFieldValues: { complaint: "headache", duration: "3 days" },
      }),
    });

    const result = await t.withIdentity(identity).action(
      api["documents/documents"].getLatestSignedIntakeByPatient,
      { organizationId, patientId: String(patientId) },
    );

    expect(result).not.toBeNull();
    expect(result!.formFieldValues).toEqual({ complaint: "headache", duration: "3 days" });
  });

  test("extracts fieldDefinitions from template contentJson and groups byFieldType", async () => {
    const { t, organizationId, userId, identity, patientId } = await setup();
    const contentJson = makeContentJson([
      { fieldId: "complaint", fieldType: "textarea", label: "Main complaint" },
      { fieldId: "onset_date", fieldType: "date", label: "Onset date" },
      { fieldId: "severity", fieldType: "select", label: "Severity" },
    ]);
    const templateId = await seedIntakeTemplate(String(organizationId), String(userId), contentJson);
    await seedFormDocument(String(organizationId), templateId, String(patientId), String(userId), {
      responseData: JSON.stringify({
        html: "<p>intake</p>",
        formFieldValues: {
          complaint: "headache",
          onset_date: "2026-07-01",
          severity: "moderate",
        },
      }),
    });

    const result = await t.withIdentity(identity).action(
      api["documents/documents"].getLatestSignedIntakeByPatient,
      { organizationId, patientId: String(patientId) },
    );

    expect(result).not.toBeNull();
    expect(result!.fieldDefinitions).toHaveLength(3);

    // byFieldType groups correctly
    expect(result!.byFieldType["textarea"]).toEqual([
      { fieldId: "complaint", label: "Main complaint", value: "headache" },
    ]);
    expect(result!.byFieldType["date"]).toEqual([
      { fieldId: "onset_date", label: "Onset date", value: "2026-07-01" },
    ]);
    expect(result!.byFieldType["select"]).toEqual([
      { fieldId: "severity", label: "Severity", value: "moderate" },
    ]);
  });

  test("picks the most recent signed intake when multiple exist", async () => {
    const { t, organizationId, userId, identity, patientId } = await setup();
    const templateId = await seedIntakeTemplate(String(organizationId), String(userId));
    const olderSignedAt = Date.now() - 10_000;
    const newerSignedAt = Date.now();

    await seedFormDocument(String(organizationId), templateId, String(patientId), String(userId), {
      signedAt: olderSignedAt,
      updatedAt: olderSignedAt,
      responseData: JSON.stringify({
        html: "",
        formFieldValues: { complaint: "old value" },
      }),
    });
    await seedFormDocument(String(organizationId), templateId, String(patientId), String(userId), {
      signedAt: newerSignedAt,
      updatedAt: newerSignedAt,
      responseData: JSON.stringify({
        html: "",
        formFieldValues: { complaint: "new value" },
      }),
    });

    const result = await t.withIdentity(identity).action(
      api["documents/documents"].getLatestSignedIntakeByPatient,
      { organizationId, patientId: String(patientId) },
    );

    expect(result).not.toBeNull();
    expect(result!.formFieldValues["complaint"]).toBe("new value");
    expect(result!.signedAt).toBe(newerSignedAt);
  });

  test("ignores intake documents linked to a different patient", async () => {
    const { t, organizationId, userId, identity, patientId } = await setup();
    const templateId = await seedIntakeTemplate(String(organizationId), String(userId));
    // Document belongs to a different patient UUID
    await seedFormDocument(String(organizationId), templateId, "other-patient-uuid", String(userId));

    const result = await t.withIdentity(identity).action(
      api["documents/documents"].getLatestSignedIntakeByPatient,
      { organizationId, patientId: String(patientId) },
    );

    expect(result).toBeNull();
  });

  test("ignores non-intake templates", async () => {
    const { t, organizationId, userId, identity, patientId } = await setup();

    // Seed a consent template (not intake)
    const db = createSupabaseDb();
    const now = Date.now();
    const consentTemplateId = await db.insert("formTemplates", {
      organizationId: String(organizationId),
      name: "Consent Form",
      category: "consent",
      formJson: "{}",
      modules: ["gabinet"],
      entityTypes: ["patient"],
      requiresSignature: true,
      version: 1,
      isActive: true,
      createdBy: String(userId),
      createdAt: now,
      updatedAt: now,
    });
    await seedFormDocument(String(organizationId), consentTemplateId, String(patientId), String(userId));

    const result = await t.withIdentity(identity).action(
      api["documents/documents"].getLatestSignedIntakeByPatient,
      { organizationId, patientId: String(patientId) },
    );

    expect(result).toBeNull();
  });

  test("also returns completed-status documents", async () => {
    const { t, organizationId, userId, identity, patientId } = await setup();
    const templateId = await seedIntakeTemplate(String(organizationId), String(userId));
    await seedFormDocument(String(organizationId), templateId, String(patientId), String(userId), {
      status: "completed",
    });

    const result = await t.withIdentity(identity).action(
      api["documents/documents"].getLatestSignedIntakeByPatient,
      { organizationId, patientId: String(patientId) },
    );

    expect(result).not.toBeNull();
    expect(result!.templateName).toBe("Health Intake");
  });
});
