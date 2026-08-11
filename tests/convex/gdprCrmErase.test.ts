import { afterEach, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createTestCtx,
  seedTestUser,
} from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

async function seedContact(
  t: ReturnType<typeof createTestCtx>,
  organizationId: string,
  userId: string,
) {
  const db = createSupabaseDb();
  const now = Date.now();
  const contactId = `contact-test-${now}`;
  await db.insert("contacts", {
    _id: contactId,
    organizationId,
    firstName: "Jan",
    lastName: "Kowalski",
    email: "jan.kowalski@example.com",
    phone: "+48123456789",
    title: "CEO",
    notes: "Ważny klient.",
    source: null,
    tags: null,
    tagIds: null,
    categoryId: null,
    avatarUrl: null,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });
  return contactId;
}

describe("contacts.gdprErase — CRM GDPR erasure", () => {
  test("anonymizes PII fields on the contact row", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const db = createSupabaseDb();
    const contactId = await seedContact(t, String(organizationId), String(userId));

    await t.withIdentity(identity).action(api.contacts.gdprErase, {
      organizationId,
      contactId,
    });

    const contact = await db.get("contacts", contactId);
    expect(contact?.firstName).toBe("ANONIMOWY");
    expect(contact?.lastName).toMatch(/^#/);
    expect(String(contact?.email ?? "")).toContain("gdpr.invalid");
    expect(contact?.phone).toBeNull();
    expect(contact?.title).toBeNull();
    expect(contact?.notes).toBeNull();
  });

  test("redacts activity descriptions for the erased contact", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const contactId = await seedContact(t, String(organizationId), String(userId));

    await t.run(async (ctx) => {
      await ctx.db.insert("activities", {
        organizationId,
        entityType: "contact",
        entityId: contactId,
        action: "created",
        description: "Utworzono kontakt Jan Kowalski",
        performedBy: userId,
        createdAt: Date.now(),
      });
    });

    await t.withIdentity(identity).action(api.contacts.gdprErase, {
      organizationId,
      contactId,
    });

    const activities = await t.run(async (ctx) =>
      ctx.db
        .query("activities")
        .withIndex("by_entity", (q) =>
          q.eq("entityType", "contact").eq("entityId", contactId)
        )
        .collect()
    );

    for (const activity of activities) {
      expect(activity.description).not.toContain("Kowalski");
      expect(activity.description).not.toContain("Jan");
    }
    expect(activities.length).toBeGreaterThanOrEqual(1);
  });

  test("redacts note contents for the erased contact", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const contactId = await seedContact(t, String(organizationId), String(userId));
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("notes", {
        organizationId,
        entityType: "contact",
        entityId: contactId,
        content: "Jan Kowalski prosił o ofertę na Q4.",
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
    });

    await t.withIdentity(identity).action(api.contacts.gdprErase, {
      organizationId,
      contactId,
    });

    const notes = await t.run(async (ctx) =>
      ctx.db
        .query("notes")
        .withIndex("by_entity", (q) =>
          q.eq("entityType", "contact").eq("entityId", contactId)
        )
        .collect()
    );

    expect(notes).toHaveLength(1);
    expect(notes[0].content).toBe("[RODO: dane usunięte]");
  });

  test("writes an audit log entry with action gdpr_contact_erased", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const contactId = await seedContact(t, String(organizationId), String(userId));

    await t.withIdentity(identity).action(api.contacts.gdprErase, {
      organizationId,
      contactId,
    });

    const auditEntries = await t.run(async (ctx) =>
      ctx.db
        .query("auditLog")
        .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
        .collect()
    );

    const erasureEntry = auditEntries.find(
      (e) => e.action === "gdpr_contact_erased"
    );
    expect(erasureEntry).toBeDefined();
    expect(erasureEntry?.entityType).toBe("contact");
    expect(erasureEntry?.entityId).toBe(contactId);
  });

  test("deletes custom field values linked to the contact", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const db = createSupabaseDb();
    const orgStr = String(organizationId);
    const contactId = await seedContact(t, orgStr, String(userId));
    const now = Date.now();

    await db.insert("customFieldValues", {
      _id: `cfv-${now}`,
      organizationId: orgStr,
      fieldDefinitionId: `field-def-${now}`,
      entityType: "contact",
      entityId: contactId,
      value: "Jan Kowalski",
      createdAt: now,
      updatedAt: now,
    });

    await t.withIdentity(identity).action(api.contacts.gdprErase, {
      organizationId,
      contactId,
    });

    const remaining = await db
      .query("customFieldValues")
      .eq("entityType", "contact")
      .eq("entityId", contactId)
      .collect();
    expect(remaining).toHaveLength(0);
  });

  test("denies erasure for non-owner/admin users", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t, { role: "member" });
    const contactId = await seedContact(t, String(organizationId), String(userId));
    const memberIdentity = {
      subject: `${userId}|fake-session-id`,
      issuer: "test",
      tokenIdentifier: `test|${userId}`,
    };

    await expect(
      t.withIdentity(memberIdentity).action(api.contacts.gdprErase, {
        organizationId,
        contactId,
      })
    ).rejects.toThrow("Permission denied");
  });
});
