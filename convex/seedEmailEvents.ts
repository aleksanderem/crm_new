import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";


interface EventTypeDef {
  eventType: string;
  module: "crm" | "gabinet" | "platform";
  displayName: string;
  description: string;
  payloadSchema: string;
}

// ---------------------------------------------------------------------------
// Platform (5)
// ---------------------------------------------------------------------------
const platformEvents: EventTypeDef[] = [
  {
    eventType: "platform.email_verification",
    module: "platform",
    displayName: "Email Verification",
    description: "Sent to verify a new email address.",
    payloadSchema: JSON.stringify({ userName: "string", verificationLink: "string" }),
  },
  {
    eventType: "platform.password_reset",
    module: "platform",
    displayName: "Password Reset",
    description: "Sent when a user requests a password reset.",
    payloadSchema: JSON.stringify({ userName: "string", resetLink: "string" }),
  },
  {
    eventType: "platform.team_invitation",
    module: "platform",
    displayName: "Team Invitation",
    description: "Sent when a user is invited to join an organization.",
    payloadSchema: JSON.stringify({ inviterName: "string", organizationName: "string", inviteLink: "string" }),
  },
  {
    eventType: "platform.welcome",
    module: "platform",
    displayName: "Welcome",
    description: "Sent to welcome a new user after registration.",
    payloadSchema: JSON.stringify({ userName: "string", organizationName: "string" }),
  },
  {
    eventType: "platform.account_deactivation",
    module: "platform",
    displayName: "Account Deactivation",
    description: "Sent when an account is deactivated.",
    payloadSchema: JSON.stringify({ userName: "string", organizationName: "string" }),
  },
];

// ---------------------------------------------------------------------------
// CRM / Contacts (6)
// ---------------------------------------------------------------------------
const crmContactEvents: EventTypeDef[] = [
  {
    eventType: "crm.contact.welcome",
    module: "crm",
    displayName: "Contact Welcome",
    description: "Sent when a new contact is added to the CRM.",
    payloadSchema: JSON.stringify({ contactName: "string", contactEmail: "string", organizationName: "string" }),
  },
  {
    eventType: "crm.contact.thank_you",
    module: "crm",
    displayName: "Contact Thank You",
    description: "Sent as a thank-you after cooperation.",
    payloadSchema: JSON.stringify({ contactName: "string", contactEmail: "string", organizationName: "string" }),
  },
  {
    eventType: "crm.contact.birthday",
    module: "crm",
    displayName: "Contact Birthday",
    description: "Sent as a birthday greeting.",
    payloadSchema: JSON.stringify({ contactName: "string", contactEmail: "string" }),
  },
  {
    eventType: "crm.contact.feedback_request",
    module: "crm",
    displayName: "Feedback Request",
    description: "Sent to request feedback from a contact.",
    payloadSchema: JSON.stringify({ contactName: "string", contactEmail: "string", feedbackLink: "string?" }),
  },
  {
    eventType: "crm.contact.data_update",
    module: "crm",
    displayName: "Contact Data Update",
    description: "Sent to confirm a contact's data has been updated.",
    payloadSchema: JSON.stringify({ contactName: "string", contactEmail: "string" }),
  },
  {
    eventType: "crm.contact.reactivation",
    module: "crm",
    displayName: "Contact Reactivation",
    description: "Sent to re-engage an inactive contact.",
    payloadSchema: JSON.stringify({ contactName: "string", contactEmail: "string", organizationName: "string" }),
  },
];

// ---------------------------------------------------------------------------
// CRM / Leads & Deals (6)
// ---------------------------------------------------------------------------
const crmLeadEvents: EventTypeDef[] = [
  {
    eventType: "crm.lead.new_notification",
    module: "crm",
    displayName: "New Lead Notification",
    description: "Internal notification when a new lead is created.",
    payloadSchema: JSON.stringify({ contactName: "string", contactEmail: "string", leadTitle: "string", assigneeName: "string?" }),
  },
  {
    eventType: "crm.lead.assignment",
    module: "crm",
    displayName: "Lead Assigned",
    description: "Sent when a lead is assigned to a team member.",
    payloadSchema: JSON.stringify({ contactName: "string", contactEmail: "string", leadTitle: "string", assigneeName: "string", assigneeEmail: "string" }),
  },
  {
    eventType: "crm.deal.proposal_sent",
    module: "crm",
    displayName: "Proposal Sent",
    description: "Sent when a deal proposal is shared with a contact.",
    payloadSchema: JSON.stringify({ contactName: "string", contactEmail: "string", dealTitle: "string", proposalLink: "string?" }),
  },
  {
    eventType: "crm.deal.proposal_followup",
    module: "crm",
    displayName: "Proposal Follow-up",
    description: "Follow-up after a proposal has been sent.",
    payloadSchema: JSON.stringify({ contactName: "string", contactEmail: "string", dealTitle: "string" }),
  },
  {
    eventType: "crm.deal.won_internal",
    module: "crm",
    displayName: "Deal Won (Internal)",
    description: "Internal notification when a deal is won.",
    payloadSchema: JSON.stringify({ contactName: "string", dealTitle: "string", dealValue: "string?", assigneeName: "string" }),
  },
  {
    eventType: "crm.deal.thank_you",
    module: "crm",
    displayName: "Deal Thank You",
    description: "Sent to thank a client after closing a deal.",
    payloadSchema: JSON.stringify({ contactName: "string", contactEmail: "string", dealTitle: "string", organizationName: "string" }),
  },
];

// ---------------------------------------------------------------------------
// CRM / Activities (3)
// ---------------------------------------------------------------------------
const crmActivityEvents: EventTypeDef[] = [
  {
    eventType: "crm.activity.reminder",
    module: "crm",
    displayName: "Activity Reminder",
    description: "Reminder about an upcoming activity.",
    payloadSchema: JSON.stringify({ assigneeName: "string", activityTitle: "string", dueDate: "string", dueTime: "string?" }),
  },
  {
    eventType: "crm.activity.assignment",
    module: "crm",
    displayName: "Activity Assigned",
    description: "Sent when an activity is assigned to a team member.",
    payloadSchema: JSON.stringify({ assigneeName: "string", assigneeEmail: "string", activityTitle: "string", dueDate: "string" }),
  },
  {
    eventType: "crm.activity.overdue",
    module: "crm",
    displayName: "Activity Overdue",
    description: "Notification about an overdue activity.",
    payloadSchema: JSON.stringify({ assigneeName: "string", activityTitle: "string", dueDate: "string" }),
  },
];

// ---------------------------------------------------------------------------
// CRM / Documents (3)
// ---------------------------------------------------------------------------
const crmDocumentEvents: EventTypeDef[] = [
  {
    eventType: "crm.document.shared",
    module: "crm",
    displayName: "Document Shared",
    description: "Sent when a document is shared with a contact.",
    payloadSchema: JSON.stringify({ contactName: "string", contactEmail: "string", documentName: "string", shareLink: "string?" }),
  },
  {
    eventType: "crm.document.signature_request",
    module: "crm",
    displayName: "Signature Request",
    description: "Sent to request a digital signature on a document.",
    payloadSchema: JSON.stringify({ contactName: "string", contactEmail: "string", documentName: "string", signLink: "string?" }),
  },
  {
    eventType: "crm.document.signed",
    module: "crm",
    displayName: "Document Signed",
    description: "Confirmation that a document has been signed.",
    payloadSchema: JSON.stringify({ contactName: "string", contactEmail: "string", documentName: "string" }),
  },
];

// ---------------------------------------------------------------------------
// CRM / Marketing (4)
// ---------------------------------------------------------------------------
const crmMarketingEvents: EventTypeDef[] = [
  {
    eventType: "crm.marketing.newsletter",
    module: "crm",
    displayName: "Newsletter",
    description: "Regular newsletter email.",
    payloadSchema: JSON.stringify({ contactName: "string", contactEmail: "string", organizationName: "string" }),
  },
  {
    eventType: "crm.marketing.promotion",
    module: "crm",
    displayName: "Promotional Offer",
    description: "Promotional offer email.",
    payloadSchema: JSON.stringify({ contactName: "string", contactEmail: "string", promotionTitle: "string?" }),
  },
  {
    eventType: "crm.marketing.seasonal",
    module: "crm",
    displayName: "Seasonal Campaign",
    description: "Seasonal marketing campaign email.",
    payloadSchema: JSON.stringify({ contactName: "string", contactEmail: "string", campaignName: "string?" }),
  },
  {
    eventType: "crm.marketing.referral",
    module: "crm",
    displayName: "Referral Program",
    description: "Referral program invitation.",
    payloadSchema: JSON.stringify({ contactName: "string", contactEmail: "string", referralLink: "string?" }),
  },
];

// ---------------------------------------------------------------------------
// Gabinet / Patients (4)
// ---------------------------------------------------------------------------
const gabinetPatientEvents: EventTypeDef[] = [
  {
    eventType: "gabinet.patient.welcome",
    module: "gabinet",
    displayName: "Patient Welcome",
    description: "Sent to welcome a new patient.",
    payloadSchema: JSON.stringify({ patientName: "string", patientEmail: "string", organizationName: "string" }),
  },
  {
    eventType: "gabinet.patient.portal_access",
    module: "gabinet",
    displayName: "Patient Portal Access",
    description: "Sent with portal access credentials.",
    payloadSchema: JSON.stringify({ patientName: "string", patientEmail: "string", portalLink: "string" }),
  },
  {
    eventType: "gabinet.patient.health_survey",
    module: "gabinet",
    displayName: "Health Survey Request",
    description: "Sent to request a health survey from a patient.",
    payloadSchema: JSON.stringify({ patientName: "string", patientEmail: "string", surveyLink: "string?" }),
  },
  {
    eventType: "gabinet.patient.visit_summary",
    module: "gabinet",
    displayName: "Visit Summary",
    description: "Sent as a summary after a patient's visit.",
    payloadSchema: JSON.stringify({ patientName: "string", patientEmail: "string", visitDate: "string", treatmentName: "string", employeeName: "string" }),
  },
];

// ---------------------------------------------------------------------------
// Gabinet / Appointments (11)
// ---------------------------------------------------------------------------
const gabinetAppointmentEvents: EventTypeDef[] = [
  {
    eventType: "gabinet.appointment.confirmation",
    module: "gabinet",
    displayName: "Appointment Confirmation",
    description: "Sent to confirm a newly booked appointment.",
    payloadSchema: JSON.stringify({ patientName: "string", patientEmail: "string", appointmentDate: "string", appointmentTime: "string", treatmentName: "string", employeeName: "string" }),
  },
  {
    eventType: "gabinet.appointment.reminder_24h",
    module: "gabinet",
    displayName: "Appointment Reminder (24h)",
    description: "Sent 24 hours before a scheduled appointment.",
    payloadSchema: JSON.stringify({ patientName: "string", patientEmail: "string", appointmentDate: "string", appointmentTime: "string", treatmentName: "string", employeeName: "string" }),
  },
  {
    eventType: "gabinet.appointment.reminder_1h",
    module: "gabinet",
    displayName: "Appointment Reminder (1h)",
    description: "Sent 1 hour before a scheduled appointment.",
    payloadSchema: JSON.stringify({ patientName: "string", patientEmail: "string", appointmentDate: "string", appointmentTime: "string", treatmentName: "string", employeeName: "string" }),
  },
  {
    eventType: "gabinet.appointment.reminder_custom",
    module: "gabinet",
    displayName: "Appointment Reminder (Custom)",
    description: "Custom-timed appointment reminder.",
    payloadSchema: JSON.stringify({ patientName: "string", patientEmail: "string", appointmentDate: "string", appointmentTime: "string", treatmentName: "string", employeeName: "string" }),
  },
  {
    eventType: "gabinet.appointment.rescheduled",
    module: "gabinet",
    displayName: "Appointment Rescheduled",
    description: "Sent when an appointment is rescheduled.",
    payloadSchema: JSON.stringify({ patientName: "string", patientEmail: "string", oldDate: "string", oldTime: "string", newDate: "string", newTime: "string", treatmentName: "string", employeeName: "string" }),
  },
  {
    eventType: "gabinet.appointment.cancelled_by_clinic",
    module: "gabinet",
    displayName: "Cancelled by Clinic",
    description: "Sent when an appointment is cancelled by the clinic.",
    payloadSchema: JSON.stringify({ patientName: "string", patientEmail: "string", appointmentDate: "string", appointmentTime: "string", treatmentName: "string", cancellationReason: "string?" }),
  },
  {
    eventType: "gabinet.appointment.cancelled_by_patient",
    module: "gabinet",
    displayName: "Cancelled by Patient",
    description: "Sent when a patient cancels an appointment.",
    payloadSchema: JSON.stringify({ patientName: "string", patientEmail: "string", appointmentDate: "string", appointmentTime: "string", treatmentName: "string" }),
  },
  {
    eventType: "gabinet.appointment.followup",
    module: "gabinet",
    displayName: "Appointment Follow-up",
    description: "Follow-up / aftercare email after an appointment.",
    payloadSchema: JSON.stringify({ patientName: "string", patientEmail: "string", appointmentDate: "string", treatmentName: "string", employeeName: "string", aftercareInstructions: "string?" }),
  },
  {
    eventType: "gabinet.appointment.no_show",
    module: "gabinet",
    displayName: "No-Show",
    description: "Sent when a patient does not show up for an appointment.",
    payloadSchema: JSON.stringify({ patientName: "string", patientEmail: "string", appointmentDate: "string", appointmentTime: "string", treatmentName: "string" }),
  },
  {
    eventType: "gabinet.appointment.slot_available",
    module: "gabinet",
    displayName: "Slot Available",
    description: "Notification that a requested time slot has become available.",
    payloadSchema: JSON.stringify({ patientName: "string", patientEmail: "string", availableDate: "string", availableTime: "string", treatmentName: "string?" }),
  },
  {
    eventType: "gabinet.appointment.slot_unavailable",
    module: "gabinet",
    displayName: "Slot Unavailable",
    description: "Notification that a requested time slot is no longer available.",
    payloadSchema: JSON.stringify({ patientName: "string", patientEmail: "string", requestedDate: "string", requestedTime: "string" }),
  },
];

// ---------------------------------------------------------------------------
// Gabinet / Treatments (4)
// ---------------------------------------------------------------------------
const gabinetTreatmentEvents: EventTypeDef[] = [
  {
    eventType: "gabinet.treatment.recommendation",
    module: "gabinet",
    displayName: "Treatment Recommendation",
    description: "Sent to recommend a treatment to a patient.",
    payloadSchema: JSON.stringify({ patientName: "string", patientEmail: "string", treatmentName: "string", employeeName: "string" }),
  },
  {
    eventType: "gabinet.treatment.pre_instructions",
    module: "gabinet",
    displayName: "Pre-Treatment Instructions",
    description: "Sent with instructions before a treatment.",
    payloadSchema: JSON.stringify({ patientName: "string", patientEmail: "string", treatmentName: "string", appointmentDate: "string", instructions: "string?" }),
  },
  {
    eventType: "gabinet.treatment.aftercare",
    module: "gabinet",
    displayName: "Aftercare Instructions",
    description: "Sent with aftercare instructions following a treatment.",
    payloadSchema: JSON.stringify({ patientName: "string", patientEmail: "string", treatmentName: "string", aftercareInstructions: "string?" }),
  },
  {
    eventType: "gabinet.treatment.series_progress",
    module: "gabinet",
    displayName: "Treatment Series Progress",
    description: "Sent to update a patient on their treatment series progress.",
    payloadSchema: JSON.stringify({ patientName: "string", patientEmail: "string", treatmentName: "string", completedSessions: "string", totalSessions: "string" }),
  },
];

// ---------------------------------------------------------------------------
// Gabinet / Packages (4)
// ---------------------------------------------------------------------------
const gabinetPackageEvents: EventTypeDef[] = [
  {
    eventType: "gabinet.package.purchase_confirmation",
    module: "gabinet",
    displayName: "Package Purchase Confirmation",
    description: "Sent to confirm a treatment package purchase.",
    payloadSchema: JSON.stringify({ patientName: "string", patientEmail: "string", packageName: "string", totalSessions: "string" }),
  },
  {
    eventType: "gabinet.package.usage_update",
    module: "gabinet",
    displayName: "Package Usage Update",
    description: "Sent to update a patient on package usage.",
    payloadSchema: JSON.stringify({ patientName: "string", patientEmail: "string", packageName: "string", usedSessions: "string", remainingSessions: "string" }),
  },
  {
    eventType: "gabinet.package.expiring_soon",
    module: "gabinet",
    displayName: "Package Expiring Soon",
    description: "Sent when a treatment package is about to expire.",
    payloadSchema: JSON.stringify({ patientName: "string", patientEmail: "string", packageName: "string", expirationDate: "string", remainingSessions: "string" }),
  },
  {
    eventType: "gabinet.package.expired",
    module: "gabinet",
    displayName: "Package Expired",
    description: "Sent when a treatment package has expired.",
    payloadSchema: JSON.stringify({ patientName: "string", patientEmail: "string", packageName: "string", unusedSessions: "string?" }),
  },
];

// ---------------------------------------------------------------------------
// Gabinet / Loyalty (3)
// ---------------------------------------------------------------------------
const gabinetLoyaltyEvents: EventTypeDef[] = [
  {
    eventType: "gabinet.loyalty.points_earned",
    module: "gabinet",
    displayName: "Loyalty Points Earned",
    description: "Sent when a patient earns loyalty points.",
    payloadSchema: JSON.stringify({ patientName: "string", patientEmail: "string", pointsEarned: "string", totalPoints: "string" }),
  },
  {
    eventType: "gabinet.loyalty.tier_upgrade",
    module: "gabinet",
    displayName: "Loyalty Tier Upgrade",
    description: "Sent when a patient advances to a higher loyalty tier.",
    payloadSchema: JSON.stringify({ patientName: "string", patientEmail: "string", newTier: "string", totalPoints: "string" }),
  },
  {
    eventType: "gabinet.loyalty.reward_available",
    module: "gabinet",
    displayName: "Loyalty Reward Available",
    description: "Sent when a patient has a loyalty reward available to redeem.",
    payloadSchema: JSON.stringify({ patientName: "string", patientEmail: "string", rewardName: "string?", totalPoints: "string" }),
  },
];

// ---------------------------------------------------------------------------
// Gabinet / Payments (3)
// ---------------------------------------------------------------------------
const gabinetPaymentEvents: EventTypeDef[] = [
  {
    eventType: "gabinet.payment.confirmation",
    module: "gabinet",
    displayName: "Payment Confirmation",
    description: "Sent to confirm a payment has been received.",
    payloadSchema: JSON.stringify({ patientName: "string", patientEmail: "string", amount: "string", paymentMethod: "string?", treatmentName: "string?" }),
  },
  {
    eventType: "gabinet.payment.reminder",
    module: "gabinet",
    displayName: "Payment Reminder",
    description: "Sent as a reminder about a pending payment.",
    payloadSchema: JSON.stringify({ patientName: "string", patientEmail: "string", amount: "string", dueDate: "string", treatmentName: "string?" }),
  },
  {
    eventType: "gabinet.payment.invoice",
    module: "gabinet",
    displayName: "Invoice Sent",
    description: "Sent when an invoice is generated and shared.",
    payloadSchema: JSON.stringify({ patientName: "string", patientEmail: "string", amount: "string", invoiceNumber: "string?", invoiceLink: "string?" }),
  },
];

// ---------------------------------------------------------------------------
// Gabinet / Operational (4)
// ---------------------------------------------------------------------------
const gabinetOperationalEvents: EventTypeDef[] = [
  {
    eventType: "gabinet.operational.hours_change",
    module: "gabinet",
    displayName: "Working Hours Change",
    description: "Notification about a change in working hours.",
    payloadSchema: JSON.stringify({ organizationName: "string", effectiveDate: "string", newHours: "string?" }),
  },
  {
    eventType: "gabinet.operational.holiday_closure",
    module: "gabinet",
    displayName: "Holiday Closure",
    description: "Notification about a holiday closure.",
    payloadSchema: JSON.stringify({ organizationName: "string", closureDate: "string", reopenDate: "string?" }),
  },
  {
    eventType: "gabinet.operational.new_service",
    module: "gabinet",
    displayName: "New Service Available",
    description: "Announcement of a new treatment or service.",
    payloadSchema: JSON.stringify({ organizationName: "string", treatmentName: "string", treatmentDescription: "string?" }),
  },
  {
    eventType: "gabinet.operational.new_specialist",
    module: "gabinet",
    displayName: "New Specialist",
    description: "Announcement of a new specialist joining the team.",
    payloadSchema: JSON.stringify({ organizationName: "string", specialistName: "string", specialization: "string?" }),
  },
];

// ---------------------------------------------------------------------------
// Combined list: 60 event types total
// ---------------------------------------------------------------------------
const ALL_EVENT_TYPES: EventTypeDef[] = [
  ...platformEvents,
  ...crmContactEvents,
  ...crmLeadEvents,
  ...crmActivityEvents,
  ...crmDocumentEvents,
  ...crmMarketingEvents,
  ...gabinetPatientEvents,
  ...gabinetAppointmentEvents,
  ...gabinetTreatmentEvents,
  ...gabinetPackageEvents,
  ...gabinetLoyaltyEvents,
  ...gabinetPaymentEvents,
  ...gabinetOperationalEvents,
];

/**
 * Seed default email event types for an organization.
 * Idempotent — skips event types that already exist for the org.
 * Call once per org during onboarding or via a Convex action.
 *
 * Split into batches of 20 to stay within Convex execution limits.
 * Each batch is scheduled sequentially via ctx.scheduler.runAfter().
 */
export const seedDefaultEventTypes = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    createdBy: v.id("users"),
    batchIndex: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const BATCH_SIZE = 20;
    const batchIndex = args.batchIndex ?? 0;
    const start = batchIndex * BATCH_SIZE;
    const batch = ALL_EVENT_TYPES.slice(start, start + BATCH_SIZE);

    if (batch.length === 0) {
      return { seeded: 0, total: ALL_EVENT_TYPES.length, done: true };
    }

    const now = Date.now();
    let seeded = 0;

    for (const def of batch) {
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

    // Schedule next batch if there are more
    const nextStart = (batchIndex + 1) * BATCH_SIZE;
    if (nextStart < ALL_EVENT_TYPES.length) {
      await ctx.scheduler.runAfter(
        0,
        internal.seedEmailEvents.seedDefaultEventTypes,
        {
          organizationId: args.organizationId,
          createdBy: args.createdBy,
          batchIndex: batchIndex + 1,
        },
      );
    }

    return { seeded, batchIndex, total: ALL_EVENT_TYPES.length, done: nextStart >= ALL_EVENT_TYPES.length };
  },
});
