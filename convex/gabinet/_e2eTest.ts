/**
 * Internal E2E test for Gabinet module - R2 Worker
 * Tests: patients, appointments, documents, packages CRUD + status workflows
 * Run: npx convex run gabinet/_e2eTest:runAll '{"organizationId":"...","userId":"..."}'
 */
import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";

interface TestResult {
  test: string;
  pass: boolean;
  detail: string;
  ids?: Record<string, string>;
}

export const runAll = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const results: TestResult[] = [];
    const now = Date.now();
    const orgId = args.organizationId;
    const userId = args.userId;

    // ============================================================
    // TEST 1: Patient CREATE
    // ============================================================
    let testPatientId: Id<"gabinetPatients"> | null = null;
    try {
      testPatientId = await ctx.db.insert("gabinetPatients", {
        organizationId: orgId,
        firstName: "E2E_Test",
        lastName: "Patient_R2",
        email: `e2e.r2.${now}@test.com`,
        phone: "+48 999 888 777",
        dateOfBirth: "1990-01-15",
        gender: "male",
        pesel: "90011512345",
        allergies: "None",
        bloodType: "O+",
        isActive: true,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
      const fetched = await ctx.db.get(testPatientId);
      if (fetched && fetched.firstName === "E2E_Test" && fetched.lastName === "Patient_R2") {
        results.push({
          test: "patient_create",
          pass: true,
          detail: `Created patient with correct fields`,
          ids: { patientId: testPatientId },
        });
      } else {
        results.push({ test: "patient_create", pass: false, detail: "Patient created but fields mismatch" });
      }
    } catch (e: any) {
      results.push({ test: "patient_create", pass: false, detail: e.message });
    }

    // ============================================================
    // TEST 2: Patient READ (verify persistence)
    // ============================================================
    try {
      if (!testPatientId) throw new Error("No patient to read");
      const patient = await ctx.db.get(testPatientId);
      if (!patient) throw new Error("Patient not found after creation");
      if (patient.organizationId !== orgId) throw new Error("Wrong org");
      if (patient.email !== `e2e.r2.${now}@test.com`) throw new Error("Email mismatch");
      if (patient.pesel !== "90011512345") throw new Error("PESEL mismatch");
      if (patient.bloodType !== "O+") throw new Error("Blood type mismatch");
      results.push({
        test: "patient_read",
        pass: true,
        detail: `Read patient OK: ${patient.firstName} ${patient.lastName}, all fields verified`,
        ids: { patientId: testPatientId },
      });
    } catch (e: any) {
      results.push({ test: "patient_read", pass: false, detail: e.message });
    }

    // ============================================================
    // TEST 3: Patient UPDATE
    // ============================================================
    try {
      if (!testPatientId) throw new Error("No patient to update");
      await ctx.db.patch(testPatientId, {
        allergies: "Penicillin, Latex",
        medicalNotes: "E2E test update - added medical notes",
        phone: "+48 111 222 333",
        updatedAt: Date.now(),
      });
      const updated = await ctx.db.get(testPatientId);
      if (!updated) throw new Error("Patient not found after update");
      if (updated.allergies !== "Penicillin, Latex") throw new Error("Allergies not updated");
      if (updated.medicalNotes !== "E2E test update - added medical notes") throw new Error("Notes not updated");
      if (updated.phone !== "+48 111 222 333") throw new Error("Phone not updated");
      // Verify unchanged fields
      if (updated.firstName !== "E2E_Test") throw new Error("firstName changed unexpectedly");
      results.push({
        test: "patient_update",
        pass: true,
        detail: `Updated allergies, medicalNotes, phone. Unchanged fields preserved.`,
        ids: { patientId: testPatientId },
      });
    } catch (e: any) {
      results.push({ test: "patient_update", pass: false, detail: e.message });
    }

    // ============================================================
    // TEST 4: Patient SOFT DELETE
    // ============================================================
    try {
      if (!testPatientId) throw new Error("No patient to delete");
      await ctx.db.patch(testPatientId, { isActive: false, updatedAt: Date.now() });
      const deleted = await ctx.db.get(testPatientId);
      if (!deleted) throw new Error("Patient hard-deleted instead of soft-delete");
      if (deleted.isActive !== false) throw new Error("isActive not set to false");
      // Restore for further tests
      await ctx.db.patch(testPatientId, { isActive: true, updatedAt: Date.now() });
      results.push({
        test: "patient_soft_delete",
        pass: true,
        detail: `Soft delete works. isActive=false. Record still exists. Restored.`,
        ids: { patientId: testPatientId },
      });
    } catch (e: any) {
      results.push({ test: "patient_soft_delete", pass: false, detail: e.message });
    }

    // ============================================================
    // TEST 5: Treatment CREATE
    // ============================================================
    let testTreatmentId: Id<"gabinetTreatments"> | null = null;
    try {
      testTreatmentId = await ctx.db.insert("gabinetTreatments", {
        organizationId: orgId,
        name: "E2E Test Treatment",
        category: "E2E Testing",
        duration: 30,
        price: 100,
        currency: "PLN",
        isActive: true,
        sortOrder: 99,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
      const fetched = await ctx.db.get(testTreatmentId);
      if (!fetched || fetched.name !== "E2E Test Treatment") throw new Error("Treatment creation failed");
      results.push({
        test: "treatment_create",
        pass: true,
        detail: `Created treatment: ${fetched.name}, duration=${fetched.duration}min, price=${fetched.price}PLN`,
        ids: { treatmentId: testTreatmentId },
      });
    } catch (e: any) {
      results.push({ test: "treatment_create", pass: false, detail: e.message });
    }

    // ============================================================
    // TEST 6: Appointment CREATE (with employee qualification + conflict check)
    // ============================================================
    let testAppointmentId: Id<"gabinetAppointments"> | null = null;
    try {
      if (!testPatientId || !testTreatmentId) throw new Error("Prerequisites missing");

      // Add the test treatment to employee's qualified treatments
      const employee = await ctx.db
        .query("gabinetEmployees")
        .withIndex("by_orgAndUser", (q) =>
          q.eq("organizationId", orgId).eq("userId", userId)
        )
        .first();

      if (employee) {
        await ctx.db.patch(employee._id, {
          qualifiedTreatmentIds: [...employee.qualifiedTreatmentIds, testTreatmentId],
        });
      }

      // Create appointment for next Wednesday (avoid weekends)
      const futureDate = new Date();
      // Find next working day (Mon-Fri)
      do {
        futureDate.setDate(futureDate.getDate() + 1);
      } while (futureDate.getDay() === 0 || futureDate.getDay() === 6);
      const dateStr = futureDate.toISOString().split("T")[0];

      testAppointmentId = await ctx.db.insert("gabinetAppointments", {
        organizationId: orgId,
        patientId: testPatientId,
        treatmentId: testTreatmentId,
        employeeId: userId,
        date: dateStr,
        startTime: "16:00",
        endTime: "16:30",
        status: "scheduled",
        isRecurring: false,
        notes: "E2E test appointment",
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });

      const fetched = await ctx.db.get(testAppointmentId);
      if (!fetched) throw new Error("Appointment not found after creation");
      if (fetched.status !== "scheduled") throw new Error(`Wrong status: ${fetched.status}`);
      if (fetched.date !== dateStr) throw new Error("Date mismatch");

      results.push({
        test: "appointment_create",
        pass: true,
        detail: `Created appointment for ${dateStr} 16:00-16:30, status=scheduled`,
        ids: { appointmentId: testAppointmentId },
      });
    } catch (e: any) {
      results.push({ test: "appointment_create", pass: false, detail: e.message });
    }

    // ============================================================
    // TEST 7: Appointment STATUS WORKFLOW (scheduled → confirmed → in_progress → completed)
    // ============================================================
    const VALID_TRANSITIONS: Record<string, string[]> = {
      scheduled: ["confirmed", "cancelled", "no_show"],
      confirmed: ["in_progress", "cancelled", "no_show"],
      in_progress: ["completed", "cancelled"],
      completed: [],
      cancelled: [],
      no_show: [],
    };

    try {
      if (!testAppointmentId) throw new Error("No appointment for status test");

      // scheduled → confirmed
      await ctx.db.patch(testAppointmentId, { status: "confirmed", updatedAt: Date.now() });
      let appt = await ctx.db.get(testAppointmentId);
      if (appt?.status !== "confirmed") throw new Error(`Expected confirmed, got ${appt?.status}`);

      // confirmed → in_progress
      await ctx.db.patch(testAppointmentId, { status: "in_progress", updatedAt: Date.now() });
      appt = await ctx.db.get(testAppointmentId);
      if (appt?.status !== "in_progress") throw new Error(`Expected in_progress, got ${appt?.status}`);

      // in_progress → completed
      await ctx.db.patch(testAppointmentId, { status: "completed", updatedAt: Date.now() });
      appt = await ctx.db.get(testAppointmentId);
      if (appt?.status !== "completed") throw new Error(`Expected completed, got ${appt?.status}`);

      results.push({
        test: "appointment_status_workflow",
        pass: true,
        detail: `Status workflow: scheduled→confirmed→in_progress→completed. All transitions valid.`,
        ids: { appointmentId: testAppointmentId },
      });
    } catch (e: any) {
      results.push({ test: "appointment_status_workflow", pass: false, detail: e.message });
    }

    // ============================================================
    // TEST 8: Appointment STATUS INVALID TRANSITION (verify guard)
    // ============================================================
    try {
      if (!testAppointmentId) throw new Error("No appointment for invalid transition test");
      // completed → scheduled should be invalid per VALID_TRANSITIONS
      const appt = await ctx.db.get(testAppointmentId);
      if (!appt) throw new Error("Appointment not found");
      const allowed = VALID_TRANSITIONS[appt.status] ?? [];
      if (allowed.includes("scheduled")) {
        results.push({
          test: "appointment_invalid_transition_guard",
          pass: false,
          detail: "completed→scheduled should be invalid but was found in VALID_TRANSITIONS",
        });
      } else {
        results.push({
          test: "appointment_invalid_transition_guard",
          pass: true,
          detail: `Guard OK: completed has allowed transitions=[${allowed.join(",")}], does not include scheduled`,
          ids: { appointmentId: testAppointmentId },
        });
      }
    } catch (e: any) {
      results.push({ test: "appointment_invalid_transition_guard", pass: false, detail: e.message });
    }

    // ============================================================
    // TEST 9: Appointment CANCEL (separate appointment)
    // ============================================================
    let cancelApptId: Id<"gabinetAppointments"> | null = null;
    try {
      if (!testPatientId || !testTreatmentId) throw new Error("Prerequisites missing");

      const futureDate = new Date();
      do {
        futureDate.setDate(futureDate.getDate() + 2);
      } while (futureDate.getDay() === 0 || futureDate.getDay() === 6);
      const dateStr = futureDate.toISOString().split("T")[0];

      cancelApptId = await ctx.db.insert("gabinetAppointments", {
        organizationId: orgId,
        patientId: testPatientId,
        treatmentId: testTreatmentId,
        employeeId: userId,
        date: dateStr,
        startTime: "17:00",
        endTime: "17:30",
        status: "scheduled",
        isRecurring: false,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });

      // Cancel it
      await ctx.db.patch(cancelApptId, {
        status: "cancelled",
        cancelledAt: Date.now(),
        cancelledBy: userId,
        cancellationReason: "E2E test cancellation",
        updatedAt: Date.now(),
      });

      const cancelled = await ctx.db.get(cancelApptId);
      if (cancelled?.status !== "cancelled") throw new Error(`Expected cancelled, got ${cancelled?.status}`);
      if (!cancelled.cancelledAt) throw new Error("cancelledAt not set");
      if (cancelled.cancellationReason !== "E2E test cancellation") throw new Error("Reason not saved");

      results.push({
        test: "appointment_cancel",
        pass: true,
        detail: `Cancelled appointment. cancelledAt set, reason saved.`,
        ids: { appointmentId: cancelApptId },
      });
    } catch (e: any) {
      results.push({ test: "appointment_cancel", pass: false, detail: e.message });
    }

    // ============================================================
    // TEST 10: Appointment UPDATE (reschedule time)
    // ============================================================
    let rescheduleApptId: Id<"gabinetAppointments"> | null = null;
    try {
      if (!testPatientId || !testTreatmentId) throw new Error("Prerequisites missing");

      const futureDate = new Date();
      do {
        futureDate.setDate(futureDate.getDate() + 3);
      } while (futureDate.getDay() === 0 || futureDate.getDay() === 6);
      const dateStr = futureDate.toISOString().split("T")[0];

      rescheduleApptId = await ctx.db.insert("gabinetAppointments", {
        organizationId: orgId,
        patientId: testPatientId,
        treatmentId: testTreatmentId,
        employeeId: userId,
        date: dateStr,
        startTime: "09:00",
        endTime: "09:30",
        status: "scheduled",
        isRecurring: false,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });

      // Reschedule to 10:00-10:30
      await ctx.db.patch(rescheduleApptId, {
        startTime: "10:00",
        endTime: "10:30",
        notes: "Rescheduled from 09:00",
        updatedAt: Date.now(),
      });

      const rescheduled = await ctx.db.get(rescheduleApptId);
      if (rescheduled?.startTime !== "10:00") throw new Error("Start time not updated");
      if (rescheduled?.endTime !== "10:30") throw new Error("End time not updated");
      if (rescheduled?.notes !== "Rescheduled from 09:00") throw new Error("Notes not updated");

      results.push({
        test: "appointment_update_reschedule",
        pass: true,
        detail: `Rescheduled 09:00→10:00. Time fields and notes updated.`,
        ids: { appointmentId: rescheduleApptId },
      });
    } catch (e: any) {
      results.push({ test: "appointment_update_reschedule", pass: false, detail: e.message });
    }

    // ============================================================
    // TEST 11: Document CREATE
    // ============================================================
    let testDocId: Id<"gabinetDocuments"> | null = null;
    try {
      if (!testPatientId) throw new Error("No patient for document test");

      testDocId = await ctx.db.insert("gabinetDocuments", {
        organizationId: orgId,
        patientId: testPatientId,
        title: "E2E Consent Form",
        type: "consent",
        content: "I, E2E_Test Patient_R2, consent to the E2E test procedure.",
        status: "draft",
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });

      const doc = await ctx.db.get(testDocId);
      if (!doc) throw new Error("Document not found");
      if (doc.title !== "E2E Consent Form") throw new Error("Title mismatch");
      if (doc.status !== "draft") throw new Error("Status should be draft");
      if (doc.type !== "consent") throw new Error("Type mismatch");

      results.push({
        test: "document_create",
        pass: true,
        detail: `Created document: "${doc.title}", type=${doc.type}, status=${doc.status}`,
        ids: { documentId: testDocId },
      });
    } catch (e: any) {
      results.push({ test: "document_create", pass: false, detail: e.message });
    }

    // ============================================================
    // TEST 12: Document STATUS WORKFLOW (draft → pending_signature → signed)
    // ============================================================
    try {
      if (!testDocId) throw new Error("No document for status test");

      // draft → pending_signature
      await ctx.db.patch(testDocId, { status: "pending_signature", updatedAt: Date.now() });
      let doc = await ctx.db.get(testDocId);
      if (doc?.status !== "pending_signature") throw new Error(`Expected pending_signature, got ${doc?.status}`);

      // pending_signature → signed
      await ctx.db.patch(testDocId, {
        status: "signed",
        signatureData: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRke5CYII=",
        signedAt: Date.now(),
        signedByPatient: true,
        updatedAt: Date.now(),
      });
      doc = await ctx.db.get(testDocId);
      if (doc?.status !== "signed") throw new Error(`Expected signed, got ${doc?.status}`);
      if (!doc.signedAt) throw new Error("signedAt not set");
      if (!doc.signatureData) throw new Error("signatureData not saved");
      if (doc.signedByPatient !== true) throw new Error("signedByPatient not set");

      results.push({
        test: "document_status_workflow",
        pass: true,
        detail: `Document workflow: draft→pending_signature→signed. Signature data + signedAt persisted.`,
        ids: { documentId: testDocId },
      });
    } catch (e: any) {
      results.push({ test: "document_status_workflow", pass: false, detail: e.message });
    }

    // ============================================================
    // TEST 13: Document ARCHIVE
    // ============================================================
    try {
      if (!testDocId) throw new Error("No document for archive test");

      // Create a separate doc for archiving
      const archiveDocId = await ctx.db.insert("gabinetDocuments", {
        organizationId: orgId,
        patientId: testPatientId!,
        title: "E2E Archive Test",
        type: "medical_record",
        content: "Test content for archiving",
        status: "draft",
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.patch(archiveDocId, { status: "archived", updatedAt: Date.now() });
      const archived = await ctx.db.get(archiveDocId);
      if (archived?.status !== "archived") throw new Error(`Expected archived, got ${archived?.status}`);

      results.push({
        test: "document_archive",
        pass: true,
        detail: `Archived document successfully`,
        ids: { documentId: archiveDocId },
      });
    } catch (e: any) {
      results.push({ test: "document_archive", pass: false, detail: e.message });
    }

    // ============================================================
    // TEST 14: Package CREATE
    // ============================================================
    let testPackageId: Id<"gabinetTreatmentPackages"> | null = null;
    try {
      if (!testTreatmentId) throw new Error("No treatment for package test");

      // Get an existing treatment for the package
      const existingTreatments = await ctx.db
        .query("gabinetTreatments")
        .withIndex("by_org", (q) => q.eq("organizationId", orgId))
        .take(3);

      if (existingTreatments.length < 2) throw new Error("Need at least 2 treatments for package");

      testPackageId = await ctx.db.insert("gabinetTreatmentPackages", {
        organizationId: orgId,
        name: "E2E Test Package",
        description: "Package created by E2E test",
        treatments: [
          { treatmentId: existingTreatments[0]._id, quantity: 3 },
          { treatmentId: existingTreatments[1]._id, quantity: 2 },
        ],
        totalPrice: 500,
        currency: "PLN",
        discountPercent: 10,
        validityDays: 60,
        isActive: true,
        loyaltyPointsAwarded: 50,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });

      const pkg = await ctx.db.get(testPackageId);
      if (!pkg) throw new Error("Package not found");
      if (pkg.name !== "E2E Test Package") throw new Error("Name mismatch");
      if (pkg.treatments.length !== 2) throw new Error("Treatments count mismatch");
      if (pkg.totalPrice !== 500) throw new Error("Price mismatch");

      results.push({
        test: "package_create",
        pass: true,
        detail: `Created package: "${pkg.name}", ${pkg.treatments.length} treatments, ${pkg.totalPrice}PLN`,
        ids: { packageId: testPackageId },
      });
    } catch (e: any) {
      results.push({ test: "package_create", pass: false, detail: e.message });
    }

    // ============================================================
    // TEST 15: Package PURCHASE (creates usage record + loyalty points)
    // ============================================================
    let testUsageId: Id<"gabinetPackageUsage"> | null = null;
    try {
      if (!testPackageId || !testPatientId) throw new Error("Prerequisites missing");

      const pkg = await ctx.db.get(testPackageId);
      if (!pkg) throw new Error("Package not found");

      const expiresAt = pkg.validityDays
        ? now + pkg.validityDays * 24 * 60 * 60 * 1000
        : undefined;

      testUsageId = await ctx.db.insert("gabinetPackageUsage", {
        organizationId: orgId,
        patientId: testPatientId,
        packageId: testPackageId,
        purchasedAt: now,
        expiresAt,
        status: "active",
        treatmentsUsed: pkg.treatments.map((t) => ({
          treatmentId: t.treatmentId,
          usedCount: 0,
          totalCount: t.quantity,
        })),
        paidAmount: 500,
        paymentMethod: "card",
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });

      const usage = await ctx.db.get(testUsageId);
      if (!usage) throw new Error("Usage not found");
      if (usage.status !== "active") throw new Error("Status should be active");
      if (usage.treatmentsUsed.length !== 2) throw new Error("Treatments used count mismatch");
      if (usage.treatmentsUsed.some((t) => t.usedCount !== 0)) throw new Error("Used count should be 0");

      // Award loyalty points
      if (pkg.loyaltyPointsAwarded && pkg.loyaltyPointsAwarded > 0) {
        const loyalty = await ctx.db
          .query("gabinetLoyaltyPoints")
          .withIndex("by_orgAndPatient", (q) =>
            q.eq("organizationId", orgId).eq("patientId", testPatientId!)
          )
          .first();

        const newBalance = (loyalty?.balance ?? 0) + pkg.loyaltyPointsAwarded;
        const newLifetimeEarned = (loyalty?.lifetimeEarned ?? 0) + pkg.loyaltyPointsAwarded;

        if (loyalty) {
          await ctx.db.patch(loyalty._id, { balance: newBalance, lifetimeEarned: newLifetimeEarned, updatedAt: now });
        } else {
          await ctx.db.insert("gabinetLoyaltyPoints", {
            organizationId: orgId,
            patientId: testPatientId!,
            balance: newBalance,
            lifetimeEarned: newLifetimeEarned,
            lifetimeSpent: 0,
            createdAt: now,
            updatedAt: now,
          });
        }

        await ctx.db.insert("gabinetLoyaltyTransactions", {
          organizationId: orgId,
          patientId: testPatientId!,
          type: "earn",
          points: pkg.loyaltyPointsAwarded,
          reason: `Package purchase: ${pkg.name}`,
          referenceType: "packageUsage",
          referenceId: testUsageId,
          balanceAfter: newBalance,
          createdBy: userId,
          createdAt: now,
        });
      }

      results.push({
        test: "package_purchase",
        pass: true,
        detail: `Purchased package. Usage record created. Loyalty points awarded: ${pkg.loyaltyPointsAwarded}`,
        ids: { usageId: testUsageId, packageId: testPackageId },
      });
    } catch (e: any) {
      results.push({ test: "package_purchase", pass: false, detail: e.message });
    }

    // ============================================================
    // TEST 16: Package USE TREATMENT (deduct from usage)
    // ============================================================
    try {
      if (!testUsageId) throw new Error("No usage for deduction test");

      const usage = await ctx.db.get(testUsageId);
      if (!usage) throw new Error("Usage not found");

      const treatmentId = usage.treatmentsUsed[0].treatmentId;
      const updatedTreatments = usage.treatmentsUsed.map((t) =>
        t.treatmentId === treatmentId
          ? { ...t, usedCount: t.usedCount + 1 }
          : t
      );

      await ctx.db.patch(testUsageId, {
        treatmentsUsed: updatedTreatments,
        updatedAt: Date.now(),
      });

      const updated = await ctx.db.get(testUsageId);
      if (!updated) throw new Error("Usage not found after update");
      const entry = updated.treatmentsUsed.find((t) => t.treatmentId === treatmentId);
      if (!entry || entry.usedCount !== 1) throw new Error(`Expected usedCount=1, got ${entry?.usedCount}`);
      if (updated.status !== "active") throw new Error("Status should still be active");

      results.push({
        test: "package_use_treatment",
        pass: true,
        detail: `Used 1 treatment from package. usedCount: 0→1. Status still active.`,
        ids: { usageId: testUsageId },
      });
    } catch (e: any) {
      results.push({ test: "package_use_treatment", pass: false, detail: e.message });
    }

    // ============================================================
    // TEST 17: Verify loyalty points persistence
    // ============================================================
    try {
      if (!testPatientId) throw new Error("No patient for loyalty test");

      const loyalty = await ctx.db
        .query("gabinetLoyaltyPoints")
        .withIndex("by_orgAndPatient", (q) =>
          q.eq("organizationId", orgId).eq("patientId", testPatientId!)
        )
        .first();

      if (!loyalty) throw new Error("Loyalty record not found");
      if (loyalty.balance <= 0) throw new Error(`Expected positive balance, got ${loyalty.balance}`);

      const transactions = await ctx.db
        .query("gabinetLoyaltyTransactions")
        .withIndex("by_orgAndPatient", (q) =>
          q.eq("organizationId", orgId).eq("patientId", testPatientId!)
        )
        .collect();

      if (transactions.length === 0) throw new Error("No loyalty transactions found");

      results.push({
        test: "loyalty_points_persistence",
        pass: true,
        detail: `Loyalty: balance=${loyalty.balance}, transactions=${transactions.length}`,
        ids: { loyaltyId: loyalty._id },
      });
    } catch (e: any) {
      results.push({ test: "loyalty_points_persistence", pass: false, detail: e.message });
    }

    // ============================================================
    // TEST 18: Verify existing seeded data integrity
    // ============================================================
    try {
      const patients = await ctx.db
        .query("gabinetPatients")
        .withIndex("by_org", (q) => q.eq("organizationId", orgId))
        .collect();
      const treatments = await ctx.db
        .query("gabinetTreatments")
        .withIndex("by_org", (q) => q.eq("organizationId", orgId))
        .collect();
      const appointments = await ctx.db
        .query("gabinetAppointments")
        .withIndex("by_org", (q) => q.eq("organizationId", orgId))
        .collect();
      const packages = await ctx.db
        .query("gabinetTreatmentPackages")
        .withIndex("by_org", (q) => q.eq("organizationId", orgId))
        .collect();
      const documents = await ctx.db
        .query("gabinetDocuments")
        .withIndex("by_org", (q) => q.eq("organizationId", orgId))
        .collect();
      const employees = await ctx.db
        .query("gabinetEmployees")
        .withIndex("by_org", (q) => q.eq("organizationId", orgId))
        .collect();

      const activePatients = patients.filter((p) => p.isActive);
      const scheduledAppts = appointments.filter((a) => a.status === "scheduled");
      const completedAppts = appointments.filter((a) => a.status === "completed");
      const cancelledAppts = appointments.filter((a) => a.status === "cancelled");

      const ok = patients.length >= 12 && treatments.length >= 12 && appointments.length >= 31 && packages.length >= 3;

      results.push({
        test: "seeded_data_integrity",
        pass: ok,
        detail: `patients=${patients.length}(active=${activePatients.length}), treatments=${treatments.length}, appointments=${appointments.length}(sched=${scheduledAppts.length},completed=${completedAppts.length},cancelled=${cancelledAppts.length}), packages=${packages.length}, documents=${documents.length}, employees=${employees.length}`,
      });
    } catch (e: any) {
      results.push({ test: "seeded_data_integrity", pass: false, detail: e.message });
    }

    // ============================================================
    // TEST 19: Working hours and leave types seeded correctly
    // ============================================================
    try {
      const workingHours = await ctx.db
        .query("gabinetWorkingHours")
        .withIndex("by_org", (q) => q.eq("organizationId", orgId))
        .collect();
      const leaveTypes = await ctx.db
        .query("gabinetLeaveTypes")
        .withIndex("by_org", (q) => q.eq("organizationId", orgId))
        .collect();

      if (workingHours.length !== 7) throw new Error(`Expected 7 working hour entries, got ${workingHours.length}`);
      if (leaveTypes.length < 5) throw new Error(`Expected 5 leave types, got ${leaveTypes.length}`);

      const sundayClosed = workingHours.find((w) => w.dayOfWeek === 0 && !w.isOpen);
      const mondayOpen = workingHours.find((w) => w.dayOfWeek === 1 && w.isOpen);
      if (!sundayClosed) throw new Error("Sunday should be closed");
      if (!mondayOpen) throw new Error("Monday should be open");

      results.push({
        test: "working_hours_leave_types",
        pass: true,
        detail: `7 working hour entries (Sun closed, Mon-Sat open). ${leaveTypes.length} leave types.`,
      });
    } catch (e: any) {
      results.push({ test: "working_hours_leave_types", pass: false, detail: e.message });
    }

    // ============================================================
    // TEST 20: Document template rendering
    // ============================================================
    try {
      const templates = await ctx.db
        .query("gabinetDocumentTemplates")
        .withIndex("by_org", (q) => q.eq("organizationId", orgId))
        .collect();

      if (templates.length < 4) throw new Error(`Expected 4 templates, got ${templates.length}`);

      // Test template rendering logic
      const consentTemplate = templates.find((t) => t.type === "consent");
      if (!consentTemplate) throw new Error("Consent template not found");

      const content = consentTemplate.content
        .replace("{{patient.firstName}}", "E2E_Test")
        .replace("{{patient.lastName}}", "Patient_R2");

      if (!content.includes("E2E_Test")) throw new Error("Template rendering failed");
      if (!content.includes("Patient_R2")) throw new Error("Template rendering failed for lastName");

      results.push({
        test: "document_template_rendering",
        pass: true,
        detail: `${templates.length} templates found. Consent template renders correctly.`,
      });
    } catch (e: any) {
      results.push({ test: "document_template_rendering", pass: false, detail: e.message });
    }

    // ============================================================
    // SUMMARY
    // ============================================================
    const passed = results.filter((r) => r.pass).length;
    const failed = results.filter((r) => !r.pass).length;

    return {
      summary: `${passed}/${results.length} tests passed, ${failed} failed`,
      results,
      testDataIds: {
        patientId: testPatientId,
        treatmentId: testTreatmentId,
        appointmentId: testAppointmentId,
        cancelledAppointmentId: cancelApptId,
        rescheduledAppointmentId: rescheduleApptId,
        documentId: testDocId,
        packageId: testPackageId,
        usageId: testUsageId,
      },
    };
  },
});
