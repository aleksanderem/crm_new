/**
 * Tenant isolation tests — verifies that an authenticated user from Org A
 * cannot read rows that belong to Org B through any Convex query endpoint.
 *
 * Two attack vectors are tested for each endpoint:
 *   1. Cross-org list: pass Org B's organizationId while authenticated as a
 *      member of Org A only → verifyOrgAccess must throw.
 *   2. Cross-ID fetch: pass Org A's organizationId but an entity ID that
 *      belongs to Org B → the per-entity org ownership check must throw.
 *
 * These tests cover the Convex query layer. Supabase RLS (the other half of the
 * read-path protection) cannot be exercised with the in-memory stub; it is
 * validated by the RLS coverage audit (#3709 dependency).
 */

import { afterEach, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";

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

  test("getMembers: org A user cannot list org B members", async () => {
    const t = createTestCtx();
    const { identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId } = await seedOrgB(t);

    await expect(
      t.withIdentity(identityA).query(api.organizations.getMembers, {
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

describe("tenant isolation — contacts", () => {
  test("list: org A user cannot list org B contacts", async () => {
    const t = createTestCtx();
    const { identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId } = await seedOrgB(t);

    await expect(
      t.withIdentity(identityA).query(api.contacts.list, {
        organizationId: orgBId,
        paginationOpts: PAGINATION,
      }),
    ).rejects.toThrow("Not a member of this organization");
  });

  test("getById: org A user cannot fetch an org B contact by ID", async () => {
    const t = createTestCtx();
    const { organizationId: orgAId, identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId, userId: userBId } = await seedOrgB(t);

    // Create a contact in Org B
    const contactBId = await t.run(async (ctx) => {
      return ctx.db.insert("contacts", {
        organizationId: orgBId,
        firstName: "B",
        lastName: "Contact",
        email: "b@example.com",
        createdBy: userBId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    // Org A user with Org A's orgId but Org B's contactId
    await expect(
      t.withIdentity(identityA).query(api.contacts.getById, {
        organizationId: orgAId,
        contactId: contactBId,
      }),
    ).rejects.toThrow("Contact not found");
  });
});

// ─── Companies ────────────────────────────────────────────────────────────────

describe("tenant isolation — companies", () => {
  test("list: org A user cannot list org B companies", async () => {
    const t = createTestCtx();
    const { identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId } = await seedOrgB(t);

    await expect(
      t.withIdentity(identityA).query(api.companies.list, {
        organizationId: orgBId,
        paginationOpts: PAGINATION,
      }),
    ).rejects.toThrow("Not a member of this organization");
  });

  test("getById: org A user cannot fetch an org B company by ID", async () => {
    const t = createTestCtx();
    const { organizationId: orgAId, identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId, userId: userBId } = await seedOrgB(t);

    const companyBId = await t.run(async (ctx) => {
      return ctx.db.insert("companies", {
        organizationId: orgBId,
        name: "B Corp",
        createdBy: userBId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    await expect(
      t.withIdentity(identityA).query(api.companies.getById, {
        organizationId: orgAId,
        companyId: companyBId,
      }),
    ).rejects.toThrow("Company not found");
  });
});

// ─── Leads ────────────────────────────────────────────────────────────────────

describe("tenant isolation — leads", () => {
  test("list: org A user cannot list org B leads", async () => {
    const t = createTestCtx();
    const { identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId } = await seedOrgB(t);

    await expect(
      t.withIdentity(identityA).query(api.leads.list, {
        organizationId: orgBId,
        paginationOpts: PAGINATION,
      }),
    ).rejects.toThrow("Not a member of this organization");
  });

  test("getById: org A user cannot fetch an org B lead by ID", async () => {
    const t = createTestCtx();
    const { organizationId: orgAId, identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId, userId: userBId } = await seedOrgB(t);

    const leadBId = await t.run(async (ctx) => {
      return ctx.db.insert("leads", {
        organizationId: orgBId,
        title: "Org B Deal",
        status: "open" as const,
        createdBy: userBId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    await expect(
      t.withIdentity(identityA).query(api.leads.getById, {
        organizationId: orgAId,
        leadId: leadBId,
      }),
    ).rejects.toThrow("Lead not found");
  });
});

// ─── Notes ────────────────────────────────────────────────────────────────────

describe("tenant isolation — notes", () => {
  test("listByEntity: org A user cannot query using org B's organizationId", async () => {
    const t = createTestCtx();
    const { identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId } = await seedOrgB(t);

    await expect(
      t.withIdentity(identityA).query(api.notes.listByEntity, {
        organizationId: orgBId,
        entityType: "contact",
        entityId: "some-id",
      }),
    ).rejects.toThrow("Not a member of this organization");
  });

  test("getById: org A user cannot fetch an org B note by ID", async () => {
    const t = createTestCtx();
    const { organizationId: orgAId, identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId, userId: userBId } = await seedOrgB(t);

    const noteBId = await t.run(async (ctx) => {
      return ctx.db.insert("notes", {
        organizationId: orgBId,
        entityType: "contact",
        entityId: "some-contact-id",
        content: "Secret note from Org B",
        isPinned: false,
        createdBy: userBId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    await expect(
      t.withIdentity(identityA).query(api.notes.getById, {
        organizationId: orgAId,
        noteId: noteBId,
      }),
    ).rejects.toThrow("Note not found");
  });
});

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

describe("tenant isolation — auditLog", () => {
  test("list: org A admin cannot read org B audit log", async () => {
    const t = createTestCtx();
    // seedTestUser creates owner role which is also admin
    const { identity: identityA } = await seedTestUser(t);
    const { organizationId: orgBId } = await seedOrgB(t);

    await expect(
      t.withIdentity(identityA).query(api.auditLog.list, {
        organizationId: orgBId,
      }),
    ).rejects.toThrow("Not a member of this organization");
  });
});
