// Test helpers for convex-test based unit tests.
//
// `import.meta.glob` is a Vite-only feature. To keep this file safe to bundle
// into the Convex deploy (where `import.meta.glob` is undefined and would
// throw), the call is deferred into `createTestCtx` so it never runs at
// module-load time. Vite/Vitest still transform the call statically into a
// module map, so vitest tests get the real implementation.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { convexTest } from "convex-test";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { createSupabaseDb } from "./_helpers/supabaseDb";

/**
 * Create a fresh convex-test instance with our schema.
 */
export function createTestCtx() {
  const modules = (
    import.meta as ImportMeta & {
      glob: (pattern: string) => Record<string, () => Promise<any>>;
    }
  ).glob("./**/!(*.test).*s");
  return convexTest(schema, modules);
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

    const membershipId = await ctx.db.insert("teamMemberships", {
      organizationId,
      userId,
      role,
      joinedAt: Date.now(),
    });

    return { userId, organizationId, membershipId };
  });

  // Mirror to in-memory Supabase so action handlers that read TABLE_MAP
  // tables via createSupabaseDb() (e.g. checkSeatLimitAction) see consistent
  // state with the Convex db.
  const db = createSupabaseDb();
  const now = Date.now();
  await db.insert("organizations", {
    _id: String(ids.organizationId),
    name: "Test Org",
    slug: "test-org",
    ownerId: String(ids.userId),
    createdAt: now,
    updatedAt: now,
  });
  await db.insert("teamMemberships", {
    _id: String(ids.membershipId),
    organizationId: String(ids.organizationId),
    userId: String(ids.userId),
    role,
    joinedAt: now,
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

    const membershipId = await ctx.db.insert("teamMemberships", {
      organizationId,
      userId,
      role,
      joinedAt: Date.now(),
    });

    return { userId, membershipId };
  });

  // Mirror to in-memory Supabase so action handlers that read TABLE_MAP
  // tables via createSupabaseDb() see consistent state.
  const db = createSupabaseDb();
  await db.insert("teamMemberships", {
    _id: String(ids.membershipId),
    organizationId: String(organizationId),
    userId: String(ids.userId),
    role,
    joinedAt: Date.now(),
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
  const ids = await t.run(async (ctx) => {
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

  // Mirror prereqs into the Supabase in-memory mock so action handlers
  // (which read working hours, employees, etc. through createSupabaseDb)
  // see consistent state. In production this helper isn't run; under
  // vitest, `createSupabaseDb` resolves to the in-memory stand-in.
  const now = Date.now();
  const db = createSupabaseDb();
  await db.insert("gabinetPatients", {
    _id: ids.patientId,
    organizationId: String(organizationId),
    firstName: "Jan",
    lastName: "Kowalski",
    email: "jan@example.com",
    isActive: true,
    createdBy: String(userId),
    createdAt: now,
    updatedAt: now,
  });
  await db.insert("gabinetTreatments", {
    _id: ids.treatmentId,
    organizationId: String(organizationId),
    name: "Consultation",
    duration: 30,
    price: 100,
    isActive: true,
    createdBy: String(userId),
    createdAt: now,
    updatedAt: now,
  });
  await db.insert("gabinetEmployees", {
    organizationId: String(organizationId),
    userId: String(userId),
    role: "doctor",
    qualifiedTreatmentIds: [ids.treatmentId],
    isActive: true,
    createdBy: String(userId),
    createdAt: now,
    updatedAt: now,
  });
  for (let day = 0; day <= 6; day++) {
    await db.insert("gabinetWorkingHours", {
      organizationId: String(organizationId),
      dayOfWeek: day,
      startTime: "08:00",
      endTime: "18:00",
      isOpen: true,
      createdBy: String(userId),
      createdAt: now,
      updatedAt: now,
    });
  }

  return ids;
}
