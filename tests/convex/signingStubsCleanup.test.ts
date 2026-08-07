import { describe, expect, test } from "vitest";
import { internal } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// Must match CLEANUP_GRACE_MS in signingStubs.ts
const GRACE_MS = DAY_MS;

describe("signingStubs._cleanupExpiredStubs — daily cron", () => {
  test("deletes stubs whose expiresAt is past the 24 h grace period", async () => {
    const t = createTestCtx();
    const { organizationId } = await seedTestUser(t);

    // Insert one stub that expired 25 h ago (outside grace period — should be deleted)
    const oldExpiredId = await t.run(async (ctx) => {
      return await ctx.db.insert("signingLinkStubs", {
        stubId: "stale-stub",
        token: "tok-stale",
        organizationId,
        expiresAt: Date.now() - GRACE_MS - HOUR_MS,
      });
    });

    await t.mutation(internal.signingStubs._cleanupExpiredStubs, {});

    const deleted = await t.run(async (ctx) => ctx.db.get(oldExpiredId));
    expect(deleted).toBeNull();
  });

  test("keeps stubs whose expiresAt is within the 24 h grace period", async () => {
    const t = createTestCtx();
    const { organizationId } = await seedTestUser(t);

    // Expired 1 h ago — within the 24 h grace window, must survive
    const recentlyExpiredId = await t.run(async (ctx) => {
      return await ctx.db.insert("signingLinkStubs", {
        stubId: "recent-stub",
        token: "tok-recent",
        organizationId,
        expiresAt: Date.now() - HOUR_MS,
      });
    });

    await t.mutation(internal.signingStubs._cleanupExpiredStubs, {});

    const surviving = await t.run(async (ctx) => ctx.db.get(recentlyExpiredId));
    expect(surviving).not.toBeNull();
  });

  test("keeps stubs that have not yet expired", async () => {
    const t = createTestCtx();
    const { organizationId } = await seedTestUser(t);

    // Expires in 10 h — definitely still valid
    const activeId = await t.run(async (ctx) => {
      return await ctx.db.insert("signingLinkStubs", {
        stubId: "active-stub",
        token: "tok-active",
        organizationId,
        expiresAt: Date.now() + 10 * HOUR_MS,
      });
    });

    await t.mutation(internal.signingStubs._cleanupExpiredStubs, {});

    const surviving = await t.run(async (ctx) => ctx.db.get(activeId));
    expect(surviving).not.toBeNull();
  });

  test("deletes used stubs past the grace period alongside unused expired ones", async () => {
    const t = createTestCtx();
    const { organizationId } = await seedTestUser(t);

    // Used stub, expired 25 h ago
    const usedExpiredId = await t.run(async (ctx) => {
      return await ctx.db.insert("signingLinkStubs", {
        stubId: "used-expired",
        token: "tok-used",
        organizationId,
        expiresAt: Date.now() - GRACE_MS - HOUR_MS,
        usedAt: Date.now() - 2 * DAY_MS,
      });
    });

    await t.mutation(internal.signingStubs._cleanupExpiredStubs, {});

    const deleted = await t.run(async (ctx) => ctx.db.get(usedExpiredId));
    expect(deleted).toBeNull();
  });
});
