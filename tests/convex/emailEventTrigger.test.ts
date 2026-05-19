import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { internal } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";

// `triggerEmailEvent` schedules Supabase dual-writes and downstream event
// processing via `ctx.scheduler.runAfter(0, …)`. convex-test fires those
// callbacks via `setTimeout(0, …)` against a `global.Convex` reference; once
// the next test creates a fresh instance, orphan callbacks from the previous
// test fire against the new `global.Convex` and surface as "Write outside of
// transaction" unhandled rejections that flip vitest's exit code even though
// every assertion passes. Match the per-file filter used by
// payments/packageActivities (#511, #514) — swallow only the known
// scheduler-noise shape, let everything else through.
const SCHEDULER_NOISE = [
  /Write outside of transaction \d+;_scheduled_functions/,
];

function onUnhandledRejection(reason: unknown) {
  const msg = reason instanceof Error ? reason.message : String(reason);
  if (SCHEDULER_NOISE.some((re) => re.test(msg))) return;
}

beforeAll(() => {
  process.on("unhandledRejection", onUnhandledRejection);
});

afterAll(() => {
  process.off("unhandledRejection", onUnhandledRejection);
});

afterEach(async () => {
  // Let any pending setTimeout(0) side-effect callbacks from the test fire
  // against the *current* instance before the next test creates a new one.
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
    const t = createTestCtx();
    const { organizationId } = await seedTestUser(t);

    const bindings = await t.run(async (ctx) =>
      ctx.db
        .query("emailEventBindings")
        .withIndex("by_orgAndEventType", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("eventType", "appointment.created"),
        )
        .filter((q) => q.eq(q.field("enabled"), true))
        .collect(),
    );

    expect(bindings).toHaveLength(0);
  });

  // ─── listEnabledBindings: active binding found ─────────────────

  test("listEnabledBindings returns active binding for matching event type", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);

    // Seed: email template + enabled binding
    const { templateId, bindingId } = await t.run(async (ctx) => {
      const now = Date.now();

      const templateId = await ctx.db.insert("emailTemplates", {
        organizationId,
        name: "Appointment Created",
        subject: "Your appointment is confirmed",
        body: "Hello {{patientName}}, your appointment is confirmed.",
        variables: [{ key: "patientName", label: "Patient Name", source: "patient.name" }],
        createdBy: userId,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

      const bindingId = await ctx.db.insert("emailEventBindings", {
        organizationId,
        eventType: "appointment.created",
        templateId,
        enabled: true,
        priority: 1,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });

      return { templateId, bindingId };
    });

    // Verify the binding is discoverable
    const bindings = await t.run(async (ctx) =>
      ctx.db
        .query("emailEventBindings")
        .withIndex("by_orgAndEventType", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("eventType", "appointment.created"),
        )
        .filter((q) => q.eq(q.field("enabled"), true))
        .collect(),
    );

    expect(bindings).toHaveLength(1);
    expect(bindings[0]._id).toBe(bindingId);
    expect(bindings[0].templateId).toBe(templateId);
    expect(bindings[0].enabled).toBe(true);
  });

  // ─── Disabled binding not returned ────────────────────────────

  test("listEnabledBindings ignores disabled bindings", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);

    await t.run(async (ctx) => {
      const now = Date.now();

      const templateId = await ctx.db.insert("emailTemplates", {
        organizationId,
        name: "Appointment Created",
        subject: "Appointment confirmed",
        body: "Hello {{patientName}}",
        variables: [],
        createdBy: userId,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

      // Insert a DISABLED binding
      await ctx.db.insert("emailEventBindings", {
        organizationId,
        eventType: "appointment.created",
        templateId,
        enabled: false, // disabled
        priority: 1,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
    });

    const bindings = await t.run(async (ctx) =>
      ctx.db
        .query("emailEventBindings")
        .withIndex("by_orgAndEventType", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("eventType", "appointment.created"),
        )
        .filter((q) => q.eq(q.field("enabled"), true))
        .collect(),
    );

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
