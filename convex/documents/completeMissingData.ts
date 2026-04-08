import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "../_helpers/auth";
import type { Id } from "../_generated/dataModel";

/**
 * Patch missing entity fields that a document template requires.
 *
 * The frontend sends a flat map like:
 *   { "patient.pesel": "12345678901", "patient.address.city": "Warszawa" }
 *
 * The mutation groups by entity prefix, resolves the entity record, and patches
 * only the provided fields. Nested address fields are merged into the existing
 * address object.
 */
export const completeMissingData = mutation({
  args: {
    organizationId: v.id("organizations"),
    entityType: v.string(),
    entityId: v.string(),
    data: v.record(v.string(), v.string()),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);

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
          // For patient entity type, use entityId directly.
          // For appointment entity type, resolve patientId from the appointment.
          let patientId: Id<"gabinetPatients"> | null = null;

          if (args.entityType === "patient") {
            patientId = args.entityId as Id<"gabinetPatients">;
          } else if (args.entityType === "appointment") {
            const appointment = await ctx.db.get(
              args.entityId as Id<"gabinetAppointments">,
            );
            if (appointment && appointment.organizationId === args.organizationId) {
              patientId = appointment.patientId;
            }
          }

          if (!patientId) continue;
          const patient = await ctx.db.get(patientId);
          if (!patient || patient.organizationId !== args.organizationId) continue;

          const update: Record<string, unknown> = {};
          for (const [field, value] of Object.entries(fields)) {
            if (field.startsWith("address.")) {
              const addrField = field.substring("address.".length);
              if (!update.address) {
                update.address = { ...(patient.address ?? {}) };
              }
              (update.address as Record<string, unknown>)[addrField] = value;
            } else {
              update[field] = value;
            }
          }
          await ctx.db.patch(patientId, update);
          break;
        }

        case "contact": {
          // For contact entity type, use entityId directly.
          // For patient entity type, resolve contactId from the patient.
          // For appointment entity type, resolve through patient.
          let contactId: Id<"contacts"> | null = null;

          if (args.entityType === "contact") {
            contactId = args.entityId as Id<"contacts">;
          } else if (args.entityType === "patient") {
            const patient = await ctx.db.get(
              args.entityId as Id<"gabinetPatients">,
            );
            if (patient?.contactId) {
              contactId = patient.contactId;
            }
          } else if (args.entityType === "appointment") {
            const appointment = await ctx.db.get(
              args.entityId as Id<"gabinetAppointments">,
            );
            if (appointment && appointment.organizationId === args.organizationId) {
              const patient = await ctx.db.get(appointment.patientId);
              if (patient?.contactId) {
                contactId = patient.contactId;
              }
            }
          } else if (args.entityType === "lead") {
            // Lead → contact via objectRelationships
            const rels = await ctx.db
              .query("objectRelationships")
              .withIndex("by_source", (q) =>
                q.eq("sourceType", "lead").eq("sourceId", args.entityId),
              )
              .collect();
            const contactRel = rels.find((r) => r.targetType === "contact");
            if (contactRel) {
              contactId = contactRel.targetId as Id<"contacts">;
            }
          }

          if (!contactId) continue;
          const contact = await ctx.db.get(contactId);
          if (!contact || contact.organizationId !== args.organizationId) continue;

          const update: Record<string, unknown> = {};
          for (const [field, value] of Object.entries(fields)) {
            update[field] = value;
          }
          await ctx.db.patch(contactId, update);
          break;
        }

        case "company": {
          let companyId: Id<"companies"> | null = null;

          if (args.entityType === "company") {
            companyId = args.entityId as Id<"companies">;
          } else if (args.entityType === "lead") {
            const lead = await ctx.db.get(args.entityId as Id<"leads">);
            if (lead?.companyId) {
              companyId = lead.companyId;
            }
          }

          if (!companyId) continue;
          const company = await ctx.db.get(companyId);
          if (!company || company.organizationId !== args.organizationId) continue;

          const update: Record<string, unknown> = {};
          for (const [field, value] of Object.entries(fields)) {
            if (field.startsWith("address.")) {
              const addrField = field.substring("address.".length);
              if (!update.address) {
                update.address = { ...(company.address ?? {}) };
              }
              (update.address as Record<string, unknown>)[addrField] = value;
            } else {
              update[field] = value;
            }
          }
          await ctx.db.patch(companyId, update);
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
