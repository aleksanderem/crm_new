/**
 * D23 — Full E2E verification of document versioning, snapshot isolation,
 * and read-path immutability after D21/D22 and follow-ups #5383–#5385.
 *
 * Scenario:
 *   v1 — create Document A
 *   v2 — create Document B
 *   v3 — update template to final state
 *   → all read paths for A must return v1 data
 *   → all read paths for B must return v2 data
 *   → live template shows v3
 */

import { createHash } from "crypto";
import { afterEach, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

function sha256Sync(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function makeComponentContent(marker: string): string {
  return JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: marker }] }],
  });
}

function makeTemplateContent(componentId: string, fieldId: string, fieldLabel: string): string {
  return JSON.stringify({
    type: "doc",
    content: [
      { type: "componentBlock", attrs: { componentId } },
      { type: "formField", attrs: { fieldId, fieldType: "textarea", label: fieldLabel } },
    ],
  });
}

describe("D23 — document versioning, snapshot isolation, and read-path immutability", () => {
  // ──────────────────────────────────────────────────────────────────────────
  // MAIN E2E LIFECYCLE TEST
  // Full scenario: v1 → create Doc A → sign → v2 → create Doc B → sign → v3
  // Then verify all read paths for A=v1, B=v2 with live template at v3.
  // ──────────────────────────────────────────────────────────────────────────

  test("snapshot frozen at creation — all read paths independent of later template mutations", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const db = createSupabaseDb();
    const now = Date.now();
    const orgStr = String(organizationId);
    const userStr = String(userId);
    const patientId = "patient-e2e-d23";

    // ── Seed component at v1 ─────────────────────────────────────────────────
    const componentId = "comp-d23-001";
    await db.insert("documentComponents", {
      _id: componentId,
      organizationId: orgStr,
      name: "Blok zgody",
      scope: "org",
      contentJson: makeComponentContent("KOMPONENT V1"),
      isActive: true,
      protected: false,
      createdBy: userStr,
      createdAt: now,
      updatedAt: now,
    });

    // ── Seed template at v1 (intake so getLatestSignedIntakeByPatient finds it) ─
    const templateId = "tmpl-d23-001";
    await db.insert("formTemplates", {
      _id: templateId,
      organizationId: orgStr,
      name: "Wywiad D23",
      category: "intake",
      templateType: "document",
      contentJson: makeTemplateContent(componentId, "field_v1", "Pole v1"),
      formJson: '{"version":"1"}',
      modules: ["gabinet"],
      entityTypes: ["patient"],
      requiresSignature: false,
      version: 1,
      isActive: true,
      createdBy: userStr,
      createdAt: now,
      updatedAt: now,
    });

    // ── Create Document A (resolves component at creation time) ──────────────
    const signingTokenA = "d23-signing-token-a";
    const docAId = await t.withIdentity(identity).action(
      api.documents.documents.create,
      {
        organizationId: orgStr,
        templateId,
        title: "Document A (v1)",
        responseData: "{}",
        entityType: "patient",
        entityId: patientId,
        status: "draft",
        signingToken: signingTokenA,
        signingTokenExpiresAt: now + 48 * 60 * 60 * 1000,
      },
    ) as string;

    // ── Verify Document A snapshot at creation ───────────────────────────────
    {
      const docA = await db.get("formDocuments", docAId);
      expect(docA, "Document A must exist after creation").not.toBeNull();

      // templateVersion must be captured at creation
      expect(docA!.templateVersion, "Document A templateVersion = 1").toBe(1);

      const snapshot = JSON.parse(docA!.contentJsonSnapshot as string);
      // No componentBlock nodes — eagerly resolved (#5383)
      const hasComponentBlock = snapshot.content.some(
        (n: { type: string }) => n.type === "componentBlock",
      );
      expect(hasComponentBlock, "Document A snapshot must have no componentBlock nodes").toBe(false);

      const text = JSON.stringify(snapshot);
      expect(text, "Document A snapshot must contain KOMPONENT V1").toContain("KOMPONENT V1");
      expect(text, "Document A snapshot must contain field_v1").toContain("field_v1");
      expect(text, "Document A snapshot must contain Pole v1").toContain("Pole v1");
      expect(text, "Document A snapshot must NOT contain v2 content").not.toContain("KOMPONENT V2");
    }

    // ── Sign Document A ──────────────────────────────────────────────────────
    await db.patch("formDocuments", docAId, {
      status: "signed",
      signedAt: now + 1_000,
      responseData: JSON.stringify({
        html: "<p>Signed Document A</p>",
        formFieldValues: { field_v1: "Odpowiedź v1" },
      }),
      updatedAt: now + 1_000,
    });

    // ── getLatestSignedIntakeByPatient: only Doc A signed → uses v1 snapshot ─
    {
      const intake = await t.withIdentity(identity).action(
        api.documents.documents.getLatestSignedIntakeByPatient,
        { organizationId: orgStr, patientId },
      );
      expect(intake, "Latest intake must exist (Doc A signed)").not.toBeNull();
      expect(intake!.id, "Latest intake id = Doc A").toBe(docAId);
      // Field defs from v1 snapshot, not live template
      expect(intake!.fieldDefinitions).toEqual([
        { fieldId: "field_v1", fieldType: "textarea", label: "Pole v1" },
      ]);
      expect(intake!.intakeSummary).toEqual(["Pole v1: Odpowiedź v1"]);
    }

    // ── Update component → KOMPONENT V2 ─────────────────────────────────────
    await db.patch("documentComponents", componentId, {
      contentJson: makeComponentContent("KOMPONENT V2"),
      updatedAt: now + 2_000,
    });

    // ── Update template → v2 (new field F2) ─────────────────────────────────
    await db.patch("formTemplates", templateId, {
      contentJson: makeTemplateContent(componentId, "field_v2", "Pole v2"),
      formJson: '{"version":"2"}',
      version: 2,
      updatedAt: now + 2_000,
    });

    // ── Create Document B (resolves component at v2 state) ───────────────────
    const signingTokenB = "d23-signing-token-b";
    const docBId = await t.withIdentity(identity).action(
      api.documents.documents.create,
      {
        organizationId: orgStr,
        templateId,
        title: "Document B (v2)",
        responseData: "{}",
        entityType: "patient",
        entityId: patientId,
        status: "draft",
        signingToken: signingTokenB,
        signingTokenExpiresAt: now + 48 * 60 * 60 * 1000,
      },
    ) as string;

    // ── Verify Document B snapshot at creation ───────────────────────────────
    {
      const docB = await db.get("formDocuments", docBId);
      expect(docB, "Document B must exist after creation").not.toBeNull();
      expect(docB!.templateVersion, "Document B templateVersion = 2").toBe(2);

      const snapshot = JSON.parse(docB!.contentJsonSnapshot as string);
      const hasComponentBlock = snapshot.content.some(
        (n: { type: string }) => n.type === "componentBlock",
      );
      expect(hasComponentBlock, "Document B snapshot must have no componentBlock nodes").toBe(false);

      const text = JSON.stringify(snapshot);
      expect(text, "Document B snapshot must contain KOMPONENT V2").toContain("KOMPONENT V2");
      expect(text, "Document B snapshot must contain field_v2").toContain("field_v2");
      expect(text, "Document B snapshot must NOT contain v1 content").not.toContain("KOMPONENT V1");
      expect(text, "Document B snapshot must NOT contain v3 content").not.toContain("KOMPONENT V3");
    }

    // ── Sign Document B ──────────────────────────────────────────────────────
    await db.patch("formDocuments", docBId, {
      status: "signed",
      signedAt: now + 3_000,
      responseData: JSON.stringify({
        html: "<p>Signed Document B</p>",
        formFieldValues: { field_v2: "Odpowiedź v2" },
      }),
      updatedAt: now + 3_000,
    });

    // ── Update to v3 (final state — Doc A and Doc B must be unaffected) ──────
    await db.patch("documentComponents", componentId, {
      contentJson: makeComponentContent("KOMPONENT V3"),
      updatedAt: now + 4_000,
    });
    await db.patch("formTemplates", templateId, {
      contentJson: makeTemplateContent(componentId, "field_v3", "Pole v3"),
      formJson: '{"version":"3"}',
      version: 3,
      updatedAt: now + 4_000,
    });

    // ════════════════════════════════════════════════════════════════════════
    // READ PATH VERIFICATION — template at v3, verify A=v1, B=v2
    // ════════════════════════════════════════════════════════════════════════

    // ── getBySigningToken: Document A must still show v1 ────────────────────
    {
      const result = await t.action(api.documents.documents.getBySigningToken, {
        token: signingTokenA,
      });
      expect(result.document.templateVersion, "Doc A: templateVersion still 1").toBe(1);
      const content = result.template?.contentJson ?? "";
      expect(content, "Doc A via signing: KOMPONENT V1 preserved").toContain("KOMPONENT V1");
      expect(content, "Doc A via signing: field_v1 preserved").toContain("field_v1");
      expect(content, "Doc A via signing: must NOT have v3 component").not.toContain("KOMPONENT V3");
      expect(content, "Doc A via signing: must NOT have v3 field").not.toContain("field_v3");
    }

    // ── getBySigningToken: Document B must still show v2 ────────────────────
    {
      const result = await t.action(api.documents.documents.getBySigningToken, {
        token: signingTokenB,
      });
      expect(result.document.templateVersion, "Doc B: templateVersion still 2").toBe(2);
      const content = result.template?.contentJson ?? "";
      expect(content, "Doc B via signing: KOMPONENT V2 preserved").toContain("KOMPONENT V2");
      expect(content, "Doc B via signing: field_v2 preserved").toContain("field_v2");
      expect(content, "Doc B via signing: must NOT have v1 component").not.toContain("KOMPONENT V1");
      expect(content, "Doc B via signing: must NOT have v3 component").not.toContain("KOMPONENT V3");
    }

    // ── getLatestSignedIntakeByPatient: Doc B is newer → uses v2 snapshot ───
    {
      const intake = await t.withIdentity(identity).action(
        api.documents.documents.getLatestSignedIntakeByPatient,
        { organizationId: orgStr, patientId },
      );
      expect(intake, "Latest intake must exist (both docs signed)").not.toBeNull();
      // Doc B was signed at now+3000 > now+1000 → Doc B is the latest
      expect(intake!.id, "Latest intake = Doc B (more recent)").toBe(docBId);
      // Field defs from Doc B's v2 snapshot, not from live v3 template
      expect(intake!.fieldDefinitions, "fieldDefinitions from v2 snapshot").toEqual([
        { fieldId: "field_v2", fieldType: "textarea", label: "Pole v2" },
      ]);
      expect(intake!.intakeSummary, "intakeSummary from v2 snapshot").toEqual(["Pole v2: Odpowiedź v2"]);
      // Must NOT reflect v3 fields
      const hasV3Field = intake!.fieldDefinitions.some(
        (f: { fieldId: string }) => f.fieldId === "field_v3",
      );
      expect(hasV3Field, "No v3 fields must leak into v2 snapshot result").toBe(false);
    }

    // ── Signed documents are immutable — responseData update blocked ─────────
    await expect(
      t.withIdentity(identity).action(api.documents.documents.updateResponseData, {
        organizationId: orgStr,
        documentId: docAId,
        responseData: JSON.stringify({ formFieldValues: { tampered: "yes" } }),
      }),
      "Signed Doc A must reject responseData update",
    ).rejects.toThrow("Can only update response data on draft documents");

    await expect(
      t.withIdentity(identity).action(api.documents.documents.updateResponseData, {
        organizationId: orgStr,
        documentId: docBId,
        responseData: JSON.stringify({ formFieldValues: { tampered: "yes" } }),
      }),
      "Signed Doc B must reject responseData update",
    ).rejects.toThrow("Can only update response data on draft documents");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // LEGACY DOCUMENT — no snapshot, falls back to live template without crash
  // ──────────────────────────────────────────────────────────────────────────

  test("legacy document (no contentJsonSnapshot) falls back to live template in getBySigningToken without crash", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);
    const db = createSupabaseDb();
    const now = Date.now();
    const orgStr = String(organizationId);
    const userStr = String(userId);

    // Template is already at v3 (represents post-mutation state)
    const v3Content = JSON.stringify({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "TREŚĆ TEMPLATE V3" }] }],
    });
    const templateId = "tmpl-legacy-d23";
    await db.insert("formTemplates", {
      _id: templateId,
      organizationId: orgStr,
      name: "Legacy Template at v3",
      category: "consent",
      templateType: "document",
      contentJson: v3Content,
      formJson: '{"version":"3"}',
      modules: ["gabinet"],
      entityTypes: ["patient"],
      requiresSignature: false,
      version: 3,
      isActive: true,
      createdBy: userStr,
      createdAt: now,
      updatedAt: now,
    });

    // Pre-migration document: no contentJsonSnapshot, no templateVersion
    const legacyToken = "d23-legacy-signing-token";
    await db.insert("formDocuments", {
      organizationId: orgStr,
      templateId,
      title: "Legacy Document (pre-migration)",
      responseData: "{}",
      entityType: "patient",
      entityId: "patient-legacy-d23",
      status: "pending_signature",
      signingToken: legacyToken,
      signingTokenExpiresAt: now + 48 * 60 * 60 * 1000,
      createdBy: userStr,
      createdAt: now,
      updatedAt: now,
      // contentJsonSnapshot intentionally absent — simulates pre-migration row
    });

    // Must not crash; must fall back to live template's current contentJson
    const result = await t.action(api.documents.documents.getBySigningToken, {
      token: legacyToken,
    });
    expect(result.document, "Legacy document must be returned").not.toBeNull();
    // System does NOT pretend to know the historical version; shows live v3
    expect(result.template?.contentJson, "Fallback to live v3 template").toContain("TREŚĆ TEMPLATE V3");
    // No crash occurred — fallback is safe
  });

  // ──────────────────────────────────────────────────────────────────────────
  // listByPatientToken — returns document-level formJson not live template's
  // ──────────────────────────────────────────────────────────────────────────

  test("listByPatientToken returns doc.formJson instead of live template formJson (fix #5385)", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);
    const db = createSupabaseDb();
    const now = Date.now();
    const orgStr = String(organizationId);
    const userStr = String(userId);
    const patientId = "patient-portal-d23";

    // Template has been updated to v2 (simulates template mutation after doc creation)
    const templateId = "tmpl-portal-d23";
    await db.insert("formTemplates", {
      _id: templateId,
      organizationId: orgStr,
      name: "Portal Test Template v2",
      category: "consent",
      formJson: '{"version":"2","live":"yes"}',
      modules: ["gabinet"],
      entityTypes: ["patient"],
      requiresSignature: false,
      version: 2,
      isActive: true,
      createdBy: userStr,
      createdAt: now,
      updatedAt: now,
    });

    // Document was created at v1 — it has its own formJson captured at creation time
    await db.insert("formDocuments", {
      organizationId: orgStr,
      templateId,
      title: "Portal Document",
      responseData: "{}",
      entityType: "patient",
      entityId: patientId,
      status: "draft",
      formJson: '{"version":"1","historical":"yes"}',
      createdBy: userStr,
      createdAt: now,
      updatedAt: now,
    });

    // Active portal session for the patient
    const rawToken = "d23-portal-token";
    await db.insert("gabinetPortalSessions", {
      patientId,
      organizationId: orgStr,
      tokenHash: sha256Sync(rawToken),
      isActive: true,
      lastAccessedAt: now,
      createdAt: now,
      expiresAt: now + 30 * 24 * 60 * 60 * 1000,
    });

    const docs = await t.action(api.documents.documents.listByPatientToken, {
      tokenHash: rawToken,
    });

    expect(docs, "One document must be returned").toHaveLength(1);
    // Must return the document's own formJson (v1), not the live template's (v2)
    expect(docs[0].formJson, "doc.formJson = historical v1 value").toBe('{"version":"1","historical":"yes"}');
    expect(docs[0].formJson, "Must not contain live template's formJson").not.toContain('"live":"yes"');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getLatestSignedIntakeByPatient — uses contentJsonSnapshot not live template
  // (dedicated focused test with explicit snapshot vs live template contrast)
  // ──────────────────────────────────────────────────────────────────────────

  test("getLatestSignedIntakeByPatient: contentJsonSnapshot takes precedence over live template contentJson", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const db = createSupabaseDb();
    const now = Date.now();
    const orgStr = String(organizationId);
    const userStr = String(userId);
    const patientId = "patient-intake-d23";

    // Template currently at v3 (field renamed to field_v3 after signing)
    const liveContentJson = JSON.stringify({
      type: "doc",
      content: [
        { type: "formField", attrs: { fieldId: "field_v3", fieldType: "textarea", label: "Pole v3 (nowe)" } },
      ],
    });
    const templateId = "tmpl-intake-d23";
    await db.insert("formTemplates", {
      _id: templateId,
      organizationId: orgStr,
      name: "Wywiad Intake D23",
      category: "intake",
      templateType: "document",
      contentJson: liveContentJson,
      formJson: "{}",
      modules: ["gabinet"],
      entityTypes: ["patient"],
      requiresSignature: false,
      version: 3,
      isActive: true,
      createdBy: userStr,
      createdAt: now,
      updatedAt: now,
    });

    // Document was signed when v1 was in effect — snapshot = v1 field layout
    const snapshotAtSigning = JSON.stringify({
      type: "doc",
      content: [
        { type: "formField", attrs: { fieldId: "field_v1", fieldType: "textarea", label: "Pole v1 (historyczne)" } },
      ],
    });

    await db.insert("formDocuments", {
      organizationId: orgStr,
      templateId,
      contentJsonSnapshot: snapshotAtSigning,
      templateVersion: 1,
      title: "Wywiad (podpisany przy v1)",
      responseData: JSON.stringify({
        formFieldValues: { field_v1: "Alergie na penicylinę" },
      }),
      entityType: "patient",
      entityId: patientId,
      status: "signed",
      signedAt: now + 1_000,
      createdBy: userStr,
      createdAt: now,
      updatedAt: now,
    });

    const intake = await t.withIdentity(identity).action(
      api.documents.documents.getLatestSignedIntakeByPatient,
      { organizationId: orgStr, patientId },
    );
    expect(intake, "Intake must be found").not.toBeNull();

    // Must use snapshot field layout (field_v1), NOT the live v3 template (field_v3)
    expect(intake!.fieldDefinitions, "fieldDefinitions from v1 snapshot").toEqual([
      { fieldId: "field_v1", fieldType: "textarea", label: "Pole v1 (historyczne)" },
    ]);
    expect(intake!.intakeSummary, "intakeSummary from v1 snapshot").toEqual([
      "Pole v1 (historyczne): Alergie na penicylinę",
    ]);

    // The v3 live field must NOT appear
    const hasLiveField = intake!.fieldDefinitions.some(
      (f: { fieldId: string }) => f.fieldId === "field_v3",
    );
    expect(hasLiveField, "Live v3 field must not leak into historical snapshot result").toBe(false);
  });
});
