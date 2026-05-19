import { expect, test, describe } from "vitest";
import { convexTest } from "convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { seedTestUser } from "../../convex/_test_helpers";

const modules = (
  import.meta as ImportMeta & {
    glob: (pattern: string) => Record<string, () => Promise<unknown>>;
  }
).glob("../../convex/**/*.*s");

function createCtx() {
  return convexTest(schema, modules);
}

describe("recentlyViewed", () => {
  test("tracks and lists recently viewed items", async () => {
    const t = createCtx();
    const { organizationId, identity } = await seedTestUser(t);

    await t.withIdentity(identity).action(api.recentlyViewed.track, {
      organizationId,
      entityType: "contacts",
      entityId: "test-id-1",
      entityLabel: "Jan Kowalski",
    });

    const items = await t.withIdentity(identity).action(api.recentlyViewed.list, {
      organizationId,
      entityType: "contacts",
      limit: 3,
    });

    expect(items).toHaveLength(1);
    expect(items[0].entityLabel).toBe("Jan Kowalski");
    expect(items[0].entityId).toBe("test-id-1");
  });

  test("upserts existing entry instead of duplicating", async () => {
    const t = createCtx();
    const { organizationId, identity } = await seedTestUser(t);

    await t.withIdentity(identity).action(api.recentlyViewed.track, {
      organizationId,
      entityType: "contacts",
      entityId: "test-id-1",
      entityLabel: "Jan K.",
    });
    await t.withIdentity(identity).action(api.recentlyViewed.track, {
      organizationId,
      entityType: "contacts",
      entityId: "test-id-1",
      entityLabel: "Jan Kowalski",
    });

    const items = await t.withIdentity(identity).action(api.recentlyViewed.list, {
      organizationId,
      entityType: "contacts",
      limit: 10,
    });

    expect(items).toHaveLength(1);
    expect(items[0].entityLabel).toBe("Jan Kowalski");
  });

  test("returns items ordered by most recent first", async () => {
    const t = createCtx();
    const { organizationId, identity } = await seedTestUser(t);

    // Space the calls out so Date.now() advances between them — without a
    // gap, all three tracks can land on the same millisecond and the
    // viewedAt-desc ordering becomes a tie.
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    await t.withIdentity(identity).action(api.recentlyViewed.track, {
      organizationId,
      entityType: "contacts",
      entityId: "id-1",
      entityLabel: "First",
    });
    await sleep(2);
    await t.withIdentity(identity).action(api.recentlyViewed.track, {
      organizationId,
      entityType: "contacts",
      entityId: "id-2",
      entityLabel: "Second",
    });
    await sleep(2);
    await t.withIdentity(identity).action(api.recentlyViewed.track, {
      organizationId,
      entityType: "contacts",
      entityId: "id-3",
      entityLabel: "Third",
    });

    const items = await t.withIdentity(identity).action(api.recentlyViewed.list, {
      organizationId,
      entityType: "contacts",
      limit: 3,
    });

    expect(items).toHaveLength(3);
    expect(items[0].entityLabel).toBe("Third");
    expect(items[1].entityLabel).toBe("Second");
    expect(items[2].entityLabel).toBe("First");
  });

  test("respects limit parameter", async () => {
    const t = createCtx();
    const { organizationId, identity } = await seedTestUser(t);

    for (let i = 0; i < 5; i++) {
      await t.withIdentity(identity).action(api.recentlyViewed.track, {
        organizationId,
        entityType: "contacts",
        entityId: `id-${i}`,
        entityLabel: `Item ${i}`,
      });
    }

    const items = await t.withIdentity(identity).action(api.recentlyViewed.list, {
      organizationId,
      entityType: "contacts",
      limit: 2,
    });

    expect(items).toHaveLength(2);
  });

  test("separates items by entityType", async () => {
    const t = createCtx();
    const { organizationId, identity } = await seedTestUser(t);

    await t.withIdentity(identity).action(api.recentlyViewed.track, {
      organizationId,
      entityType: "contacts",
      entityId: "contact-1",
      entityLabel: "Contact One",
    });
    await t.withIdentity(identity).action(api.recentlyViewed.track, {
      organizationId,
      entityType: "companies",
      entityId: "company-1",
      entityLabel: "Company One",
    });

    const contacts = await t.withIdentity(identity).action(api.recentlyViewed.list, {
      organizationId,
      entityType: "contacts",
      limit: 10,
    });
    const companies = await t.withIdentity(identity).action(api.recentlyViewed.list, {
      organizationId,
      entityType: "companies",
      limit: 10,
    });

    expect(contacts).toHaveLength(1);
    expect(contacts[0].entityLabel).toBe("Contact One");
    expect(companies).toHaveLength(1);
    expect(companies[0].entityLabel).toBe("Company One");
  });
});
