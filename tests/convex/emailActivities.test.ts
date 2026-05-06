import { describe, expect, test, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { sendEmail } from "@cvx/email";

vi.mock("@cvx/email", () => ({
  sendEmail: vi.fn(async () => undefined),
}));

describe("email activities", () => {
  test("emails.send publishes outbound email envelope with stable eventKey and semantic payload", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("emailAccounts", {
        organizationId,
        fromName: "Support",
        fromEmail: "support@example.com",
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      });
    });

    const emailId = await t.withIdentity(identity).mutation(api.emails.send, {
      organizationId,
      to: ["client@example.com"],
      subject: "Welcome aboard",
      bodyText: "Thanks for signing up",
    });

    expect(emailId).toBeTruthy();
    expect(sendEmail).toHaveBeenCalledWith({
      to: "client@example.com",
      subject: "Welcome aboard",
      html: "Thanks for signing up",
    });

    const rows = await t.run(async (ctx) => {
      const all = await ctx.db.query("activities").collect();
      return all.filter((row) => row.organizationId === organizationId);
    });

    expect(rows).toHaveLength(1);

    const [row] = rows;
    expect(row.entityType).toBe("email");
    expect(row.entityId).toBe(emailId);
    expect(row.action).toBe("email_sent");
    expect(row.description).toBe('Sent email "Welcome aboard" to client@example.com');
    expect(row.performedBy).toBe(userId);

    const envelope = row.metadata?.activityEnvelope;
    expect(envelope).toBeTruthy();
    expect(envelope).toMatchObject({
      schemaVersion: 1,
      module: "crm",
      summary: 'Sent email "Welcome aboard" to client@example.com',
      actor: {
        type: "user",
        userId,
      },
      payload: {
        emailId,
        direction: "outbound",
        to: ["client@example.com"],
        subject: "Welcome aboard",
      },
      targets: [
        {
          entityType: "email",
          entityId: emailId,
        },
      ],
    });
    expect(envelope.eventKey).toBe(`crm:email:${emailId}:email_sent`);
    expect(envelope.occurredAt).toBe(row.createdAt);
  });

  test("emails_internal.insertInbound publishes email_received envelope with stable eventKey and semantic payload", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);

    const now = Date.now();
    const messageId = "inbound-message-42@example.com";

    await t.mutation(internal.emails_internal.insertInbound, {
      organizationId,
      threadId: "thread-42",
      messageId,
      from: "client@example.com",
      to: ["support@example.com"],
      subject: "Need help with billing",
      bodyText: "Could you clarify my invoice?",
      snippet: "Could you clarify my invoice?",
    });

    const { email, rows } = await t.run(async (ctx) => {
      const email = await ctx.db
        .query("emails")
        .withIndex("by_messageId", (q) => q.eq("messageId", messageId))
        .unique();
      const rows = await ctx.db.query("activities").collect();
      return {
        email,
        rows: rows.filter((row) => row.organizationId === organizationId),
      };
    });

    expect(email).toBeTruthy();
    expect(rows).toHaveLength(1);

    const [row] = rows;
    expect(row.action).toBe("email_received");
    expect(row.entityType).toBe("email");
    expect(row.entityId).toBe(email!._id);
    expect(row.performedBy).toBe(userId);
    expect(row.description).toBe('Received email "Need help with billing" from client@example.com');

    const envelope = row.metadata?.activityEnvelope;
    expect(envelope).toBeTruthy();
    expect(envelope).toMatchObject({
      schemaVersion: 1,
      module: "crm",
      summary: 'Received email "Need help with billing" from client@example.com',
      actor: {
        type: "external",
        label: "client@example.com",
      },
      payload: {
        emailId: email!._id,
        direction: "inbound",
        from: "client@example.com",
        to: ["support@example.com"],
        subject: "Need help with billing",
      },
      targets: [
        {
          entityType: "email",
          entityId: email!._id,
        },
      ],
    });
    expect(envelope.eventKey).toBe(`crm:email:${email!._id}:email_received`);
    expect(envelope.occurredAt).toBe(row.createdAt);
    expect(row.createdAt).toBeGreaterThanOrEqual(now);
  });

  test("emails_internal.insertInbound still persists email when organization is missing", async () => {
    const t = createTestCtx();
    const { organizationId } = await seedTestUser(t);
    const messageId = "orphan-inbound-message@example.com";

    await t.run(async (ctx) => {
      await ctx.db.delete(organizationId);
    });

    await t.mutation(internal.emails_internal.insertInbound, {
      organizationId,
      threadId: "orphan-thread",
      messageId,
      from: "client@example.com",
      to: ["support@example.com"],
      subject: "Still store this",
      bodyText: "Inbound row should still persist",
      snippet: "Inbound row should still persist",
    });

    const { email, rows } = await t.run(async (ctx) => {
      const email = await ctx.db
        .query("emails")
        .withIndex("by_messageId", (q) => q.eq("messageId", messageId))
        .unique();
      const rows = await ctx.db.query("activities").collect();
      return { email, rows };
    });

    expect(email).toBeTruthy();
    expect(email?.organizationId).toBe(organizationId);
    expect(rows).toHaveLength(0);
  });
});
