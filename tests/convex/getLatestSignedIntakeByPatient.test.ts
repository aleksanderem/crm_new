import { afterEach, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

describe("documents.getLatestSignedIntakeByPatient", () => {
  async function setup() {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const db = createSupabaseDb();
    const now = Date.now();

    const patientId = await t.run(async (ctx) => {
      return await ctx.db.insert("gabinetPatients", {
        organizationId,
        firstName: "Anna",
        lastName: "Kowalska",
        email: "anna@example.com",
        isActive: true,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
    });

    await db.insert("gabinetPatients", {
      _id: patientId,
      organizationId: String(organizationId),
      firstName: "Anna",
      lastName: "Kowalska",
      email: "anna@example.com",
      isActive: true,
      createdBy: String(userId),
      createdAt: now,
      updatedAt: now,
    });

    // Seed an intake form template
    const templateId = await t.run(async (ctx) => {
      return await ctx.db.insert("formTemplates", {
        organizationId,
        name: "Wywiad lekarki",
        category: "intake",
        formJson: "{}",
        modules: ["gabinet"],
        entityTypes: ["patient", "appointment"],
        requiresSignature: true,
        version: 1,
        isActive: true,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
    });

    await db.insert("formTemplates", {
      _id: templateId,
      organizationId: String(organizationId),
      name: "Wywiad lekarki",
      category: "intake",
      formJson: "{}",
      modules: ["gabinet"],
      entityTypes: ["patient", "appointment"],
      requiresSignature: true,
      version: 1,
      isActive: true,
      createdBy: String(userId),
      createdAt: now,
      updatedAt: now,
    });

    return { t, organizationId, userId, identity, patientId, templateId, db, now };
  }

  test("returns null when no intake documents exist", async () => {
    const { t, organizationId, identity, patientId } = await setup();

    const result = await t.withIdentity(identity).action(
      api.documents.documents.getLatestSignedIntakeByPatient,
      { organizationId, patientId: String(patientId) },
    );

    expect(result).toBeNull();
  });

  test("returns null when intake exists but is not signed/completed", async () => {
    const { t, organizationId, userId, identity, patientId, templateId, db, now } = await setup();

    const docId = await t.run(async (ctx) => {
      return await ctx.db.insert("formDocuments", {
        organizationId,
        templateId,
        title: "Wywiad",
        responseData: JSON.stringify({ formFieldValues: { q1: "a1" } }),
        entityType: "patient",
        entityId: String(patientId),
        status: "pending_signature",
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
    });

    await db.insert("formDocuments", {
      _id: docId,
      organizationId: String(organizationId),
      templateId: String(templateId),
      title: "Wywiad",
      responseData: JSON.stringify({ formFieldValues: { q1: "a1" } }),
      entityType: "patient",
      entityId: String(patientId),
      status: "pending_signature",
      createdBy: String(userId),
      createdAt: now,
      updatedAt: now,
    });

    const result = await t.withIdentity(identity).action(
      api.documents.documents.getLatestSignedIntakeByPatient,
      { organizationId, patientId: String(patientId) },
    );

    expect(result).toBeNull();
  });

  test("returns signed intake document linked directly to patient", async () => {
    const { t, organizationId, userId, identity, patientId, templateId, db, now } = await setup();

    const signedAt = now + 1000;
    const responseData = JSON.stringify({ formFieldValues: { name: "Anna", age: "30" } });

    const docId = await t.run(async (ctx) => {
      return await ctx.db.insert("formDocuments", {
        organizationId,
        templateId,
        title: "Wywiad",
        responseData,
        entityType: "patient",
        entityId: String(patientId),
        status: "signed",
        signedAt,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
    });

    await db.insert("formDocuments", {
      _id: docId,
      organizationId: String(organizationId),
      templateId: String(templateId),
      title: "Wywiad",
      responseData,
      entityType: "patient",
      entityId: String(patientId),
      status: "signed",
      signedAt,
      createdBy: String(userId),
      createdAt: now,
      updatedAt: now,
    });

    const result = await t.withIdentity(identity).action(
      api.documents.documents.getLatestSignedIntakeByPatient,
      { organizationId, patientId: String(patientId) },
    );

    expect(result).not.toBeNull();
    expect(result!.id).toBe(String(docId));
    expect(result!.signedAt).toBe(signedAt);
    expect(result!.responseData).toBe(responseData);
    expect(result!.formFieldValues).toEqual({ name: "Anna", age: "30" });
    expect(result!.templateId).toBe(String(templateId));
    // Template has no contentJson → both arrays must be empty
    expect(result!.fieldDefinitions).toEqual([]);
    expect(result!.intakeSummary).toEqual([]);
  });

  test("returns intake document linked to appointment via scopeEntities", async () => {
    const { t, organizationId, userId, identity, patientId, templateId, db, now } = await setup();

    const signedAt = now + 2000;
    const responseData = JSON.stringify({ formFieldValues: { condition: "healthy" } });

    const docId = await t.run(async (ctx) => {
      return await ctx.db.insert("formDocuments", {
        organizationId,
        templateId,
        title: "Wywiad — wizyta",
        responseData,
        entityType: "appointment",
        entityId: "appt-uuid-123",
        scopeEntities: JSON.stringify({ patient: String(patientId) }),
        status: "signed",
        signedAt,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
    });

    await db.insert("formDocuments", {
      _id: docId,
      organizationId: String(organizationId),
      templateId: String(templateId),
      title: "Wywiad — wizyta",
      responseData,
      entityType: "appointment",
      entityId: "appt-uuid-123",
      scopeEntities: { patient: String(patientId) },
      status: "signed",
      signedAt,
      createdBy: String(userId),
      createdAt: now,
      updatedAt: now,
    });

    const result = await t.withIdentity(identity).action(
      api.documents.documents.getLatestSignedIntakeByPatient,
      { organizationId, patientId: String(patientId) },
    );

    expect(result).not.toBeNull();
    expect(result!.id).toBe(String(docId));
    expect(result!.signedAt).toBe(signedAt);
    expect(result!.formFieldValues).toEqual({ condition: "healthy" });
    expect(result!.fieldDefinitions).toEqual([]);
    expect(result!.intakeSummary).toEqual([]);
  });

  test("returns the most recently signed document when multiple exist", async () => {
    const { t, organizationId, userId, identity, patientId, templateId, db, now } = await setup();

    const olderSignedAt = now + 1000;
    const newerSignedAt = now + 5000;
    const responseOld = JSON.stringify({ formFieldValues: { visit: "first" } });
    const responseNew = JSON.stringify({ formFieldValues: { visit: "second" } });

    const [oldDocId, newDocId] = await t.run(async (ctx) => {
      const a = await ctx.db.insert("formDocuments", {
        organizationId,
        templateId,
        title: "Wywiad 1",
        responseData: responseOld,
        entityType: "patient",
        entityId: String(patientId),
        status: "signed",
        signedAt: olderSignedAt,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
      const b = await ctx.db.insert("formDocuments", {
        organizationId,
        templateId,
        title: "Wywiad 2",
        responseData: responseNew,
        entityType: "patient",
        entityId: String(patientId),
        status: "signed",
        signedAt: newerSignedAt,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
      return [a, b];
    });

    await db.insert("formDocuments", {
      _id: oldDocId,
      organizationId: String(organizationId),
      templateId: String(templateId),
      title: "Wywiad 1",
      responseData: responseOld,
      entityType: "patient",
      entityId: String(patientId),
      status: "signed",
      signedAt: olderSignedAt,
      createdBy: String(userId),
      createdAt: now,
      updatedAt: now,
    });

    await db.insert("formDocuments", {
      _id: newDocId,
      organizationId: String(organizationId),
      templateId: String(templateId),
      title: "Wywiad 2",
      responseData: responseNew,
      entityType: "patient",
      entityId: String(patientId),
      status: "signed",
      signedAt: newerSignedAt,
      createdBy: String(userId),
      createdAt: now,
      updatedAt: now,
    });

    const result = await t.withIdentity(identity).action(
      api.documents.documents.getLatestSignedIntakeByPatient,
      { organizationId, patientId: String(patientId) },
    );

    expect(result).not.toBeNull();
    expect(result!.id).toBe(String(newDocId));
    expect(result!.formFieldValues).toEqual({ visit: "second" });
  });

  test("extracts fieldDefinitions and intakeSummary from template contentJson", async () => {
    const { t, organizationId, userId, identity, patientId, db, now } = await setup();

    const contentJson = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "formField",
          attrs: { fieldId: "allergies", fieldType: "textarea", label: "Alergie" },
        },
        {
          type: "formField",
          attrs: { fieldId: "diabetes", fieldType: "checkbox", label: "Cukrzyca" },
        },
        {
          type: "formField",
          attrs: { fieldId: "medications", fieldType: "text", label: "Leki" },
        },
      ],
    });

    const richTemplateId = await t.run(async (ctx) => {
      return await ctx.db.insert("formTemplates", {
        organizationId,
        name: "Wywiad z contentJson",
        category: "intake",
        formJson: "{}",
        contentJson,
        modules: ["gabinet"],
        entityTypes: ["patient"],
        requiresSignature: true,
        version: 1,
        isActive: true,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
    });

    await db.insert("formTemplates", {
      _id: richTemplateId,
      organizationId: String(organizationId),
      name: "Wywiad z contentJson",
      category: "intake",
      formJson: "{}",
      contentJson,
      modules: ["gabinet"],
      entityTypes: ["patient"],
      requiresSignature: true,
      version: 1,
      isActive: true,
      createdBy: String(userId),
      createdAt: now,
      updatedAt: now,
    });

    const signedAt = now + 3000;
    const responseData = JSON.stringify({
      formFieldValues: {
        allergies: "penicylina",
        diabetes: "true",
        medications: "",
      },
    });

    const docId = await t.run(async (ctx) => {
      return await ctx.db.insert("formDocuments", {
        organizationId,
        templateId: richTemplateId,
        title: "Wywiad",
        responseData,
        entityType: "patient",
        entityId: String(patientId),
        status: "signed",
        signedAt,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
    });

    await db.insert("formDocuments", {
      _id: docId,
      organizationId: String(organizationId),
      templateId: String(richTemplateId),
      title: "Wywiad",
      responseData,
      entityType: "patient",
      entityId: String(patientId),
      status: "signed",
      signedAt,
      createdBy: String(userId),
      createdAt: now,
      updatedAt: now,
    });

    const result = await t.withIdentity(identity).action(
      api.documents.documents.getLatestSignedIntakeByPatient,
      { organizationId, patientId: String(patientId) },
    );

    expect(result).not.toBeNull();
    expect(result!.fieldDefinitions).toEqual([
      { fieldId: "allergies", fieldType: "textarea", label: "Alergie" },
      { fieldId: "diabetes", fieldType: "checkbox", label: "Cukrzyca" },
      { fieldId: "medications", fieldType: "text", label: "Leki" },
    ]);
    // allergies has a value → "Label: value"; diabetes is checked → plain label;
    // medications is empty → omitted
    expect(result!.intakeSummary).toEqual([
      "Alergie: penicylina",
      "Cukrzyca",
    ]);
  });

  test("ignores intake documents belonging to a different patient", async () => {
    const { t, organizationId, userId, identity, patientId, templateId, db, now } = await setup();

    const otherPatientId = "other-patient-uuid";
    const responseData = JSON.stringify({ formFieldValues: { note: "other" } });

    const docId = await t.run(async (ctx) => {
      return await ctx.db.insert("formDocuments", {
        organizationId,
        templateId,
        title: "Wywiad",
        responseData,
        entityType: "patient",
        entityId: otherPatientId,
        status: "signed",
        signedAt: now + 1000,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
    });

    await db.insert("formDocuments", {
      _id: docId,
      organizationId: String(organizationId),
      templateId: String(templateId),
      title: "Wywiad",
      responseData,
      entityType: "patient",
      entityId: otherPatientId,
      status: "signed",
      signedAt: now + 1000,
      createdBy: String(userId),
      createdAt: now,
      updatedAt: now,
    });

    const result = await t.withIdentity(identity).action(
      api.documents.documents.getLatestSignedIntakeByPatient,
      { organizationId, patientId: String(patientId) },
    );

    expect(result).toBeNull();
  });
});
