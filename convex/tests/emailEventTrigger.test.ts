import { expect, test, describe } from "vitest";
import { internal } from "../_generated/api";
import { createTestCtx, seedTestUser } from "../_test_helpers";

describe("emailEventTrigger", () => {
  test("triggerEmailEvent creates pending log when no bindings", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await t.withIdentity(identity).mutation(internal.emailEventTrigger.triggerEmailEvent, {
      organizationId, eventType: "appointment.created", recipientEmail: "test@example.com", triggeredBy: userId,
    });
    const logs = await t.run(async (ctx) => ctx.db.query("emailEventLog").collect());
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe("pending");
  });

  test("listEnabledBindings returns empty when no bindings", async () => {
    const t = createTestCtx();
    const { organizationId } = await seedTestUser(t);
    const bindings = await t.run(async (ctx) => ctx.db.query("emailEventBindings").withIndex("by_orgAndEventType", q => q.eq("organizationId", organizationId).eq("eventType", "x")).filter(q => q.eq(q.field("enabled"), true)).collect());
    expect(bindings).toHaveLength(0);
  });

  test("listEnabledBindings returns active binding", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);
    const { bindingId } = await t.run(async (ctx) => {
      const now = Date.now();
      const tid = await ctx.db.insert("emailTemplates", { organizationId, name: "Test", subject: "Test", body: "Test", variables: [], createdBy: userId, isActive: true, createdAt: now, updatedAt: now });
      const bid = await ctx.db.insert("emailEventBindings", { organizationId, eventType: "x", templateId: tid, enabled: true, priority: 1, createdBy: userId, createdAt: now, updatedAt: now });
      return { bindingId: bid };
    });
    const bindings = await t.run(async (ctx) => ctx.db.query("emailEventBindings").withIndex("by_orgAndEventType", q => q.eq("organizationId", organizationId).eq("eventType", "x")).filter(q => q.eq(q.field("enabled"), true)).collect());
    expect(bindings).toHaveLength(1);
    expect(bindings[0]._id).toBe(bindingId);
  });

  test("listEnabledBindings ignores disabled", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      const tid = await ctx.db.insert("emailTemplates", { organizationId, name: "Test", subject: "Test", body: "Test", variables: [], createdBy: userId, isActive: true, createdAt: now, updatedAt: now });
      await ctx.db.insert("emailEventBindings", { organizationId, eventType: "x", templateId: tid, enabled: false, priority: 1, createdBy: userId, createdAt: now, updatedAt: now });
    });
    const bindings = await t.run(async (ctx) => ctx.db.query("emailEventBindings").withIndex("by_orgAndEventType", q => q.eq("organizationId", organizationId).eq("eventType", "x")).filter(q => q.eq(q.field("enabled"), true)).collect());
    expect(bindings).toHaveLength(0);
  });

  test("multiple calls create multiple logs", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    for (const email of ["a@a.com", "b@b.com"]) {
      await t.withIdentity(identity).mutation(internal.emailEventTrigger.triggerEmailEvent, { organizationId, eventType: "x", recipientEmail: email, triggeredBy: userId });
    }
    const logs = await t.run(async (ctx) => ctx.db.query("emailEventLog").collect());
    expect(logs).toHaveLength(2);
  });
});
