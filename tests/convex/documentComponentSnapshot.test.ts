/**
 * Verifies that contentJsonSnapshot stored at document creation time has all
 * componentBlock nodes resolved to their actual content, so future edits to a
 * component never affect historical documents (issue #5383).
 */

import { afterEach, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

describe("contentJsonSnapshot — eager component resolution at creation", () => {
  async function setup() {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const db = createSupabaseDb();
    const now = Date.now();

    // A component whose content we will later mutate
    const componentId = "comp-uuid-001";
    await db.insert("documentComponents", {
      _id: componentId,
      organizationId: String(organizationId),
      name: "Consent Footer",
      contentJson: JSON.stringify({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Original content" }] }],
      }),
      scope: "org",
      isActive: true,
      protected: false,
      createdBy: String(userId),
      createdAt: now,
      updatedAt: now,
    });

    // Template that embeds the component via a componentBlock node
    const templateId = "tmpl-comp-001";
    await db.insert("formTemplates", {
      _id: templateId,
      organizationId: String(organizationId),
      name: "Template With Component",
      category: "consent",
      templateType: "document",
      contentJson: JSON.stringify({
        type: "doc",
        content: [
          { type: "componentBlock", attrs: { componentId } },
        ],
      }),
      formJson: "{}",
      modules: ["gabinet"],
      entityTypes: ["patient"],
      requiresSignature: false,
      version: 1,
      isActive: true,
      createdBy: String(userId),
      createdAt: now,
      updatedAt: now,
    });

    return { t, organizationId, userId, identity, db, now, componentId, templateId };
  }

  test("documents.create stores resolved snapshot without componentBlock nodes", async () => {
    const { t, organizationId, identity, db, componentId, templateId } = await setup();

    const docId = await t.withIdentity(identity).action(api.documents.documents.create, {
      organizationId,
      templateId,
      title: "Test Doc",
      responseData: "{}",
      entityType: "patient",
      entityId: "patient-001",
      status: "draft",
    });

    const doc = await db.get("formDocuments", docId as string);
    expect(doc).not.toBeNull();

    const snapshot = JSON.parse(doc!.contentJsonSnapshot as string);
    // No componentBlock nodes in the stored snapshot
    const hasComponentBlock = snapshot.content.some(
      (n: { type: string }) => n.type === "componentBlock",
    );
    expect(hasComponentBlock).toBe(false);

    // The resolved component content is inlined
    expect(snapshot.content).toHaveLength(1);
    expect(snapshot.content[0].type).toBe("paragraph");

    // Mutate the component AFTER document creation
    await db.patch("documentComponents", componentId, {
      contentJson: JSON.stringify({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Updated content" }] }],
      }),
    });

    // Reload the document — snapshot must be unchanged
    const docAfter = await db.get("formDocuments", docId as string);
    const snapshotAfter = JSON.parse(docAfter!.contentJsonSnapshot as string);
    expect(snapshotAfter.content[0].content[0].text).toBe("Original content");
  });

  test("documents.generate.generateDocument stores resolved snapshot", async () => {
    const { t, organizationId, identity, db, componentId, templateId } = await setup();

    const result = await t.withIdentity(identity).action(api.documents.generate.generateDocument, {
      organizationId,
      templateId,
      entityType: "patient",
      entityId: "patient-001",
      responseData: JSON.stringify({ formFieldValues: {} }),
    });

    const doc = await db.get("formDocuments", result.documentId);
    expect(doc).not.toBeNull();

    const snapshot = JSON.parse(doc!.contentJsonSnapshot as string);
    const hasComponentBlock = snapshot.content.some(
      (n: { type: string }) => n.type === "componentBlock",
    );
    expect(hasComponentBlock).toBe(false);

    // Mutate component and verify snapshot is frozen
    await db.patch("documentComponents", componentId, {
      contentJson: JSON.stringify({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Updated content" }] }],
      }),
    });

    const docAfter = await db.get("formDocuments", result.documentId);
    const snapshotAfter = JSON.parse(docAfter!.contentJsonSnapshot as string);
    expect(snapshotAfter.content[0].content[0].text).toBe("Original content");
  });
});
