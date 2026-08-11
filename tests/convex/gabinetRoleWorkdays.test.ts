/**
 * End-to-end workday scenarios per clinical Gabinet role (closes #4126).
 *
 * Each describe block walks through the core operations a staff member in
 * that role must be able to perform on a typical working day. A failure
 * here means the role cannot execute its primary function, which would be
 * a blocker before the first client goes live.
 *
 * Roles under test: doctor, therapist, nurse, receptionist, admin.
 *
 * Test structure per role:
 *   happy-path — the operations the role IS permitted to do
 *   denied-path — at least one operation the role is NOT permitted to do,
 *                 confirming the permission gate is active for that user
 *
 * The "member without gabinet role" describe block is the baseline: a plain
 * org member with no gabinetMemberships row cannot reach any gabinet data,
 * which proves the permission gate is enforced at all.
 */

import { afterEach, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createTestCtx,
  seedTestUser,
  seedSecondUser,
  seedGabinetPrereqs,
} from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";
import type { Id } from "../../convex/_generated/dataModel";

// Drain orphan scheduler callbacks to avoid unhandledRejection noise from
// side-effect mutations that fire after the test has already returned.
afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

// ---------------------------------------------------------------------------
// Helper: insert a gabinetMemberships row into the Convex db.
// gabinetMemberships is a Convex-only mirror (not in TABLE_MAP) used by
// checkPermission to resolve the gabinet role for a user. Only inserting into
// Convex is enough — the in-memory Supabase store is not involved.
// ---------------------------------------------------------------------------
async function seedGabinetRole(
  t: ReturnType<typeof createTestCtx>,
  userId: Id<"users">,
  organizationId: Id<"organizations">,
  gabinetRole: string,
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("gabinetMemberships", {
      organizationId,
      userId,
      gabinetRole,
      isActive: true,
      updatedAt: Date.now(),
    });
  });
}

// ---------------------------------------------------------------------------
// Helper: insert an orgPermissions override for the "member" role that sets
// every gabinet_* feature to "none" for every action.
//
// Background: DEFAULT_PERMISSIONS.member gives create:"all" to ALL features
// (including gabinet_*) so that a plain CRM member can create contacts, leads,
// etc. without extra configuration. This is correct for CRM, but for Gabinet
// the intended design is that gabinet-role is the SOLE granting path — a plain
// member with no gabinetMemberships row must be denied.
//
// In production, organisations are expected to ship with an orgPermissions row
// that restricts gabinet_* for the member/viewer role. The test must mirror that
// state so checkPermission evaluates the same way it does in production:
//   orgScope = "none" (from override)
//   gabinetScope = defaultGabinetScope(role, feature, action)
//   effectiveScope = max(orgScope, gabinetScope)
//
// checkPermission (action variant, internal._helpers.authAction.checkPermission)
// reads orgPermissions from the in-memory Supabase store, so we insert there.
// ---------------------------------------------------------------------------
const GABINET_FEATURES = [
  "gabinet_dashboard",
  "gabinet_patients",
  "gabinet_appointments",
  "gabinet_treatments",
  "gabinet_packages",
  "gabinet_employees",
  "gabinet_payments",
  "gabinet_receipts",
  "gabinet_reports",
  "gabinet_financial_reports",
  "gabinet_purchase_prices",
  "gabinet_photos",
  "gabinet_online_booking",
  "gabinet_inventory",
  "gabinet_settings",
] as const;

const NONE_ALL_ACTIONS = {
  view: "none",
  create: "none",
  edit: "none",
  delete: "none",
  approve: "none",
  sign: "none",
  refund: "none",
} as const;

async function seedGabinetOrgPermissions(
  organizationId: Id<"organizations">,
): Promise<void> {
  const db = createSupabaseDb();
  // Build a permissions map: keep all non-gabinet features at their defaults
  // (we don't override them), and set every gabinet_* feature to all-none.
  const gabinetNonePerms: Record<string, typeof NONE_ALL_ACTIONS> = {};
  for (const feat of GABINET_FEATURES) {
    gabinetNonePerms[feat] = NONE_ALL_ACTIONS;
  }
  await db.insert("orgPermissions", {
    organizationId: String(organizationId),
    role: "member",
    permissions: gabinetNonePerms,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

// ---------------------------------------------------------------------------
// Shared setup factory: org owner + prereqs + a clinical user with the
// given gabinet role.
// ---------------------------------------------------------------------------
async function setupClinicalUser(gabinetRole: string) {
  const t = createTestCtx();

  // org owner — used to seed reference data (no gabinet role needed, owner is admin)
  const { organizationId, userId: ownerUserId, identity: ownerIdentity } =
    await seedTestUser(t);

  // Seed patients, treatments, employees, working hours into Convex + Supabase stub
  await seedGabinetPrereqs(t, organizationId, ownerUserId);

  // Restrict gabinet_* features for the "member" org role to "none" in the
  // Supabase orgPermissions override so that the gabinet-role MAX-merge is the
  // sole granting mechanism. Without this, DEFAULT_PERMISSIONS.member gives
  // create:"all" to every feature, which would let any member create treatments.
  await seedGabinetOrgPermissions(organizationId);

  // clinical user — org role "member" so org-level scope is "none" for all
  // gabinet_* features; only the gabinet role grants access
  const { userId: clinicalUserId, identity: clinicalIdentity } =
    await seedSecondUser(t, organizationId, { role: "member" });

  await seedGabinetRole(t, clinicalUserId, organizationId, gabinetRole);

  return { t, organizationId, ownerUserId, ownerIdentity, clinicalUserId, clinicalIdentity };
}

// ---------------------------------------------------------------------------
// Baseline: org member with NO gabinet role cannot view patients.
// This confirms the permission gate is active, not a no-op.
// ---------------------------------------------------------------------------
describe("member without gabinet role — permission gate is enforced", () => {
  test("cannot list patients (Permission denied)", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);
    await seedGabinetPrereqs(t, organizationId, userId);

    // Restrict gabinet_* features for "member" in Supabase orgPermissions so that
    // checkPermission returns scope="none" when no gabinetMemberships row exists.
    await seedGabinetOrgPermissions(organizationId);

    const { identity: memberIdentity } = await seedSecondUser(t, organizationId, {
      role: "member",
    });
    // No gabinetMemberships entry — effective scope for gabinet_patients:view is "none"

    await expect(
      t.withIdentity(memberIdentity).action(api.gabinet.patients.list, {
        organizationId,
        paginationOpts: { numItems: 10, cursor: null },
      }),
    ).rejects.toThrow(/Permission denied/);
  });
});

// ---------------------------------------------------------------------------
// Doctor workday
// ---------------------------------------------------------------------------
describe("Doctor workday", () => {
  test("can list patients (gabinet_patients:view=all)", async () => {
    const { t, organizationId, clinicalIdentity } = await setupClinicalUser("doctor");

    const result = await t
      .withIdentity(clinicalIdentity)
      .action(api.gabinet.patients.list, {
        organizationId,
        paginationOpts: { numItems: 10, cursor: null },
      });

    expect(result).toBeDefined();
    expect(Array.isArray(result.page)).toBe(true);
  });

  test("can create a patient (gabinet_patients:create=all)", async () => {
    const { t, organizationId, clinicalIdentity } = await setupClinicalUser("doctor");

    const newId = await t
      .withIdentity(clinicalIdentity)
      .action(api.gabinet.patients.create, {
        organizationId,
        firstName: "Anna",
        lastName: "Nowak",
        email: "anna.doctor@example.com",
      });

    expect(typeof newId).toBe("string");
  });

  test("can list treatments (gabinet_treatments:view=all)", async () => {
    const { t, organizationId, clinicalIdentity } = await setupClinicalUser("doctor");

    const result = await t
      .withIdentity(clinicalIdentity)
      .action(api.gabinet.treatments.list, {
        organizationId,
        paginationOpts: { numItems: 10, cursor: null },
      });

    expect(result).toBeDefined();
    expect(Array.isArray(result.page)).toBe(true);
  });

  test("can list appointments (gabinet_appointments:view=all)", async () => {
    const { t, organizationId, clinicalIdentity } = await setupClinicalUser("doctor");

    const result = await t
      .withIdentity(clinicalIdentity)
      .action(api.gabinet.appointments.list, {
        organizationId,
        paginationOpts: { numItems: 10, cursor: null },
      });

    expect(result).toBeDefined();
    expect(Array.isArray(result.page)).toBe(true);
  });

  test("cannot create treatments — catalog management is denied (gabinet_treatments:create=none)", async () => {
    const { t, organizationId, clinicalIdentity } = await setupClinicalUser("doctor");

    await expect(
      t.withIdentity(clinicalIdentity).action(api.gabinet.treatments.create, {
        organizationId,
        name: "Doctor-created treatment",
        duration: 30,
        price: 150,
      }),
    ).rejects.toThrow(/Permission denied/);
  });
});

// ---------------------------------------------------------------------------
// Therapist workday — same permission profile as doctor
// ---------------------------------------------------------------------------
describe("Therapist workday", () => {
  test("can list patients (gabinet_patients:view=all)", async () => {
    const { t, organizationId, clinicalIdentity } = await setupClinicalUser("therapist");

    const result = await t
      .withIdentity(clinicalIdentity)
      .action(api.gabinet.patients.list, {
        organizationId,
        paginationOpts: { numItems: 10, cursor: null },
      });

    expect(result).toBeDefined();
    expect(Array.isArray(result.page)).toBe(true);
  });

  test("can create a patient (gabinet_patients:create=all)", async () => {
    const { t, organizationId, clinicalIdentity } = await setupClinicalUser("therapist");

    const newId = await t
      .withIdentity(clinicalIdentity)
      .action(api.gabinet.patients.create, {
        organizationId,
        firstName: "Piotr",
        lastName: "Wiśniewski",
        email: "piotr.therapist@example.com",
      });

    expect(typeof newId).toBe("string");
  });

  test("can list treatments (gabinet_treatments:view=all)", async () => {
    const { t, organizationId, clinicalIdentity } = await setupClinicalUser("therapist");

    const result = await t
      .withIdentity(clinicalIdentity)
      .action(api.gabinet.treatments.list, {
        organizationId,
        paginationOpts: { numItems: 10, cursor: null },
      });

    expect(result).toBeDefined();
    expect(Array.isArray(result.page)).toBe(true);
  });

  test("cannot create treatments (gabinet_treatments:create=none)", async () => {
    const { t, organizationId, clinicalIdentity } = await setupClinicalUser("therapist");

    await expect(
      t.withIdentity(clinicalIdentity).action(api.gabinet.treatments.create, {
        organizationId,
        name: "Therapist-created treatment",
        duration: 45,
        price: 200,
      }),
    ).rejects.toThrow(/Permission denied/);
  });
});

// ---------------------------------------------------------------------------
// Nurse workday
// ---------------------------------------------------------------------------
describe("Nurse workday", () => {
  test("can list patients (gabinet_patients:view=all)", async () => {
    const { t, organizationId, clinicalIdentity } = await setupClinicalUser("nurse");

    const result = await t
      .withIdentity(clinicalIdentity)
      .action(api.gabinet.patients.list, {
        organizationId,
        paginationOpts: { numItems: 10, cursor: null },
      });

    expect(result).toBeDefined();
    expect(Array.isArray(result.page)).toBe(true);
  });

  test("can create a patient (gabinet_patients:create=all)", async () => {
    const { t, organizationId, clinicalIdentity } = await setupClinicalUser("nurse");

    const newId = await t
      .withIdentity(clinicalIdentity)
      .action(api.gabinet.patients.create, {
        organizationId,
        firstName: "Maria",
        lastName: "Kowalczyk",
        email: "maria.nurse@example.com",
      });

    expect(typeof newId).toBe("string");
  });

  test("can list appointments (gabinet_appointments:view=all)", async () => {
    const { t, organizationId, clinicalIdentity } = await setupClinicalUser("nurse");

    const result = await t
      .withIdentity(clinicalIdentity)
      .action(api.gabinet.appointments.list, {
        organizationId,
        paginationOpts: { numItems: 10, cursor: null },
      });

    expect(result).toBeDefined();
    expect(Array.isArray(result.page)).toBe(true);
  });

  test("cannot create treatments (gabinet_treatments:create=none)", async () => {
    const { t, organizationId, clinicalIdentity } = await setupClinicalUser("nurse");

    await expect(
      t.withIdentity(clinicalIdentity).action(api.gabinet.treatments.create, {
        organizationId,
        name: "Nurse-created treatment",
        duration: 20,
        price: 80,
      }),
    ).rejects.toThrow(/Permission denied/);
  });
});

// ---------------------------------------------------------------------------
// Receptionist workday
// ---------------------------------------------------------------------------
describe("Receptionist workday", () => {
  test("can list patients with full scope (gabinet_patients:view=all)", async () => {
    const { t, organizationId, clinicalIdentity } = await setupClinicalUser("receptionist");

    const result = await t
      .withIdentity(clinicalIdentity)
      .action(api.gabinet.patients.list, {
        organizationId,
        paginationOpts: { numItems: 10, cursor: null },
      });

    expect(result).toBeDefined();
    expect(Array.isArray(result.page)).toBe(true);
    // Receptionist has scope "all" — should see the seeded patient
    expect(result.page.length).toBeGreaterThan(0);
  });

  test("can create a patient (gabinet_patients:create=all)", async () => {
    const { t, organizationId, clinicalIdentity } = await setupClinicalUser("receptionist");

    const newId = await t
      .withIdentity(clinicalIdentity)
      .action(api.gabinet.patients.create, {
        organizationId,
        firstName: "Tomasz",
        lastName: "Jabłoński",
        email: "tomasz.receptionist@example.com",
      });

    expect(typeof newId).toBe("string");
  });

  test("can list appointments (gabinet_appointments:view=all)", async () => {
    const { t, organizationId, clinicalIdentity } = await setupClinicalUser("receptionist");

    const result = await t
      .withIdentity(clinicalIdentity)
      .action(api.gabinet.appointments.list, {
        organizationId,
        paginationOpts: { numItems: 10, cursor: null },
      });

    expect(result).toBeDefined();
    expect(Array.isArray(result.page)).toBe(true);
  });

  test("can list treatments (gabinet_treatments:view=all)", async () => {
    const { t, organizationId, clinicalIdentity } = await setupClinicalUser("receptionist");

    const result = await t
      .withIdentity(clinicalIdentity)
      .action(api.gabinet.treatments.list, {
        organizationId,
        paginationOpts: { numItems: 10, cursor: null },
      });

    expect(result).toBeDefined();
    expect(Array.isArray(result.page)).toBe(true);
    // Receptionist can view the treatment catalog
    expect(result.page.length).toBeGreaterThan(0);
  });

  test("cannot create treatments — catalog management is denied (gabinet_treatments:create=none)", async () => {
    const { t, organizationId, clinicalIdentity } = await setupClinicalUser("receptionist");

    await expect(
      t.withIdentity(clinicalIdentity).action(api.gabinet.treatments.create, {
        organizationId,
        name: "Receptionist-created treatment",
        duration: 30,
        price: 100,
      }),
    ).rejects.toThrow(/Permission denied/);
  });
});

// ---------------------------------------------------------------------------
// Admin workday — elevated access including catalog management
// ---------------------------------------------------------------------------
describe("Admin workday", () => {
  test("can list patients (gabinet_patients:view=all)", async () => {
    const { t, organizationId, clinicalIdentity } = await setupClinicalUser("admin");

    const result = await t
      .withIdentity(clinicalIdentity)
      .action(api.gabinet.patients.list, {
        organizationId,
        paginationOpts: { numItems: 10, cursor: null },
      });

    expect(result).toBeDefined();
    expect(Array.isArray(result.page)).toBe(true);
  });

  test("can create a patient (gabinet_patients:create=all)", async () => {
    const { t, organizationId, clinicalIdentity } = await setupClinicalUser("admin");

    const newId = await t
      .withIdentity(clinicalIdentity)
      .action(api.gabinet.patients.create, {
        organizationId,
        firstName: "Katarzyna",
        lastName: "Zielińska",
        email: "katarzyna.admin@example.com",
      });

    expect(typeof newId).toBe("string");
  });

  test("can list treatments (gabinet_treatments:view=all)", async () => {
    const { t, organizationId, clinicalIdentity } = await setupClinicalUser("admin");

    const result = await t
      .withIdentity(clinicalIdentity)
      .action(api.gabinet.treatments.list, {
        organizationId,
        paginationOpts: { numItems: 10, cursor: null },
      });

    expect(result).toBeDefined();
    expect(Array.isArray(result.page)).toBe(true);
  });

  test("can create treatments — catalog management allowed (gabinet_treatments:create=all)", async () => {
    const { t, organizationId, clinicalIdentity } = await setupClinicalUser("admin");

    const newId = await t
      .withIdentity(clinicalIdentity)
      .action(api.gabinet.treatments.create, {
        organizationId,
        name: "Admin-managed treatment",
        duration: 60,
        price: 300,
      });

    expect(typeof newId).toBe("string");
  });

  test("can list appointments (gabinet_appointments:view=all)", async () => {
    const { t, organizationId, clinicalIdentity } = await setupClinicalUser("admin");

    const result = await t
      .withIdentity(clinicalIdentity)
      .action(api.gabinet.appointments.list, {
        organizationId,
        paginationOpts: { numItems: 10, cursor: null },
      });

    expect(result).toBeDefined();
    expect(Array.isArray(result.page)).toBe(true);
  });
});
