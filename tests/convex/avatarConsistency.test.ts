import { expect, test, describe } from "vitest";
import { api } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";

describe("updateUserImage", () => {
  test("caches storage URL in image field when imageId is set", async () => {
    const t = createTestCtx();
    const { userId, identity } = await seedTestUser(t);

    // Upload a fake file to storage
    const storageId = await t.run(async (ctx) => {
      return await ctx.storage.store(new Blob(["fake-image"]));
    });

    // Call updateUserImage
    await t.withIdentity(identity).mutation(api.app.updateUserImage, {
      imageId: storageId,
    });

    // Verify both imageId AND image (cached URL) are set
    const user = await t.run(async (ctx) => ctx.db.get(userId));
    expect(user!.imageId).toBe(storageId);
    expect(user!.image).toBeDefined();
    expect(user!.image).toMatch(/^https?:\/\//);
  });

  test("removeUserImage clears both imageId and image", async () => {
    const t = createTestCtx();
    const { userId, identity } = await seedTestUser(t);

    // Set an image first
    const storageId = await t.run(async (ctx) => {
      return await ctx.storage.store(new Blob(["fake-image"]));
    });
    await t.withIdentity(identity).mutation(api.app.updateUserImage, {
      imageId: storageId,
    });

    // Remove it
    await t.withIdentity(identity).mutation(api.app.removeUserImage, {});

    const user = await t.run(async (ctx) => ctx.db.get(userId));
    expect(user!.imageId).toBeUndefined();
    expect(user!.image).toBeUndefined();
  });
});
