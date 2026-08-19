/**
 * Integration tests for documents.documents.updateStatus status guard.
 *
 * The guard pre-dates auth so both "voided" and "signed" must be rejected
 * before verifyOrgAccess is called — callers must use voidDocument /
 * recordSignature instead.
 *
 * Covers: #5479 (voided guard), regression anchor for #5478 (signed guard).
 */

import { afterEach, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

describe("documents.documents.updateStatus — blocked status guard", () => {
  test("rejects 'voided' — callers must use voidDocument", async () => {
    const t = createTestCtx();
    const { organizationId } = await seedTestUser(t);

    await expect(
      t.action(api.documents.documents.updateStatus, {
        organizationId: String(organizationId),
        documentId: "doc-uuid-001",
        status: "voided",
      }),
    ).rejects.toThrow(
      "Use voidDocument to void a document — updateStatus cannot set status to 'voided'",
    );
  });

  test("rejects 'signed' — callers must use recordSignature", async () => {
    const t = createTestCtx();
    const { organizationId } = await seedTestUser(t);

    await expect(
      t.action(api.documents.documents.updateStatus, {
        organizationId: String(organizationId),
        documentId: "doc-uuid-001",
        status: "signed",
      }),
    ).rejects.toThrow(
      "Use recordSignature to sign a document — updateStatus cannot set status to 'signed'",
    );
  });

  test("accepts 'completed' and persists it — valid status still works", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const db = createSupabaseDb();
    const now = Date.now();

    const docId = await db.insert("formDocuments", {
      organizationId: String(organizationId),
      templateId: "tmpl-uuid-001",
      title: "Test Document",
      responseData: "{}",
      entityType: "patient",
      entityId: "patient-uuid-001",
      status: "draft",
      createdBy: String(userId),
      createdAt: now,
      updatedAt: now,
    });

    await t.withIdentity(identity).action(api.documents.documents.updateStatus, {
      organizationId: String(organizationId),
      documentId: docId,
      status: "completed",
    });

    const updated = await db.get("formDocuments", docId);
    expect(updated!.status).toBe("completed");
  });
});
