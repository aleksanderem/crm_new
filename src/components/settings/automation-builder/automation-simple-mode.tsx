import { useEffect, useMemo, useState } from "react";
import type { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type {
  AutomationBuilderEventCatalogEntry,
  AutomationBuilderSubmitPayload,
} from "./automation-graph-builder";
import {
  AUTOMATION_PLAYGROUND_APPOINTMENT_STATUSES,
  AUTOMATION_PLAYGROUND_REPLY_INTENTS,
  buildAutomationPlaygroundSubmitPayload,
  createAutomationPlaygroundActionDraft,
  getAvailableAutomationPlaygroundActionCapabilities,
  getAvailableAutomationPlaygroundEvents,
  getAutomationPlaygroundFields,
  type AutomationActionCapability,
  type AutomationCustomFieldDefinition,
  type AutomationEmailTemplateRecord,
  type AutomationPlaygroundActionDraft,
  type AutomationPlaygroundActionType,
  type AutomationPlaygroundConditionOperator,
  type AutomationPlaygroundField,
  type AutomationPlaygroundFilter,
  type AutomationPlaygroundFormValue,
  type AutomationUpdateFieldTargetEntityType,
  type AutomationUpdateFieldValueType,
} from "./automation-simple-presets";

type AutomationVariableSource = {
  key: string;
  label: string;
  fields: Array<{
    key: string;
    label: string;
    token: string;
  }>;
};

type EditableFieldOption = {
  key: string;
  label: string;
  valueType: AutomationUpdateFieldValueType;
  fieldKind: "standard" | "custom";
};

type Props = {
  eventCatalog: AutomationBuilderEventCatalogEntry[];
  actionCapabilities: AutomationActionCapability[];
  emailTemplates: AutomationEmailTemplateRecord[];
  customFieldsByEntityType: Partial<
    Record<AutomationUpdateFieldTargetEntityType, AutomationCustomFieldDefinition[]>
  >;
  initialValue?: AutomationPlaygroundFormValue;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (payload: AutomationBuilderSubmitPayload) => void;
};

const OPERATOR_OPTIONS: Record<
  AutomationPlaygroundField["type"],
  AutomationPlaygroundConditionOperator[]
> = {
  string: ["equals", "not_equals", "contains"],
  number: ["equals", "not_equals", "greater_than", "less_than"],
  boolean: ["equals", "not_equals"],
  date: ["equals", "greater_than", "less_than"],
  datetime: ["equals", "greater_than", "less_than"],
  id: ["equals"],
};

const TECHNICAL_EVENT_FIELDS = new Set([
  "appointmentId",
  "patientId",
  "employeeId",
  "treatmentId",
  "createdBy",
  "providerMessageId",
]);

const STANDARD_EDITABLE_FIELDS: Record<
  AutomationUpdateFieldTargetEntityType,
  EditableFieldOption[]
> = {
  gabinetPatient: [
    { key: "firstName", label: "First name", valueType: "string", fieldKind: "standard" },
    { key: "lastName", label: "Last name", valueType: "string", fieldKind: "standard" },
    { key: "email", label: "Email", valueType: "string", fieldKind: "standard" },
    { key: "phone", label: "Phone", valueType: "string", fieldKind: "standard" },
    { key: "dateOfBirth", label: "Date of birth", valueType: "date", fieldKind: "standard" },
    { key: "medicalNotes", label: "Medical notes", valueType: "string", fieldKind: "standard" },
    { key: "allergies", label: "Allergies", valueType: "string", fieldKind: "standard" },
    { key: "bloodType", label: "Blood type", valueType: "string", fieldKind: "standard" },
    {
      key: "emergencyContactName",
      label: "Emergency contact name",
      valueType: "string",
      fieldKind: "standard",
    },
    {
      key: "emergencyContactPhone",
      label: "Emergency contact phone",
      valueType: "string",
      fieldKind: "standard",
    },
    {
      key: "referralSource",
      label: "Referral source",
      valueType: "string",
      fieldKind: "standard",
    },
  ],
  gabinetAppointment: [
    { key: "date", label: "Date", valueType: "date", fieldKind: "standard" },
    { key: "startTime", label: "Start time", valueType: "string", fieldKind: "standard" },
    { key: "endTime", label: "End time", valueType: "string", fieldKind: "standard" },
    { key: "notes", label: "Notes", valueType: "string", fieldKind: "standard" },
    {
      key: "internalNotes",
      label: "Internal notes",
      valueType: "string",
      fieldKind: "standard",
    },
    { key: "color", label: "Color", valueType: "string", fieldKind: "standard" },
    {
      key: "cancellationReason",
      label: "Cancellation reason",
      valueType: "string",
      fieldKind: "standard",
    },
    {
      key: "bodyChartData",
      label: "Body chart data",
      valueType: "string",
      fieldKind: "standard",
    },
  ],
  gabinetEmployee: [
    { key: "firstName", label: "First name", valueType: "string", fieldKind: "standard" },
    { key: "lastName", label: "Last name", valueType: "string", fieldKind: "standard" },
    {
      key: "specialization",
      label: "Specialization",
      valueType: "string",
      fieldKind: "standard",
    },
    {
      key: "licenseNumber",
      label: "License number",
      valueType: "string",
      fieldKind: "standard",
    },
    { key: "hireDate", label: "Hire date", valueType: "date", fieldKind: "standard" },
    { key: "isActive", label: "Active", valueType: "boolean", fieldKind: "standard" },
    { key: "color", label: "Color", valueType: "string", fieldKind: "standard" },
    { key: "notes", label: "Notes", valueType: "string", fieldKind: "standard" },
  ],
  lead: [
    { key: "title", label: "Title", valueType: "string", fieldKind: "standard" },
    { key: "status", label: "Status", valueType: "string", fieldKind: "standard" },
    { key: "priority", label: "Priority", valueType: "string", fieldKind: "standard" },
    { key: "source", label: "Source", valueType: "string", fieldKind: "standard" },
    { key: "value", label: "Value", valueType: "number", fieldKind: "standard" },
    { key: "notes", label: "Notes", valueType: "string", fieldKind: "standard" },
  ],
};

function getEventLabel(
  eventType: AutomationBuilderEventCatalogEntry["eventType"],
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  switch (eventType) {
    case "gabinet.appointment.created":
      return t("settings.automationPlayground.events.created");
    case "gabinet.appointment.status_changed":
      return t("settings.automationPlayground.events.statusChanged");
    case "gabinet.appointment.reminder_due":
      return t("settings.automationPlayground.events.reminderDue");
    case "gabinet.appointment.sms_reply_received":
      return t("settings.automationPlayground.events.smsReplyReceived", {
        defaultValue: "An appointment SMS reply is received",
      });
    case "gabinet.patient.created":
      return t("settings.automationPlayground.events.patientCreated", {
        defaultValue: "A new patient is created",
      });
    case "crm.lead.status_changed":
      return t("settings.automationPlayground.events.leadStatusChanged", {
        defaultValue: "A lead status changes",
      });
    case "crm.lead.stage_changed":
      return t("settings.automationPlayground.events.leadStageChanged", {
        defaultValue: "A lead stage changes",
      });
    default:
      return eventType;
  }
}

function getReplyIntentLabel(
  replyIntent: (typeof AUTOMATION_PLAYGROUND_REPLY_INTENTS)[number],
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  switch (replyIntent) {
    case "confirm":
      return t("settings.automationPlayground.replyIntents.confirm", {
        defaultValue: "Confirmation reply",
      });
    case "cancel":
      return t("settings.automationPlayground.replyIntents.cancel", {
        defaultValue: "Cancellation reply",
      });
    case "unknown":
      return t("settings.automationPlayground.replyIntents.unknown", {
        defaultValue: "Other reply",
      });
  }
}

function getGroupLabel(
  group: string | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  switch (group) {
    case "patient":
      return t("settings.automationPlayground.groups.patient");
    case "appointment":
      return t("settings.automationPlayground.groups.appointment");
    case "message":
      return t("settings.automationPlayground.groups.message");
    case "lead":
      return t("settings.automationPlayground.groups.lead", {
        defaultValue: "Lead details",
      });
    case "ownership":
      return t("settings.automationPlayground.groups.ownership", {
        defaultValue: "Ownership",
      });
    case "pipeline":
      return t("settings.automationPlayground.groups.pipeline", {
        defaultValue: "Pipeline",
      });
    default:
      return t("settings.automationPlayground.groups.other");
  }
}

function getOperatorLabel(
  operator: AutomationPlaygroundConditionOperator,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  switch (operator) {
    case "equals":
      return t("settings.automationPlayground.operators.equals");
    case "not_equals":
      return t("settings.automationPlayground.operators.notEquals");
    case "contains":
      return t("settings.automationPlayground.operators.contains");
    case "greater_than":
      return t("settings.automationPlayground.operators.greaterThan");
    case "less_than":
      return t("settings.automationPlayground.operators.lessThan");
  }
}

function getActionTypeLabel(
  actionType: AutomationPlaygroundActionType,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  return t(`settings.automationActionTypes.${actionType}`, {
    defaultValue: actionType,
  });
}

function getTargetEntityLabel(
  entityType: AutomationUpdateFieldTargetEntityType,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  switch (entityType) {
    case "gabinetPatient":
      return t("settings.automationPlayground.updateField.targets.patient", {
        defaultValue: "Patient",
      });
    case "gabinetAppointment":
      return t("settings.automationPlayground.updateField.targets.appointment", {
        defaultValue: "Appointment",
      });
    case "gabinetEmployee":
      return t("settings.automationPlayground.updateField.targets.employee", {
        defaultValue: "Employee",
      });
    case "lead":
      return t("settings.automationPlayground.updateField.targets.lead", {
        defaultValue: "Lead",
      });
  }
}

function mapCustomFieldValueType(
  fieldType: AutomationCustomFieldDefinition["fieldType"],
): AutomationUpdateFieldValueType | null {
  switch (fieldType) {
    case "number":
      return "number";
    case "date":
      return "date";
    case "checkbox":
      return "boolean";
    case "text":
    case "select":
    case "url":
    case "email":
    case "phone":
      return "string";
    default:
      return null;
  }
}

function createDefaultForm(
  eventCatalog: AutomationBuilderEventCatalogEntry[],
  actionCapabilities: AutomationActionCapability[],
  t: (key: string, options?: Record<string, unknown>) => string,
): AutomationPlaygroundFormValue | null {
  const events = getAvailableAutomationPlaygroundEvents(eventCatalog);
  const availableActionCapabilities = getAvailableAutomationPlaygroundActionCapabilities(
    actionCapabilities,
  );
  const eventType = events[0]?.eventType;
  const firstActionType = availableActionCapabilities[0]?.type;

  if (!eventType || !firstActionType) {
    return null;
  }

  return {
    name: t("settings.automationPlayground.defaults.name"),
    description: "",
    enabled: true,
    eventType: eventType as AutomationPlaygroundFormValue["eventType"],
    eventStatus: "",
    replyIntent: "",
    filters: [],
    actions: [
      createAutomationPlaygroundActionDraft(
        firstActionType,
        t,
        eventType as AutomationPlaygroundFormValue["eventType"],
      ),
    ],
  };
}

function createEmptyFilter(fields: AutomationPlaygroundField[]): AutomationPlaygroundFilter | null {
  const field = fields[0];
  if (!field) return null;

  return {
    fieldPath: field.path,
    operator: OPERATOR_OPTIONS[field.type][0],
    value: "",
  };
}

function isValidActionDraft(action: AutomationPlaygroundActionDraft) {
  switch (action.type) {
    case "send_sms":
    case "send_sms_request":
      return action.messageTemplate.trim().length > 0;
    case "send_email":
      return action.mode === "template"
        ? action.templateId !== ""
        : action.subjectTemplate.trim().length > 0 &&
            action.bodyTemplate.trim().length > 0;
    case "create_notification":
      return (
        action.titleTemplate.trim().length > 0 &&
        action.messageTemplate.trim().length > 0
      );
    case "write_activity":
      return action.descriptionTemplate.trim().length > 0;
    case "update_field":
      return action.fieldKey.trim().length > 0 && action.valueTemplate.trim().length > 0;
  }
}

function getActionSummary(
  action: AutomationPlaygroundActionDraft,
  emailTemplates: AutomationEmailTemplateRecord[],
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  switch (action.type) {
    case "send_sms":
      return t("settings.automationPlayground.summary.sendSms", {
        message: action.messageTemplate,
      });
    case "send_sms_request":
      return t("settings.automationPlayground.summary.sendSmsRequest", {
        message: action.messageTemplate,
        defaultValue: `It sends an SMS reply request: ${action.messageTemplate}`,
      });
    case "send_email":
      if (action.mode === "template") {
        const templateName =
          emailTemplates.find((template) => template._id === action.templateId)?.name ??
          action.templateId;
        return t("settings.automationPlayground.summary.sendEmailTemplate", {
          template: templateName,
          defaultValue: `It sends the email template “${templateName}”.`,
        });
      }
      return t("settings.automationPlayground.summary.sendEmailManual", {
        subject: action.subjectTemplate,
        defaultValue: `It sends an email with the subject “${action.subjectTemplate}”.`,
      });
    case "create_notification":
      return t("settings.automationPlayground.summary.createNotification", {
        title: action.titleTemplate,
        message: action.messageTemplate,
      });
    case "write_activity":
      return t("settings.automationPlayground.summary.writeActivity", {
        message: action.descriptionTemplate,
      });
    case "update_field":
      return t("settings.automationPlayground.summary.updateField", {
        entity: getTargetEntityLabel(action.targetEntityType, t),
        field: action.fieldKey,
        value: action.valueTemplate,
        defaultValue: `It updates ${action.fieldKey} on ${getTargetEntityLabel(action.targetEntityType, t)} to ${action.valueTemplate}.`,
      });
  }
}

function getTriggerSummary(
  form: AutomationPlaygroundFormValue,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const eventLabel = getEventLabel(form.eventType, t);
  if (form.eventType === "gabinet.appointment.status_changed" && form.eventStatus) {
    return t("settings.automationPlayground.summary.triggerWithStatus", {
      event: eventLabel,
      status: t(`settings.automationPlayground.statuses.${form.eventStatus}`),
    });
  }

  if (form.eventType === "gabinet.appointment.sms_reply_received" && form.replyIntent) {
    return t("settings.automationPlayground.summary.triggerWithReplyIntent", {
      event: eventLabel,
      replyIntent: getReplyIntentLabel(form.replyIntent, t),
      defaultValue: `This runs when ${eventLabel} and the reply matches ${getReplyIntentLabel(form.replyIntent, t)}.`,
    });
  }

  return t("settings.automationPlayground.summary.trigger", {
    event: eventLabel,
  });
}

function VariablePicker({
  sources,
  onInsert,
  label,
}: {
  sources: AutomationVariableSource[];
  onInsert: (token: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs">
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="end">
        <div className="max-h-60 overflow-y-auto">
          {sources.map((source) => (
            <div key={source.key} className="mb-2">
              <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                {source.label}
              </p>
              {source.fields.map((field) => (
                <button
                  key={`${source.key}.${field.key}`}
                  type="button"
                  className="w-full rounded-sm px-2 py-1 text-left text-sm hover:bg-accent"
                  onClick={() => {
                    onInsert(field.token);
                    setOpen(false);
                  }}
                >
                  {field.label}
                  <span className="ml-1 text-xs text-muted-foreground">
                    {field.token}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function VariableInsertRow({
  sources,
  onInsert,
  t,
}: {
  sources: AutomationVariableSource[];
  onInsert: (token: string) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  if (sources.length === 0) return null;

  return (
    <div className="flex justify-end">
      <VariablePicker
        sources={sources}
        onInsert={onInsert}
        label={t("settings.automationPlayground.variablePicker.insert", {
          defaultValue: "Insert variable",
        })}
      />
    </div>
  );
}

export function AutomationSimpleMode({
  eventCatalog,
  actionCapabilities,
  emailTemplates,
  customFieldsByEntityType,
  initialValue,
  isSubmitting,
  onCancel,
  onSubmit,
}: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState<AutomationPlaygroundFormValue | null>(null);
  const [nextActionType, setNextActionType] =
    useState<AutomationPlaygroundActionType>("send_sms");

  const availableEvents = useMemo(
    () => getAvailableAutomationPlaygroundEvents(eventCatalog),
    [eventCatalog],
  );
  const availableActionCapabilities = useMemo(
    () => getAvailableAutomationPlaygroundActionCapabilities(actionCapabilities),
    [actionCapabilities],
  );
  const actionCapabilityMap = useMemo(
    () =>
      new Map(
        availableActionCapabilities.map((capability) => [capability.type, capability]),
      ),
    [availableActionCapabilities],
  );

  useEffect(() => {
    if (initialValue) {
      setForm(initialValue);
      const firstActionType = initialValue.actions[0]?.type ?? "send_sms";
      setNextActionType(firstActionType);
      return;
    }

    const defaultForm = createDefaultForm(eventCatalog, actionCapabilities, t);
    setForm(defaultForm);
    if (defaultForm?.actions[0]) {
      setNextActionType(defaultForm.actions[0]!.type);
    }
  }, [actionCapabilities, eventCatalog, initialValue, t]);

  const selectedEvent = useMemo(
    () =>
      availableEvents.find((event) => event.eventType === form?.eventType) ??
      availableEvents[0],
    [availableEvents, form?.eventType],
  );

  const availableFields = useMemo(
    () => getAutomationPlaygroundFields(selectedEvent),
    [selectedEvent],
  );

  const variableSources = useMemo<AutomationVariableSource[]>(() => {
    if (!selectedEvent) return [];

    const grouped = new Map<string, AutomationVariableSource>();
    selectedEvent.variableCatalog.forEach((variable) => {
      if (variable.type === "id") return;
      if (variable.group === "audit") return;
      if (TECHNICAL_EVENT_FIELDS.has(variable.path)) return;
      if (variable.path.endsWith("Id") || variable.key.endsWith("Id")) return;

      const groupKey = variable.group ?? "other";
      const existing = grouped.get(groupKey) ?? {
        key: groupKey,
        label: getGroupLabel(variable.group, t),
        fields: [],
      };
      existing.fields.push({
        key: variable.key,
        label: variable.label,
        token: `{{${variable.path}}}`,
      });
      grouped.set(groupKey, existing);
    });

    return Array.from(grouped.values());
  }, [selectedEvent, t]);

  const editableFieldOptions = useMemo<
    Record<AutomationUpdateFieldTargetEntityType, EditableFieldOption[]>
  >(() => {
    const buildCustomFields = (entityType: AutomationUpdateFieldTargetEntityType) =>
      (customFieldsByEntityType[entityType] ?? []).flatMap((field) => {
        const valueType = mapCustomFieldValueType(field.fieldType);
        if (!valueType) return [];
        return [
          {
            key: field.fieldKey,
            label: field.name,
            valueType,
            fieldKind: "custom" as const,
          },
        ];
      });

    return {
      gabinetPatient: [
        ...STANDARD_EDITABLE_FIELDS.gabinetPatient,
        ...buildCustomFields("gabinetPatient"),
      ],
      gabinetAppointment: [
        ...STANDARD_EDITABLE_FIELDS.gabinetAppointment,
        ...buildCustomFields("gabinetAppointment"),
      ],
      gabinetEmployee: [
        ...STANDARD_EDITABLE_FIELDS.gabinetEmployee,
        ...buildCustomFields("gabinetEmployee"),
      ],
      lead: [...STANDARD_EDITABLE_FIELDS.lead],
    };
  }, [customFieldsByEntityType]);

  useEffect(() => {
    if (!form) return;

    const supportedFieldPaths = new Set(availableFields.map((field) => field.path));
    const nextFilters = form.filters.filter((filter) =>
      supportedFieldPaths.has(filter.fieldPath),
    );

    let didChange = nextFilters.length !== form.filters.length;
    const nextActions = form.actions.map((action) => {
      if (action.type !== "update_field") {
        return action;
      }

      const editableFields = editableFieldOptions[action.targetEntityType];
      const matchingField = editableFields.find(
        (field) =>
          field.key === action.fieldKey && field.fieldKind === action.fieldKind,
      );
      if (matchingField) {
        if (matchingField.valueType === action.valueType) {
          return action;
        }
        didChange = true;
        return {
          ...action,
          valueType: matchingField.valueType,
        };
      }

      const fallbackField = editableFields[0];
      if (!fallbackField) {
        return action;
      }

      didChange = true;
      return {
        ...action,
        fieldKey: fallbackField.key,
        fieldKind: fallbackField.fieldKind,
        valueType: fallbackField.valueType,
      };
    });

    if (didChange) {
      setForm({
        ...form,
        filters: nextFilters,
        actions: nextActions,
      });
    }
  }, [availableFields, editableFieldOptions, form]);

  if (!form || !selectedEvent || availableActionCapabilities.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          {t("settings.automationPlayground.unavailable")}
        </CardContent>
      </Card>
    );
  }

  const canSubmit =
    !!form.name.trim() &&
    form.actions.length > 0 &&
    form.actions.every(isValidActionDraft) &&
    form.filters.every((filter) => !!filter.value.trim());

  const updateFilter = (index: number, nextFilter: AutomationPlaygroundFilter) => {
    setForm((current) => {
      if (!current) return current;
      const nextFilters = [...current.filters];
      nextFilters[index] = nextFilter;
      return { ...current, filters: nextFilters };
    });
  };

  const updateAction = (actionId: string, updater: (action: AutomationPlaygroundActionDraft) => AutomationPlaygroundActionDraft) => {
    setForm((current) => {
      if (!current) return current;
      return {
        ...current,
        actions: current.actions.map((action) =>
          action.id === actionId ? updater(action) : action,
        ),
      };
    });
  };

  const appendTokenToActionField = (
    actionId: string,
    field:
      | "messageTemplate"
      | "subjectTemplate"
      | "bodyTemplate"
      | "titleTemplate"
      | "descriptionTemplate"
      | "valueTemplate",
    token: string,
  ) => {
    updateAction(actionId, (action) => {
      if (!(field in action)) return action;
      return {
        ...action,
        [field]: `${String(action[field as keyof typeof action] ?? "")}${token}`,
      } as AutomationPlaygroundActionDraft;
    });
  };

  const handleAddFilter = () => {
    const nextFilter = createEmptyFilter(availableFields);
    if (!nextFilter) return;

    setForm((current) =>
      current ? { ...current, filters: [...current.filters, nextFilter] } : current,
    );
  };

  const handleRemoveFilter = (index: number) => {
    setForm((current) =>
      current
        ? {
            ...current,
            filters: current.filters.filter((_, currentIndex) => currentIndex !== index),
          }
        : current,
    );
  };

  const handleAddAction = () => {
    setForm((current) =>
      current
        ? {
            ...current,
            actions: [
              ...current.actions,
              createAutomationPlaygroundActionDraft(nextActionType, t, current.eventType),
            ],
          }
        : current,
    );
  };

  const handleRemoveAction = (actionId: string) => {
    setForm((current) =>
      current
        ? {
            ...current,
            actions: current.actions.filter((action) => action.id !== actionId),
          }
        : current,
    );
  };

  const moveAction = (index: number, direction: -1 | 1) => {
    setForm((current) => {
      if (!current) return current;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.actions.length) {
        return current;
      }
      const nextActions = [...current.actions];
      const [item] = nextActions.splice(index, 1);
      nextActions.splice(nextIndex, 0, item);
      return {
        ...current,
        actions: nextActions,
      };
    });
  };

  const handleSubmit = () => {
    onSubmit(buildAutomationPlaygroundSubmitPayload(form, eventCatalog));
  };

  const nextCapability = actionCapabilityMap.get(nextActionType);

  return (
    <div className="space-y-6" data-testid="automation-playground">
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.automationPlayground.title")}</CardTitle>
          <CardDescription>
            {t("settings.automationPlayground.description")}
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.automationPlayground.sections.basics.title")}</CardTitle>
          <CardDescription>
            {t("settings.automationPlayground.sections.basics.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="automation-playground-name">{t("common.name")}</Label>
              <Input
                id="automation-playground-name"
                value={form.name}
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, name: event.target.value } : current,
                  )
                }
                data-testid="automation-playground-name-input"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-4 py-3">
              <div>
                <p className="text-sm font-medium">
                  {t("settings.automationPlayground.enabledLabel")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("settings.automationPlayground.enabledHint")}
                </p>
              </div>
              <Switch
                checked={form.enabled}
                onCheckedChange={(checked) =>
                  setForm((current) =>
                    current ? { ...current, enabled: checked } : current,
                  )
                }
                data-testid="automation-playground-enabled-switch"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="automation-playground-description">
              {t("common.description")} ({t("common.optional")})
            </Label>
            <Textarea
              id="automation-playground-description"
              value={form.description}
              onChange={(event) =>
                setForm((current) =>
                  current ? { ...current, description: event.target.value } : current,
                )
              }
              rows={3}
              data-testid="automation-playground-description-input"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.automationPlayground.sections.trigger.title")}</CardTitle>
          <CardDescription>
            {t("settings.automationPlayground.sections.trigger.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("settings.automationPlayground.entityLabel")}</Label>
              <div className="flex h-10 items-center rounded-md border px-3 text-sm">
                {selectedEvent.entityType
                  ? getTargetEntityLabel(
                      selectedEvent.entityType as AutomationUpdateFieldTargetEntityType,
                      t,
                    )
                  : t("settings.automationPlayground.entityAppointment")}
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("settings.automationPlayground.eventLabel")}</Label>
              <Select
                value={form.eventType}
                onValueChange={(value) =>
                  setForm((current) =>
                    current
                      ? {
                          ...current,
                          eventType: value as AutomationPlaygroundFormValue["eventType"],
                          eventStatus: "",
                          replyIntent: "",
                          filters: [],
                        }
                      : current,
                  )
                }
              >
                <SelectTrigger data-testid="automation-playground-event-trigger">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableEvents.map((event) => (
                    <SelectItem key={event.eventType} value={event.eventType}>
                      {getEventLabel(event.eventType, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {form.eventType === "gabinet.appointment.status_changed" ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {t("settings.automationPlayground.sections.eventSettings.title")}
            </CardTitle>
            <CardDescription>
              {t("settings.automationPlayground.sections.eventSettings.description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>{t("settings.automationPlayground.statusLabel")}</Label>
              <Select
                value={form.eventStatus || "__all__"}
                onValueChange={(value) =>
                  setForm((current) =>
                    current
                      ? {
                          ...current,
                          eventStatus:
                            value === "__all__"
                              ? ""
                              : (value as AutomationPlaygroundFormValue["eventStatus"]),
                        }
                      : current,
                  )
                }
              >
                <SelectTrigger data-testid="automation-playground-status-trigger">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">
                    {t("settings.automationPlayground.statusAny")}
                  </SelectItem>
                  {AUTOMATION_PLAYGROUND_APPOINTMENT_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {t(`settings.automationPlayground.statuses.${status}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {form.eventType === "gabinet.appointment.sms_reply_received" ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {t("settings.automationPlayground.sections.eventSettings.title")}
            </CardTitle>
            <CardDescription>
              {t("settings.automationPlayground.replyIntentDescription", {
                defaultValue: "Optionally limit this automation to a specific SMS reply intent.",
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>
                {t("settings.automationPlayground.replyIntentLabel", {
                  defaultValue: "Only for this reply",
                })}
              </Label>
              <Select
                value={form.replyIntent || "__all__"}
                onValueChange={(value) =>
                  setForm((current) =>
                    current
                      ? {
                          ...current,
                          replyIntent:
                            value === "__all__"
                              ? ""
                              : (value as AutomationPlaygroundFormValue["replyIntent"]),
                        }
                      : current,
                  )
                }
              >
                <SelectTrigger data-testid="automation-playground-reply-intent-trigger">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">
                    {t("settings.automationPlayground.replyIntentAny", {
                      defaultValue: "Any reply",
                    })}
                  </SelectItem>
                  {AUTOMATION_PLAYGROUND_REPLY_INTENTS.map((replyIntent) => (
                    <SelectItem key={replyIntent} value={replyIntent}>
                      {getReplyIntentLabel(replyIntent, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.automationPlayground.sections.filters.title")}</CardTitle>
          <CardDescription>
            {t("settings.automationPlayground.sections.filters.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {form.filters.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              {t("settings.automationPlayground.filtersEmpty")}
            </div>
          ) : (
            form.filters.map((filter, index) => {
              const field =
                availableFields.find((item) => item.path === filter.fieldPath) ??
                availableFields[0];
              const operators = field
                ? OPERATOR_OPTIONS[field.type]
                : OPERATOR_OPTIONS.string;

              return (
                <div
                  key={`${filter.fieldPath}-${index}`}
                  className="grid gap-3 rounded-lg border p-4 md:grid-cols-[1.3fr_1fr_1fr_auto]"
                  data-testid={`automation-playground-filter-${index}`}
                >
                  <div className="space-y-2">
                    <Label>{t("settings.automationPlayground.filterFieldLabel")}</Label>
                    <Select
                      value={filter.fieldPath}
                      onValueChange={(value) => {
                        const nextField =
                          availableFields.find((item) => item.path === value) ??
                          availableFields[0];
                        if (!nextField) return;
                        updateFilter(index, {
                          fieldPath: value,
                          operator: OPERATOR_OPTIONS[nextField.type][0],
                          value: "",
                        });
                      }}
                    >
                      <SelectTrigger data-testid={`automation-playground-filter-field-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {availableFields.map((item) => (
                          <SelectItem key={item.path} value={item.path}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {field?.group ? (
                      <p className="text-xs text-muted-foreground">
                        {getGroupLabel(field.group, t)}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label>{t("settings.automationPlayground.filterOperatorLabel")}</Label>
                    <Select
                      value={filter.operator}
                      onValueChange={(value) =>
                        updateFilter(index, {
                          ...filter,
                          operator: value as AutomationPlaygroundConditionOperator,
                        })
                      }
                    >
                      <SelectTrigger data-testid={`automation-playground-filter-operator-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {operators.map((operator) => (
                          <SelectItem key={operator} value={operator}>
                            {getOperatorLabel(operator, t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("settings.automationPlayground.filterValueLabel")}</Label>
                    {field?.type === "boolean" ? (
                      <Select
                        value={filter.value || "true"}
                        onValueChange={(value) =>
                          updateFilter(index, {
                            ...filter,
                            value,
                          })
                        }
                      >
                        <SelectTrigger data-testid={`automation-playground-filter-value-${index}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">{t("common.yes")}</SelectItem>
                          <SelectItem value="false">{t("common.no")}</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        type={
                          field?.type === "number"
                            ? "number"
                            : field?.type === "date"
                              ? "date"
                              : field?.type === "datetime"
                                ? "datetime-local"
                                : "text"
                        }
                        value={filter.value}
                        onChange={(event) =>
                          updateFilter(index, {
                            ...filter,
                            value: event.target.value,
                          })
                        }
                        data-testid={`automation-playground-filter-value-${index}`}
                      />
                    )}
                  </div>

                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveFilter(index)}
                      data-testid={`automation-playground-filter-remove-${index}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}

          <Button
            type="button"
            variant="outline"
            onClick={handleAddFilter}
            disabled={availableFields.length === 0}
            data-testid="automation-playground-add-filter-button"
          >
            <Plus className="mr-2 h-4 w-4" />
            {t("settings.automationPlayground.addFilter")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.automationPlayground.sections.action.title")}</CardTitle>
          <CardDescription>
            {t("settings.automationPlayground.sections.action.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <Label>
                {t("settings.automationPlayground.actionLabel")}
              </Label>
              <Select
                value={nextActionType}
                onValueChange={(value) =>
                  setNextActionType(value as AutomationPlaygroundActionType)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableActionCapabilities.map((capability) => (
                    <SelectItem
                      key={capability.type}
                      value={capability.type}
                      disabled={!capability.available}
                    >
                      {getActionTypeLabel(capability.type, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {nextCapability && !nextCapability.available ? (
                <p className="text-xs text-amber-600">
                  {nextCapability.missingConfigReason ||
                    t("settings.automationPlayground.capabilities.configRequired", {
                      defaultValue: "This action needs additional configuration before it can run.",
                    })}
                </p>
              ) : null}
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                onClick={handleAddAction}
                disabled={!nextCapability?.available}
                data-testid="automation-playground-add-action-button"
              >
                <Plus className="mr-2 h-4 w-4" />
                {t("settings.automationPlayground.addAction", {
                  defaultValue: "Add action",
                })}
              </Button>
            </div>
          </div>

          {form.actions.map((action, index) => {
            const capability = actionCapabilityMap.get(action.type);
            const editableFields =
              action.type === "update_field"
                ? editableFieldOptions[action.targetEntityType]
                : [];
            const selectedEditableField =
              action.type === "update_field"
                ? editableFields.find(
                    (field) =>
                      field.key === action.fieldKey &&
                      field.fieldKind === action.fieldKind,
                  ) ?? editableFields[0]
                : null;

            return (
              <div
                key={action.id}
                className="space-y-4 rounded-lg border p-4"
                data-testid={`automation-playground-action-card-${index}`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">
                        {t("settings.automationPlayground.actionCardTitle", {
                          index: index + 1,
                          defaultValue: `Action ${index + 1}`,
                        })}
                      </p>
                      <Badge variant="outline">
                        {getActionTypeLabel(action.type, t)}
                      </Badge>
                      {capability && !capability.available ? (
                        <Badge variant="secondary">
                          {t("settings.automationPlayground.capabilities.configRequiredShort", {
                            defaultValue: "Needs setup",
                          })}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="w-full max-w-sm space-y-2">
                      <Select
                        value={action.type}
                        onValueChange={(value) =>
                          updateAction(action.id, () =>
                            createAutomationPlaygroundActionDraft(
                              value as AutomationPlaygroundActionType,
                              t,
                              form.eventType,
                            ),
                          )
                        }
                      >
                        <SelectTrigger
                          data-testid={
                            index === 0
                              ? "automation-playground-action-trigger"
                              : `automation-playground-action-trigger-${index}`
                          }
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {availableActionCapabilities.map((option) => (
                            <SelectItem
                              key={option.type}
                              value={option.type}
                              disabled={!option.available && option.type !== action.type}
                            >
                              {getActionTypeLabel(option.type, t)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {capability && !capability.available ? (
                      <p className="text-xs text-amber-600">
                        {capability.missingConfigReason ||
                          t("settings.automationPlayground.capabilities.configRequired", {
                            defaultValue: "This action needs additional configuration before it can run.",
                          })}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => moveAction(index, -1)}
                      disabled={index === 0}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => moveAction(index, 1)}
                      disabled={index === form.actions.length - 1}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveAction(action.id)}
                      disabled={form.actions.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {(action.type === "send_sms" || action.type === "send_sms_request") && (
                  <div
                    className="space-y-2"
                    data-testid={`automation-playground-action-${action.type}`}
                  >
                    <Label htmlFor={`automation-playground-sms-message-${action.id}`}>
                      {t("settings.automationPlayground.smsMessageLabel")}
                    </Label>
                    <Textarea
                      id={`automation-playground-sms-message-${action.id}`}
                      rows={5}
                      value={action.messageTemplate}
                      onChange={(event) =>
                        updateAction(action.id, (current) =>
                          current.type === "send_sms" || current.type === "send_sms_request"
                            ? { ...current, messageTemplate: event.target.value }
                            : current,
                        )
                      }
                      data-testid="automation-playground-sms-message-input"
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("settings.automationPlayground.smsMessageHint")}
                    </p>
                    <VariableInsertRow
                      sources={variableSources}
                      onInsert={(token) =>
                        appendTokenToActionField(action.id, "messageTemplate", token)
                      }
                      t={t}
                    />
                  </div>
                )}

                {action.type === "send_email" && (
                  <div className="space-y-4" data-testid="automation-playground-action-send-email">
                    <div className="space-y-2">
                      <Label>
                        {t("settings.automationPlayground.emailModeLabel", {
                          defaultValue: "Email content mode",
                        })}
                      </Label>
                      <Select
                        value={action.mode}
                        onValueChange={(value) =>
                          updateAction(action.id, (current) =>
                            current.type !== "send_email"
                              ? current
                              : value === "template"
                                ? {
                                    id: current.id,
                                    type: "send_email",
                                    mode: "template",
                                    templateId: "",
                                  }
                                : {
                                    id: current.id,
                                    type: "send_email",
                                    mode: "manual",
                                    subjectTemplate: t(
                                      form.eventType === "gabinet.patient.created"
                                        ? "settings.automationPlayground.defaults.patientEmailSubject"
                                        : "settings.automationPlayground.defaults.emailSubject",
                                      {
                                        defaultValue:
                                          form.eventType === "gabinet.patient.created"
                                            ? "Patient update"
                                            : "Appointment update",
                                      },
                                    ),
                                    bodyTemplate: t(
                                      form.eventType === "gabinet.patient.created"
                                        ? "settings.automationPlayground.defaults.patientEmailBody"
                                        : "settings.automationPlayground.defaults.emailBody",
                                      {
                                        defaultValue:
                                          form.eventType === "gabinet.patient.created"
                                            ? "Hello {{patientName}}, a new patient profile was created in your clinic."
                                            : "Hello {{patientName}}, we are contacting you about your appointment on {{date}} at {{startTime}}.",
                                      },
                                    ),
                                  },
                          )
                        }
                      >
                        <SelectTrigger data-testid={`automation-playground-email-mode-${index}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manual">
                            {t("settings.automationPlayground.emailModes.manual", {
                              defaultValue: "Write the email here",
                            })}
                          </SelectItem>
                          <SelectItem value="template">
                            {t("settings.automationPlayground.emailModes.template", {
                              defaultValue: "Use an email template",
                            })}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {action.mode === "template" ? (
                      <div className="space-y-2">
                        <Label>
                          {t("settings.automationPlayground.emailTemplateLabel", {
                            defaultValue: "Email template",
                          })}
                        </Label>
                        <Select
                          value={action.templateId || "__none__"}
                          onValueChange={(value) =>
                            updateAction(action.id, (current) =>
                              current.type === "send_email" && current.mode === "template"
                                ? {
                                    ...current,
                                    templateId:
                                      value === "__none__"
                                        ? ""
                                        : (value as Id<"emailTemplates">),
                                  }
                                : current,
                            )
                          }
                        >
                          <SelectTrigger data-testid="automation-playground-email-template-input">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">
                              {t("settings.automationPlayground.emailTemplatePlaceholder", {
                                defaultValue: "Choose a template",
                              })}
                            </SelectItem>
                            {emailTemplates.map((template) => (
                              <SelectItem key={template._id} value={template._id}>
                                {template.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {emailTemplates.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            {t("settings.automationPlayground.emailTemplateEmpty", {
                              defaultValue: "Create an email template first to use template mode.",
                            })}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor={`automation-playground-email-subject-${action.id}`}>
                            {t("settings.automationPlayground.emailSubjectLabel", {
                              defaultValue: "Email subject",
                            })}
                          </Label>
                          <Input
                            id={`automation-playground-email-subject-${action.id}`}
                            value={action.subjectTemplate}
                            onChange={(event) =>
                              updateAction(action.id, (current) =>
                                current.type === "send_email" && current.mode === "manual"
                                  ? { ...current, subjectTemplate: event.target.value }
                                  : current,
                              )
                            }
                            data-testid="automation-playground-email-subject-input"
                          />
                          <VariableInsertRow
                            sources={variableSources}
                            onInsert={(token) =>
                              appendTokenToActionField(action.id, "subjectTemplate", token)
                            }
                            t={t}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`automation-playground-email-body-${action.id}`}>
                            {t("settings.automationPlayground.emailBodyLabel", {
                              defaultValue: "Email body",
                            })}
                          </Label>
                          <Textarea
                            id={`automation-playground-email-body-${action.id}`}
                            rows={6}
                            value={action.bodyTemplate}
                            onChange={(event) =>
                              updateAction(action.id, (current) =>
                                current.type === "send_email" && current.mode === "manual"
                                  ? { ...current, bodyTemplate: event.target.value }
                                  : current,
                              )
                            }
                            data-testid="automation-playground-email-body-input"
                          />
                          <VariableInsertRow
                            sources={variableSources}
                            onInsert={(token) =>
                              appendTokenToActionField(action.id, "bodyTemplate", token)
                            }
                            t={t}
                          />
                        </div>
                      </>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {t(
                        form.eventType.startsWith("crm.lead.")
                          ? "settings.automationPlayground.recipients.leadOwnerEmail"
                          : form.eventType === "gabinet.patient.created"
                            ? "settings.automationPlayground.recipients.patientEmailPatient"
                            : "settings.automationPlayground.recipients.patientEmail",
                        {
                          defaultValue: form.eventType.startsWith("crm.lead.")
                            ? "This email is sent to the lead owner."
                            : form.eventType === "gabinet.patient.created"
                              ? "This email is sent to the patient email on the patient record."
                              : "This email is sent to the patient email on the appointment.",
                        },
                      )}
                    </p>
                  </div>
                )}

                {action.type === "create_notification" && (
                  <div
                    className="space-y-4"
                    data-testid="automation-playground-action-create-notification"
                  >
                    <div className="space-y-2">
                      <Label htmlFor={`automation-playground-notification-title-${action.id}`}>
                        {t("settings.automationPlayground.notificationTitleLabel")}
                      </Label>
                      <Input
                        id={`automation-playground-notification-title-${action.id}`}
                        value={action.titleTemplate}
                        onChange={(event) =>
                          updateAction(action.id, (current) =>
                            current.type === "create_notification"
                              ? { ...current, titleTemplate: event.target.value }
                              : current,
                          )
                        }
                        data-testid="automation-playground-notification-title-input"
                      />
                      <VariableInsertRow
                        sources={variableSources}
                        onInsert={(token) =>
                          appendTokenToActionField(action.id, "titleTemplate", token)
                        }
                        t={t}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`automation-playground-notification-message-${action.id}`}>
                        {t("settings.automationPlayground.notificationMessageLabel")}
                      </Label>
                      <Textarea
                        id={`automation-playground-notification-message-${action.id}`}
                        rows={4}
                        value={action.messageTemplate}
                        onChange={(event) =>
                          updateAction(action.id, (current) =>
                            current.type === "create_notification"
                              ? { ...current, messageTemplate: event.target.value }
                              : current,
                          )
                        }
                        data-testid="automation-playground-notification-message-input"
                      />
                      <VariableInsertRow
                        sources={variableSources}
                        onInsert={(token) =>
                          appendTokenToActionField(action.id, "messageTemplate", token)
                        }
                        t={t}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t(
                        form.eventType.startsWith("crm.lead.")
                          ? "settings.automationPlayground.recipients.assignedLeadOwner"
                          : form.eventType === "gabinet.patient.created"
                            ? "settings.automationPlayground.recipients.createdBy"
                            : "settings.automationPlayground.recipients.assignedEmployee",
                        {
                          defaultValue: form.eventType.startsWith("crm.lead.")
                            ? "This notification goes to the assigned lead owner."
                            : form.eventType === "gabinet.patient.created"
                              ? "This notification goes to the user who created the patient."
                              : "This notification goes to the employee linked to the appointment.",
                        },
                      )}
                    </p>
                  </div>
                )}

                {action.type === "write_activity" && (
                  <div
                    className="space-y-2"
                    data-testid="automation-playground-action-write-activity"
                  >
                    <Label htmlFor={`automation-playground-activity-message-${action.id}`}>
                      {t("settings.automationPlayground.activityMessageLabel")}
                    </Label>
                    <Textarea
                      id={`automation-playground-activity-message-${action.id}`}
                      rows={4}
                      value={action.descriptionTemplate}
                      onChange={(event) =>
                        updateAction(action.id, (current) =>
                          current.type === "write_activity"
                            ? { ...current, descriptionTemplate: event.target.value }
                            : current,
                        )
                      }
                      data-testid="automation-playground-activity-message-input"
                    />
                    <VariableInsertRow
                      sources={variableSources}
                      onInsert={(token) =>
                        appendTokenToActionField(action.id, "descriptionTemplate", token)
                      }
                      t={t}
                    />
                  </div>
                )}

                {action.type === "update_field" && (
                  <div className="space-y-4" data-testid="automation-playground-action-update-field">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>
                          {t("settings.automationPlayground.updateField.targetLabel", {
                            defaultValue: "Update this record",
                          })}
                        </Label>
                        <Select
                          value={action.targetEntityType}
                          onValueChange={(value) =>
                            updateAction(action.id, (current) => {
                              if (current.type !== "update_field") return current;
                              const nextTarget = value as AutomationUpdateFieldTargetEntityType;
                              const nextField = editableFieldOptions[nextTarget][0];
                              return {
                                ...current,
                                targetEntityType: nextTarget,
                                fieldKind: nextField?.fieldKind ?? "standard",
                                fieldKey: nextField?.key ?? "",
                                valueType: nextField?.valueType ?? "string",
                              };
                            })
                          }
                        >
                          <SelectTrigger data-testid={`automation-playground-update-target-${index}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="gabinetPatient">
                              {getTargetEntityLabel("gabinetPatient", t)}
                            </SelectItem>
                            <SelectItem value="gabinetAppointment">
                              {getTargetEntityLabel("gabinetAppointment", t)}
                            </SelectItem>
                            <SelectItem value="gabinetEmployee">
                              {getTargetEntityLabel("gabinetEmployee", t)}
                            </SelectItem>
                            <SelectItem value="lead">
                              {getTargetEntityLabel("lead", t)}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>
                          {t("settings.automationPlayground.updateField.fieldLabel", {
                            defaultValue: "Field to update",
                          })}
                        </Label>
                        <Select
                          value={`${action.fieldKind}:${action.fieldKey}`}
                          onValueChange={(value) => {
                            const [fieldKind, fieldKey] = value.split(":");
                            const matchingField = editableFields.find(
                              (field) =>
                                field.fieldKind === fieldKind && field.key === fieldKey,
                            );
                            if (!matchingField) return;
                            updateAction(action.id, (current) =>
                              current.type === "update_field"
                                ? {
                                    ...current,
                                    fieldKind: matchingField.fieldKind,
                                    fieldKey: matchingField.key,
                                    valueType: matchingField.valueType,
                                  }
                                : current,
                            );
                          }}
                        >
                          <SelectTrigger data-testid={`automation-playground-update-field-${index}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {editableFields.map((field) => (
                              <SelectItem
                                key={`${field.fieldKind}:${field.key}`}
                                value={`${field.fieldKind}:${field.key}`}
                              >
                                {field.fieldKind === "custom"
                                  ? `${field.label} (${t("settings.automationPlayground.updateField.customFieldShort", {
                                      defaultValue: "custom",
                                    })})`
                                  : field.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`automation-playground-update-value-${action.id}`}>
                        {t("settings.automationPlayground.updateField.valueLabel", {
                          defaultValue: "New value",
                        })}
                      </Label>
                      {selectedEditableField?.valueType === "boolean" ? (
                        <Select
                          value={action.valueTemplate || "true"}
                          onValueChange={(value) =>
                            updateAction(action.id, (current) =>
                              current.type === "update_field"
                                ? { ...current, valueTemplate: value }
                                : current,
                            )
                          }
                        >
                          <SelectTrigger data-testid="automation-playground-update-value-input">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">{t("common.yes")}</SelectItem>
                            <SelectItem value="false">{t("common.no")}</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          id={`automation-playground-update-value-${action.id}`}
                          type={selectedEditableField?.valueType === "date" ? "date" : selectedEditableField?.valueType === "number" ? "number" : "text"}
                          value={action.valueTemplate}
                          onChange={(event) =>
                            updateAction(action.id, (current) =>
                              current.type === "update_field"
                                ? { ...current, valueTemplate: event.target.value }
                                : current,
                            )
                          }
                          data-testid="automation-playground-update-value-input"
                        />
                      )}
                      <VariableInsertRow
                        sources={variableSources}
                        onInsert={(token) =>
                          appendTokenToActionField(action.id, "valueTemplate", token)
                        }
                        t={t}
                      />
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {t("settings.automationPlayground.updateField.permissionHint", {
                        defaultValue:
                          "Only safe, permission-checked fields can be updated from automation.",
                      })}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card data-testid="automation-playground-summary">
        <CardHeader>
          <CardTitle>{t("settings.automationPlayground.sections.summary.title")}</CardTitle>
          <CardDescription>
            {t("settings.automationPlayground.sections.summary.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              {selectedEvent.entityType
                ? getTargetEntityLabel(
                    selectedEvent.entityType as AutomationUpdateFieldTargetEntityType,
                    t,
                  )
                : t("settings.automationPlayground.entityAppointment")}
            </Badge>
            <Badge variant="outline">{getEventLabel(form.eventType, t)}</Badge>
            <Badge variant={form.enabled ? "default" : "secondary"}>
              {form.enabled
                ? t("settings.automationRuleStates.enabled")
                : t("settings.automationRuleStates.disabled")}
            </Badge>
            <Badge variant="outline">
              {t("settings.automationActionCount", {
                count: form.actions.length,
              })}
            </Badge>
          </div>
          <p>{getTriggerSummary(form, t)}</p>
          <div className="space-y-2">
            {form.actions.map((action, index) => (
              <p key={action.id}>
                {t("settings.automationPlayground.summary.actionLine", {
                  index: index + 1,
                  summary: getActionSummary(action, emailTemplates, t),
                  defaultValue: `${index + 1}. ${getActionSummary(action, emailTemplates, t)}`,
                })}
              </p>
            ))}
          </div>
          {form.filters.length > 0 ? (
            <p>
              {t("settings.automationPlayground.summary.filters", {
                count: form.filters.length,
              })}
            </p>
          ) : (
            <p>{t("settings.automationPlayground.summary.noFilters")}</p>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!canSubmit || isSubmitting}
          data-testid="automation-playground-save-button"
        >
          {isSubmitting ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </div>
  );
}
