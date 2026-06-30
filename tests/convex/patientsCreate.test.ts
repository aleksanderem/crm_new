import { afterEach, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createTestCtx,
  seedTestUser,
  seedGabinetPrereqs,
} from "../../convex/_test_helpers";

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

describe("gabinet/patients.create duplicate guard", () => {
  test("rejects creation when another active patient has the same email", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    // Seeds a patient with email "jan@example.com"
    await seedGabinetPrereqs(t, organizationId, userId);

    await expect(
      t.withIdentity(identity).action(api.gabinet.patients.create, {
        organizationId,
        firstName: "Duplicate",
        lastName: "Patient",
        email: "jan@example.com",
      }),
    ).rejects.toThrow(/Duplicate patient detected/);
  });

  test("rejects creation when another active patient has the same phone", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await seedGabinetPrereqs(t, organizationId, userId);

    // First create a patient with a phone number
    await t.withIdentity(identity).action(api.gabinet.patients.create, {
      organizationId,
      firstName: "First",
      lastName: "Patient",
      email: "first@example.com",
      phone: "600100200",
    });

    // Second creation with same phone should be rejected
    await expect(
      t.withIdentity(identity).action(api.gabinet.patients.create, {
        organizationId,
        firstName: "Second",
        lastName: "Patient",
        email: "second@example.com",
        phone: "600100200",
      }),
    ).rejects.toThrow(/Duplicate patient detected/);
  });

  test("allows creation when a patient with the same email exists but is inactive", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId } = await seedGabinetPrereqs(t, organizationId, userId);

    // Soft-delete the seeded patient (email: "jan@example.com")
    await t.withIdentity(identity).action(api.gabinet.patients.remove, {
      organizationId,
      patientId: String(patientId),
    });

    // Creating a new patient with the same email should now succeed
    const newId = await t.withIdentity(identity).action(api.gabinet.patients.create, {
      organizationId,
      firstName: "New",
      lastName: "Patient",
      email: "jan@example.com",
    });
    expect(typeof newId).toBe("string");
  });

  test("allows creation when email and phone are unique", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await seedGabinetPrereqs(t, organizationId, userId);

    const newId = await t.withIdentity(identity).action(api.gabinet.patients.create, {
      organizationId,
      firstName: "Unique",
      lastName: "Patient",
      email: "unique@example.com",
      phone: "700200300",
    });
    expect(typeof newId).toBe("string");
  });

  test("rejects creation when another active patient has the same email in different case", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    // Seeds a patient with email "jan@example.com"
    await seedGabinetPrereqs(t, organizationId, userId);

    await expect(
      t.withIdentity(identity).action(api.gabinet.patients.create, {
        organizationId,
        firstName: "Duplicate",
        lastName: "Patient",
        email: "JAN@EXAMPLE.COM",
      }),
    ).rejects.toThrow(/Duplicate patient detected/);
  });

  test("allows creation when only phone is provided and no match exists", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    await seedGabinetPrereqs(t, organizationId, userId);

    const newId = await t.withIdentity(identity).action(api.gabinet.patients.create, {
      organizationId,
      firstName: "Phone",
      lastName: "Only",
      email: "phoneonly@example.com",
      phone: "999888777",
    });
    expect(typeof newId).toBe("string");
  });
});
