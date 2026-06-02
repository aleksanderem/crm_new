import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { createSupabaseDb } from "../_helpers/supabaseDb";

// One-off migration for issue #1287.
//
// Patient credit / overpayment carry-forward (#1059) introduced the
// `creditEarned` column on payments. New visits write the overpayment
// portion into it so the running patient balance picks it up. Historical
// completed payments booked *before* #1059 shipped have `creditEarned = NULL`
// even when the patient overpaid relative to the linked treatment price,
// so that excess never makes it into the balance.
//
// This action backfills those rows. For each completed payment that:
//   - belongs to the target organization,
//   - has an `appointmentId` and a `patientId`,
//   - is a regular payment (`kind` IS NULL or "payment", never
//     "credit_refund"),
//   - has `creditEarned` IS NULL (or 0),
//   - links to an appointment whose `treatmentId` resolves to a treatment
//     with a positive `price`,
// we set `creditEarned = amount − treatment.price` when `amount` exceeds
// `treatment.price` (above a small rounding epsilon).
//
// Idempotent: re-runs skip payments whose `creditEarned` is already set
// (positive or negative), so calling this twice is a no-op for already
// migrated rows. Supports `dryRun: true` for inspection without writes.

type PaymentRow = {
  _id: string;
  organizationId: string;
  patientId: string | null;
  appointmentId: string | null;
  amount: number;
  status: string;
  kind: string | null;
  creditEarned: number | null;
};

type AppointmentRow = {
  _id: string;
  treatmentId: string | null;
};

type TreatmentRow = {
  _id: string;
  price: number | null;
};

const EPSILON = 0.005;

export const backfillCreditEarned = internalAction({
  args: {
    organizationId: v.id("organizations"),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (_ctx, args) => {
    const { organizationId, dryRun = false } = args;
    const prefix = dryRun ? "[DRY RUN] " : "";
    const db = createSupabaseDb();

    const completedPayments = (await db
      .query("payments")
      .eq("organizationId", String(organizationId))
      .eq("status", "completed")
      .collect()) as PaymentRow[];

    const candidates = completedPayments.filter((p) => {
      if (!p.appointmentId || !p.patientId) return false;
      if (p.kind && p.kind !== "payment") return false;
      if (p.creditEarned !== null && p.creditEarned !== undefined) return false;
      if (!Number.isFinite(p.amount) || p.amount <= 0) return false;
      return true;
    });

    if (candidates.length === 0) {
      const summary = {
        organizationId: String(organizationId),
        paymentsScanned: completedPayments.length,
        paymentsUpdated: 0,
        totalCreditBackfilled: 0,
        dryRun,
      };
      console.log(
        `${prefix}backfillCreditEarned: nothing to do`,
        JSON.stringify(summary),
      );
      return summary;
    }

    const appointmentIds = Array.from(
      new Set(candidates.map((p) => String(p.appointmentId))),
    );
    const appointments = (await db.getMany(
      "gabinetAppointments",
      appointmentIds,
    )) as AppointmentRow[];
    const appointmentById = new Map<string, AppointmentRow>();
    for (const a of appointments) appointmentById.set(String(a._id), a);

    const treatmentIds = Array.from(
      new Set(
        appointments
          .map((a) => a.treatmentId)
          .filter((id): id is string => !!id),
      ),
    );
    const treatments = (await db.getMany(
      "gabinetTreatments",
      treatmentIds,
    )) as TreatmentRow[];
    const treatmentById = new Map<string, TreatmentRow>();
    for (const t of treatments) treatmentById.set(String(t._id), t);

    let paymentsUpdated = 0;
    let totalCreditBackfilled = 0;
    let skippedNoAppointment = 0;
    let skippedNoTreatment = 0;
    let skippedNoPrice = 0;
    let skippedNoOverpayment = 0;

    for (const p of candidates) {
      const appt = appointmentById.get(String(p.appointmentId));
      if (!appt) {
        skippedNoAppointment++;
        continue;
      }
      if (!appt.treatmentId) {
        skippedNoTreatment++;
        continue;
      }
      const treatment = treatmentById.get(String(appt.treatmentId));
      if (!treatment) {
        skippedNoTreatment++;
        continue;
      }
      const price = treatment.price ?? 0;
      if (!Number.isFinite(price) || price <= 0) {
        skippedNoPrice++;
        continue;
      }

      const excess = Math.round((p.amount - price) * 100) / 100;
      if (excess <= EPSILON) {
        skippedNoOverpayment++;
        continue;
      }

      if (!dryRun) {
        await db.patch("payments", p._id, {
          creditEarned: excess,
          updatedAt: Date.now(),
        });
      }
      paymentsUpdated++;
      totalCreditBackfilled =
        Math.round((totalCreditBackfilled + excess) * 100) / 100;
      console.log(
        `${prefix}payment ${p._id}: amount=${p.amount}, price=${price}, creditEarned=${excess}`,
      );
    }

    const summary = {
      organizationId: String(organizationId),
      paymentsScanned: completedPayments.length,
      candidatesConsidered: candidates.length,
      paymentsUpdated,
      totalCreditBackfilled,
      skippedNoAppointment,
      skippedNoTreatment,
      skippedNoPrice,
      skippedNoOverpayment,
      dryRun,
    };
    console.log(
      `${prefix}backfillCreditEarned complete:`,
      JSON.stringify(summary),
    );
    return summary;
  },
});
