import { afterEach, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createTestCtx,
  seedTestUser,
  seedGabinetPrereqs,
} from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

describe("gabinet/patients.update — clearing optional fields", () => {
  test("clearing PESEL via null sets the column to null", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId } = await seedGabinetPrereqs(t, organizationId, userId);

    // Set a starting PESEL value directly via the Supabase mock.
    const db = createSupabaseDb();
    await db.patch("gabinetPatients", String(patientId), {
      pesel: "12345678901",
    });
    const before = await db.get("gabinetPatients", String(patientId));
    expect((before as { pesel?: string | null } | null)?.pesel).toBe(
      "12345678901",
    );

    // Edit form sends `pesel: null` when cleared.
    await t
      .withIdentity(identity)
      .action(api.gabinet.patients.update, {
        organizationId,
        patientId: String(patientId),
        pesel: null,
      });

    const after = await db.get("gabinetPatients", String(patientId));
    expect((after as { pesel?: string | null } | null)?.pesel).toBeNull();
  });

  test("clearing address via null sets the column to null", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId } = await seedGabinetPrereqs(t, organizationId, userId);

    const db = createSupabaseDb();
    await db.patch("gabinetPatients", String(patientId), {
      address: { street: "Main 1", city: "Warsaw", postalCode: "00-001" },
    });

    await t
      .withIdentity(identity)
      .action(api.gabinet.patients.update, {
        organizationId,
        patientId: String(patientId),
        address: null,
      });

    const after = await db.get("gabinetPatients", String(patientId));
    expect((after as { address?: unknown } | null)?.address).toBeNull();
  });
});
