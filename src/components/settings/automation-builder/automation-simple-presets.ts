import type { Id } from "@cvx/_generated/dataModel";
import type {
  AutomationBuilderEventCatalogEntry,
  AutomationBuilderSubmitPayload,
} from "./automation-graph-builder";

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

export type AutomationRuleAction =
  | {
      type: "send_email";
      templateEventType: string;
      recipientEmailPath: string;
      recipientNamePath?: string;
    }
  | {
      type: "send_email";
      mode: "template";
      templateId: Id<"emailTemplates">;
      recipientEmailPath: string;
      recipientNamePath?: string;
    }
  | {
      type: "send_email";
      mode: "manual";
      recipientEmailPath: string;
      recipientNamePath?: string;
      subjectTemplate: string;
      bodyTemplate: string;
    }
  | {
      type: "send_sms" | "send_sms_request";
      phonePath: string;
      messageTemplate: string;
    }
  | {
      type: "create_notification";
      userIdPath: string;
      titleTemplate: string;
      messageTemplate: string;
      linkTemplate?: string;
    }
  | {
      type: "write_activity";
      activityAction:
        | "created"
        | "updated"
        | "deleted"
        | "note_added"
        | "stage_changed"
        | "assigned"
        | "relationship_added"
        | "relationship_removed"
        | "document_uploaded"
        | "status_changed"
        | "email_sent"
        | "email_received"
        | "sms_sent"
        | "sms_received";
      descriptionTemplate: string;
      entityTypePath?: string;
      entityIdPath?: string;
    }
  | {
      type: "update_field";
      targetEntityType:
        | "gabinetPatient"
        | "gabinetAppointment"
        | "gabinetEmployee"
        | "lead";
      targetIdPath?: string;
      fieldKind: "standard" | "custom";
      fieldKey: string;
      valueTemplate: string;
      valueType: "string" | "number" | "boolean" | "date";
    };

export type AutomationRuleCondition = {
  path: string;
  operator:
    | "equals"
    | "not_equals"
    | "contains"
    | "greater_than"
    | "less_than"
    | "is_truthy"
    | "is_falsy";
  value?: string | number | boolean;
};

export type AutomationRuleRecord = {
  _id: string;
  name: string;
  description?: string;
  module: "gabinet" | "crm" | "platform";
  eventType: string;
  entityType?: string;
  enabled: boolean;
  actions: AutomationRuleAction[];
  conditions: AutomationRuleCondition[];
};

export type AutomationEmailTemplateRecord = {
  _id: string;
  name: string;
  subject: string;
  module?: string;
  isActive?: boolean;
};

export type AutomationCustomFieldDefinition = {
  _id: Id<"customFieldDefinitions">;
  name: string;
  fieldKey: string;
  fieldType:
    | "text"
    | "number"
    | "date"
    | "select"
    | "multiSelect"
    | "checkbox"
    | "url"
    | "email"
    | "phone"
    | "file";
  options?: string[];
};

type AutomationSimpleModeModule = "gabinet" | "crm";

type AutomationSimpleModePack = {
  module: AutomationSimpleModeModule;
  eventTypes: readonly string[];
};

export const AUTOMATION_SIMPLE_MODE_PACKS: Record<
  AutomationSimpleModeModule,
  AutomationSimpleModePack
> = {
  gabinet: {
    module: "gabinet",
    eventTypes: [
      "gabinet.appointment.created",
      "gabinet.appointment.status_changed",
      "gabinet.appointment.reminder_due",
      "gabinet.appointment.sms_reply_received",
      "gabinet.patient.created",
    ],
  },
  crm: {
    module: "crm",
    eventTypes: ["crm.lead.status_changed", "crm.lead.stage_changed"],
  },
};

export const AUTOMATION_PLAYGROUND_EVENT_TYPES = [
  ...AUTOMATION_SIMPLE_MODE_PACKS.gabinet.eventTypes,
  ...AUTOMATION_SIMPLE_MODE_PACKS.crm.eventTypes,
] as const;

export const AUTOMATION_PLAYGROUND_ACTION_TYPES = [
  "send_sms",
  "send_sms_request",
  "send_email",
  "create_notification",
  "write_activity",
  "update_field",
] as const;

export const AUTOMATION_PLAYGROUND_APPOINTMENT_STATUSES = [
  "scheduled",
  "pending_confirmation",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
] as const;

export const AUTOMATION_PLAYGROUND_REPLY_INTENTS = [
  "confirm",
  "cancel",
  "unknown",
] as const;

export type AutomationPlaygroundEventType =
  (typeof AUTOMATION_PLAYGROUND_EVENT_TYPES)[number];
export type AutomationPlaygroundActionType =
  (typeof AUTOMATION_PLAYGROUND_ACTION_TYPES)[number];
export type AutomationPlaygroundAppointmentStatus =
  (typeof AUTOMATION_PLAYGROUND_APPOINTMENT_STATUSES)[number];
export type AutomationPlaygroundReplyIntent =
  (typeof AUTOMATION_PLAYGROUND_REPLY_INTENTS)[number];
export type AutomationPlaygroundConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "greater_than"
  | "less_than";

export type AutomationPlaygroundFilter = {
  fieldPath: string;
  operator: AutomationPlaygroundConditionOperator;
  value: string;
};

export type AutomationPlaygroundField = {
  key: string;
  path: string;
  label: string;
  type: "string" | "number" | "boolean" | "date" | "datetime" | "id";
  group?: string;
};

export type AutomationUpdateFieldTargetEntityType =
  | "gabinetPatient"
  | "gabinetAppointment"
  | "gabinetEmployee"
  | "lead";

export type AutomationUpdateFieldValueType =
  | "string"
  | "number"
  | "boolean"
  | "date";

export type AutomationPlaygroundActionDraft =
  | {
      id: string;
      type: "send_sms" | "send_sms_request";
      messageTemplate: string;
    }
  | {
      id: string;
      type: "send_email";
      mode: "manual";
      subjectTemplate: string;
      bodyTemplate: string;
    }
  | {
      id: string;
      type: "send_email";
      mode: "template";
      templateId: Id<"emailTemplates"> | "";
    }
  | {
      id: string;
      type: "create_notification";
      titleTemplate: string;
      messageTemplate: string;
    }
  | {
      id: string;
      type: "write_activity";
      descriptionTemplate: string;
    }
  | {
      id: string;
      type: "update_field";
      targetEntityType: AutomationUpdateFieldTargetEntityType;
      fieldKind: "standard" | "custom";
      fieldKey: string;
      valueTemplate: string;
      valueType: AutomationUpdateFieldValueType;
    };

export type AutomationPlaygroundFormValue = {
  name: string;
  description: string;
  enabled: boolean;
  eventType: AutomationPlaygroundEventType;
  eventStatus: "" | AutomationPlaygroundAppointmentStatus;
  replyIntent: "" | AutomationPlaygroundReplyIntent;
  filters: AutomationPlaygroundFilter[];
  actions: AutomationPlaygroundActionDraft[];
};

export const AUTOMATION_NOTIFICATION_LINK_TEMPLATE =
  "/dashboard/gabinet/appointments/{{appointmentId}}";

const TECHNICAL_FIELD_PATHS = new Set([
  "appointmentId",
  "patientId",
  "employeeId",
  "treatmentId",
  "createdBy",
  "providerMessageId",
]);

function createActionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `automation-action-${Math.random().toString(36).slice(2, 10)}`;
}

function isSupportedEventType(
  eventType: string,
): eventType is AutomationPlaygroundEventType {
  return (AUTOMATION_PLAYGROUND_EVENT_TYPES as readonly string[]).includes(eventType);
}

function isSupportedActionType(
  actionType: string,
): actionType is AutomationPlaygroundActionType {
  return (AUTOMATION_PLAYGROUND_ACTION_TYPES as readonly string[]).includes(actionType);
}

function isSupportedAppointmentStatus(
  status: string,
): status is AutomationPlaygroundAppointmentStatus {
  return (AUTOMATION_PLAYGROUND_APPOINTMENT_STATUSES as readonly string[]).includes(status);
}

function isSupportedReplyIntent(
  intent: string,
): intent is AutomationPlaygroundReplyIntent {
  return (AUTOMATION_PLAYGROUND_REPLY_INTENTS as readonly string[]).includes(intent);
}

function isVisibleVariable(
  variable: AutomationBuilderEventCatalogEntry["variableCatalog"][number],
) {
  if (variable.type === "id") return false;
  if (variable.group === "audit") return false;
  if (TECHNICAL_FIELD_PATHS.has(variable.path)) return false;
  if (variable.key.endsWith("Id") || variable.path.endsWith("Id")) return false;
  return true;
}

function coerceConditionValue(
  value: string,
  type: AutomationPlaygroundField["type"],
) {
  if (type === "number") {
    return Number(value);
  }

  if (type === "boolean") {
    return value === "true";
  }

  return value;
}

function getConditionNodePosition(index: number) {
  return {
    positionX: 390 + index * 240,
    positionY: 70,
  };
}

function getActionNodePosition(index: number, conditionCount: number) {
  return {
    positionX: (conditionCount > 0 ? 390 + conditionCount * 240 : 390) + index * 240,
    positionY: 70,
  };
}

function getEventModule(eventType: AutomationPlaygroundEventType) {
  return eventType.startsWith("crm.") ? "crm" : "gabinet";
}

function getDefaultTargetIdPath(targetEntityType: AutomationUpdateFieldTargetEntityType) {
  switch (targetEntityType) {
    case "gabinetPatient":
      return "patientId";
    case "gabinetAppointment":
      return "appointmentId";
    case "gabinetEmployee":
      return "employeeId";
    case "lead":
      return "leadId";
  }
}

function getDefaultActivityAction(eventType: AutomationPlaygroundEventType) {
  if (eventType === "gabinet.appointment.status_changed") {
    return "status_changed" as const;
  }

  if (eventType === "gabinet.appointment.sms_reply_received") {
    return "sms_received" as const;
  }

  if (eventType.startsWith("crm.lead.")) {
    return "stage_changed" as const;
  }

  return "created" as const;
}

function isPatientEventType(eventType: AutomationPlaygroundEventType) {
  return eventType === "gabinet.patient.created";
}

function isLeadEventType(eventType: AutomationPlaygroundEventType) {
  return eventType.startsWith("crm.lead.");
}

function canUseSupportedNotificationLink(
  eventType: AutomationPlaygroundEventType,
  linkTemplate?: string,
) {
  if (!linkTemplate) return true;

  if (isPatientEventType(eventType)) {
    return linkTemplate === "/dashboard/gabinet/patients/{{patientId}}";
  }

  if (isLeadEventType(eventType)) {
    return linkTemplate === "/dashboard/leads/{{leadId}}";
  }

  return linkTemplate === AUTOMATION_NOTIFICATION_LINK_TEMPLATE;
}

export function createAutomationPlaygroundActionDraft(
  actionType: AutomationPlaygroundActionType,
  t: (key: string, options?: Record<string, unknown>) => string,
  eventType?: AutomationPlaygroundEventType,
): AutomationPlaygroundActionDraft {
  switch (actionType) {
    case "send_sms":
      return {
        id: createActionId(),
        type: "send_sms",
        messageTemplate: t(
          isPatientEventType(eventType ?? "gabinet.appointment.created")
            ? "settings.automationPlayground.defaults.patientSmsMessage"
            : "settings.automationPlayground.defaults.smsMessage",
        ),
      };
    case "send_sms_request":
      return {
        id: createActionId(),
        type: "send_sms_request",
        messageTemplate: t(
          isPatientEventType(eventType ?? "gabinet.appointment.created")
            ? "settings.automationPlayground.defaults.patientSmsRequestMessage"
            : "settings.automationPlayground.defaults.smsRequestMessage",
        ),
      };
    case "send_email":
      return {
        id: createActionId(),
        type: "send_email",
        mode: "manual",
        subjectTemplate: t(
          isPatientEventType(eventType ?? "gabinet.appointment.created")
            ? "settings.automationPlayground.defaults.patientEmailSubject"
            : "settings.automationPlayground.defaults.emailSubject",
        ),
        bodyTemplate: t(
          isPatientEventType(eventType ?? "gabinet.appointment.created")
            ? "settings.automationPlayground.defaults.patientEmailBody"
            : "settings.automationPlayground.defaults.emailBody",
        ),
      };
    case "create_notification":
      return {
        id: createActionId(),
        type: "create_notification",
        titleTemplate: t(
          isPatientEventType(eventType ?? "gabinet.appointment.created")
            ? "settings.automationPlayground.defaults.patientNotificationTitle"
            : "settings.automationPlayground.defaults.notificationTitle",
        ),
        messageTemplate: t(
          isPatientEventType(eventType ?? "gabinet.appointment.created")
            ? "settings.automationPlayground.defaults.patientNotificationMessage"
            : "settings.automationPlayground.defaults.notificationMessage",
        ),
      };
    case "write_activity":
      return {
        id: createActionId(),
        type: "write_activity",
        descriptionTemplate: t(
          isPatientEventType(eventType ?? "gabinet.appointment.created")
            ? "settings.automationPlayground.defaults.patientActivityMessage"
            : "settings.automationPlayground.defaults.activityMessage",
        ),
      };
    case "update_field":
      return {
        id: createActionId(),
        type: "update_field",
        targetEntityType: isLeadEventType(eventType ?? "gabinet.appointment.created")
          ? "lead"
          : "gabinetPatient",
        fieldKind: "standard",
        fieldKey: isLeadEventType(eventType ?? "gabinet.appointment.created")
          ? "status"
          : "phone",
        valueTemplate: "",
        valueType: "string",
      };
  }
}

export function getAvailableAutomationPlaygroundEvents(
  eventCatalog: AutomationBuilderEventCatalogEntry[],
) {
  const eventOrder = new Map(
    AUTOMATION_PLAYGROUND_EVENT_TYPES.map((eventType, index) => [eventType, index]),
  );

  return eventCatalog
    .filter((event) => isSupportedEventType(event.eventType))
    .sort(
      (left, right) =>
        (eventOrder.get(left.eventType as AutomationPlaygroundEventType) ?? Number.MAX_SAFE_INTEGER) -
        (eventOrder.get(right.eventType as AutomationPlaygroundEventType) ?? Number.MAX_SAFE_INTEGER),
    );
}

export function getAvailableAutomationPlaygroundActionCapabilities(
  actionCapabilities: AutomationActionCapability[],
) {
  return actionCapabilities.filter((capability) => isSupportedActionType(capability.type));
}

export function getAutomationPlaygroundFields(
  eventCatalogEntry?: AutomationBuilderEventCatalogEntry,
) {
  if (!eventCatalogEntry) return [];

  return eventCatalogEntry.variableCatalog
    .filter(isVisibleVariable)
    .filter(
      (variable) =>
        !(
          eventCatalogEntry.eventType === "gabinet.appointment.status_changed" &&
          variable.path === "status"
        ) &&
        !(
          eventCatalogEntry.eventType === "gabinet.appointment.sms_reply_received" &&
          variable.path === "parsedIntent"
        ),
    )
    .map((variable) => ({
      key: variable.key,
      path: variable.path,
      label: variable.label,
      type: variable.type,
      group: variable.group,
    }));
}

export function buildAutomationPlaygroundSubmitPayload(
  form: AutomationPlaygroundFormValue,
  eventCatalog: AutomationBuilderEventCatalogEntry[],
): AutomationBuilderSubmitPayload {
  const selectedEvent = eventCatalog.find((event) => event.eventType === form.eventType);

  if (!selectedEvent) {
    throw new Error("Unsupported automation playground event");
  }

  const trigger = {
    module: selectedEvent.module,
    eventType: selectedEvent.eventType,
    entityType: selectedEvent.entityType,
    source: selectedEvent.source,
    label: selectedEvent.label,
  } as const;

  const availableFields = getAutomationPlaygroundFields(selectedEvent);
  const fieldMap = new Map(availableFields.map((field) => [field.path, field]));

  const conditions: AutomationRuleCondition[] = [];

  if (
    form.eventType === "gabinet.appointment.status_changed" &&
    form.eventStatus
  ) {
    conditions.push({
      path: "status",
      operator: "equals",
      value: form.eventStatus,
    });
  }

  if (
    form.eventType === "gabinet.appointment.sms_reply_received" &&
    form.replyIntent
  ) {
    conditions.push({
      path: "parsedIntent",
      operator: "equals",
      value: form.replyIntent,
    });
  }

  for (const filter of form.filters) {
    const field = fieldMap.get(filter.fieldPath);
    if (!field) {
      throw new Error(`Unsupported automation playground filter: ${filter.fieldPath}`);
    }

    conditions.push({
      path: filter.fieldPath,
      operator: filter.operator,
      value: coerceConditionValue(filter.value, field.type),
    });
  }

  const actions: AutomationRuleAction[] = form.actions.map((action) => {
    switch (action.type) {
      case "send_sms":
      case "send_sms_request":
        return {
          type: action.type,
          phonePath: isLeadEventType(form.eventType) ? "leadPhone" : "patientPhone",
          messageTemplate: action.messageTemplate.trim(),
        };
      case "send_email": {
        const recipientEmailPath = isLeadEventType(form.eventType)
          ? "leadOwnerEmail"
          : "patientEmail";
        const recipientNamePath = isLeadEventType(form.eventType)
          ? "leadOwnerName"
          : "patientName";

        if (action.mode === "template") {
          return {
            type: "send_email",
            mode: "template",
            templateId: action.templateId as Id<"emailTemplates">,
            recipientEmailPath,
            recipientNamePath,
          };
        }

        return {
          type: "send_email",
          mode: "manual",
          recipientEmailPath,
          recipientNamePath,
          subjectTemplate: action.subjectTemplate.trim(),
          bodyTemplate: action.bodyTemplate.trim(),
        };
      }
      case "create_notification":
        return {
          type: "create_notification",
          userIdPath: isLeadEventType(form.eventType)
            ? "assignedTo"
            : isPatientEventType(form.eventType)
              ? "createdBy"
              : "employeeId",
          titleTemplate: action.titleTemplate.trim(),
          messageTemplate: action.messageTemplate.trim(),
          linkTemplate: isLeadEventType(form.eventType)
            ? "/dashboard/leads/{{leadId}}"
            : isPatientEventType(form.eventType)
              ? "/dashboard/gabinet/patients/{{patientId}}"
              : AUTOMATION_NOTIFICATION_LINK_TEMPLATE,
        };
      case "write_activity":
        return {
          type: "write_activity",
          activityAction: getDefaultActivityAction(form.eventType),
          descriptionTemplate: action.descriptionTemplate.trim(),
        };
      case "update_field":
        return {
          type: "update_field",
          targetEntityType: action.targetEntityType,
          targetIdPath: getDefaultTargetIdPath(action.targetEntityType),
          fieldKind: action.fieldKind,
          fieldKey: action.fieldKey,
          valueTemplate: action.valueTemplate.trim(),
          valueType: action.valueType,
        };
    }
  });

  const nodes: AutomationBuilderSubmitPayload["graph"]["nodes"] = [
    {
      id: "trigger-1",
      type: "trigger",
      positionX: 60,
      positionY: 70,
      trigger,
    },
  ];

  const edges: AutomationBuilderSubmitPayload["graph"]["edges"] = [];

  let previousNodeId = "trigger-1";
  conditions.forEach((condition, index) => {
    const conditionNodeId = `condition-${index + 1}`;
    const position = getConditionNodePosition(index);
    nodes.push({
      id: conditionNodeId,
      type: "condition",
      positionX: position.positionX,
      positionY: position.positionY,
      condition,
    });
    edges.push({
      id: `edge-${previousNodeId}-${conditionNodeId}`,
      source: previousNodeId,
      target: conditionNodeId,
      branch: previousNodeId === "trigger-1" ? "default" : "true",
    });
    previousNodeId = conditionNodeId;
  });

  actions.forEach((action, index) => {
    const actionNodeId = `action-${index + 1}`;
    const position = getActionNodePosition(index, conditions.length);
    nodes.push({
      id: actionNodeId,
      type: "action",
      positionX: position.positionX,
      positionY: position.positionY,
      action,
    });
    edges.push({
      id: `edge-${previousNodeId}-${actionNodeId}`,
      source: previousNodeId,
      target: actionNodeId,
      branch: previousNodeId.startsWith("condition-") ? "true" : "default",
    });
    previousNodeId = actionNodeId;
  });

  return {
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    module: trigger.module,
    eventType: trigger.eventType,
    entityType: trigger.entityType,
    enabled: form.enabled,
    trigger,
    graph: {
      nodes,
      edges,
    },
    conditions,
    actions,
  };
}

function classifyAutomationPlaygroundAction(
  action: AutomationRuleAction,
  eventType: AutomationPlaygroundEventType,
  supportedActionTypes: AutomationPlaygroundActionType[],
): AutomationPlaygroundActionDraft | null {
  if (!supportedActionTypes.includes(action.type)) {
    return null;
  }

  if (action.type === "send_sms" || action.type === "send_sms_request") {
    const expectedPhonePath = isLeadEventType(eventType) ? "leadPhone" : "patientPhone";
    if (action.phonePath !== expectedPhonePath) {
      return null;
    }

    return {
      id: createActionId(),
      type: action.type,
      messageTemplate: action.messageTemplate,
    };
  }

  if (action.type === "send_email") {
    const expectedRecipientEmailPath = isLeadEventType(eventType)
      ? "leadOwnerEmail"
      : "patientEmail";
    const expectedRecipientNamePath = isLeadEventType(eventType)
      ? "leadOwnerName"
      : "patientName";

    if (
      action.recipientEmailPath !== expectedRecipientEmailPath ||
      (action.recipientNamePath && action.recipientNamePath !== expectedRecipientNamePath)
    ) {
      return null;
    }

    if ("mode" in action) {
      if (action.mode === "template") {
        return {
          id: createActionId(),
          type: "send_email",
          mode: "template",
          templateId: action.templateId,
        };
      }

      return {
        id: createActionId(),
        type: "send_email",
        mode: "manual",
        subjectTemplate: action.subjectTemplate,
        bodyTemplate: action.bodyTemplate,
      };
    }

    return null;
  }

  if (action.type === "create_notification") {
    const expectedUserIdPath = isLeadEventType(eventType)
      ? "assignedTo"
      : isPatientEventType(eventType)
        ? "createdBy"
        : "employeeId";

    if (
      action.userIdPath !== expectedUserIdPath ||
      !canUseSupportedNotificationLink(eventType, action.linkTemplate)
    ) {
      return null;
    }

    return {
      id: createActionId(),
      type: "create_notification",
      titleTemplate: action.titleTemplate,
      messageTemplate: action.messageTemplate,
    };
  }

  if (action.type === "write_activity") {
    const expectedActivityAction = getDefaultActivityAction(eventType);

    if (
      action.activityAction !== expectedActivityAction ||
      action.entityTypePath ||
      action.entityIdPath
    ) {
      return null;
    }

    return {
      id: createActionId(),
      type: "write_activity",
      descriptionTemplate: action.descriptionTemplate,
    };
  }

  if (action.type === "update_field") {
    const defaultTargetIdPath = getDefaultTargetIdPath(action.targetEntityType);
    if (action.targetIdPath && action.targetIdPath !== defaultTargetIdPath) {
      return null;
    }

    if (
      action.fieldKind === "custom" &&
      action.targetEntityType !== "gabinetPatient"
    ) {
      return null;
    }

    return {
      id: createActionId(),
      type: "update_field",
      targetEntityType: action.targetEntityType,
      fieldKind: action.fieldKind,
      fieldKey: action.fieldKey,
      valueTemplate: action.valueTemplate,
      valueType: action.valueType,
    };
  }

  return null;
}

export function classifyAutomationPlaygroundRule(
  rule: AutomationRuleRecord,
  eventCatalog: AutomationBuilderEventCatalogEntry[],
  actionCapabilities: AutomationActionCapability[],
): AutomationPlaygroundFormValue | null {
  const supportedEvents = getAvailableAutomationPlaygroundEvents(eventCatalog);
  const supportedActionTypes = getAvailableAutomationPlaygroundActionCapabilities(
    actionCapabilities,
  ).map((capability) => capability.type);

  if (!isSupportedEventType(rule.eventType)) {
    return null;
  }

  if (getEventModule(rule.eventType) !== rule.module) {
    return null;
  }

  const selectedEvent = supportedEvents.find((event) => event.eventType === rule.eventType);
  if (!selectedEvent) {
    return null;
  }

  const visibleFields = getAutomationPlaygroundFields(selectedEvent);
  const fieldMap = new Map(visibleFields.map((field) => [field.path, field]));

  let eventStatus: AutomationPlaygroundFormValue["eventStatus"] = "";
  let replyIntent: AutomationPlaygroundFormValue["replyIntent"] = "";
  const filters: AutomationPlaygroundFilter[] = [];

  for (const condition of rule.conditions) {
    if (
      ![
        "equals",
        "not_equals",
        "contains",
        "greater_than",
        "less_than",
      ].includes(condition.operator)
    ) {
      return null;
    }

    if (
      rule.eventType === "gabinet.appointment.status_changed" &&
      condition.path === "status"
    ) {
      if (
        condition.operator !== "equals" ||
        typeof condition.value !== "string" ||
        !isSupportedAppointmentStatus(condition.value) ||
        eventStatus
      ) {
        return null;
      }
      eventStatus = condition.value;
      continue;
    }

    if (
      rule.eventType === "gabinet.appointment.sms_reply_received" &&
      condition.path === "parsedIntent"
    ) {
      if (
        condition.operator !== "equals" ||
        typeof condition.value !== "string" ||
        !isSupportedReplyIntent(condition.value) ||
        replyIntent
      ) {
        return null;
      }
      replyIntent = condition.value;
      continue;
    }

    const field = fieldMap.get(condition.path);
    if (!field || condition.value === undefined) {
      return null;
    }

    filters.push({
      fieldPath: condition.path,
      operator: condition.operator as AutomationPlaygroundConditionOperator,
      value: String(condition.value),
    });
  }

  const actions = rule.actions
    .map((action) =>
      classifyAutomationPlaygroundAction(
        action,
        rule.eventType as AutomationPlaygroundEventType,
        supportedActionTypes,
      ),
    );

  if (actions.some((action) => action === null)) {
    return null;
  }

  return {
    name: rule.name,
    description: rule.description ?? "",
    enabled: rule.enabled,
    eventType: rule.eventType,
    eventStatus,
    replyIntent,
    filters,
    actions: actions as AutomationPlaygroundActionDraft[],
  };
}
