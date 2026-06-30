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

describe("gabinet/patients.gdprErase — activity and note anonymization", () => {
  test("anonymizes descriptions of existing activities referencing the erased patient", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId } = await seedGabinetPrereqs(t, organizationId, userId);
    const patientIdStr = String(patientId);

    // Seed two activity entries referencing this patient in Convex
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("activities", {
        organizationId,
        entityType: "gabinetPatient",
        entityId: patientIdStr,
        action: "created",
        description: "Utworzono pacjenta Jan Kowalski",
        performedBy: userId,
        createdAt: now,
      });
      await ctx.db.insert("activities", {
        organizationId,
        entityType: "gabinetPatient",
        entityId: patientIdStr,
        action: "updated",
        description: "Zaktualizowano dane Jana Kowalskiego",
        performedBy: userId,
        createdAt: now + 1,
      });
    });

    await t.withIdentity(identity).action(api.gabinet.patients.gdprErase, {
      organizationId,
      patientId: patientIdStr,
    });

    const activities = await t.run(async (ctx) =>
      ctx.db
        .query("activities")
        .withIndex("by_entity", (q) =>
          q.eq("entityType", "gabinetPatient").eq("entityId", patientIdStr)
        )
        .collect()
    );

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

    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("notes", {
        organizationId,
        entityType: "gabinetPatient",
        entityId: patientIdStr,
        content: "Pacjent Jan Kowalski skarżył się na ból głowy.",
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
    });

    await t.withIdentity(identity).action(api.gabinet.patients.gdprErase, {
      organizationId,
      patientId: patientIdStr,
    });

    const notes = await t.run(async (ctx) =>
      ctx.db
        .query("notes")
        .withIndex("by_entity", (q) =>
          q.eq("entityType", "gabinetPatient").eq("entityId", patientIdStr)
        )
        .collect()
    );

    expect(notes).toHaveLength(1);
    expect(notes[0].content).not.toContain("Kowalski");
    expect(notes[0].content).not.toContain("Jan");
    expect(notes[0].content).toBe("[RODO: dane usunięte]");
  });

  test("nulls out clinical text fields on appointments for the erased patient", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(t, organizationId, userId);
    const patientIdStr = String(patientId);

    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("gabinetAppointments", {
        organizationId,
        patientId,
        treatmentId,
        employeeId: userId,
        date: "2026-01-15",
        startTime: "09:00",
        endTime: "10:00",
        status: "completed",
        notes: "Jan Kowalski wymaga specjalnej opieki.",
        internalNotes: "Historia choroby Jana Kowalskiego.",
        interviewNotes: "Pacjent Jan Kowalski skarżył się na ból pleców.",
        clinicalRemarks: "Kowalski ma alergię na lateks.",
        bodyChartData: JSON.stringify({ marks: ["lower_back"] }),
        treatmentParameterValues: JSON.stringify([{ name: "Waga", value: "85kg" }]),
        isRecurring: false,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
    });

    await t.withIdentity(identity).action(api.gabinet.patients.gdprErase, {
      organizationId,
      patientId: patientIdStr,
    });

    const appointments = await t.run(async (ctx) =>
      ctx.db
        .query("gabinetAppointments")
        .withIndex("by_orgAndPatient", (q) =>
          q.eq("organizationId", organizationId).eq("patientId", patientId)
        )
        .collect()
    );

    expect(appointments).toHaveLength(1);
    expect(appointments[0].interviewNotes).toBeUndefined();
    expect(appointments[0].notes).toBeUndefined();
    expect(appointments[0].internalNotes).toBeUndefined();
    expect(appointments[0].clinicalRemarks).toBeUndefined();
    expect(appointments[0].bodyChartData).toBeUndefined();
    expect(appointments[0].treatmentParameterValues).toBeUndefined();
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
          q.eq("entityType", "gabinetPatient").eq("entityId", patientIdStr)
        )
        .collect()
    );

    // Every activity entry — including the new deletion event — must be PII-free
    for (const activity of activities) {
      expect(activity.description).not.toContain("Kowalski");
      expect(activity.description).not.toContain("Jan");
    }
  });
});
