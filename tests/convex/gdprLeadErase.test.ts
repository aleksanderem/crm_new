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

async function seedLead(
  organizationId: string,
  userId: string,
  overrides: Record<string, unknown> = {},
) {
  const db = createSupabaseDb();
  const now = Date.now();
  const leadId = `lead-gdpr-test-${now}`;
  await db.insert("leads", {
    _id: leadId,
    organizationId,
    title: "Potencjalny klient - Jan Kowalski",
    value: 5000,
    currency: "PLN",
    status: "open",
    priority: null,
    expectedCloseDate: null,
    source: null,
    companyId: null,
    assignedTo: null,
    pipelineStageId: null,
    stageOrder: null,
    notes: "Jan Kowalski, tel. +48 123 456 789, prosi o wycenę.",
    tags: null,
    tagIds: null,
    categoryId: null,
    wonAt: null,
    lostAt: null,
    lostReason: null,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
  return leadId;
}

describe("leads.gdprErase — GDPR erasure for leads", () => {
  test("redacts notes field on the lead row", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const db = createSupabaseDb();
    const leadId = await seedLead(String(organizationId), String(userId));

    await t.withIdentity(identity).action(api.leads.gdprErase, {
      organizationId,
      leadId,
    });

    const lead = await db.get("leads", leadId);
    expect(lead?.notes).toBeNull();
  });

  test("deletes custom field values linked to the lead", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const db = createSupabaseDb();
    const orgStr = String(organizationId);
    const leadId = await seedLead(orgStr, String(userId));
    const now = Date.now();

    await db.insert("customFieldValues", {
      _id: `cfv-${now}`,
      organizationId: orgStr,
      fieldDefinitionId: `field-def-${now}`,
      entityType: "lead",
      entityId: leadId,
      value: "Jan Kowalski",
      createdAt: now,
      updatedAt: now,
    });

    await t.withIdentity(identity).action(api.leads.gdprErase, {
      organizationId,
      leadId,
    });

    const remaining = await db
      .query("customFieldValues")
      .eq("entityType", "lead")
      .eq("entityId", leadId)
      .collect();
    expect(remaining).toHaveLength(0);
  });

  test("redacts activity descriptions linked to the lead", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const leadId = await seedLead(String(organizationId), String(userId));

    await t.run(async (ctx) => {
      await ctx.db.insert("activities", {
        organizationId,
        entityType: "lead",
        entityId: leadId,
        action: "created",
        description: "Utworzono lead Jan Kowalski",
        performedBy: userId,
        createdAt: Date.now(),
      });
    });

    await t.withIdentity(identity).action(api.leads.gdprErase, {
      organizationId,
      leadId,
    });

    const activities = await t.run(async (ctx) =>
      ctx.db
        .query("activities")
        .withIndex("by_entity", (q) =>
          q.eq("entityType", "lead").eq("entityId", leadId)
        )
        .collect()
    );

    const nonGdprActivities = activities.filter(
      (a) => a.description !== "[RODO: dane usunięte]"
    );
    expect(nonGdprActivities).toHaveLength(0);
    expect(activities.length).toBeGreaterThanOrEqual(1);
  });

  test("redacts note contents linked to the lead", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const leadId = await seedLead(String(organizationId), String(userId));
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("notes", {
        organizationId,
        entityType: "lead",
        entityId: leadId,
        content: "Jan Kowalski prosił o ofertę na Q4.",
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
    });

    await t.withIdentity(identity).action(api.leads.gdprErase, {
      organizationId,
      leadId,
    });

    const notes = await t.run(async (ctx) =>
      ctx.db
        .query("notes")
        .withIndex("by_entity", (q) =>
          q.eq("entityType", "lead").eq("entityId", leadId)
        )
        .collect()
    );

    expect(notes).toHaveLength(1);
    expect(notes[0].content).toBe("[RODO: dane usunięte]");
  });

  test("writes an audit log entry with action gdpr_lead_erased", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const leadId = await seedLead(String(organizationId), String(userId));

    await t.withIdentity(identity).action(api.leads.gdprErase, {
      organizationId,
      leadId,
    });

    const auditEntries = await t.run(async (ctx) =>
      ctx.db
        .query("auditLog")
        .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
        .collect()
    );

    const erasureEntry = auditEntries.find(
      (e) => e.action === "gdpr_lead_erased"
    );
    expect(erasureEntry).toBeDefined();
    expect(erasureEntry?.entityType).toBe("lead");
    expect(erasureEntry?.entityId).toBe(leadId);
  });

  test("denies erasure for non-owner/admin users", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t, { role: "member" });
    const leadId = await seedLead(String(organizationId), String(userId));
    const memberIdentity = {
      subject: `${userId}|fake-session-id`,
      issuer: "test",
      tokenIdentifier: `test|${userId}`,
    };

    await expect(
      t.withIdentity(memberIdentity).action(api.leads.gdprErase, {
        organizationId,
        leadId,
      })
    ).rejects.toThrow("Permission denied");
  });
});

describe("leads.gdprExport — GDPR data export for leads", () => {
  test("returns lead core data", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const leadId = await seedLead(String(organizationId), String(userId));

    const result = await t.withIdentity(identity).action(api.leads.gdprExport, {
      organizationId,
      leadId,
    });

    expect(result.lead.id).toBe(leadId);
    expect(result.lead.title).toBe("Potencjalny klient - Jan Kowalski");
    expect(result.lead.notes).toBe("Jan Kowalski, tel. +48 123 456 789, prosi o wycenę.");
    expect(result.exportedAt).toBeDefined();
  });

  test("includes custom field values linked to the lead", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const db = createSupabaseDb();
    const orgStr = String(organizationId);
    const leadId = await seedLead(orgStr, String(userId));
    const now = Date.now();

    await db.insert("customFieldValues", {
      _id: `cfv-export-${now}`,
      organizationId: orgStr,
      fieldDefinitionId: `field-def-export-${now}`,
      entityType: "lead",
      entityId: leadId,
      value: "Jan Kowalski",
      createdAt: now,
      updatedAt: now,
    });

    const result = await t.withIdentity(identity).action(api.leads.gdprExport, {
      organizationId,
      leadId,
    });

    expect(result.customFieldValues).toHaveLength(1);
    const cfv = (result.customFieldValues as Array<Record<string, unknown>>)[0];
    expect(cfv.value).toBe("Jan Kowalski");
  });

  test("returns empty arrays when no related data exists", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const leadId = await seedLead(String(organizationId), String(userId));

    const result = await t.withIdentity(identity).action(api.leads.gdprExport, {
      organizationId,
      leadId,
    });

    expect(result.activities).toEqual([]);
    expect(result.notes).toEqual([]);
    expect(result.customFieldValues).toEqual([]);
  });

  test("denies export for non-owner/admin users", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t, { role: "member" });
    const leadId = await seedLead(String(organizationId), String(userId));
    const memberIdentity = {
      subject: `${userId}|fake-session-id`,
      issuer: "test",
      tokenIdentifier: `test|${userId}`,
    };

    await expect(
      t.withIdentity(memberIdentity).action(api.leads.gdprExport, {
        organizationId,
        leadId,
      })
    ).rejects.toThrow("Permission denied");
  });
});
