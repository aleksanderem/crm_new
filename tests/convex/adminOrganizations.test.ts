/**
 * SP2 Task 1 — Data model foundation for org admin fields.
 *
 * Proves that the in-memory Supabase stub accepts the three new columns
 * (status, suspended_reason, seat_limit_override) on an organizations row
 * and that values round-trip correctly.
 */
import { expect, test } from "vitest";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

test("organizations accepts admin fields (status/reason/override)", async () => {
  const db = createSupabaseDb();
  const id = "org_test_sp2";
  await db.insert("organizations", {
    id,
    name: "T",
    slug: "t",
    ownerId: "u1",
    createdAt: 1,
    updatedAt: 1,
    status: "suspended",
    suspendedReason: "abuse",
    seatLimitOverride: 50,
  });
  const row = await db.get("organizations", id);
  expect(row?.status).toBe("suspended");
  expect(row?.suspendedReason).toBe("abuse");
  expect(row?.seatLimitOverride).toBe(50);
});

test("organizations admin fields default to undefined when not provided", async () => {
  const db = createSupabaseDb();
  const id = "org_test_sp2_defaults";
  await db.insert("organizations", {
    id,
    name: "Minimal",
    slug: "minimal",
    ownerId: "u2",
    createdAt: 1,
    updatedAt: 1,
  });
  const row = await db.get("organizations", id);
  expect(row?.status).toBeUndefined();
  expect(row?.suspendedReason).toBeUndefined();
  expect(row?.seatLimitOverride).toBeUndefined();
});

test("organizations admin fields can be patched independently", async () => {
  const db = createSupabaseDb();
  const id = "org_test_sp2_patch";
  await db.insert("organizations", {
    id,
    name: "PatchTest",
    slug: "patch-test",
    ownerId: "u3",
    createdAt: 1,
    updatedAt: 1,
  });
  await db.patch("organizations", id, { status: "suspended", suspendedReason: "test", seatLimitOverride: 10 });
  const row = await db.get("organizations", id);
  expect(row?.status).toBe("suspended");
  expect(row?.suspendedReason).toBe("test");
  expect(row?.seatLimitOverride).toBe(10);
});
