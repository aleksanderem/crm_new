export type AutomationRegistryModule = "crm" | "gabinet" | "platform";
export type AutomationTriggerSource = "domain_event" | "communication_reply";

export type EventCatalogVariable = {
  key: string;
  path: string;
  label: string;
  type: "string" | "number" | "boolean" | "date" | "datetime" | "id";
  group?: string;
};

export type EventCatalogEntry = {
  module: AutomationRegistryModule;
  eventType: string;
  label: string;
  entityType?: string;
  source: AutomationTriggerSource;
  samplePayload: Record<string, unknown>;
  variables: EventCatalogVariable[];
};

export const EVENT_REGISTRY: EventCatalogEntry[] = [
  {
    module: "gabinet",
    eventType: "gabinet.patient.created",
    label: "Patient created",
    entityType: "gabinetPatient",
    source: "domain_event",
    samplePayload: {
      organizationId: "org_123",
      patientId: "patient_123",
      contactId: "contact_123",
      firstName: "Jan",
      lastName: "Kowalski",
      patientName: "Jan Kowalski",
      patientEmail: "jan@example.com",
      patientPhone: "500600700",
      referralSource: "Website",
      createdBy: "user_123",
    },
    variables: [
      { key: "patientId", path: "patientId", label: "Patient ID", type: "id", group: "patient" },
      { key: "firstName", path: "firstName", label: "Patient first name", type: "string", group: "patient" },
      { key: "lastName", path: "lastName", label: "Patient last name", type: "string", group: "patient" },
      { key: "patientName", path: "patientName", label: "Patient name", type: "string", group: "patient" },
      { key: "patientPhone", path: "patientPhone", label: "Patient phone", type: "string", group: "patient" },
      { key: "patientEmail", path: "patientEmail", label: "Patient email", type: "string", group: "patient" },
      { key: "referralSource", path: "referralSource", label: "Referral source", type: "string", group: "patient" },
      { key: "createdBy", path: "createdBy", label: "Created by user ID", type: "id", group: "audit" },
    ],
  },
  {
    module: "gabinet",
    eventType: "gabinet.appointment.created",
    label: "Appointment created",
    entityType: "gabinetAppointment",
    source: "domain_event",
    samplePayload: {
      organizationId: "org_123",
      appointmentId: "appt_123",
      patientId: "patient_123",
      treatmentId: "treatment_123",
      employeeId: "user_123",
      date: "2026-03-17",
      startTime: "10:00",
      endTime: "10:30",
      status: "scheduled",
      patientEmail: "jan@example.com",
      patientPhone: "500600700",
      patientName: "Jan Kowalski",
      treatmentName: "Consultation",
      employeeName: "Dr. Example",
      createdBy: "user_123",
    },
    variables: [
      { key: "appointmentId", path: "appointmentId", label: "Appointment ID", type: "id", group: "appointment" },
      { key: "patientId", path: "patientId", label: "Patient ID", type: "id", group: "patient" },
      { key: "patientName", path: "patientName", label: "Patient name", type: "string", group: "patient" },
      { key: "patientPhone", path: "patientPhone", label: "Patient phone", type: "string", group: "patient" },
      { key: "patientEmail", path: "patientEmail", label: "Patient email", type: "string", group: "patient" },
      { key: "employeeId", path: "employeeId", label: "Employee ID", type: "id", group: "appointment" },
      { key: "date", path: "date", label: "Appointment date", type: "date", group: "appointment" },
      { key: "startTime", path: "startTime", label: "Start time", type: "string", group: "appointment" },
      { key: "endTime", path: "endTime", label: "End time", type: "string", group: "appointment" },
      { key: "status", path: "status", label: "Status", type: "string", group: "appointment" },
      { key: "createdBy", path: "createdBy", label: "Created by user ID", type: "id", group: "audit" },
    ],
  },
  {
    module: "gabinet",
    eventType: "gabinet.appointment.updated",
    label: "Appointment updated",
    entityType: "gabinetAppointment",
    source: "domain_event",
    samplePayload: {
      organizationId: "org_123",
      appointmentId: "appt_123",
      patientId: "patient_123",
      treatmentId: "treatment_123",
      employeeId: "user_123",
      date: "2026-03-17",
      startTime: "11:00",
      endTime: "11:30",
      previousStatus: "scheduled",
      status: "scheduled",
      createdBy: "user_123",
      updatedFields: ["startTime", "endTime"],
    },
    variables: [
      { key: "appointmentId", path: "appointmentId", label: "Appointment ID", type: "id", group: "appointment" },
      { key: "patientId", path: "patientId", label: "Patient ID", type: "id", group: "patient" },
      { key: "employeeId", path: "employeeId", label: "Employee ID", type: "id", group: "appointment" },
      { key: "date", path: "date", label: "Appointment date", type: "date", group: "appointment" },
      { key: "startTime", path: "startTime", label: "Start time", type: "string", group: "appointment" },
      { key: "endTime", path: "endTime", label: "End time", type: "string", group: "appointment" },
      { key: "status", path: "status", label: "Status", type: "string", group: "appointment" },
      { key: "previousStatus", path: "previousStatus", label: "Previous status", type: "string", group: "appointment" },
      { key: "createdBy", path: "createdBy", label: "Created by user ID", type: "id", group: "audit" },
    ],
  },
  {
    module: "gabinet",
    eventType: "gabinet.appointment.status_changed",
    label: "Appointment status changed",
    entityType: "gabinetAppointment",
    source: "domain_event",
    samplePayload: {
      organizationId: "org_123",
      appointmentId: "appt_123",
      patientId: "patient_123",
      employeeId: "user_123",
      treatmentId: "treatment_123",
      status: "confirmed",
      previousStatus: "scheduled",
      date: "2026-03-17",
      startTime: "10:00",
      cancellationReason: null,
      createdBy: "user_123",
    },
    variables: [
      { key: "appointmentId", path: "appointmentId", label: "Appointment ID", type: "id", group: "appointment" },
      { key: "patientId", path: "patientId", label: "Patient ID", type: "id", group: "patient" },
      { key: "employeeId", path: "employeeId", label: "Employee ID", type: "id", group: "appointment" },
      { key: "status", path: "status", label: "Status", type: "string", group: "appointment" },
      { key: "previousStatus", path: "previousStatus", label: "Previous status", type: "string", group: "appointment" },
      { key: "date", path: "date", label: "Appointment date", type: "date", group: "appointment" },
      { key: "startTime", path: "startTime", label: "Start time", type: "string", group: "appointment" },
      { key: "cancellationReason", path: "cancellationReason", label: "Cancellation reason", type: "string", group: "appointment" },
      { key: "createdBy", path: "createdBy", label: "Created by user ID", type: "id", group: "audit" },
    ],
  },
  {
    module: "gabinet",
    eventType: "gabinet.appointment.reminder_due",
    label: "Appointment reminder due",
    entityType: "gabinetAppointment",
    source: "domain_event",
    samplePayload: {
      organizationId: "org_123",
      appointmentId: "appt_123",
      patientId: "patient_123",
      treatmentId: "treatment_123",
      employeeId: "user_123",
      date: "2026-03-17",
      startTime: "10:00",
      patientEmail: "jan@example.com",
      patientPhone: "500600700",
      patientName: "Jan Kowalski",
      treatmentName: "Consultation",
    },
    variables: [
      { key: "appointmentId", path: "appointmentId", label: "Appointment ID", type: "id", group: "appointment" },
      { key: "patientId", path: "patientId", label: "Patient ID", type: "id", group: "patient" },
      { key: "patientName", path: "patientName", label: "Patient name", type: "string", group: "patient" },
      { key: "patientPhone", path: "patientPhone", label: "Patient phone", type: "string", group: "patient" },
      { key: "patientEmail", path: "patientEmail", label: "Patient email", type: "string", group: "patient" },
      { key: "date", path: "date", label: "Appointment date", type: "date", group: "appointment" },
      { key: "startTime", path: "startTime", label: "Start time", type: "string", group: "appointment" },
      { key: "treatmentName", path: "treatmentName", label: "Treatment name", type: "string", group: "appointment" },
    ],
  },
  {
    module: "gabinet",
    eventType: "gabinet.appointment.sms_reply_received",
    label: "Appointment SMS reply received",
    entityType: "gabinetAppointment",
    source: "communication_reply",
    samplePayload: {
      organizationId: "org_123",
      appointmentId: "appt_123",
      patientId: "patient_123",
      provider: "twilio",
      providerMessageId: "SM123",
      normalizedPhone: "+48500600700",
      body: "TAK",
      normalizedBody: "tak",
      parsedIntent: "confirm",
      webhookSignatureVerified: true,
    },
    variables: [
      { key: "appointmentId", path: "appointmentId", label: "Appointment ID", type: "id", group: "appointment" },
      { key: "patientId", path: "patientId", label: "Patient ID", type: "id", group: "patient" },
      { key: "provider", path: "provider", label: "SMS provider", type: "string", group: "message" },
      { key: "providerMessageId", path: "providerMessageId", label: "Provider message ID", type: "string", group: "message" },
      { key: "normalizedPhone", path: "normalizedPhone", label: "Sender phone", type: "string", group: "message" },
      { key: "body", path: "body", label: "Reply body", type: "string", group: "message" },
      { key: "parsedIntent", path: "parsedIntent", label: "Parsed intent", type: "string", group: "message" },
      { key: "webhookSignatureVerified", path: "webhookSignatureVerified", label: "Webhook signature verified", type: "boolean", group: "message" },
    ],
  },
  {
    module: "crm",
    eventType: "crm.lead.status_changed",
    label: "Lead status changed",
    entityType: "lead",
    source: "domain_event",
    samplePayload: {
      organizationId: "org_123",
      leadId: "lead_123",
      title: "Enterprise Plan Deal",
      oldStatus: "new",
      newStatus: "won",
      assignedTo: "user_123",
      ownerId: "user_123",
      createdBy: "user_123",
    },
    variables: [
      { key: "leadId", path: "leadId", label: "Lead ID", type: "id", group: "lead" },
      { key: "title", path: "title", label: "Lead title", type: "string", group: "lead" },
      { key: "oldStatus", path: "oldStatus", label: "Previous status", type: "string", group: "lead" },
      { key: "newStatus", path: "newStatus", label: "New status", type: "string", group: "lead" },
      { key: "assignedTo", path: "assignedTo", label: "Assigned user", type: "id", group: "ownership" },
      { key: "ownerId", path: "ownerId", label: "Lead owner", type: "id", group: "ownership" },
      { key: "createdBy", path: "createdBy", label: "Created by user ID", type: "id", group: "audit" },
    ],
  },
  {
    module: "crm",
    eventType: "crm.lead.stage_changed",
    label: "Lead stage changed",
    entityType: "lead",
    source: "domain_event",
    samplePayload: {
      organizationId: "org_123",
      leadId: "lead_123",
      title: "Enterprise Plan Deal",
      fromStageId: "stage_1",
      toStageId: "stage_2",
      oldStatus: "new",
      newStatus: "qualified",
      ownerId: "user_123",
      createdBy: "user_123",
    },
    variables: [
      { key: "leadId", path: "leadId", label: "Lead ID", type: "id", group: "lead" },
      { key: "title", path: "title", label: "Lead title", type: "string", group: "lead" },
      { key: "fromStageId", path: "fromStageId", label: "From stage", type: "id", group: "pipeline" },
      { key: "toStageId", path: "toStageId", label: "To stage", type: "id", group: "pipeline" },
      { key: "oldStatus", path: "oldStatus", label: "Previous status", type: "string", group: "lead" },
      { key: "newStatus", path: "newStatus", label: "New status", type: "string", group: "lead" },
      { key: "ownerId", path: "ownerId", label: "Lead owner", type: "id", group: "ownership" },
      { key: "createdBy", path: "createdBy", label: "Created by user ID", type: "id", group: "audit" },
    ],
  },
];

export function listEventCatalogEntries() {
  return EVENT_REGISTRY.map((event) => ({
    module: event.module,
    eventType: event.eventType,
    label: event.label,
    entityType: event.entityType,
    source: event.source,
    variableCatalog: event.variables,
    samplePayload: event.samplePayload,
  }));
}

export function mapLegacyTriggerSource(eventType: string): AutomationTriggerSource {
  return eventType.endsWith("sms_reply_received") ? "communication_reply" : "domain_event";
}

export function resolveRuleTrigger(rule: {
  module: AutomationRegistryModule;
  eventType: string;
  entityType?: string;
  trigger?: {
    module: AutomationRegistryModule;
    eventType: string;
    entityType?: string;
    source: AutomationTriggerSource;
    label?: string;
  };
}) {
  return (
    rule.trigger ?? {
      module: rule.module,
      eventType: rule.eventType,
      entityType: rule.entityType,
      source: mapLegacyTriggerSource(rule.eventType),
    }
  );
}

export type AutomationActionType =
  | "send_email"
  | "send_sms"
  | "send_sms_request"
  | "create_notification"
  | "write_activity"
  | "update_field";

export type AutomationActionCapability = {
  type: AutomationActionType;
  available: boolean;
  availability: "available" | "config_required";
  missingConfigReason?: string;
  recipientModes?: string[];
  contentModes?: string[];
};

export const AUTOMATION_ACTION_CAPABILITIES: Array<{
  type: AutomationActionType;
  needsEmail?: boolean;
  needsSms?: boolean;
  recipientModes?: string[];
  contentModes?: string[];
}> = [
  {
    type: "send_sms",
    needsSms: true,
    recipientModes: ["patient_phone"],
    contentModes: ["manual"],
  },
  {
    type: "send_sms_request",
    needsSms: true,
    recipientModes: ["patient_phone"],
    contentModes: ["manual"],
  },
  {
    type: "send_email",
    needsEmail: true,
    recipientModes: ["patient_email"],
    contentModes: ["template", "manual"],
  },
  {
    type: "create_notification",
    recipientModes: ["employee_user"],
    contentModes: ["manual"],
  },
  {
    type: "write_activity",
    recipientModes: ["entity_context"],
    contentModes: ["manual"],
  },
  {
    type: "update_field",
    recipientModes: ["entity_context"],
    contentModes: ["template_value"],
  },
];

export function buildActionCapabilities(options: { hasEmail: boolean; hasSms: boolean }) {
  return AUTOMATION_ACTION_CAPABILITIES.map<AutomationActionCapability>((capability) => {
    const needsEmail = capability.needsEmail === true;
    const needsSms = capability.needsSms === true;
    const available = needsEmail ? options.hasEmail : needsSms ? options.hasSms : true;

    return {
      type: capability.type,
      available,
      availability: available ? "available" : "config_required",
      missingConfigReason: available
        ? undefined
        : needsEmail
          ? "Configure a default email account to enable email actions."
          : "Configure an active SMS provider to enable SMS actions.",
      recipientModes: capability.recipientModes,
      contentModes: capability.contentModes,
    };
  });
}
