import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";

// --- Helpers ---

function humanizeKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

const CATEGORY_MAP: Record<string, string> = {
  consent: "consent",
  medical_record: "report",
  prescription: "prescription",
  referral: "referral",
  custom: "custom",
};

const PLACEHOLDER_REGEX = /\{\{patient\.(\w+)\}\}/g;

function parseAndRewritePlaceholders(content: string): {
  rewrittenContent: string;
  fieldKeys: string[];
} {
  const fieldKeys: string[] = [];
  const seen = new Set<string>();

  // Collect unique field keys in order of appearance
  let match: RegExpExecArray | null;
  const regex = new RegExp(PLACEHOLDER_REGEX.source, "g");
  while ((match = regex.exec(content)) !== null) {
    const key = match[1];
    if (!seen.has(key)) {
      seen.add(key);
      fieldKeys.push(key);
    }
  }

  // Replace {{patient.X}} with {{field:X}}
  const rewrittenContent = content.replace(
    PLACEHOLDER_REGEX,
    (_full, key: string) => `{{field:${key}}}`
  );

  return { rewrittenContent, fieldKeys };
}

// --- Migration ---

export const migrateGabinetDocuments = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { organizationId, dryRun = false } = args;
    const prefix = dryRun ? "[DRY RUN] " : "";

    console.log(
      `${prefix}Starting Gabinet document migration for org ${organizationId}`
    );

    // -------------------------------------------------------
    // Step 1: Migrate gabinetDocumentTemplates → documentTemplates + documentTemplateFields
    // -------------------------------------------------------

    const oldTemplates = await ctx.db
      .query("gabinetDocumentTemplates")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .collect();

    console.log(`${prefix}Found ${oldTemplates.length} old templates`);

    // Map old template ID → new template ID
    const templateIdMap = new Map<
      Id<"gabinetDocumentTemplates">,
      Id<"documentTemplates">
    >();

    let templatesCreated = 0;
    let fieldsCreated = 0;

    for (const oldTemplate of oldTemplates) {
      const category = CATEGORY_MAP[oldTemplate.type] ?? "custom";

      // Parse placeholders and rewrite content
      const { rewrittenContent, fieldKeys } = oldTemplate.content
        ? parseAndRewritePlaceholders(oldTemplate.content)
        : { rewrittenContent: "", fieldKeys: [] };

      // Build signature slots
      const signatureSlots: Array<{
        id: string;
        role: "patient" | "employee";
        label: string;
      }> = [];
      if (oldTemplate.requiresSignature) {
        signatureSlots.push({
          id: "patient",
          role: "patient",
          label: "Podpis pacjenta",
        });
        signatureSlots.push({
          id: "employee",
          role: "employee",
          label: "Podpis pracownika",
        });
      }

      const newTemplateData = {
        organizationId,
        name: oldTemplate.name,
        category: category as
          | "contract"
          | "invoice"
          | "consent"
          | "referral"
          | "prescription"
          | "report"
          | "protocol"
          | "custom",
        content: rewrittenContent,
        module: "gabinet",
        requiredSources: ["patient"],
        requiresSignature: oldTemplate.requiresSignature,
        signatureSlots,
        accessControl: {
          mode: "all" as const,
          roles: [] as string[],
          userIds: [] as Id<"users">[],
        },
        version: 1,
        status: (oldTemplate.isActive ? "active" : "archived") as
          | "draft"
          | "active"
          | "archived",
        createdBy: oldTemplate.createdBy,
        createdAt: oldTemplate.createdAt,
        updatedAt: oldTemplate.updatedAt,
      };

      console.log(
        `${prefix}Template "${oldTemplate.name}" (${oldTemplate.type} → ${category}): ${fieldKeys.length} placeholder fields`
      );

      if (!dryRun) {
        const newTemplateId = await ctx.db.insert(
          "documentTemplates",
          newTemplateData
        );
        templateIdMap.set(oldTemplate._id, newTemplateId);
        templatesCreated++;

        // Create documentTemplateFields from parsed placeholders
        for (let i = 0; i < fieldKeys.length; i++) {
          const fieldKey = fieldKeys[i];
          await ctx.db.insert("documentTemplateFields", {
            templateId: newTemplateId,
            fieldKey,
            label: humanizeKey(fieldKey),
            type: "text",
            sortOrder: i,
            binding: {
              source: "patient",
              field: fieldKey,
            },
            width: "full",
          });
          fieldsCreated++;
        }
      } else {
        // In dry run, still track the mapping conceptually
        templateIdMap.set(
          oldTemplate._id,
          "dry_run_placeholder" as Id<"documentTemplates">
        );
      }
    }

    console.log(
      `${prefix}Templates: ${templatesCreated} created, ${fieldsCreated} fields created`
    );

    // -------------------------------------------------------
    // Step 2: Migrate gabinetDocuments → documentInstances
    // -------------------------------------------------------

    const oldDocuments = await ctx.db
      .query("gabinetDocuments")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .collect();

    console.log(`${prefix}Found ${oldDocuments.length} old documents`);

    let instancesCreated = 0;
    let skippedNoTemplate = 0;

    for (const oldDoc of oldDocuments) {
      // Resolve template ID
      let newTemplateId: Id<"documentTemplates"> | null = null;
      if (oldDoc.templateId) {
        newTemplateId = templateIdMap.get(oldDoc.templateId) ?? null;
      }

      if (!newTemplateId) {
        // Document has no template or template wasn't in this org's migration
        console.log(
          `${prefix}Skipping document "${oldDoc.title}" — no matching template (templateId: ${oldDoc.templateId ?? "none"})`
        );
        skippedNoTemplate++;
        continue;
      }

      // Map status
      const statusMap: Record<string, string> = {
        draft: "draft",
        pending_signature: "pending_signature",
        signed: "signed",
        archived: "archived",
      };
      const newStatus = (statusMap[oldDoc.status] ?? "draft") as
        | "draft"
        | "pending_review"
        | "approved"
        | "pending_signature"
        | "signed"
        | "archived";

      // Build signatures array
      const signatures: Array<{
        slotId: string;
        slotLabel: string;
        signatureData?: string;
        signedByUserId?: Id<"users">;
        signedByName?: string;
        signedAt?: number;
      }> = [];

      if (oldDoc.signatureData) {
        signatures.push({
          slotId: "patient",
          slotLabel: "Podpis pacjenta",
          signatureData: oldDoc.signatureData,
          signedAt: oldDoc.signedAt,
        });
      }

      if (oldDoc.signedByEmployee) {
        signatures.push({
          slotId: "employee",
          slotLabel: "Podpis pracownika",
          signedByUserId: oldDoc.signedByEmployee,
          signedAt: oldDoc.signedAt,
        });
      }

      const newInstanceData = {
        organizationId,
        templateId: newTemplateId,
        templateVersion: 1,
        title: oldDoc.title,
        renderedContent: oldDoc.content,
        fieldValues: {},
        resolvedSources: { patient: oldDoc.patientId as string },
        status: newStatus,
        module: "gabinet",
        signatures,
        createdBy: oldDoc.createdBy,
        createdAt: oldDoc.createdAt,
        updatedAt: oldDoc.updatedAt,
      };

      console.log(
        `${prefix}Document "${oldDoc.title}" (${oldDoc.status} → ${newStatus}): ${signatures.length} signatures`
      );

      if (!dryRun) {
        await ctx.db.insert("documentInstances", newInstanceData);
        instancesCreated++;
      }
    }

    console.log(
      `${prefix}Instances: ${instancesCreated} created, ${skippedNoTemplate} skipped (no template)`
    );

    const summary = {
      templatesFound: oldTemplates.length,
      templatesCreated: dryRun ? 0 : templatesCreated,
      fieldsCreated: dryRun ? 0 : fieldsCreated,
      documentsFound: oldDocuments.length,
      instancesCreated: dryRun ? 0 : instancesCreated,
      skippedNoTemplate,
      dryRun,
    };

    console.log(`${prefix}Migration complete:`, JSON.stringify(summary));

    return summary;
  },
});
