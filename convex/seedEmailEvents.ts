import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Seed default email event types for an organization.
 * Idempotent — skips event types that already exist for the org.
 * Call once per org during onboarding or via a Convex action.
 */
export const seedDefaultEventTypes = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    createdBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const defaults: Array<{
      eventType: string;
      module: "crm" | "gabinet" | "platform";
      displayName: string;
      description: string;
      payloadSchema: string;
    }> = [
      // --- Gabinet ---
      {
        eventType: "appointment.created",
        module: "gabinet",
        displayName: "Appointment Created",
        description: "Sent when a new appointment is booked for a patient.",
        payloadSchema: JSON.stringify({
          patientName: "string",
          patientEmail: "string",
          appointmentDate: "string",
          appointmentTime: "string",
          treatmentName: "string",
          employeeName: "string",
        }),
      },
      {
        eventType: "appointment.reminder",
        module: "gabinet",
        displayName: "Appointment Reminder",
        description: "Sent as a reminder before a scheduled appointment.",
        payloadSchema: JSON.stringify({
          patientName: "string",
          patientEmail: "string",
          appointmentDate: "string",
          appointmentTime: "string",
          treatmentName: "string",
          employeeName: "string",
        }),
      },
      {
        eventType: "appointment.cancelled",
        module: "gabinet",
        displayName: "Appointment Cancelled",
        description: "Sent when an appointment is cancelled.",
        payloadSchema: JSON.stringify({
          patientName: "string",
          patientEmail: "string",
          appointmentDate: "string",
          appointmentTime: "string",
          treatmentName: "string",
          cancellationReason: "string?",
        }),
      },
      // --- CRM ---
      {
        eventType: "lead.status_changed",
        module: "crm",
        displayName: "Lead Status Changed",
        description: "Sent when a lead moves to a new pipeline stage.",
        payloadSchema: JSON.stringify({
          contactName: "string",
          contactEmail: "string",
          leadTitle: "string",
          previousStage: "string",
          newStage: "string",
          assigneeName: "string?",
        }),
      },
      {
        eventType: "lead.assigned",
        module: "crm",
        displayName: "Lead Assigned",
        description: "Sent when a lead is assigned to a team member.",
        payloadSchema: JSON.stringify({
          contactName: "string",
          contactEmail: "string",
          leadTitle: "string",
          assigneeName: "string",
          assigneeEmail: "string",
        }),
      },
      {
        eventType: "contact.welcome",
        module: "crm",
        displayName: "Contact Welcome",
        description: "Sent when a new contact is added to the CRM.",
        payloadSchema: JSON.stringify({
          contactName: "string",
          contactEmail: "string",
          organizationName: "string",
        }),
      },
    ];

    const now = Date.now();
    let seeded = 0;

    for (const def of defaults) {
      const existing = await ctx.db
        .query("emailEventTypes")
        .withIndex("by_orgAndType", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("eventType", def.eventType),
        )
        .first();

      if (!existing) {
        await ctx.db.insert("emailEventTypes", {
          organizationId: args.organizationId,
          eventType: def.eventType,
          module: def.module,
          displayName: def.displayName,
          description: def.description,
          payloadSchema: def.payloadSchema,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
        seeded++;
      }
    }

    return { seeded, total: defaults.length };
  },
});
