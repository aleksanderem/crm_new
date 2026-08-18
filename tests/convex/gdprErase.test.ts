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

describe("gabinet/patients.gdprErase — activity and note anonymization", () => {
  test("anonymizes descriptions of existing activities referencing the erased patient", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId } = await seedGabinetPrereqs(t, organizationId, userId);
    const patientIdStr = String(patientId);

    // Seed two activity entries referencing this patient in Supabase (where
    // gdprErase anonymizes them via db.raw() and where logActivity writes).
    const db = createSupabaseDb();
    const now = Date.now();
    await db.insert("activities", {
      organizationId: String(organizationId),
      entityType: "gabinetPatient",
      entityId: patientIdStr,
      action: "created",
      description: "Utworzono pacjenta Jan Kowalski",
      performedBy: String(userId),
      createdAt: now,
    });
    await db.insert("activities", {
      organizationId: String(organizationId),
      entityType: "gabinetPatient",
      entityId: patientIdStr,
      action: "updated",
      description: "Zaktualizowano dane Jana Kowalskiego",
      performedBy: String(userId),
      createdAt: now + 1,
    });

    await t.withIdentity(identity).action(api.gabinet.patients.gdprErase, {
      organizationId,
      patientId: patientIdStr,
    });

    const activities = await createSupabaseDb()
      .query("activities")
      .eq("organizationId", String(organizationId))
      .eq("entityType", "gabinetPatient")
      .eq("entityId", patientIdStr)
      .collect();

    for (const activity of activities) {
      expect(activity.description).not.toContain("Kowalski");
      expect(activity.description).not.toContain("Jan");
    }
    // At least the two seeded entries plus the erasure entry should exist
    expect(activities.length).toBeGreaterThanOrEqual(2);
  });

  test("anonymizes content of existing notes referencing the erased patient", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId } = await seedGabinetPrereqs(t, organizationId, userId);
    const patientIdStr = String(patientId);

    // Seed note in Supabase where gdprErase anonymizes via db.raw()
    const db = createSupabaseDb();
    const now = Date.now();
    await db.insert("notes", {
      organizationId: String(organizationId),
      entityType: "gabinetPatient",
      entityId: patientIdStr,
      content: "Pacjent Jan Kowalski skarżył się na ból głowy.",
      createdBy: String(userId),
      createdAt: now,
      updatedAt: now,
    });

    await t.withIdentity(identity).action(api.gabinet.patients.gdprErase, {
      organizationId,
      patientId: patientIdStr,
    });

    const notes = await createSupabaseDb()
      .query("notes")
      .eq("organizationId", String(organizationId))
      .eq("entityType", "gabinetPatient")
      .eq("entityId", patientIdStr)
      .collect();

    expect(notes).toHaveLength(1);
    expect(notes[0].content).not.toContain("Kowalski");
    expect(notes[0].content).not.toContain("Jan");
    expect(notes[0].content).toBe("[RODO: dane usunięte]");
  });

  test("nulls out clinical text fields on appointments for the erased patient", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );
    const patientIdStr = String(patientId);

    // Seed appointment in Supabase where gdprErase nulls clinical fields via db.raw()
    const db = createSupabaseDb();
    const now = Date.now();
    await db.insert("gabinetAppointments", {
      organizationId: String(organizationId),
      patientId: patientIdStr,
      employeeId: String(userId),
      date: "2026-01-15",
      startTime: "09:00",
      endTime: "10:00",
      status: "completed",
      notes: "Jan Kowalski wymaga specjalnej opieki.",
      internalNotes: "Historia choroby Jana Kowalskiego.",
      interviewNotes: "Pacjent Jan Kowalski skarżył się na ból pleców.",
      clinicalRemarks: "Kowalski ma alergię na lateks.",
      bodyChartData: JSON.stringify({ marks: ["lower_back"] }),
      treatmentParameterValues: JSON.stringify([
        { name: "Waga", value: "85kg" },
      ]),
      isRecurring: false,
      createdBy: String(userId),
      createdAt: now,
      updatedAt: now,
    });

    await t.withIdentity(identity).action(api.gabinet.patients.gdprErase, {
      organizationId,
      patientId: patientIdStr,
    });

    // Read from Supabase (the store that gdprErase updated) using the same
    // patientIdStr filter that the action used.
    const appointments = await createSupabaseDb()
      .query("gabinetAppointments")
      .eq("organizationId", String(organizationId))
      .eq("patientId", patientIdStr)
      .collect();

    expect(appointments).toHaveLength(1);
    // Supabase stores null (not undefined) for cleared fields
    expect(appointments[0].interviewNotes).toBeNull();
    expect(appointments[0].notes).toBeNull();
    expect(appointments[0].internalNotes).toBeNull();
    expect(appointments[0].clinicalRemarks).toBeNull();
    expect(appointments[0].bodyChartData).toBeNull();
    expect(appointments[0].treatmentParameterValues).toBeNull();
  });

  test("writes an audit log entry with action gdpr_patient_erased", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId } = await seedGabinetPrereqs(t, organizationId, userId);
    const patientIdStr = String(patientId);

    await t.withIdentity(identity).action(api.gabinet.patients.gdprErase, {
      organizationId,
      patientId: patientIdStr,
    });

    const auditEntries = await createSupabaseDb()
      .query("auditLog")
      .eq("organizationId", String(organizationId))
      .collect();

    const erasureEntry = auditEntries.find(
      (e) => e.action === "gdpr_patient_erased",
    );
    expect(erasureEntry).toBeDefined();
    expect(erasureEntry?.entityType).toBe("gabinetPatient");
    expect(erasureEntry?.entityId).toBe(patientIdStr);
  });

  test("new erasure activity entry does not contain original patient name", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId } = await seedGabinetPrereqs(t, organizationId, userId);
    const patientIdStr = String(patientId);

    await t.withIdentity(identity).action(api.gabinet.patients.gdprErase, {
      organizationId,
      patientId: patientIdStr,
    });

    const activities = await t.run(async (ctx) =>
      ctx.db
        .query("activities")
        .withIndex("by_entity", (q) =>
          q.eq("entityType", "gabinetPatient").eq("entityId", patientIdStr),
        )
        .collect(),
    );

    // Every activity entry — including the new deletion event — must be PII-free
    for (const activity of activities) {
      expect(activity.description).not.toContain("Kowalski");
      expect(activity.description).not.toContain("Jan");
    }
  });
});
