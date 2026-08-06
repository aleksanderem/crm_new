import { afterEach, describe, expect, test } from "vitest";
import { internal } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

afterEach(async () => {
  // Let any pending setTimeout(0) side-effect callbacks from the test fire
  // against the *current* instance before the next test creates a new one.
  // The process-wide scheduler-noise filter in tests/convex/_setup.ts swallows
  // any orphan-write rejections that still escape.
  await new Promise((resolve) => setTimeout(resolve, 0));
});

describe("emailEventTrigger", () => {
  // ─── No-op: no bindings configured ────────────────────────────

  test("triggerEmailEvent creates a pending log entry when no bindings exist", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    // Call triggerEmailEvent — no bindings configured for this org
    await t.withIdentity(identity).mutation(
      internal.emailEventTrigger.triggerEmailEvent,
      {
        organizationId,
        eventType: "appointment.created",
        recipientEmail: "patient@example.com",
        recipientName: "Jan Kowalski",
        payload: JSON.stringify({ patientName: "Jan Kowalski" }),
        triggeredBy: userId,
      },
    );

    // A log entry must be created with status "pending"
    const logs = await t.run(async (ctx) =>
      ctx.db.query("emailEventLog").collect(),
    );
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe("pending");
    expect(logs[0].eventType).toBe("appointment.created");
    expect(logs[0].recipientEmail).toBe("patient@example.com");
    expect(logs[0].organizationId).toBe(organizationId);
  });

  // ─── listEnabledBindings: no bindings ─────────────────────────

  test("listEnabledBindings returns empty when no bindings configured", async () => {
    const { organizationId } = await seedTestUser(createTestCtx());

    const db = createSupabaseDb();
    const bindings = await db
      .query("emailEventBindings")
      .eq("organizationId", String(organizationId))
      .eq("eventType", "appointment.created")
      .eq("enabled", true)
      .collect();

    expect(bindings).toHaveLength(0);
  });

  // ─── listEnabledBindings: active binding found ─────────────────

  test("listEnabledBindings returns active binding for matching event type", async () => {
    const { organizationId, userId } = await seedTestUser(createTestCtx());

    const db = createSupabaseDb();
    const now = Date.now();

    const templateId = await db.insert("emailTemplates", {
      organizationId: String(organizationId),
      name: "Appointment Created",
      subject: "Your appointment is confirmed",
      body: "Hello {{patientName}}, your appointment is confirmed.",
      createdBy: String(userId),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    const bindingId = await db.insert("emailEventBindings", {
      organizationId: String(organizationId),
      eventType: "appointment.created",
      templateId,
      enabled: true,
      priority: 1,
      createdBy: String(userId),
      createdAt: now,
      updatedAt: now,
    });

    const bindings = await db
      .query("emailEventBindings")
      .eq("organizationId", String(organizationId))
      .eq("eventType", "appointment.created")
      .eq("enabled", true)
      .order("priority", true)
      .collect();

    expect(bindings).toHaveLength(1);
    expect(bindings[0]._id).toBe(bindingId);
    expect(bindings[0].templateId).toBe(templateId);
    expect(bindings[0].enabled).toBe(true);
  });

  // ─── Disabled binding not returned ────────────────────────────

  test("listEnabledBindings ignores disabled bindings", async () => {
    const { organizationId, userId } = await seedTestUser(createTestCtx());

    const db = createSupabaseDb();
    const now = Date.now();

    const templateId = await db.insert("emailTemplates", {
      organizationId: String(organizationId),
      name: "Appointment Created",
      subject: "Appointment confirmed",
      body: "Hello {{patientName}}",
      createdBy: String(userId),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert("emailEventBindings", {
      organizationId: String(organizationId),
      eventType: "appointment.created",
      templateId,
      enabled: false,
      priority: 1,
      createdBy: String(userId),
      createdAt: now,
      updatedAt: now,
    });

    const bindings = await db
      .query("emailEventBindings")
      .eq("organizationId", String(organizationId))
      .eq("eventType", "appointment.created")
      .eq("enabled", true)
      .collect();

    expect(bindings).toHaveLength(0);
  });

  // ─── Multiple calls create multiple log entries ────────────────

  test("multiple triggerEmailEvent calls each create a separate log entry", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);

    for (const email of ["a@example.com", "b@example.com"]) {
      await t.withIdentity(identity).mutation(
        internal.emailEventTrigger.triggerEmailEvent,
        {
          organizationId,
          eventType: "appointment.created",
          recipientEmail: email,
          triggeredBy: userId,
        },
      );
    }

    const logs = await t.run(async (ctx) =>
      ctx.db.query("emailEventLog").collect(),
    );
    expect(logs).toHaveLength(2);
    const emails = logs.map((l) => l.recipientEmail).sort();
    expect(emails).toEqual(["a@example.com", "b@example.com"]);
  });
});
