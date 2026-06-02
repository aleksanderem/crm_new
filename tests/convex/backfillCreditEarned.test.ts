import { afterEach, describe, expect, test } from "vitest";
import { internal } from "../../convex/_generated/api";
import { createTestCtx, seedTestUser } from "../../convex/_test_helpers";
import { createSupabaseDb } from "../../convex/_helpers/supabaseDb";

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

async function seedTreatment(
  organizationId: string,
  userId: string,
  price: number,
  id = "t1",
) {
  const db = createSupabaseDb();
  await db.insert("gabinetTreatments", {
    _id: id,
    organizationId,
    name: `Treatment ${id}`,
    duration: 30,
    price,
    isActive: true,
    createdBy: userId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return id;
}

async function seedAppointment(
  organizationId: string,
  patientId: string,
  treatmentId: string | null,
  userId: string,
  id = "a1",
) {
  const db = createSupabaseDb();
  await db.insert("gabinetAppointments", {
    _id: id,
    organizationId,
    patientId,
    treatmentId,
    employeeId: userId,
    date: "2026-03-15",
    startTime: "09:00",
    endTime: "09:30",
    status: "completed",
    isRecurring: false,
    createdBy: userId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return id;
}

async function seedPayment(
  organizationId: string,
  userId: string,
  fields: {
    appointmentId?: string | null;
    patientId?: string | null;
    amount: number;
    status?: string;
    kind?: string | null;
    creditEarned?: number | null;
  },
  id?: string,
) {
  const db = createSupabaseDb();
  const paymentId =
    id ?? `p_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  await db.insert("payments", {
    _id: paymentId,
    organizationId,
    patientId: fields.patientId ?? null,
    appointmentId: fields.appointmentId ?? null,
    packageUsageId: null,
    amount: fields.amount,
    currency: "PLN",
    paymentMethod: "cash",
    status: fields.status ?? "completed",
    paidAt: Date.now(),
    notes: null,
    creditEarned: fields.creditEarned ?? null,
    creditApplied: null,
    kind: fields.kind ?? null,
    createdBy: userId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return paymentId;
}

describe("backfillCreditEarned", () => {
  test("backfills overpayment as creditEarned on completed appointment payment", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);
    const orgId = String(organizationId);
    const uid = String(userId);

    const treatmentId = await seedTreatment(orgId, uid, 100);
    const appointmentId = await seedAppointment(
      orgId,
      "patient-1",
      treatmentId,
      uid,
    );
    const paymentId = await seedPayment(orgId, uid, {
      appointmentId,
      patientId: "patient-1",
      amount: 300,
    });

    const summary = await t.action(
      internal.migrations.backfillCreditEarned.backfillCreditEarned,
      { organizationId },
    );

    expect(summary.paymentsUpdated).toBe(1);
    expect(summary.totalCreditBackfilled).toBe(200);

    const db = createSupabaseDb();
    const updated = await db.get<{ creditEarned: number | null }>(
      "payments",
      paymentId,
    );
    expect(updated?.creditEarned).toBe(200);
  });

  test("is idempotent: re-running does not double-credit", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);
    const orgId = String(organizationId);
    const uid = String(userId);

    const treatmentId = await seedTreatment(orgId, uid, 100);
    const appointmentId = await seedAppointment(
      orgId,
      "patient-1",
      treatmentId,
      uid,
    );
    const paymentId = await seedPayment(orgId, uid, {
      appointmentId,
      patientId: "patient-1",
      amount: 250,
    });

    await t.action(
      internal.migrations.backfillCreditEarned.backfillCreditEarned,
      { organizationId },
    );
    const second = await t.action(
      internal.migrations.backfillCreditEarned.backfillCreditEarned,
      { organizationId },
    );

    expect(second.paymentsUpdated).toBe(0);
    expect(second.totalCreditBackfilled).toBe(0);

    const db = createSupabaseDb();
    const updated = await db.get<{ creditEarned: number | null }>(
      "payments",
      paymentId,
    );
    expect(updated?.creditEarned).toBe(150);
  });

  test("dryRun reports candidates without persisting changes", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);
    const orgId = String(organizationId);
    const uid = String(userId);

    const treatmentId = await seedTreatment(orgId, uid, 100);
    const appointmentId = await seedAppointment(
      orgId,
      "patient-1",
      treatmentId,
      uid,
    );
    const paymentId = await seedPayment(orgId, uid, {
      appointmentId,
      patientId: "patient-1",
      amount: 300,
    });

    const summary = await t.action(
      internal.migrations.backfillCreditEarned.backfillCreditEarned,
      { organizationId, dryRun: true },
    );

    expect(summary.paymentsUpdated).toBe(1);
    expect(summary.totalCreditBackfilled).toBe(200);
    expect(summary.dryRun).toBe(true);

    const db = createSupabaseDb();
    const row = await db.get<{ creditEarned: number | null }>(
      "payments",
      paymentId,
    );
    expect(row?.creditEarned ?? null).toBe(null);
  });

  test("skips payments where amount does not exceed treatment price", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);
    const orgId = String(organizationId);
    const uid = String(userId);

    const treatmentId = await seedTreatment(orgId, uid, 100);
    const appointmentId = await seedAppointment(
      orgId,
      "patient-1",
      treatmentId,
      uid,
    );
    const paymentId = await seedPayment(orgId, uid, {
      appointmentId,
      patientId: "patient-1",
      amount: 100,
    });

    const summary = await t.action(
      internal.migrations.backfillCreditEarned.backfillCreditEarned,
      { organizationId },
    );

    expect(summary.paymentsUpdated).toBe(0);
    expect(summary.skippedNoOverpayment).toBe(1);

    const db = createSupabaseDb();
    const row = await db.get<{ creditEarned: number | null }>(
      "payments",
      paymentId,
    );
    expect(row?.creditEarned ?? null).toBe(null);
  });

  test("skips payments without an appointment link", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);
    const orgId = String(organizationId);
    const uid = String(userId);

    await seedPayment(orgId, uid, {
      appointmentId: null,
      patientId: "patient-1",
      amount: 500,
    });

    const summary = await t.action(
      internal.migrations.backfillCreditEarned.backfillCreditEarned,
      { organizationId },
    );

    expect(summary.paymentsUpdated).toBe(0);
  });

  test("skips appointments without a treatment", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);
    const orgId = String(organizationId);
    const uid = String(userId);

    const appointmentId = await seedAppointment(
      orgId,
      "patient-1",
      null,
      uid,
    );
    const paymentId = await seedPayment(orgId, uid, {
      appointmentId,
      patientId: "patient-1",
      amount: 500,
    });

    const summary = await t.action(
      internal.migrations.backfillCreditEarned.backfillCreditEarned,
      { organizationId },
    );

    expect(summary.paymentsUpdated).toBe(0);
    expect(summary.skippedNoTreatment).toBe(1);

    const db = createSupabaseDb();
    const row = await db.get<{ creditEarned: number | null }>(
      "payments",
      paymentId,
    );
    expect(row?.creditEarned ?? null).toBe(null);
  });

  test("skips credit_refund bookkeeping rows", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);
    const orgId = String(organizationId);
    const uid = String(userId);

    const treatmentId = await seedTreatment(orgId, uid, 100);
    const appointmentId = await seedAppointment(
      orgId,
      "patient-1",
      treatmentId,
      uid,
    );
    await seedPayment(orgId, uid, {
      appointmentId,
      patientId: "patient-1",
      amount: 300,
      kind: "credit_refund",
    });

    const summary = await t.action(
      internal.migrations.backfillCreditEarned.backfillCreditEarned,
      { organizationId },
    );

    expect(summary.paymentsUpdated).toBe(0);
  });

  test("skips non-completed payments (pending / refunded)", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);
    const orgId = String(organizationId);
    const uid = String(userId);

    const treatmentId = await seedTreatment(orgId, uid, 100);
    const appointmentId = await seedAppointment(
      orgId,
      "patient-1",
      treatmentId,
      uid,
    );
    await seedPayment(orgId, uid, {
      appointmentId,
      patientId: "patient-1",
      amount: 300,
      status: "refunded",
    });
    await seedPayment(orgId, uid, {
      appointmentId,
      patientId: "patient-1",
      amount: 300,
      status: "pending",
    });

    const summary = await t.action(
      internal.migrations.backfillCreditEarned.backfillCreditEarned,
      { organizationId },
    );

    expect(summary.paymentsUpdated).toBe(0);
  });

  test("scopes to the requested organization only", async () => {
    const t = createTestCtx();
    const { organizationId, userId } = await seedTestUser(t);
    const orgId = String(organizationId);
    const uid = String(userId);
    const otherOrgId = "other-org-xyz";

    const treatmentMineId = await seedTreatment(orgId, uid, 100, "t-mine");
    const treatmentOtherId = await seedTreatment(
      otherOrgId,
      uid,
      100,
      "t-other",
    );
    const apptMine = await seedAppointment(
      orgId,
      "patient-1",
      treatmentMineId,
      uid,
      "a-mine",
    );
    const apptOther = await seedAppointment(
      otherOrgId,
      "patient-2",
      treatmentOtherId,
      uid,
      "a-other",
    );

    const myPaymentId = await seedPayment(
      orgId,
      uid,
      {
        appointmentId: apptMine,
        patientId: "patient-1",
        amount: 250,
      },
      "p-mine",
    );
    const otherPaymentId = await seedPayment(
      otherOrgId,
      uid,
      {
        appointmentId: apptOther,
        patientId: "patient-2",
        amount: 400,
      },
      "p-other",
    );

    const summary = await t.action(
      internal.migrations.backfillCreditEarned.backfillCreditEarned,
      { organizationId },
    );

    expect(summary.paymentsUpdated).toBe(1);
    expect(summary.totalCreditBackfilled).toBe(150);

    const db = createSupabaseDb();
    const mine = await db.get<{ creditEarned: number | null }>(
      "payments",
      myPaymentId,
    );
    const other = await db.get<{ creditEarned: number | null }>(
      "payments",
      otherPaymentId,
    );
    expect(mine?.creditEarned).toBe(150);
    expect(other?.creditEarned ?? null).toBe(null);
  });
});
