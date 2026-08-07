/**
 * Document lifecycle tests — status transition validation for documentInstances.
 *
 * documentInstances.updateStatus enforces a strict transition graph. These
 * tests verify that valid transitions succeed and that invalid transitions are
 * rejected with a clear error, ensuring the backend never allows a document to
 * move to an incompatible state.
 *
 * Transition graph:
 *   draft → pending_review, approved, pending_signature
 *   pending_review → draft, approved
 *   approved → pending_signature, archived
 *   pending_signature → signed, archived
 *   signed → archived
 *   archived → approved, signed
 */

import { afterEach, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

async function seedDocumentInstance(
  organizationId: any,
  userId: any,
  status:
    | "draft"
    | "pending_review"
    | "approved"
    | "pending_signature"
    | "signed"
    | "archived" = "draft",
): Promise<string> {
  const db = createSupabaseDb();
  const now = Date.now();
  return await db.insert("documentInstances", {
    organizationId: String(organizationId),
    type: "file",
    title: "Test Document",
    status,
    module: "gabinet",
    signatures: JSON.stringify([]),
    createdBy: String(userId),
    createdAt: now,
    updatedAt: now,
  });
}

describe("documentInstances.updateStatus — valid transitions", () => {
  test("draft → pending_review", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const docId = await seedDocumentInstance(organizationId, userId, "draft");

    await t
      .withIdentity(identity)
      .action(api.documentInstances.updateStatus, {
        id: docId,
        status: "pending_review",
      });

    const db = createSupabaseDb();
    const doc = await db.get<{ status: string }>("documentInstances", docId);
    expect(doc?.status).toBe("pending_review");
  });

  test("draft → approved (skip review step)", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const docId = await seedDocumentInstance(organizationId, userId, "draft");

    await t
      .withIdentity(identity)
      .action(api.documentInstances.updateStatus, {
        id: docId,
        status: "approved",
      });

    const db = createSupabaseDb();
    const doc = await db.get<{ status: string; approvedBy: string }>(
      "documentInstances",
      docId,
    );
    expect(doc?.status).toBe("approved");
    expect(doc?.approvedBy).toBe(String(userId));
  });

  test("pending_review → approved sets approvedBy", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const docId = await seedDocumentInstance(
      organizationId,
      userId,
      "pending_review",
    );

    await t
      .withIdentity(identity)
      .action(api.documentInstances.updateStatus, {
        id: docId,
        status: "approved",
      });

    const db = createSupabaseDb();
    const doc = await db.get<{ status: string; approvedBy: string }>(
      "documentInstances",
      docId,
    );
    expect(doc?.status).toBe("approved");
    expect(doc?.approvedBy).toBe(String(userId));
  });

  test("approved → pending_signature", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const docId = await seedDocumentInstance(organizationId, userId, "approved");

    await t
      .withIdentity(identity)
      .action(api.documentInstances.updateStatus, {
        id: docId,
        status: "pending_signature",
      });

    const db = createSupabaseDb();
    const doc = await db.get<{ status: string }>("documentInstances", docId);
    expect(doc?.status).toBe("pending_signature");
  });

  test("signed → archived", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const docId = await seedDocumentInstance(organizationId, userId, "signed");

    await t
      .withIdentity(identity)
      .action(api.documentInstances.updateStatus, {
        id: docId,
        status: "archived",
      });

    const db = createSupabaseDb();
    const doc = await db.get<{ status: string }>("documentInstances", docId);
    expect(doc?.status).toBe("archived");
  });

  test("archived → approved (restoration path)", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const docId = await seedDocumentInstance(
      organizationId,
      userId,
      "archived",
    );

    await t
      .withIdentity(identity)
      .action(api.documentInstances.updateStatus, {
        id: docId,
        status: "approved",
      });

    const db = createSupabaseDb();
    const doc = await db.get<{ status: string }>("documentInstances", docId);
    expect(doc?.status).toBe("approved");
  });
});

describe("documentInstances.updateStatus — invalid transitions", () => {
  test("signed → draft is rejected", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const docId = await seedDocumentInstance(organizationId, userId, "signed");

    await expect(
      t.withIdentity(identity).action(api.documentInstances.updateStatus, {
        id: docId,
        status: "draft",
      }),
    ).rejects.toThrow("Cannot transition from signed to draft");
  });

  test("signed → pending_review is rejected", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const docId = await seedDocumentInstance(organizationId, userId, "signed");

    await expect(
      t.withIdentity(identity).action(api.documentInstances.updateStatus, {
        id: docId,
        status: "pending_review",
      }),
    ).rejects.toThrow("Cannot transition from signed to pending_review");
  });

  test("approved → draft is rejected", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const docId = await seedDocumentInstance(organizationId, userId, "approved");

    await expect(
      t.withIdentity(identity).action(api.documentInstances.updateStatus, {
        id: docId,
        status: "draft",
      }),
    ).rejects.toThrow("Cannot transition from approved to draft");
  });

  test("pending_signature → draft is rejected", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const docId = await seedDocumentInstance(
      organizationId,
      userId,
      "pending_signature",
    );

    await expect(
      t.withIdentity(identity).action(api.documentInstances.updateStatus, {
        id: docId,
        status: "draft",
      }),
    ).rejects.toThrow("Cannot transition from pending_signature to draft");
  });
});

describe("documentInstances.updateDraft — edit guard", () => {
  test("cannot update a signed document", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const docId = await seedDocumentInstance(organizationId, userId, "signed");

    await expect(
      t.withIdentity(identity).action(api.documentInstances.updateDraft, {
        id: docId,
        title: "Modified Title",
      }),
    ).rejects.toThrow("Podpisanych i zarchiwizowanych dokumentów nie można edytować");
  });

  test("cannot update an archived document", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const docId = await seedDocumentInstance(
      organizationId,
      userId,
      "archived",
    );

    await expect(
      t.withIdentity(identity).action(api.documentInstances.updateDraft, {
        id: docId,
        title: "Modified Title",
      }),
    ).rejects.toThrow("Podpisanych i zarchiwizowanych dokumentów nie można edytować");
  });

  test("can update a draft document", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const docId = await seedDocumentInstance(organizationId, userId, "draft");

    await t.withIdentity(identity).action(api.documentInstances.updateDraft, {
      id: docId,
      title: "Updated Title",
    });

    const db = createSupabaseDb();
    const doc = await db.get<{ title: string }>("documentInstances", docId);
    expect(doc?.title).toBe("Updated Title");
  });
});
