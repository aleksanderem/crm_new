import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { v } from "convex/values";

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
