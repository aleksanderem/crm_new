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
  organizationId: string,
  userId: string,
) {
  const db = createSupabaseDb();
  const now = Date.now();
  const contactId = `contact-export-test-${now}`;
  await db.insert("contacts", {
    _id: contactId,
    organizationId,
    firstName: "Anna",
    lastName: "Nowak",
    email: "anna.nowak@example.com",
    phone: "+48987654321",
    title: "Manager",
    notes: null,
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

describe("contacts.gdprExport — GDPR data export", () => {
  test("includes emails linked to the contact", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const db = createSupabaseDb();
    const orgStr = String(organizationId);
    const userStr = String(userId);
    const contactId = await seedContact(orgStr, userStr);
    const now = Date.now();

    await db.insert("emails", {
      _id: `email-${now}`,
      organizationId: orgStr,
      threadId: `thread-${now}`,
      messageId: `msg-${now}`,
      inReplyTo: null,
      direction: "outbound",
      from: "test@example.com",
      to: ["anna.nowak@example.com"],
      cc: null,
      bcc: null,
      subject: "Oferta współpracy",
      bodyHtml: null,
      bodyText: "Dzień dobry, przesyłam ofertę...",
      snippet: "Dzień dobry, przesyłam ofertę...",
      isRead: true,
      isStarred: false,
      contactId,
      companyId: null,
      leadId: null,
      provider: null,
      mailProviderId: null,
      gmailMessageId: null,
      gmailThreadId: null,
      sentBy: userStr,
      templateId: null,
      patientId: null,
      appointmentId: null,
      employeeId: null,
      sentAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const result = await t.withIdentity(identity).action(api.contacts.gdprExport, {
      organizationId,
      contactId,
    });

    expect(result.emails).toHaveLength(1);
    const email = (result.emails as Array<Record<string, unknown>>)[0];
    expect(email.subject).toBe("Oferta współpracy");
    expect(email.body_text).toBe("Dzień dobry, przesyłam ofertę...");
  });

  test("does not include emails from a different contact", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const db = createSupabaseDb();
    const orgStr = String(organizationId);
    const userStr = String(userId);
    const contactId = await seedContact(orgStr, userStr);
    const now = Date.now();

    await db.insert("emails", {
      _id: `email-other-${now}`,
      organizationId: orgStr,
      threadId: `thread-other-${now}`,
      messageId: `msg-other-${now}`,
      inReplyTo: null,
      direction: "inbound",
      from: "other@example.com",
      to: ["test@example.com"],
      cc: null,
      bcc: null,
      subject: "Inny kontakt",
      bodyHtml: null,
      bodyText: "Treść dla innego kontaktu",
      snippet: null,
      isRead: false,
      isStarred: false,
      contactId: "different-contact-id",
      companyId: null,
      leadId: null,
      provider: null,
      mailProviderId: null,
      gmailMessageId: null,
      gmailThreadId: null,
      sentBy: userStr,
      templateId: null,
      patientId: null,
      appointmentId: null,
      employeeId: null,
      sentAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const result = await t.withIdentity(identity).action(api.contacts.gdprExport, {
      organizationId,
      contactId,
    });

    expect(result.emails).toHaveLength(0);
  });

  test("includes calls linked to the contact via object_relationships (call as source)", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const db = createSupabaseDb();
    const orgStr = String(organizationId);
    const userStr = String(userId);
    const contactId = await seedContact(orgStr, userStr);
    const now = Date.now();

    const callId = `call-${now}`;
    await db.insert("calls", {
      _id: callId,
      organizationId: orgStr,
      outcome: "connected",
      callDate: now,
      note: "Omówiono warunki umowy.",
      duration: 300,
      tagIds: null,
      categoryId: null,
      createdBy: userStr,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert("objectRelationships", {
      _id: `rel-${now}`,
      organizationId: orgStr,
      sourceType: "call",
      sourceId: callId,
      targetType: "contact",
      targetId: contactId,
      relationshipType: null,
      createdBy: userStr,
      createdAt: now,
    });

    const result = await t.withIdentity(identity).action(api.contacts.gdprExport, {
      organizationId,
      contactId,
    });

    expect(result.calls).toHaveLength(1);
    const call = (result.calls as Array<Record<string, unknown>>)[0];
    expect(call.outcome).toBe("connected");
    expect(call.note).toBe("Omówiono warunki umowy.");
  });

  test("includes calls linked to the contact via object_relationships (contact as source)", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const db = createSupabaseDb();
    const orgStr = String(organizationId);
    const userStr = String(userId);
    const contactId = await seedContact(orgStr, userStr);
    const now = Date.now();

    const callId = `call-rev-${now}`;
    await db.insert("calls", {
      _id: callId,
      organizationId: orgStr,
      outcome: "no_answer",
      callDate: now,
      note: null,
      duration: 0,
      tagIds: null,
      categoryId: null,
      createdBy: userStr,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert("objectRelationships", {
      _id: `rel-rev-${now}`,
      organizationId: orgStr,
      sourceType: "contact",
      sourceId: contactId,
      targetType: "call",
      targetId: callId,
      relationshipType: null,
      createdBy: userStr,
      createdAt: now,
    });

    const result = await t.withIdentity(identity).action(api.contacts.gdprExport, {
      organizationId,
      contactId,
    });

    expect(result.calls).toHaveLength(1);
    const call = (result.calls as Array<Record<string, unknown>>)[0];
    expect(call.outcome).toBe("no_answer");
  });

  test("returns empty calls and emails arrays when none are linked", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const orgStr = String(organizationId);
    const userStr = String(userId);
    const contactId = await seedContact(orgStr, userStr);

    const result = await t.withIdentity(identity).action(api.contacts.gdprExport, {
      organizationId,
      contactId,
    });

    expect(result.calls).toEqual([]);
    expect(result.emails).toEqual([]);
  });

  test("denies export for non-owner/admin users", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t, { role: "member" });
    const orgStr = String(organizationId);
    const userStr = String(userId);
    const contactId = await seedContact(orgStr, userStr);
    const memberIdentity = {
      subject: `${userId}|fake-session-id`,
      issuer: "test",
      tokenIdentifier: `test|${userId}`,
    };

    await expect(
      t.withIdentity(memberIdentity).action(api.contacts.gdprExport, {
        organizationId,
        contactId,
      })
    ).rejects.toThrow("Permission denied");
  });
});
