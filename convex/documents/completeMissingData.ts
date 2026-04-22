import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { createSupabaseDb } from "../_helpers/supabaseDb";

/**
 * Patch missing entity fields that a document template requires.
 *
 * The frontend sends a flat map like:
 *   { "patient.pesel": "12345678901", "patient.address.city": "Warszawa" }
 *
 * The action groups by entity prefix, resolves the entity record, and patches
 * only the provided fields. Nested address fields are merged into the existing
 * address object. All reads/writes go directly to Supabase.
 */
export const completeMissingData = action({
  args: {
    organizationId: v.id("organizations"),
    entityType: v.string(),
    entityId: v.string(),
    data: v.record(v.string(), v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.runQuery(internal._helpers.authAction.verifyOrgAccess, {
      organizationId: args.organizationId,
    });

    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);

    // Group data by entity prefix
    const grouped: Record<string, Record<string, string>> = {};
    for (const [path, value] of Object.entries(args.data)) {
      const dotIdx = path.indexOf(".");
      if (dotIdx === -1) continue;
      const prefix = path.substring(0, dotIdx);
      const field = path.substring(dotIdx + 1);
      if (!grouped[prefix]) grouped[prefix] = {};
      grouped[prefix][field] = value;
    }

    for (const [entityPrefix, fields] of Object.entries(grouped)) {
      switch (entityPrefix) {
        case "patient": {
          let patientId: string | null = null;

          if (args.entityType === "patient") {
            patientId = args.entityId;
          } else if (args.entityType === "appointment") {
            const appointment = await db.get("gabinetAppointments", args.entityId);
            if (
              appointment &&
              String(appointment.organizationId) === orgIdStr
            ) {
              patientId = String(appointment.patientId);
            }
          }

          if (!patientId) continue;
          const patient = await db.get("gabinetPatients", patientId);
          if (!patient || String(patient.organizationId) !== orgIdStr) continue;

          const update: Record<string, unknown> = {};
          for (const [field, value] of Object.entries(fields)) {
            if (field.startsWith("address.")) {
              const addrField = field.substring("address.".length);
              if (!update.address) {
                update.address = {
                  ...((patient.address as Record<string, unknown> | undefined) ?? {}),
                };
              }
              (update.address as Record<string, unknown>)[addrField] = value;
            } else {
              update[field] = value;
            }
          }
          await db.patch("gabinetPatients", patientId, update);
          break;
        }

        case "contact": {
          let contactId: string | null = null;

          if (args.entityType === "contact") {
            contactId = args.entityId;
          } else if (args.entityType === "patient") {
            const patient = await db.get("gabinetPatients", args.entityId);
            if (patient?.contactId) {
              contactId = String(patient.contactId);
            }
          } else if (args.entityType === "appointment") {
            const appointment = await db.get("gabinetAppointments", args.entityId);
            if (
              appointment &&
              String(appointment.organizationId) === orgIdStr
            ) {
              const patient = await db.get(
                "gabinetPatients",
                String(appointment.patientId),
              );
              if (patient?.contactId) {
                contactId = String(patient.contactId);
              }
            }
          } else if (args.entityType === "lead") {
            const rels = await db
              .query("objectRelationships")
              .eq("sourceType", "lead")
              .eq("sourceId", args.entityId)
              .collect();
            const contactRel = rels.find((r) => r.targetType === "contact");
            if (contactRel) {
              contactId = String(contactRel.targetId);
            }
          }

          if (!contactId) continue;
          const contact = await db.get("contacts", contactId);
          if (!contact || String(contact.organizationId) !== orgIdStr) continue;

          const update: Record<string, unknown> = {};
          for (const [field, value] of Object.entries(fields)) {
            update[field] = value;
          }
          await db.patch("contacts", contactId, update);
          break;
        }

        case "company": {
          let companyId: string | null = null;

          if (args.entityType === "company") {
            companyId = args.entityId;
          } else if (args.entityType === "lead") {
            const lead = await db.get("leads", args.entityId);
            if (lead?.companyId) {
              companyId = String(lead.companyId);
            }
          }

          if (!companyId) continue;
          const company = await db.get("companies", companyId);
          if (!company || String(company.organizationId) !== orgIdStr) continue;

          const update: Record<string, unknown> = {};
          for (const [field, value] of Object.entries(fields)) {
            if (field.startsWith("address.")) {
              const addrField = field.substring("address.".length);
              if (!update.address) {
                update.address = {
                  ...((company.address as Record<string, unknown> | undefined) ?? {}),
                };
              }
              (update.address as Record<string, unknown>)[addrField] = value;
            } else {
              update[field] = value;
            }
          }
          await db.patch("companies", companyId, update);
          break;
        }

        // system.* and organization.* are always available — skip
        case "system":
        case "organization":
          continue;

        default:
          // Unknown prefix — silently skip
          continue;
      }
    }
  },
});
