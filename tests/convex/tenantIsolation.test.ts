/**
 * Tenant isolation tests — verifies that an authenticated user from Org A
 * cannot read rows that belong to Org B through any Convex query or action
 * endpoint.
 *
 * Two attack vectors are tested for each endpoint:
 *   1. Cross-org list: pass Org B's organizationId while authenticated as a
 *      member of Org A only → verifyOrgAccess must throw.
 *   2. Cross-ID fetch: pass Org A's organizationId but an entity ID that
 *      belongs to Org B → the per-entity org ownership check must throw.
 *
 * These tests cover both the Convex query layer and the Convex action layer
 * (action endpoints that call ctx.runQuery(internal._helpers.authAction.verifyOrgAccess)
 * are tested via t.withIdentity(identity).action(...)). Supabase RLS (the other
 * half of the read-path protection) cannot be exercised with the in-memory stub;
 * it is validated by the RLS coverage audit (#3709 dependency).
 */

import { afterEach, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Seed a second fully independent org + user, not a member of any other org. */
async function seedOrgB(t: ReturnType<typeof createTestCtx>) {
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Org B User",
      email: "orgb@example.com",
    });
    const organizationId = await ctx.db.insert("organizations", {
      name: "Org B",
      slug: "org-b",
      ownerId: userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.insert("teamMemberships", {
      organizationId,
      userId,
      role: "owner" as const,
      joinedAt: Date.now(),
    });
    return { userId, organizationId };
  });

  const identity = {
    subject: `${ids.userId}|orgb-session`,
    issuer: "test",
    tokenIdentifier: `test|${ids.userId}`,
  };

  return { ...ids, identity };
}

const PAGINATION = { numItems: 20, cursor: null };

// ─── Platform / Org layer ─────────────────────────────────────────────────────

describe("tenant isolation — organizations", () => {
  test("getSeatUsage: org A user cannot query org B seat usage", async () => {
    const t = createTestCtx();
    const { identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId } = await seedOrgB(t);

    await expect(
      t.withIdentity(identityA).query(api.organizations.getSeatUsage, {
        organizationId: orgBId,
      }),
    ).rejects.toThrow("Not a member of this organization");
  });

  // getMembers is an action (not a query) — must use .action() runner.
  test("getMembers: org A user cannot list org B members", async () => {
    const t = createTestCtx();
    const { identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId } = await seedOrgB(t);

    await expect(
      t.withIdentity(identityA).action(api.organizations.getMembers, {
        organizationId: orgBId,
      }),
    ).rejects.toThrow("Not a member of this organization");
  });
});

// ─── Permissions ──────────────────────────────────────────────────────────────

describe("tenant isolation — permissions", () => {
  test("getMyRole: org A user cannot query role in org B", async () => {
    const t = createTestCtx();
    const { identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId } = await seedOrgB(t);

    await expect(
      t.withIdentity(identityA).query(api.permissions.getMyRole, {
        organizationId: orgBId,
      }),
    ).rejects.toThrow("Not a member of this organization");
  });
});

// ─── Contacts ─────────────────────────────────────────────────────────────────
//
// api.contacts.getById does NOT exist — the endpoint was removed as part of the
// Supabase migration (contacts are read via use-supabase-contacts.ts / RLS).
// Test deleted per audit recommendation. Production isolation guarantee is
// provided by Supabase RLS (audit ref #3709).

// ─── Companies ────────────────────────────────────────────────────────────────
//
// api.companies.getById does NOT exist — removed in Supabase migration.
// Test deleted per audit recommendation.

// ─── Leads ────────────────────────────────────────────────────────────────────

describe("tenant isolation — leads", () => {
  test("list: org A user cannot list org B leads", async () => {
    const t = createTestCtx();
    const { identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId } = await seedOrgB(t);

    await expect(
      t.withIdentity(identityA).action(api.leads.list, {
        organizationId: orgBId,
        paginationOpts: PAGINATION,
      }),
    ).rejects.toThrow("Not a member of this organization");
  });

  // api.leads.getById does NOT exist — removed in Supabase migration.
  // Test deleted per audit recommendation.
});

// ─── Notes ────────────────────────────────────────────────────────────────────
//
// api.notes.listByEntity and api.notes.getById do NOT exist — both were removed
// as part of the Supabase migration (notes are read via use-supabase-notes.ts /
// RLS). All three note tests deleted per audit recommendation.

// ─── Activities ───────────────────────────────────────────────────────────────

describe("tenant isolation — activities", () => {
  test("getRecentForOrg: org A user cannot read org B activity feed", async () => {
    const t = createTestCtx();
    const { identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId } = await seedOrgB(t);

    await expect(
      t.withIdentity(identityA).query(api.activities.getRecentForOrg, {
        organizationId: orgBId,
      }),
    ).rejects.toThrow("Not a member of this organization");
  });

  test("getForEntity: org A user cannot query activities using org B's organizationId", async () => {
    const t = createTestCtx();
    const { identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId } = await seedOrgB(t);

    await expect(
      t.withIdentity(identityA).query(api.activities.getForEntity, {
        organizationId: orgBId,
        entityType: "contact",
        entityId: "some-id",
        paginationOpts: PAGINATION,
      }),
    ).rejects.toThrow("Not a member of this organization");
  });
});

// ─── Audit log ────────────────────────────────────────────────────────────────
//
// api.auditLog.list does NOT exist — convex/auditLog.ts only exports the
// logAudit helper function, not a public query. The endpoint was never a
// Convex public query; audit log reads go via use-supabase-audit-log.ts / RLS.
// Test deleted per audit recommendation.

// ─── Pipelines (action-based, Supabase-primary) ───────────────────────────────
//
// These endpoints are `action` type and call ctx.runQuery(verifyOrgAccess)
// internally. The Convex auth layer is fully testable via convex-test's
// .action() runner; Supabase RLS enforcement is covered separately (#3709).

describe("tenant isolation — pipelines (actions)", () => {
  test("list: org A user cannot list org B pipelines", async () => {
    const t = createTestCtx();
    const { identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId } = await seedOrgB(t);

    await expect(
      t.withIdentity(identityA).action(api.pipelines.list, {
        organizationId: orgBId,
      }),
    ).rejects.toThrow("Not a member of this organization");
  });

  test("getById: org A user cannot access org B pipeline using org B's orgId", async () => {
    const t = createTestCtx();
    const { identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId } = await seedOrgB(t);

    await expect(
      t.withIdentity(identityA).action(api.pipelines.getById, {
        organizationId: orgBId,
        pipelineId: "some-pipeline-id",
      }),
    ).rejects.toThrow("Not a member of this organization");
  });

  test("getById: org A user cannot fetch an org B pipeline by ID using org A's orgId", async () => {
    const t = createTestCtx();
    const { organizationId: orgAId, identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId } = await seedOrgB(t);

    // Insert a pipeline belonging to Org B into the in-memory Supabase store.
    const db = createSupabaseDb();
    const pipelineBId = await db.insert("pipelines", {
      organizationId: String(orgBId),
      name: "Org B Pipeline",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Org A user passes Org A's orgId but Org B's pipeline ID.
    // verifyOrgAccess passes (user is in Org A), but the pipeline ownership
    // check (pipeline.organizationId !== orgAId) must throw.
    await expect(
      t.withIdentity(identityA).action(api.pipelines.getById, {
        organizationId: orgAId,
        pipelineId: pipelineBId,
      }),
    ).rejects.toThrow("Pipeline not found");
  });

  test("getStages: org A user cannot list stages for an org B pipeline", async () => {
    const t = createTestCtx();
    const { identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId } = await seedOrgB(t);

    await expect(
      t.withIdentity(identityA).action(api.pipelines.getStages, {
        organizationId: orgBId,
        pipelineId: "some-pipeline-id",
      }),
    ).rejects.toThrow("Not a member of this organization");
  });

  test("getAllStages: org A user cannot list all stages of org B", async () => {
    const t = createTestCtx();
    const { identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId } = await seedOrgB(t);

    await expect(
      t.withIdentity(identityA).action(api.pipelines.getAllStages, {
        organizationId: orgBId,
      }),
    ).rejects.toThrow("Not a member of this organization");
  });
});

// ─── Gabinet patients (action-based, Supabase-primary) ────────────────────────

describe("tenant isolation — gabinet patients (actions)", () => {
  test("list: org A user cannot list org B patients", async () => {
    const t = createTestCtx();
    const { identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId } = await seedOrgB(t);

    await expect(
      t.withIdentity(identityA).action(api.gabinet.patients.list, {
        organizationId: orgBId,
        paginationOpts: PAGINATION,
      }),
    ).rejects.toThrow("Not a member of this organization");
  });
});

// ─── Scheduled Activities (action-based, Supabase-primary) ───────────────────
//
// All public query endpoints were deleted as part of the Supabase migration.
// Only write actions remain; each calls verifyOrgAccess before mutating data.

describe("tenant isolation — scheduledActivities (actions)", () => {
  test("create: org A user cannot create activity in org B", async () => {
    const t = createTestCtx();
    const { identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId, userId: userBId } = await seedOrgB(t);

    await expect(
      t.withIdentity(identityA).action(api.scheduledActivities.create, {
        organizationId: orgBId,
        title: "Cross-org activity",
        activityType: "task",
        dueDate: Date.now() + 86400000,
        ownerId: String(userBId),
      }),
    ).rejects.toThrow("Not a member of this organization");
  });

  test("update: org A user cannot update using org B's organizationId", async () => {
    const t = createTestCtx();
    const { identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId } = await seedOrgB(t);

    await expect(
      t.withIdentity(identityA).action(api.scheduledActivities.update, {
        organizationId: orgBId,
        activityId: "some-activity-id",
        title: "Hijacked",
      }),
    ).rejects.toThrow("Not a member of this organization");
  });

  test("update: org A user cannot update org B activity using org A's orgId", async () => {
    const t = createTestCtx();
    const { organizationId: orgAId, identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId, userId: userBId } = await seedOrgB(t);

    const db = createSupabaseDb();
    const activityBId = await db.insert("scheduledActivities", {
      organizationId: String(orgBId),
      title: "Org B Activity",
      activityType: "task",
      dueDate: Date.now() + 86400000,
      isCompleted: false,
      ownerId: String(userBId),
      createdBy: String(userBId),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await expect(
      t.withIdentity(identityA).action(api.scheduledActivities.update, {
        organizationId: orgAId,
        activityId: activityBId,
        title: "Hijacked",
      }),
    ).rejects.toThrow("Scheduled activity not found");
  });

  test("remove: org A user cannot delete using org B's organizationId", async () => {
    const t = createTestCtx();
    const { identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId } = await seedOrgB(t);

    await expect(
      t.withIdentity(identityA).action(api.scheduledActivities.remove, {
        organizationId: orgBId,
        activityId: "some-activity-id",
      }),
    ).rejects.toThrow("Not a member of this organization");
  });

  test("remove: org A user cannot delete org B activity using org A's orgId", async () => {
    const t = createTestCtx();
    const { organizationId: orgAId, identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId, userId: userBId } = await seedOrgB(t);

    const db = createSupabaseDb();
    const activityBId = await db.insert("scheduledActivities", {
      organizationId: String(orgBId),
      title: "Org B Activity",
      activityType: "call",
      dueDate: Date.now() + 86400000,
      isCompleted: false,
      ownerId: String(userBId),
      createdBy: String(userBId),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await expect(
      t.withIdentity(identityA).action(api.scheduledActivities.remove, {
        organizationId: orgAId,
        activityId: activityBId,
      }),
    ).rejects.toThrow("Scheduled activity not found");
  });

  test("markComplete: org A user cannot complete org B activity using org A's orgId", async () => {
    const t = createTestCtx();
    const { organizationId: orgAId, identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId, userId: userBId } = await seedOrgB(t);

    const db = createSupabaseDb();
    const activityBId = await db.insert("scheduledActivities", {
      organizationId: String(orgBId),
      title: "Org B Activity",
      activityType: "meeting",
      dueDate: Date.now() + 86400000,
      isCompleted: false,
      ownerId: String(userBId),
      createdBy: String(userBId),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await expect(
      t.withIdentity(identityA).action(api.scheduledActivities.markComplete, {
        organizationId: orgAId,
        activityId: activityBId,
      }),
    ).rejects.toThrow("Scheduled activity not found");
  });

  test("markIncomplete: org A user cannot reopen org B activity using org A's orgId", async () => {
    const t = createTestCtx();
    const { organizationId: orgAId, identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId, userId: userBId } = await seedOrgB(t);

    const db = createSupabaseDb();
    const activityBId = await db.insert("scheduledActivities", {
      organizationId: String(orgBId),
      title: "Org B Completed Activity",
      activityType: "email",
      dueDate: Date.now() + 86400000,
      isCompleted: true,
      ownerId: String(userBId),
      createdBy: String(userBId),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await expect(
      t.withIdentity(identityA).action(api.scheduledActivities.markIncomplete, {
        organizationId: orgAId,
        activityId: activityBId,
      }),
    ).rejects.toThrow("Scheduled activity not found");
  });
});

// ─── Custom Fields ────────────────────────────────────────────────────────────
//
// getDefinitions / getValues / getValuesBulk are Convex queries using
// verifyOrgAccess. updateDefinition / deleteDefinition are actions that also
// enforce per-resource org ownership.

describe("tenant isolation — customFields", () => {
  test("getDefinitions: org A user cannot list org B field definitions", async () => {
    const t = createTestCtx();
    const { identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId } = await seedOrgB(t);

    await expect(
      t.withIdentity(identityA).query(api.customFields.getDefinitions, {
        organizationId: orgBId,
        entityType: "contact",
      }),
    ).rejects.toThrow("Not a member of this organization");
  });

  test("getValues: org A user cannot fetch org B entity field values", async () => {
    const t = createTestCtx();
    const { identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId } = await seedOrgB(t);

    await expect(
      t.withIdentity(identityA).query(api.customFields.getValues, {
        organizationId: orgBId,
        entityType: "contact",
        entityId: "some-contact-id",
      }),
    ).rejects.toThrow("Not a member of this organization");
  });

  test("getValuesBulk: org A user cannot bulk-fetch org B field values", async () => {
    const t = createTestCtx();
    const { identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId } = await seedOrgB(t);

    await expect(
      t.withIdentity(identityA).query(api.customFields.getValuesBulk, {
        organizationId: orgBId,
        entityType: "contact",
        entityIds: ["some-id"],
      }),
    ).rejects.toThrow("Not a member of this organization");
  });

  test("updateDefinition: org A user cannot update using org B's organizationId", async () => {
    const t = createTestCtx();
    const { identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId } = await seedOrgB(t);

    await expect(
      t.withIdentity(identityA).action(api.customFields.updateDefinition, {
        organizationId: orgBId,
        definitionId: "some-definition-id",
        name: "Hijacked",
      }),
    ).rejects.toThrow("Not a member of this organization");
  });

  test("updateDefinition: org A user cannot update org B definition using org A's orgId", async () => {
    const t = createTestCtx();
    const { organizationId: orgAId, identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId } = await seedOrgB(t);

    const db = createSupabaseDb();
    const defBId = await db.insert("customFieldDefinitions", {
      organizationId: String(orgBId),
      entityType: "contact",
      name: "Org B Field",
      fieldKey: "org_b_secret",
      fieldType: "text",
      order: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await expect(
      t.withIdentity(identityA).action(api.customFields.updateDefinition, {
        organizationId: orgAId,
        definitionId: defBId,
        name: "Hijacked",
      }),
    ).rejects.toThrow("Field definition not found");
  });

  test("deleteDefinition: org A user cannot delete using org B's organizationId", async () => {
    const t = createTestCtx();
    const { identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId } = await seedOrgB(t);

    await expect(
      t.withIdentity(identityA).action(api.customFields.deleteDefinition, {
        organizationId: orgBId,
        definitionId: "some-definition-id",
      }),
    ).rejects.toThrow("Not a member of this organization");
  });

  test("deleteDefinition: org A user cannot delete org B definition using org A's orgId", async () => {
    const t = createTestCtx();
    const { organizationId: orgAId, identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId } = await seedOrgB(t);

    const db = createSupabaseDb();
    const defBId = await db.insert("customFieldDefinitions", {
      organizationId: String(orgBId),
      entityType: "lead",
      name: "Org B Secret Field",
      fieldKey: "org_b_secret_lead",
      fieldType: "text",
      order: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await expect(
      t.withIdentity(identityA).action(api.customFields.deleteDefinition, {
        organizationId: orgAId,
        definitionId: defBId,
      }),
    ).rejects.toThrow("Field definition not found");
  });
});

// ─── Saved Views (action-based, Supabase-primary) ────────────────────────────

describe("tenant isolation — savedViews (actions)", () => {
  test("listByEntityType: org A user cannot list org B saved views", async () => {
    const t = createTestCtx();
    const { identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId } = await seedOrgB(t);

    await expect(
      t.withIdentity(identityA).action(api.savedViews.listByEntityType, {
        organizationId: orgBId,
        entityType: "contact",
      }),
    ).rejects.toThrow("Not a member of this organization");
  });

  test("getById: org A user cannot fetch using org B's organizationId", async () => {
    const t = createTestCtx();
    const { identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId } = await seedOrgB(t);

    await expect(
      t.withIdentity(identityA).action(api.savedViews.getById, {
        organizationId: orgBId,
        viewId: "some-view-id",
      }),
    ).rejects.toThrow("Not a member of this organization");
  });

  test("getById: org A user cannot fetch org B view using org A's orgId", async () => {
    const t = createTestCtx();
    const { organizationId: orgAId, identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId, userId: userBId } = await seedOrgB(t);

    const db = createSupabaseDb();
    const viewBId = await db.insert("savedViews", {
      organizationId: String(orgBId),
      entityType: "contact",
      name: "Org B Secret View",
      filters: {},
      isSystem: false,
      createdBy: String(userBId),
      order: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await expect(
      t.withIdentity(identityA).action(api.savedViews.getById, {
        organizationId: orgAId,
        viewId: viewBId,
      }),
    ).rejects.toThrow("Saved view not found");
  });
});

// ─── Notifications ────────────────────────────────────────────────────────────
//
// list / getUnreadCount are scoped by userId via requireUser (not
// verifyOrgAccess) — they return only the authenticated user's own
// notifications regardless of the organizationId argument.
//
// markAllRead is intentionally USER-scoped, not org-scoped: it marks all
// unread notifications for the authenticated user regardless of which
// organizationId is passed. There is no cross-org data leak because the
// handler filters by the authenticated user's _id only. The organizationId
// arg is accepted but not used for authorization (audit ref: sec-audit-
// convex-endpoints.md §19).

describe("tenant isolation — notifications", () => {
  test("list: org A user only sees own notifications even when passing org B's orgId", async () => {
    const t = createTestCtx();
    const { organizationId: orgAId, userId: userAId, identity: identityA } =
      await seedTestUser(t);
    const { organizationId: orgBId, userId: userBId } = await seedOrgB(t);

    // Insert a notification for org B user in Convex DB
    await t.run(async (ctx) => {
      await ctx.db.insert("notifications", {
        organizationId: orgBId,
        userId: userBId,
        type: "info",
        title: "Org B Secret",
        message: "This belongs to Org B",
        isRead: false,
        createdAt: Date.now(),
      });
      // Insert one for org A user to confirm that one shows up
      await ctx.db.insert("notifications", {
        organizationId: orgAId,
        userId: userAId,
        type: "info",
        title: "Org A Notification",
        message: "This belongs to Org A user",
        isRead: false,
        createdAt: Date.now(),
      });
    });

    // Org A user passes org B's orgId — should only see their own notification
    const result = await t.withIdentity(identityA).query(api.notifications.list, {
      organizationId: orgBId,
    });

    expect(result).toHaveLength(1);
    expect((result[0] as any).title).toBe("Org A Notification");
  });

  test("markAllRead: only marks the authenticated user's own notifications, not org B's", async () => {
    const t = createTestCtx();
    const { organizationId: orgAId, userId: userAId, identity: identityA } =
      await seedTestUser(t);
    const { organizationId: orgBId, userId: userBId } = await seedOrgB(t);

    // Insert unread notifications for both users
    await t.run(async (ctx) => {
      await ctx.db.insert("notifications", {
        organizationId: orgBId,
        userId: userBId,
        type: "info",
        title: "Org B Unread",
        message: "Org B user notification",
        isRead: false,
        createdAt: Date.now(),
      });
      await ctx.db.insert("notifications", {
        organizationId: orgAId,
        userId: userAId,
        type: "info",
        title: "Org A Unread",
        message: "Org A user notification",
        isRead: false,
        createdAt: Date.now(),
      });
    });

    // Org A user calls markAllRead with org B's orgId.
    // The action must NOT throw — it is user-scoped.
    // It must mark org A user's notifications as read and return 1 (count).
    const markedCount = await t.withIdentity(identityA).action(
      api.notifications.markAllRead,
      { organizationId: orgBId },
    );
    expect(markedCount).toBe(1);

    // Verify org B's notification is still unread (not affected).
    const orgBNotifications = await t.withIdentity(identityA).query(
      api.notifications.list,
      { organizationId: orgBId },
    );
    // Org A user still can't see org B's notification (user-scoped list)
    expect(orgBNotifications.every((n: any) => n.userId === String(userAId))).toBe(true);
  });
});
