import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  createTestCtx,
  seedGabinetPrereqs,
  seedSecondUser,
  seedTestUser,
} from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

// Stub fetch to absorb SMS side-effects triggered by appointment state changes.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({ sid: "SM_TEST_123" }),
    })) as unknown as typeof fetch,
  );
});

afterEach(async () => {
  // Drain any pending setTimeout(0) side-effect callbacks before the next test
  // creates a fresh instance. The scheduler-noise filter in _setup.ts absorbs
  // orphan-write rejections that still escape.
  await new Promise((resolve) => setTimeout(resolve, 0));
  vi.unstubAllGlobals();
});

describe("appointment billing flow (E2E)", () => {
  /**
   * Full path: appointment → package deduction → overpayment credit → authorized refund
   *
   * Covers the P0 scenario where all billing subsystems must integrate:
   *   1. A patient with an active package attends an appointment.
   *   2. The appointment completion deducts one session from the package.
   *   3. The payment for the visit carries an overpayment, creating credit.
   *   4. A staff member (no refund permission) requests a credit refund.
   *   5. An owner approves, draining the credit balance to zero.
   */
  test("appointment → package deduction → overpayment credit → authorized refund", async () => {
    const t = createTestCtx();
    const {
      organizationId,
      userId,
      identity: ownerIdentity,
    } = await seedTestUser(t);
    const { identity: memberIdentity } = await seedSecondUser(
      t,
      organizationId,
      { role: "member" },
    );
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    // ── 1. Create a 4-session package at 400 PLN ─────────────────────────────
    const packageId = await t
      .withIdentity(ownerIdentity)
      .action(api.gabinet.packages.create, {
        organizationId,
        name: "Consultation × 4",
        treatments: [{ treatmentId: String(treatmentId), quantity: 4 }],
        totalPrice: 400,
        currency: "PLN",
      });
    expect(packageId).toBeTruthy();

    // ── 2. Patient purchases the package (400 PLN cash) ──────────────────────
    const usageId = await t
      .withIdentity(ownerIdentity)
      .action(api.gabinet.packages.purchasePackage, {
        organizationId,
        patientId: String(patientId),
        packageId,
        paidAmount: 400,
        paymentMethod: "cash",
      });
    expect(usageId).toBeTruthy();

    const db = createSupabaseDb();

    // Verify initial package state: 0 of 4 sessions used.
    const usageBefore = await db.get<{
      treatmentsUsed: Array<{ usedCount: number; totalCount: number }>;
    }>("gabinetPackageUsage", usageId);
    expect(usageBefore?.treatmentsUsed[0].usedCount).toBe(0);
    expect(usageBefore?.treatmentsUsed[0].totalCount).toBe(4);

    // ── 3. Book appointment linked to the package ─────────────────────────────
    const apptId = await t
      .withIdentity(ownerIdentity)
      .action(api.gabinet.appointments.create, {
        organizationId,
        patientId: String(patientId),
        treatmentId: String(treatmentId),
        employeeId: String(userId),
        date: "2026-03-16",
        startTime: "09:00",
        endTime: "09:30",
        packageUsageId: usageId,
        allowPast: true,
      });
    expect(apptId).toBeTruthy();

    // ── 4. Seed packageDeducted: false on junction rows ───────────────────────
    // In production Postgres the gabinet_appointment_treatments.package_deducted
    // column has DEFAULT false. The in-memory mock stores junction rows without
    // this column (it's absent from the insert), so the CAS filter
    // `.eq("package_deducted", false)` would never match. Patching here
    // replicates the DB default so the deduction CAS succeeds.
    const { data: junctionRows } = await db
      .raw()
      .from("gabinet_appointment_treatments")
      .select("id")
      .eq("appointment_id", apptId);
    for (const row of (junctionRows ?? []) as Array<{ id: string }>) {
      await db.patch("gabinetAppointmentTreatments", row.id, {
        packageDeducted: false,
      });
    }

    // ── 5. Run appointment through full state machine → completed ─────────────
    await t.withIdentity(ownerIdentity).action(
      api.gabinet.appointments.updateStatus,
      { organizationId, appointmentId: apptId, status: "confirmed" },
    );
    await t.withIdentity(ownerIdentity).action(
      api.gabinet.appointments.updateStatus,
      { organizationId, appointmentId: apptId, status: "in_progress" },
    );
    await t.withIdentity(ownerIdentity).action(
      api.gabinet.appointments.updateStatus,
      { organizationId, appointmentId: apptId, status: "completed" },
    );

    const appt = await db.get<{ status: string }>(
      "gabinetAppointments",
      apptId,
    );
    expect(appt?.status).toBe("completed");

    // ── 6. Package entry is deducted: 0 → 1 used ─────────────────────────────
    const usageAfter = await db.get<{
      treatmentsUsed: Array<{ usedCount: number; totalCount: number }>;
    }>("gabinetPackageUsage", usageId);
    expect(usageAfter?.treatmentsUsed[0].usedCount).toBe(1);
    expect(usageAfter?.treatmentsUsed[0].totalCount).toBe(4);

    // ── 7. Payment: 150 PLN for 100 PLN treatment → 50 PLN credit earned ──────
    // seedGabinetPrereqs seeds the treatment at price 100 PLN.
    await t.withIdentity(ownerIdentity).action(api.payments.create, {
      organizationId,
      patientId: String(patientId),
      appointmentId: apptId,
      amount: 150,
      currency: "PLN",
      paymentMethod: "cash",
      creditEarned: 50,
    });

    // ── 8. Verify credit balance is 50 PLN ───────────────────────────────────
    const creditAfterPayment = await t
      .withIdentity(ownerIdentity)
      .action(api.payments.getPatientCredit, {
        organizationId,
        patientId: String(patientId),
      });
    expect(creditAfterPayment.balance).toBe(50);

    // ── 9. Member (no refund permission) requests authorization ───────────────
    await t.withIdentity(memberIdentity).action(
      api.payments.requestRefundAuthorization,
      {
        organizationId,
        patientId: String(patientId),
        amount: 50,
        notes: "Patient cancelled follow-up",
      },
    );

    // Retrieve the notification delivered to the owner.
    const ownerNotifications = await t.run(async (ctx) =>
      ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    );
    const refundNotification = ownerNotifications.find(
      (n) => n.type === "refund_authorization_requested",
    );
    expect(refundNotification).toBeTruthy();
    expect(
      (refundNotification!.metadata as { amount: number }).amount,
    ).toBe(50);
    expect(
      (refundNotification!.metadata as { status: string }).status,
    ).toBe("pending");

    // ── 10. Owner approves the refund ─────────────────────────────────────────
    await t.withIdentity(ownerIdentity).action(api.payments.approveRefundAuth, {
      organizationId,
      notificationId: refundNotification!._id,
    });

    // ── 11. Credit balance drains to 0 ───────────────────────────────────────
    const creditAfterRefund = await t
      .withIdentity(ownerIdentity)
      .action(api.payments.getPatientCredit, {
        organizationId,
        patientId: String(patientId),
      });
    expect(creditAfterRefund.balance).toBe(0);

    // The notification is resolved: marked read with status = "approved".
    const resolved = await t.run(async (ctx) =>
      ctx.db.get(refundNotification!._id),
    );
    expect(resolved?.isRead).toBe(true);
    expect((resolved?.metadata as { status: string }).status).toBe("approved");
  });

  /**
   * Credit carry-forward: overpayment on visit 1 is partially applied on visit 2.
   * Tests that the balance arithmetic is correct across multiple payment rows.
   */
  test("overpayment credit carries forward and is partially applied on a subsequent visit", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId } = await seedGabinetPrereqs(t, organizationId, userId);

    // Visit 1: pay 300 PLN for 100 PLN treatment — 200 PLN credit earned.
    await t.withIdentity(identity).action(api.payments.create, {
      organizationId,
      patientId: String(patientId),
      amount: 300,
      currency: "PLN",
      paymentMethod: "cash",
      creditEarned: 200,
    });

    let credit = await t.withIdentity(identity).action(
      api.payments.getPatientCredit,
      { organizationId, patientId: String(patientId) },
    );
    expect(credit.balance).toBe(200);

    // Visit 2: apply 80 PLN of existing credit; pay 20 PLN cash for the rest.
    await t.withIdentity(identity).action(api.payments.create, {
      organizationId,
      patientId: String(patientId),
      amount: 20,
      currency: "PLN",
      paymentMethod: "cash",
      creditApplied: 80,
    });

    credit = await t.withIdentity(identity).action(
      api.payments.getPatientCredit,
      { organizationId, patientId: String(patientId) },
    );
    expect(credit.balance).toBe(120); // 200 − 80 = 120
  });

  /**
   * Completing a package-linked appointment and then reverting it to in_progress
   * restores the deducted session — the CAS guard prevents double-restoration.
   */
  test("reverting completed appointment restores one package session", async () => {
    const t = createTestCtx();
    const { organizationId, userId, identity } = await seedTestUser(t);
    const { patientId, treatmentId } = await seedGabinetPrereqs(
      t,
      organizationId,
      userId,
    );

    const packageId = await t
      .withIdentity(identity)
      .action(api.gabinet.packages.create, {
        organizationId,
        name: "Revert test package",
        treatments: [{ treatmentId: String(treatmentId), quantity: 2 }],
        totalPrice: 200,
        currency: "PLN",
      });

    const usageId = await t
      .withIdentity(identity)
      .action(api.gabinet.packages.purchasePackage, {
        organizationId,
        patientId: String(patientId),
        packageId,
        paidAmount: 200,
        paymentMethod: "card",
      });

    const apptId = await t
      .withIdentity(identity)
      .action(api.gabinet.appointments.create, {
        organizationId,
        patientId: String(patientId),
        treatmentId: String(treatmentId),
        employeeId: String(userId),
        date: "2026-04-01",
        startTime: "10:00",
        endTime: "10:30",
        packageUsageId: usageId,
        allowPast: true,
      });

    const db = createSupabaseDb();

    // Seed packageDeducted: false on junction rows (production DB default).
    const { data: junctionRows } = await db
      .raw()
      .from("gabinet_appointment_treatments")
      .select("id")
      .eq("appointment_id", apptId);
    for (const row of (junctionRows ?? []) as Array<{ id: string }>) {
      await db.patch("gabinetAppointmentTreatments", row.id, {
        packageDeducted: false,
      });
    }

    // Complete the appointment — deducts 1 session.
    await t.withIdentity(identity).action(
      api.gabinet.appointments.updateStatus,
      { organizationId, appointmentId: apptId, status: "confirmed" },
    );
    await t.withIdentity(identity).action(
      api.gabinet.appointments.updateStatus,
      { organizationId, appointmentId: apptId, status: "in_progress" },
    );
    await t.withIdentity(identity).action(
      api.gabinet.appointments.updateStatus,
      { organizationId, appointmentId: apptId, status: "completed" },
    );

    const usageAfterComplete = await db.get<{
      treatmentsUsed: Array<{ usedCount: number }>;
    }>("gabinetPackageUsage", usageId);
    expect(usageAfterComplete?.treatmentsUsed[0].usedCount).toBe(1);

    // Revert to in_progress — the session should be returned.
    await t.withIdentity(identity).action(
      api.gabinet.appointments.updateStatus,
      { organizationId, appointmentId: apptId, status: "in_progress" },
    );

    const usageAfterRevert = await db.get<{
      treatmentsUsed: Array<{ usedCount: number }>;
    }>("gabinetPackageUsage", usageId);
    expect(usageAfterRevert?.treatmentsUsed[0].usedCount).toBe(0);
  });
});
