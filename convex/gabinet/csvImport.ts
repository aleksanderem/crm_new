import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { v } from "convex/values";
import { GabinetEmployeeRole, gabinetEmployeeRoleValidator } from "../schema";

const ALLOWED_EMPLOYEE_ROLES = gabinetEmployeeRoleValidator.members.map(
  (m) => m.value,
) as GabinetEmployeeRole[];

/**
 * Batch-import patients from CSV. Unlike the single-record `patients.create`,
 * this skips the duplicate guard so that real migration data is not blocked by
 * email/phone collisions with existing records — errors are surfaced per-row.
 */
export const batchImportPatients = action({
  args: {
    organizationId: v.id("organizations"),
    records: v.array(
      v.object({
        firstName: v.string(),
        lastName: v.optional(v.string()),
        email: v.optional(v.string()),
        phone: v.optional(v.string()),
        pesel: v.optional(v.string()),
        dateOfBirth: v.optional(v.string()),
        gender: v.optional(v.string()),
        allergies: v.optional(v.string()),
        bloodType: v.optional(v.string()),
        medicalNotes: v.optional(v.string()),
        emergencyContactName: v.optional(v.string()),
        emergencyContactPhone: v.optional(v.string()),
        referralSource: v.optional(v.string()),
        addressStreet: v.optional(v.string()),
        addressCity: v.optional(v.string()),
        addressPostalCode: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    if (!["owner", "admin"].includes((authResult as any).role)) {
      throw new Error("Admin access required");
    }
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);
    const userIdStr = String((authResult as any).userId);
    const now = Date.now();

    let created = 0;
    const errors: { row: number; error: string }[] = [];

    for (let i = 0; i < args.records.length; i++) {
      const rec = args.records[i];
      try {
        if (!rec.firstName?.trim()) {
          errors.push({ row: i, error: "firstName is required" });
          continue;
        }

        const normalizedGender = (rec.gender?.trim().toLowerCase() ?? "") as
          | "male"
          | "female"
          | "other"
          | "";
        const genderValue =
          normalizedGender === "male" ||
          normalizedGender === "female" ||
          normalizedGender === "other"
            ? normalizedGender
            : null;

        const address =
          rec.addressStreet || rec.addressCity || rec.addressPostalCode
            ? {
                street: rec.addressStreet?.trim() ?? null,
                city: rec.addressCity?.trim() ?? null,
                postalCode: rec.addressPostalCode?.trim() ?? null,
              }
            : null;

        await db.insert("gabinetPatients", {
          organizationId: orgIdStr,
          firstName: rec.firstName.trim(),
          lastName: rec.lastName?.trim() ?? null,
          email: rec.email?.trim() ?? null,
          phone: rec.phone?.replace(/\D/g, "") || null,
          pesel: rec.pesel?.trim() ?? null,
          dateOfBirth: rec.dateOfBirth?.trim() ?? null,
          gender: genderValue,
          allergies: rec.allergies?.trim() ?? null,
          bloodType: rec.bloodType?.trim() ?? null,
          medicalNotes: rec.medicalNotes?.trim() ?? null,
          emergencyContactName: rec.emergencyContactName?.trim() ?? null,
          emergencyContactPhone: rec.emergencyContactPhone?.trim() ?? null,
          referralSource: rec.referralSource?.trim() ?? null,
          address,
          isActive: true,
          tags: [],
          createdBy: userIdStr,
          createdAt: now,
          updatedAt: now,
        });

        created++;
      } catch (e: any) {
        errors.push({ row: i, error: e?.message ?? "Unknown error" });
      }
    }

    return { created, errors };
  },
});

/**
 * Batch-import treatments from CSV. Creates treatment categories on the fly
 * (case-insensitive dedup) then inserts each treatment row.
 */
export const batchImportTreatments = action({
  args: {
    organizationId: v.id("organizations"),
    records: v.array(
      v.object({
        name: v.string(),
        category: v.optional(v.string()),
        duration: v.optional(v.string()),
        price: v.optional(v.string()),
        currency: v.optional(v.string()),
        description: v.optional(v.string()),
        color: v.optional(v.string()),
        contraindications: v.optional(v.string()),
        preparationInstructions: v.optional(v.string()),
        aftercareInstructions: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    if (!["owner", "admin"].includes((authResult as any).role)) {
      throw new Error("Admin access required");
    }
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);
    const userIdStr = String((authResult as any).userId);
    const now = Date.now();

    // Build a category name → id map, fetching existing first then creating new ones.
    const existingCats = (await db
      .query("categoryDefinitions")
      .eq("organizationId", orgIdStr)
      .collect()) as Array<{ _id: unknown; name: unknown }>;

    const categoryIdByNameLower = new Map<string, string>(
      existingCats.map((c) => [String(c.name).toLowerCase(), String(c._id)]),
    );

    let created = 0;
    const errors: { row: number; error: string }[] = [];

    for (let i = 0; i < args.records.length; i++) {
      const rec = args.records[i];
      try {
        if (!rec.name?.trim()) {
          errors.push({ row: i, error: "name is required" });
          continue;
        }

        // Resolve / create category
        let categoryId: string | null = null;
        if (rec.category?.trim()) {
          const catLower = rec.category.trim().toLowerCase();
          if (categoryIdByNameLower.has(catLower)) {
            categoryId = categoryIdByNameLower.get(catLower)!;
          } else {
            const newId = await db.insert("categoryDefinitions", {
              organizationId: orgIdStr,
              entityType: "gabinetTreatment" as const,
              name: rec.category.trim(),
              sortOrder: categoryIdByNameLower.size,
              createdAt: now,
              updatedAt: now,
            });
            categoryId = String(newId);
            categoryIdByNameLower.set(catLower, categoryId);
          }
        }

        const duration = rec.duration ? parseInt(rec.duration, 10) : null;
        const price = rec.price ? parseFloat(rec.price) : null;

        if (!duration || isNaN(duration) || duration <= 0) {
          errors.push({ row: i, error: `Invalid duration: "${rec.duration ?? ""}"` });
          continue;
        }
        if (price === null || isNaN(price) || price < 0) {
          errors.push({ row: i, error: `Invalid price: "${rec.price ?? ""}"` });
          continue;
        }

        await db.insert("gabinetTreatments", {
          organizationId: orgIdStr,
          name: rec.name.trim(),
          categoryId: categoryId ?? null,
          duration,
          price,
          currency: rec.currency?.trim() || "PLN",
          description: rec.description?.trim() ?? null,
          color: rec.color?.trim() ?? null,
          contraindications: rec.contraindications?.trim() ?? null,
          preparationInstructions: rec.preparationInstructions?.trim() ?? null,
          aftercareInstructions: rec.aftercareInstructions?.trim() ?? null,
          isActive: true,
          sortOrder: i,
          createdBy: userIdStr,
          createdAt: now,
          updatedAt: now,
        });

        created++;
      } catch (e: any) {
        errors.push({ row: i, error: e?.message ?? "Unknown error" });
      }
    }

    return { created, errors };
  },
});

/**
 * Batch-import employees from CSV.
 *
 * Email matching: every row MUST supply an `email` that matches an existing org
 * team member. Rows without an email, or whose email doesn't match any member,
 * are skipped with an error — unlinked records (userId = null) are not allowed.
 *
 * Duplicate guard: if a user-matched employee already has a `gabinetEmployees`
 * row in this org, that row is skipped with an error (not created again).
 */
export const batchImportEmployees = action({
  args: {
    organizationId: v.id("organizations"),
    records: v.array(
      v.object({
        firstName: v.string(),
        lastName: v.optional(v.string()),
        email: v.optional(v.string()),
        role: v.optional(v.string()),
        specialization: v.optional(v.string()),
        licenseNumber: v.optional(v.string()),
        phone: v.optional(v.string()),
        hireDate: v.optional(v.string()),
        color: v.optional(v.string()),
        notes: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    if (!["owner", "admin"].includes((authResult as any).role)) {
      throw new Error("Admin access required");
    }
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);
    const userIdStr = String((authResult as any).userId);
    const now = Date.now();

    // Build email → userId map from org team members.
    const memberships = (await db
      .query("teamMemberships")
      .eq("organizationId", orgIdStr)
      .collect()) as Array<{ userId: unknown }>;

    const memberUserIds = memberships.map((m) => String(m.userId)).filter(Boolean);
    const memberUsers =
      memberUserIds.length > 0
        ? ((await db.getMany("users", memberUserIds)) as Array<{
            _id: unknown;
            email: unknown;
          } | null>)
        : [];

    const emailToUserId = new Map<string, string>();
    for (const u of memberUsers) {
      if (u && u.email && typeof u.email === "string" && u._id) {
        emailToUserId.set(u.email.toLowerCase().trim(), String(u._id));
      }
    }

    // Pre-fetch existing employee rows to detect duplicates in O(1).
    const existingEmployees = (await db
      .query("gabinetEmployees")
      .eq("organizationId", orgIdStr)
      .collect()) as Array<{ userId: unknown }>;

    const existingUserIds = new Set(
      existingEmployees
        .map((e) => (e.userId ? String(e.userId) : null))
        .filter((id): id is string => id !== null),
    );

    let created = 0;
    const errors: { row: number; error: string }[] = [];

    for (let i = 0; i < args.records.length; i++) {
      const rec = args.records[i];
      try {
        if (!rec.firstName?.trim()) {
          errors.push({ row: i, error: "firstName is required" });
          continue;
        }

        // Resolve userId from email — required; skip if no match.
        if (!rec.email?.trim()) {
          errors.push({ row: i, error: "email is required to link employee to a user account" });
          continue;
        }
        const matchedUserId = emailToUserId.get(rec.email.trim().toLowerCase()) ?? null;
        if (!matchedUserId) {
          errors.push({ row: i, error: `No org member found with email ${rec.email} — invite them first` });
          continue;
        }

        // Skip if this org user already has an employee profile.
        if (existingUserIds.has(matchedUserId)) {
          errors.push({
            row: i,
            error: `Employee profile already exists for ${rec.email}`,
          });
          continue;
        }

        const safeRole: GabinetEmployeeRole =
          rec.role &&
          ALLOWED_EMPLOYEE_ROLES.includes(
            rec.role as GabinetEmployeeRole,
          )
            ? (rec.role as GabinetEmployeeRole)
            : "other";

        const newEmployeeId = await db.insert("gabinetEmployees", {
          organizationId: orgIdStr,
          userId: matchedUserId,
          firstName: rec.firstName.trim(),
          lastName: rec.lastName?.trim() ?? null,
          role: safeRole,
          specialization: rec.specialization?.trim() ?? null,
          licenseNumber: rec.licenseNumber?.trim() ?? null,
          phone: rec.phone?.replace(/\D/g, "") || null,
          hireDate: rec.hireDate?.trim() ?? null,
          color: rec.color?.trim() ?? null,
          notes: rec.notes?.trim() ?? null,
          isActive: true,
          qualifiedTreatmentIds: [],
          showInCalendar: true,
          tagIds: null,
          categoryId: null,
          createdBy: userIdStr,
          createdAt: now,
          updatedAt: now,
        });

        // Mirror gabinet role into Convex so permission checks work.
        existingUserIds.add(matchedUserId);
        try {
          await ctx.runMutation(internal.gabinet.employees._upsertMembership, {
            organizationId: args.organizationId,
            userId: matchedUserId,
            gabinetRole: safeRole,
            isActive: true,
          });
        } catch {
          // Non-fatal: membership mirror failure doesn't block the import
        }

        void newEmployeeId;
        created++;
      } catch (e: any) {
        errors.push({ row: i, error: e?.message ?? "Unknown error" });
      }
    }

    return { created, errors };
  },
});

/**
 * Batch-import patient package balances from CSV.
 *
 * Each row creates one `gabinetPackageUsage` record. Patients are matched by
 * email (primary) or firstName+lastName (fallback). Treatments are matched by
 * name (case-insensitive). An auto-generated package per treatment is found or
 * created, matching the behaviour of `packages.purchaseTreatment`.
 *
 * Prerequisite: patients and treatments must already be imported.
 */
export const batchImportPackageBalances = action({
  args: {
    organizationId: v.id("organizations"),
    records: v.array(
      v.object({
        treatmentName: v.string(),
        totalSessions: v.string(),
        patientEmail: v.optional(v.string()),
        patientFirstName: v.optional(v.string()),
        patientLastName: v.optional(v.string()),
        usedSessions: v.optional(v.string()),
        purchasedAt: v.optional(v.string()),
        paidAmount: v.optional(v.string()),
        paymentMethod: v.optional(v.string()),
        expiresAt: v.optional(v.string()),
        status: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runAction(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    if (!["owner", "admin"].includes((authResult as any).role)) {
      throw new Error("Admin access required");
    }
    await ctx.runQuery(internal._helpers.products.verifyGabinetAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);
    const userIdStr = String((authResult as any).userId);
    const now = Date.now();

    // Pre-load all patients and treatments for O(1) lookup per row.
    const [allPatients, allTreatments] = await Promise.all([
      db.query("gabinetPatients").eq("organizationId", orgIdStr).collect() as Promise<Array<{ _id: unknown; firstName: unknown; lastName: unknown; email: unknown }>>,
      db.query("gabinetTreatments").eq("organizationId", orgIdStr).collect() as Promise<Array<{ _id: unknown; name: unknown; price: unknown; currency: unknown; treatmentCount: unknown }>>,
    ]);

    const patientByEmail = new Map<string, string>();
    const patientByName = new Map<string, string>();
    for (const p of allPatients) {
      if (p.email && typeof p.email === "string") {
        patientByEmail.set(p.email.toLowerCase().trim(), String(p._id));
      }
      const fullName = `${String(p.firstName ?? "").toLowerCase().trim()} ${String(p.lastName ?? "").toLowerCase().trim()}`.trim();
      if (fullName) patientByName.set(fullName, String(p._id));
    }

    const treatmentByNameLower = new Map<string, typeof allTreatments[number]>();
    for (const t of allTreatments) {
      if (t.name && typeof t.name === "string") {
        treatmentByNameLower.set(t.name.toLowerCase().trim(), t);
      }
    }

    // Cache: treatmentId → auto-package id (to avoid re-querying per row)
    const autoPackageByTreatment = new Map<string, string>();

    let created = 0;
    const errors: { row: number; error: string }[] = [];

    for (let i = 0; i < args.records.length; i++) {
      const rec = args.records[i];
      try {
        if (!rec.treatmentName?.trim()) {
          errors.push({ row: i, error: "treatmentName is required" });
          continue;
        }
        const totalSessions = parseInt(rec.totalSessions ?? "", 10);
        if (isNaN(totalSessions) || totalSessions < 1) {
          errors.push({ row: i, error: `Invalid totalSessions: "${rec.totalSessions ?? ""}"` });
          continue;
        }

        // Resolve patient by email first, then full name
        let patientId: string | null = null;
        if (rec.patientEmail?.trim()) {
          patientId = patientByEmail.get(rec.patientEmail.trim().toLowerCase()) ?? null;
        }
        if (!patientId && (rec.patientFirstName?.trim() || rec.patientLastName?.trim())) {
          const nameLookup = `${(rec.patientFirstName ?? "").toLowerCase().trim()} ${(rec.patientLastName ?? "").toLowerCase().trim()}`.trim();
          patientId = patientByName.get(nameLookup) ?? null;
        }

        // Resolve treatment by name
        const treatment = treatmentByNameLower.get(rec.treatmentName.trim().toLowerCase());
        if (!treatment) {
          errors.push({ row: i, error: `Treatment not found: "${rec.treatmentName}"` });
          continue;
        }
        const treatmentId = String(treatment._id);

        // Find or create auto-generated package for this treatment
        let packageId = autoPackageByTreatment.get(treatmentId);
        if (!packageId) {
          const existing = await db
            .query("gabinetTreatmentPackages")
            .eq("organizationId", orgIdStr)
            .eq("autoGeneratedForTreatmentId", treatmentId)
            .first() as { _id: unknown } | null;

          if (existing) {
            packageId = String(existing._id);
          } else {
            const treatmentName = String(treatment.name ?? "Treatment");
            const treatmentPrice = (treatment.price as number) ?? 0;
            const treatmentCurrency = (treatment.currency as string | null) ?? null;
            const defaultQuantity = (treatment.treatmentCount as number | undefined) ?? 1;

            packageId = await db.insert("gabinetTreatmentPackages", {
              organizationId: orgIdStr,
              name: `${treatmentName} (${defaultQuantity}x)`,
              treatments: [{ treatmentId, quantity: defaultQuantity }],
              totalPrice: treatmentPrice * defaultQuantity,
              currency: treatmentCurrency,
              isActive: true,
              autoGeneratedForTreatmentId: treatmentId,
              createdBy: userIdStr,
              createdAt: now,
              updatedAt: now,
            });
          }
          autoPackageByTreatment.set(treatmentId, packageId);
        }

        const usedSessions = rec.usedSessions ? parseInt(rec.usedSessions, 10) : 0;
        const safeUsed = isNaN(usedSessions) || usedSessions < 0 ? 0 : Math.min(usedSessions, totalSessions);

        const paidAmount = rec.paidAmount ? parseFloat(rec.paidAmount) : 0;
        const safePaid = isNaN(paidAmount) || paidAmount < 0 ? 0 : paidAmount;

        const purchasedAt = rec.purchasedAt ? new Date(rec.purchasedAt).getTime() : now;
        const safePurchasedAt = isNaN(purchasedAt) ? now : purchasedAt;

        const expiresAt = rec.expiresAt ? new Date(rec.expiresAt).getTime() : null;
        const safeExpiresAt = expiresAt && !isNaN(expiresAt) ? expiresAt : null;

        const ALLOWED_STATUSES = ["active", "completed", "cancelled"] as const;
        type AllowedStatus = typeof ALLOWED_STATUSES[number];
        const derivedStatus: AllowedStatus = safeUsed >= totalSessions ? "completed" : "active";
        const rawStatus = rec.status?.trim().toLowerCase() ?? "";
        const status: AllowedStatus = (ALLOWED_STATUSES as readonly string[]).includes(rawStatus)
          ? (rawStatus as AllowedStatus)
          : derivedStatus;

        await db.insert("gabinetPackageUsage", {
          organizationId: orgIdStr,
          patientId: patientId ?? null,
          packageId,
          purchasedAt: safePurchasedAt,
          expiresAt: safeExpiresAt,
          status,
          treatmentsUsed: [
            {
              treatmentId,
              usedCount: safeUsed,
              totalCount: totalSessions,
            },
          ],
          paidAmount: safePaid,
          paymentMethod: rec.paymentMethod?.trim() ?? null,
          isGift: false,
          voucherCode: null,
          giftRecipientName: null,
          giftRecipientPhone: null,
          giftRecipientEmail: null,
          soldByEmployeeId: null,
          createdBy: userIdStr,
          createdAt: now,
          updatedAt: now,
        });

        created++;
      } catch (e: any) {
        errors.push({ row: i, error: e?.message ?? "Unknown error" });
      }
    }

    return { created, errors };
  },
});
