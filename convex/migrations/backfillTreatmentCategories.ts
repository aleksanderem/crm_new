import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { createSupabaseDb } from "../_helpers/supabaseDb";

// One-off migration for issue #492:
//
// Older `gabinetTreatments` rows store the category as a free-text `category`
// string. PR #471 retired writes to that column in favour of the structured
// `categoryId` FK into `categoryDefinitions` (entityType="gabinetTreatment"),
// but legacy rows still carry the raw string and a null `categoryId`. This
// action backfills those rows by:
//
//   1. Reading every gabinet treatment for the org.
//   2. Grouping treatments with `category` set and `categoryId` null by the
//      trimmed, lowercased category string.
//   3. For each distinct group, reusing an existing root-level
//      categoryDefinition with the same normalized name, or creating a new
//      one (entityType="gabinetTreatment").
//   4. Patching each treatment's `categoryId` to the resolved definition.
//
// Idempotent: re-runs only touch treatments whose `categoryId` is still null.
// Supports `dryRun: true` for inspection without writes.

type CategoryDefRow = {
  _id: string;
  organizationId: string;
  entityType: string;
  name: string;
  parentId: string | null;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  isDeleted: boolean | null;
};

type TreatmentRow = {
  _id: string;
  organizationId: string;
  category: string | null;
  categoryId: string | null;
};

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

export const backfillTreatmentCategories = internalAction({
  args: {
    organizationId: v.id("organizations"),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (_ctx, args) => {
    const { organizationId, dryRun = false } = args;
    const prefix = dryRun ? "[DRY RUN] " : "";
    const db = createSupabaseDb();

    const treatments = (await db
      .query("gabinetTreatments")
      .eq("organizationId", String(organizationId))
      .collect()) as TreatmentRow[];

    const allCategories = (await db
      .query("categoryDefinitions")
      .eq("organizationId", String(organizationId))
      .eq("entityType", "gabinetTreatment")
      .collect()) as CategoryDefRow[];

    const activeRootCategories = allCategories.filter(
      (c) => !c.isDeleted && !c.parentId,
    );

    // Map of normalized name → existing root-level categoryDefinition id.
    const byName = new Map<string, string>();
    for (const c of activeRootCategories) {
      byName.set(normalize(c.name), c._id);
    }

    let nextSortOrder =
      activeRootCategories.reduce(
        (max, c) => Math.max(max, c.sortOrder ?? 0),
        -1,
      ) + 1;

    const candidates = treatments.filter((t) => {
      if (t.categoryId) return false;
      const raw = (t.category ?? "").trim();
      return raw.length > 0;
    });

    console.log(
      `${prefix}Org ${organizationId}: ${candidates.length} of ${treatments.length} treatments need category backfill (${activeRootCategories.length} existing root categories)`,
    );

    let treatmentsLinked = 0;
    let categoriesCreated = 0;

    for (const t of candidates) {
      const rawCategory = (t.category ?? "").trim();
      const key = normalize(rawCategory);
      let catId = byName.get(key);

      if (!catId) {
        const now = Date.now();
        if (dryRun) {
          catId = `dry_run_new_${categoriesCreated}`;
        } else {
          catId = await db.insert("categoryDefinitions", {
            organizationId: String(organizationId),
            entityType: "gabinetTreatment",
            name: rawCategory,
            parentId: null,
            color: null,
            icon: null,
            sortOrder: nextSortOrder,
            createdAt: now,
            updatedAt: now,
          });
        }
        byName.set(key, catId);
        nextSortOrder++;
        categoriesCreated++;
        console.log(
          `${prefix}Created categoryDefinition "${rawCategory}" (id=${catId})`,
        );
      }

      if (!dryRun) {
        await db.patch("gabinetTreatments", t._id, {
          categoryId: catId,
          updatedAt: Date.now(),
        });
      }
      treatmentsLinked++;
    }

    const summary = {
      organizationId: String(organizationId),
      treatmentsScanned: treatments.length,
      treatmentsLinked,
      categoriesCreated,
      dryRun,
    };
    console.log(
      `${prefix}backfillTreatmentCategories complete:`,
      JSON.stringify(summary),
    );
    return summary;
  },
});
