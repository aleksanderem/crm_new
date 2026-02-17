import { convexTest } from "convex-test";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

/**
 * Create a fresh convex-test instance with our schema.
 */
export function createTestCtx() {
  return convexTest(schema);
}

/**
 * Seed a test user + org + membership, returning IDs needed for test calls.
 * Also returns an identity that makes auth.getUserId(ctx) resolve to the user.
 */
export async function seedTestUser(
  t: ReturnType<typeof convexTest>,
  opts?: { role?: "owner" | "admin" | "member" },
) {
  const role = opts?.role ?? "owner";

  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Test User",
      email: "test@example.com",
    });

    const organizationId = await ctx.db.insert("organizations", {
      name: "Test Org",
      slug: "test-org",
      ownerId: userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("teamMemberships", {
      organizationId,
      userId,
      role,
      joinedAt: Date.now(),
    });

    return { userId, organizationId };
  });

  // auth.getUserId splits identity.subject by "|" and takes first part
  const identity = {
    subject: `${ids.userId}|fake-session-id`,
    issuer: "test",
    tokenIdentifier: `test|${ids.userId}`,
  };

  return { ...ids, identity };
}

/**
 * Seed a second user in the same org (useful for resource/employee tests).
 */
export async function seedSecondUser(
  t: ReturnType<typeof convexTest>,
  organizationId: Id<"organizations">,
  opts?: { role?: "owner" | "admin" | "member" },
) {
  const role = opts?.role ?? "member";

  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Second User",
      email: "second@example.com",
    });

    await ctx.db.insert("teamMemberships", {
      organizationId,
      userId,
      role,
      joinedAt: Date.now(),
    });

    return { userId };
  });

  const identity = {
    subject: `${ids.userId}|fake-session-id-2`,
    issuer: "test",
    tokenIdentifier: `test|${ids.userId}`,
  };

  return { ...ids, identity };
}

/**
 * Seed gabinet prerequisites: patient, treatment, employee.
 * Returns IDs needed for creating appointments.
 */
export async function seedGabinetPrereqs(
  t: ReturnType<typeof convexTest>,
  organizationId: Id<"organizations">,
  userId: Id<"users">,
) {
  return await t.run(async (ctx) => {
    const now = Date.now();

    const patientId = await ctx.db.insert("gabinetPatients", {
      organizationId,
      firstName: "Jan",
      lastName: "Kowalski",
      email: "jan@example.com",
      isActive: true,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    const treatmentId = await ctx.db.insert("gabinetTreatments", {
      organizationId,
      name: "Consultation",
      duration: 30,
      price: 100,
      isActive: true,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    // Register user as gabinet employee qualified for the treatment
    await ctx.db.insert("gabinetEmployees", {
      organizationId,
      userId,
      role: "doctor",
      qualifiedTreatmentIds: [treatmentId],
      isActive: true,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    // Seed working hours for all 7 days (Mon-Sun, 08:00-18:00)
    for (let day = 0; day <= 6; day++) {
      await ctx.db.insert("gabinetWorkingHours", {
        organizationId,
        dayOfWeek: day,
        startTime: "08:00",
        endTime: "18:00",
        isOpen: true,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { patientId, treatmentId };
  });
}
