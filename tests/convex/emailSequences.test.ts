import { afterEach, describe, expect, test } from "vitest";
import { internal } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

describe("emailSequences.enrollRecipient", () => {
  test("returns null when no steps exist in Supabase", async () => {
    const t = createTestCtx();
    const { organizationId } = await seedTestUser(t);

    const db = createSupabaseDb();
    const now = Date.now();

    const sequenceId = await db.insert("emailSequences", {
      organizationId: String(organizationId),
      name: "Empty Sequence",
      triggerEventType: "appointment.created",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    const result = await t.action(internal.emailSequences.enrollRecipient, {
      sequenceId: sequenceId,
      organizationId,
      recipientEmail: "test@example.com",
    });

    expect(result).toBeNull();
  });

  test("creates enrollment in Supabase when steps exist", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);

    const db = createSupabaseDb();
    const now = Date.now();

    const sequenceId = await db.insert("emailSequences", {
      organizationId: String(organizationId),
      name: "Test Sequence",
      triggerEventType: "appointment.created",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    const templateId = await db.insert("emailTemplates", {
      organizationId: String(organizationId),
      name: "Step 1 Template",
      subject: "Hello",
      body: "Hello {{name}}",
      createdBy: String(userId),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert("emailSequenceSteps", {
      sequenceId,
      organizationId: String(organizationId),
      order: 0,
      delayMs: 0,
      templateId,
      createdAt: now,
    });

    const enrollmentId = await t.action(internal.emailSequences.enrollRecipient, {
      sequenceId: sequenceId,
      organizationId,
      recipientEmail: "patient@example.com",
      recipientName: "Jan Kowalski",
    });

    expect(enrollmentId).toBeTruthy();

    const enrollment = await db.get("emailSequenceEnrollments", enrollmentId as string);
    expect(enrollment).not.toBeNull();
    expect(enrollment!.recipientEmail).toBe("patient@example.com");
    expect(enrollment!.recipientName).toBe("Jan Kowalski");
    expect(enrollment!.status).toBe("active");
    expect(enrollment!.currentStep).toBe(0);
  });

  test("sorts steps by order and uses first step for scheduling", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);

    const db = createSupabaseDb();
    const now = Date.now();

    const sequenceId = await db.insert("emailSequences", {
      organizationId: String(organizationId),
      name: "Multi-step Sequence",
      triggerEventType: "lead.created",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    const templateId = await db.insert("emailTemplates", {
      organizationId: String(organizationId),
      name: "Template",
      subject: "Subject",
      body: "Body",
      createdBy: String(userId),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    // Insert steps out of order to verify sorting
    await db.insert("emailSequenceSteps", {
      sequenceId,
      organizationId: String(organizationId),
      order: 1,
      delayMs: 86400000,
      templateId,
      createdAt: now,
    });
    await db.insert("emailSequenceSteps", {
      sequenceId,
      organizationId: String(organizationId),
      order: 0,
      delayMs: 0,
      templateId,
      createdAt: now,
    });

    const enrollmentId = await t.action(internal.emailSequences.enrollRecipient, {
      sequenceId: sequenceId,
      organizationId,
      recipientEmail: "lead@example.com",
    });

    expect(enrollmentId).toBeTruthy();

    const enrollment = await db.get("emailSequenceEnrollments", enrollmentId as string);
    expect(enrollment).not.toBeNull();
    expect(enrollment!.currentStep).toBe(0);
  });
});
