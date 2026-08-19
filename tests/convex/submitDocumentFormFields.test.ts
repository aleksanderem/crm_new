/**
 * Tests for documents.submitDocumentFormFields — the public (token-based) action
 * that patients use to submit form field values before signing.
 *
 * Key invariant: signingTokenExpiresAt must be reset to 48h from submission
 * so a patient who fills in the form near the token's expiry deadline still has
 * a valid link when they reach the signature step immediately after.
 */

import { afterEach, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

const TTL_48H = 48 * 60 * 60 * 1000;

async function seedFormDocument(
  organizationId: string,
  userId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const db = createSupabaseDb();
  const now = Date.now();
  return await db.insert("formDocuments", {
    organizationId,
    templateId: "tmpl-uuid-001",
    title: "Test Consent Form",
    responseData: "{}",
    entityType: "patient",
    entityId: "patient-uuid-001",
    status: "draft",
    signingToken: "test-signing-token",
    signingTokenExpiresAt: now + TTL_48H,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe("documents.submitDocumentFormFields — signingTokenExpiresAt reset", () => {
  test("extends signingTokenExpiresAt to 48h from submission time", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);

    const originalExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes left
    await seedFormDocument(String(organizationId), String(userId), {
      signingTokenExpiresAt: originalExpiry,
    });

    const before = Date.now();
    await t.action(api.documents.documents.submitDocumentFormFields, {
      token: "test-signing-token",
      renderedHtml: "<p>Hello</p>",
      formFieldValues: JSON.stringify({ name: "Jan Kowalski" }),
    });
    const after = Date.now();

    const db = createSupabaseDb();
    const doc = await db
      .query("formDocuments")
      .eq("signingToken", "test-signing-token")
      .first();

    expect(doc).not.toBeNull();
    expect(doc!.status).toBe("pending_signature");

    const newExpiry = doc!.signingTokenExpiresAt as number;
    expect(newExpiry).toBeGreaterThanOrEqual(before + TTL_48H);
    expect(newExpiry).toBeLessThanOrEqual(after + TTL_48H);
    expect(newExpiry).toBeGreaterThan(originalExpiry);
  });

  test("rejects expired token before form submission", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);

    const expiredAt = Date.now() - 1000; // already expired
    await seedFormDocument(String(organizationId), String(userId), {
      signingTokenExpiresAt: expiredAt,
    });

    await expect(
      t.action(api.documents.documents.submitDocumentFormFields, {
        token: "test-signing-token",
        renderedHtml: "<p>Hello</p>",
        formFieldValues: JSON.stringify({ name: "Jan Kowalski" }),
      }),
    ).rejects.toThrow("Signing link expired");
  });

  test("transitions status from draft to pending_signature", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);

    await seedFormDocument(String(organizationId), String(userId));

    await t.action(api.documents.documents.submitDocumentFormFields, {
      token: "test-signing-token",
      renderedHtml: "<p>Hello</p>",
      formFieldValues: JSON.stringify({ field1: "value1" }),
    });

    const db = createSupabaseDb();
    const doc = await db
      .query("formDocuments")
      .eq("signingToken", "test-signing-token")
      .first();

    expect(doc!.status).toBe("pending_signature");
    const responseData = JSON.parse(doc!.responseData as string);
    expect(responseData.html).toBe("<p>Hello</p>");
    expect(responseData.formFieldValues).toEqual({ field1: "value1" });
  });
});
