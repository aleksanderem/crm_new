import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createTestCtx,
  seedTestUser,
  seedGabinetPrereqs,
} from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

afterEach(async () => {
  // Let pending setTimeout(0) side-effect callbacks fire against the current
  // instance; the process-wide scheduler-noise filter (tests/convex/_setup.ts)
  // swallows orphan-write rejections that still escape this yield.
  await new Promise((resolve) => setTimeout(resolve, 0));
});

// Spin up a second patient in the in-memory Supabase store. The first patient
// is created by seedGabinetPrereqs; the second is what we merge into / from.
async function seedSecondPatient(
  organizationId: string,
  userId: string,
  patientId: string,
  overrides: Record<string, unknown> = {},
) {
  const db = createSupabaseDb();
  const now = Date.now();
  await db.insert("gabinetPatients", {
    _id: patientId,
    organizationId,
    firstName: "Anna",
    lastName: "Nowak",
    email: "anna@example.com",
    isActive: true,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe("gabinet/patients.merge", () => {
  describe("self-merge guard", () => {
    test("throws when target and source are the same id", async () => {
      const t = createTestCtx();
      const { organizationId, userId, identity } = await seedTestUser(t);
      const { patientId } = await seedGabinetPrereqs(t, organizationId, userId);

      await expect(
        t
          .withIdentity(identity)
          .action(api.gabinet.patients.merge, {
            organizationId,
            targetPatientId: String(patientId),
            sourcePatientId: String(patientId),
          }),
      ).rejects.toThrow(/Cannot merge a patient with itself/);
    });
  });

  describe("org-scoping guard", () => {
    test("rejects when target patient belongs to a different organization", async () => {
      const t = createTestCtx();
      const { organizationId, userId, identity } = await seedTestUser(t);
      // Seed a patient that lives in a completely different org.
      await seedSecondPatient(
        "org_other_999",
        String(userId),
        "patient_target_foreign",
      );
      // Source belongs to the caller's org so we isolate the failure to target.
      const { patientId: sourcePatientId } = await seedGabinetPrereqs(
        t,
        organizationId,
        userId,
      );

      await expect(
        t
          .withIdentity(identity)
          .action(api.gabinet.patients.merge, {
            organizationId,
            targetPatientId: "patient_target_foreign",
            sourcePatientId: String(sourcePatientId),
          }),
      ).rejects.toThrow(/Target patient not found/);
    });

    test("rejects when source patient belongs to a different organization", async () => {
      const t = createTestCtx();
      const { organizationId, userId, identity } = await seedTestUser(t);
      const { patientId: targetPatientId } = await seedGabinetPrereqs(
        t,
        organizationId,
        userId,
      );
      await seedSecondPatient(
        "org_other_999",
        String(userId),
        "patient_source_foreign",
      );

      await expect(
        t
          .withIdentity(identity)
          .action(api.gabinet.patients.merge, {
            organizationId,
            targetPatientId: String(targetPatientId),
            sourcePatientId: "patient_source_foreign",
          }),
      ).rejects.toThrow(/Source patient not found/);
    });
  });

  describe("loyalty point consolidation", () => {
    test("sums balances when both patients have loyalty rows", async () => {
      const t = createTestCtx();
      const { organizationId, userId, identity } = await seedTestUser(t);
      const { patientId: targetId } = await seedGabinetPrereqs(
        t,
        organizationId,
        userId,
      );
      const sourceId = "patient_loyalty_source";
      await seedSecondPatient(String(organizationId), String(userId), sourceId);

      const db = createSupabaseDb();
      await db.insert("gabinetLoyaltyPoints", {
        _id: "loyalty_target",
        organizationId: String(organizationId),
        patientId: String(targetId),
        balance: 100,
        lifetimeEarned: 150,
        lifetimeSpent: 50,
        updatedAt: Date.now(),
      });
      await db.insert("gabinetLoyaltyPoints", {
        _id: "loyalty_source",
        organizationId: String(organizationId),
        patientId: sourceId,
        balance: 40,
        lifetimeEarned: 60,
        lifetimeSpent: 20,
        updatedAt: Date.now(),
      });

      const result = await t
        .withIdentity(identity)
        .action(api.gabinet.patients.merge, {
          organizationId,
          targetPatientId: String(targetId),
          sourcePatientId: sourceId,
        });

      expect(result.consolidatedLoyaltyBalance).toBe(140);

      // Target row now carries the combined totals.
      const targetLoyalty = await db.get<{
        balance: number;
        lifetimeEarned: number;
        lifetimeSpent: number;
      }>("gabinetLoyaltyPoints", "loyalty_target");
      expect(targetLoyalty?.balance).toBe(140);
      expect(targetLoyalty?.lifetimeEarned).toBe(210);
      expect(targetLoyalty?.lifetimeSpent).toBe(70);

      // Source loyalty row is removed (unique constraint on org+patient).
      const sourceLoyalty = await db.get(
        "gabinetLoyaltyPoints",
        "loyalty_source",
      );
      expect(sourceLoyalty).toBeNull();
    });

    test("reassigns source loyalty row when target has none", async () => {
      const t = createTestCtx();
      const { organizationId, userId, identity } = await seedTestUser(t);
      const { patientId: targetId } = await seedGabinetPrereqs(
        t,
        organizationId,
        userId,
      );
      const sourceId = "patient_loyalty_source";
      await seedSecondPatient(String(organizationId), String(userId), sourceId);

      const db = createSupabaseDb();
      await db.insert("gabinetLoyaltyPoints", {
        _id: "loyalty_source",
        organizationId: String(organizationId),
        patientId: sourceId,
        balance: 25,
        lifetimeEarned: 30,
        lifetimeSpent: 5,
        updatedAt: Date.now(),
      });

      const result = await t
        .withIdentity(identity)
        .action(api.gabinet.patients.merge, {
          organizationId,
          targetPatientId: String(targetId),
          sourcePatientId: sourceId,
        });

      expect(result.consolidatedLoyaltyBalance).toBe(25);

      // The source row was rewired onto the target patient instead of deleted.
      const reassigned = await db.get<{
        patientId: string;
        balance: number;
      }>("gabinetLoyaltyPoints", "loyalty_source");
      expect(reassigned?.patientId).toBe(String(targetId));
      expect(reassigned?.balance).toBe(25);
    });

    test("returns target balance unchanged when source has no loyalty row", async () => {
      const t = createTestCtx();
      const { organizationId, userId, identity } = await seedTestUser(t);
      const { patientId: targetId } = await seedGabinetPrereqs(
        t,
        organizationId,
        userId,
      );
      const sourceId = "patient_no_loyalty";
      await seedSecondPatient(String(organizationId), String(userId), sourceId);

      const db = createSupabaseDb();
      await db.insert("gabinetLoyaltyPoints", {
        _id: "loyalty_target",
        organizationId: String(organizationId),
        patientId: String(targetId),
        balance: 75,
        lifetimeEarned: 100,
        lifetimeSpent: 25,
        updatedAt: Date.now(),
      });

      const result = await t
        .withIdentity(identity)
        .action(api.gabinet.patients.merge, {
          organizationId,
          targetPatientId: String(targetId),
          sourcePatientId: sourceId,
        });

      expect(result.consolidatedLoyaltyBalance).toBe(75);
      const targetLoyalty = await db.get<{ balance: number }>(
        "gabinetLoyaltyPoints",
        "loyalty_target",
      );
      expect(targetLoyalty?.balance).toBe(75);
    });
  });

  describe("polymorphic activities/notes reassignment", () => {
    test("reassigns only rows whose entityType matches gabinetPatient", async () => {
      const t = createTestCtx();
      const { organizationId, userId, identity } = await seedTestUser(t);
      const { patientId: targetId } = await seedGabinetPrereqs(
        t,
        organizationId,
        userId,
      );
      const sourceId = "patient_poly_source";
      await seedSecondPatient(String(organizationId), String(userId), sourceId);

      const db = createSupabaseDb();
      const orgIdStr = String(organizationId);

      // Note pointing at the source patient — should move.
      await db.insert("notes", {
        _id: "note_patient",
        organizationId: orgIdStr,
        entityType: "gabinetPatient",
        entityId: sourceId,
        content: "patient note",
      });
      // Same id collision but different entityType — must NOT move
      // (a contact happens to share an id namespace with the patient).
      await db.insert("notes", {
        _id: "note_contact_collision",
        organizationId: orgIdStr,
        entityType: "contact",
        entityId: sourceId,
        content: "contact note",
      });
      // Different patient id, same entityType — must NOT move.
      await db.insert("notes", {
        _id: "note_other_patient",
        organizationId: orgIdStr,
        entityType: "gabinetPatient",
        entityId: "patient_unrelated",
        content: "unrelated patient note",
      });

      // Activities: one matching, one with different entityType.
      await db.insert("activities", {
        _id: "act_patient",
        organizationId: orgIdStr,
        entityType: "gabinetPatient",
        entityId: sourceId,
        action: "created",
      });
      await db.insert("activities", {
        _id: "act_contact_collision",
        organizationId: orgIdStr,
        entityType: "contact",
        entityId: sourceId,
        action: "created",
      });

      // object_relationships: polymorphic on BOTH source_* and target_*.
      await db.insert("objectRelationships", {
        _id: "rel_source_side",
        organizationId: orgIdStr,
        sourceType: "gabinetPatient",
        sourceId: sourceId,
        targetType: "contact",
        targetId: "c_1",
      });
      await db.insert("objectRelationships", {
        _id: "rel_target_side",
        organizationId: orgIdStr,
        sourceType: "contact",
        sourceId: "c_2",
        targetType: "gabinetPatient",
        targetId: sourceId,
      });
      // Wrong type discriminator on the source side — must NOT move.
      await db.insert("objectRelationships", {
        _id: "rel_wrong_type",
        organizationId: orgIdStr,
        sourceType: "contact",
        sourceId: sourceId,
        targetType: "contact",
        targetId: "c_3",
      });

      const result = await t
        .withIdentity(identity)
        .action(api.gabinet.patients.merge, {
          organizationId,
          targetPatientId: String(targetId),
          sourcePatientId: sourceId,
        });

      expect(result.movedNotes).toBe(1);
      expect(result.movedActivities).toBe(1);
      // 1 source-side + 1 target-side = 2
      expect(result.movedRelationships).toBe(2);

      // Verify the matching note moved to the target.
      const movedNote = await db.get<{ entityId: string }>("notes", "note_patient");
      expect(movedNote?.entityId).toBe(String(targetId));

      // Verify the entityType-mismatched note did NOT move.
      const untouchedContactNote = await db.get<{ entityId: string }>(
        "notes",
        "note_contact_collision",
      );
      expect(untouchedContactNote?.entityId).toBe(sourceId);

      // Verify the unrelated patient's note did NOT move.
      const otherPatientNote = await db.get<{ entityId: string }>(
        "notes",
        "note_other_patient",
      );
      expect(otherPatientNote?.entityId).toBe("patient_unrelated");

      // Activity matching the discriminator moved; the contact one did not.
      const movedActivity = await db.get<{ entityId: string }>(
        "activities",
        "act_patient",
      );
      expect(movedActivity?.entityId).toBe(String(targetId));
      const untouchedActivity = await db.get<{ entityId: string }>(
        "activities",
        "act_contact_collision",
      );
      expect(untouchedActivity?.entityId).toBe(sourceId);

      // Relationships rewired on the correct side only.
      const relSource = await db.get<{ sourceId: string; targetId: string }>(
        "objectRelationships",
        "rel_source_side",
      );
      expect(relSource?.sourceId).toBe(String(targetId));
      const relTarget = await db.get<{ sourceId: string; targetId: string }>(
        "objectRelationships",
        "rel_target_side",
      );
      expect(relTarget?.targetId).toBe(String(targetId));
      const relUntouched = await db.get<{ sourceId: string }>(
        "objectRelationships",
        "rel_wrong_type",
      );
      expect(relUntouched?.sourceId).toBe(sourceId);
    });
  });

  describe("source patient deactivation", () => {
    test("marks source patient inactive and annotates medicalNotes", async () => {
      const t = createTestCtx();
      const { organizationId, userId, identity } = await seedTestUser(t);
      const { patientId: targetId } = await seedGabinetPrereqs(
        t,
        organizationId,
        userId,
      );
      const sourceId = "patient_deactivation_source";
      await seedSecondPatient(String(organizationId), String(userId), sourceId, {
        medicalNotes: "Existing notes about source",
      });

      await t
        .withIdentity(identity)
        .action(api.gabinet.patients.merge, {
          organizationId,
          targetPatientId: String(targetId),
          sourcePatientId: sourceId,
        });

      const db = createSupabaseDb();
      const source = await db.get<{
        isActive: boolean;
        medicalNotes: string | null;
      }>("gabinetPatients", sourceId);

      expect(source?.isActive).toBe(false);
      expect(source?.medicalNotes).toContain(
        `[Merged into patient ${String(targetId)}`,
      );
      expect(source?.medicalNotes).toContain("Existing notes about source");
    });
  });
});
