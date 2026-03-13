import { useEffect, useMemo, useState } from "react";
import { Background, Controls, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTranslation } from "react-i18next";
import type { Id } from "@cvx/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export type AutomationBuilderEventCatalogEntry = {
  module: "crm" | "gabinet" | "platform";
  eventType: string;
  label: string;
  entityType?: string;
  source: "domain_event" | "communication_reply";
  variableCatalog: Array<{
    key: string;
    path: string;
    label: string;
    type: "string" | "number" | "boolean" | "date" | "datetime" | "id";
    group?: string;
  }>;
};

export type AutomationBuilderSubmitPayload = {
  name: string;
  description?: string;
  module: "crm" | "gabinet" | "platform";
  eventType: string;
  entityType?: string;
  enabled: boolean;
  trigger: {
    module: "crm" | "gabinet" | "platform";
    eventType: string;
    entityType?: string;
    source: "domain_event" | "communication_reply";
    label?: string;
  };
  graph: {
    nodes: Array<
      | {
          id: string;
          type: "trigger";
          positionX: number;
          positionY: number;
          trigger: {
            module: "crm" | "gabinet" | "platform";
            eventType: string;
            entityType?: string;
            source: "domain_event" | "communication_reply";
            label?: string;
          };
        }
      | {
          id: string;
          type: "condition";
          positionX: number;
          positionY: number;
          condition: {
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
        }
      | {
          id: string;
          type: "action";
          positionX: number;
          positionY: number;
          action:
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
                  | "gabinetEmployee";
                targetIdPath?: string;
                fieldKind: "standard" | "custom";
                fieldKey: string;
                valueTemplate: string;
                valueType: "string" | "number" | "boolean" | "date";
              };
        }
    >;
    edges: Array<{ id: string; source: string; target: string; branch?: "default" | "true" | "false" }>;
  };
  conditions: Array<{
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
  }>;
  actions: Array<
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
          | "gabinetEmployee";
        targetIdPath?: string;
        fieldKind: "standard" | "custom";
        fieldKey: string;
        valueTemplate: string;
        valueType: "string" | "number" | "boolean" | "date";
      }
  >;
};

export type AutomationBuilderInitialValue = {
  name: string;
  description: string;
  enabled: boolean;
  eventType: string;
  actionType: "send_email" | "send_sms" | "send_sms_request" | "create_notification" | "write_activity";
  smsPhonePath: string;
  smsMessageTemplate: string;
  emailTemplateEventType: string;
  emailRecipientPath: string;
  emailRecipientNamePath: string;
  notificationUserIdPath: string;
  notificationTitleTemplate: string;
  notificationMessageTemplate: string;
  notificationLinkTemplate: string;
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
  activityDescriptionTemplate: string;
  activityEntityTypePath: string;
  activityEntityIdPath: string;
  useCondition: boolean;
  conditionPath: string;
  conditionOperator:
    | "equals"
    | "not_equals"
    | "contains"
    | "greater_than"
    | "less_than"
    | "is_truthy"
    | "is_falsy";
  conditionValue: string;
};

type Props = {
  eventCatalog: AutomationBuilderEventCatalogEntry[];
  actionTypes: string[];
  initialValue: AutomationBuilderInitialValue;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (payload: AutomationBuilderSubmitPayload) => void;
};

const ACTION_TYPES = [
  "send_sms",
  "send_sms_request",
  "send_email",
  "create_notification",
  "write_activity",
] as const;

function toSupportedActionTypes(actionTypes: string[]) {
  return actionTypes.filter((actionType): actionType is (typeof ACTION_TYPES)[number] =>
    ACTION_TYPES.includes(actionType as (typeof ACTION_TYPES)[number]),
  );
}

export function AutomationGraphBuilder({
  eventCatalog,
  actionTypes,
  initialValue,
  isSubmitting,
  onCancel,
  onSubmit,
}: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState<AutomationBuilderInitialValue>(initialValue);

  useEffect(() => {
    setForm(initialValue);
  }, [initialValue]);

  const supportedActionTypes = useMemo(() => {
    const mapped = toSupportedActionTypes(actionTypes);
    if (mapped.length > 0) return mapped;
    return ["send_sms", "create_notification"];
  }, [actionTypes]);

  useEffect(() => {
    if (!supportedActionTypes.includes(form.actionType)) {
      setForm((prev) => ({
        ...prev,
        actionType: supportedActionTypes[0] as AutomationBuilderInitialValue["actionType"],
      }));
    }
  }, [form.actionType, supportedActionTypes]);

  const selectedEvent =
    eventCatalog.find((event) => event.eventType === form.eventType) ??
    eventCatalog[0];

  const graphNodes = useMemo<Node[]>(() => {
    const triggerNode: Node = {
      id: "trigger-1",
      type: "default",
      position: { x: 60, y: 70 },
      data: { label: t("settings.automationBuilderTriggerNode", { event: selectedEvent?.label ?? form.eventType }) },
      draggable: false,
      selectable: false,
    };

    const actionNode: Node = {
      id: "action-1",
      type: "default",
      position: { x: form.useCondition ? 720 : 390, y: 70 },
      data: { label: t("settings.automationBuilderActionNode", { action: t(`settings.automationActionTypes.${form.actionType}`, { defaultValue: form.actionType }) }) },
      draggable: false,
      selectable: false,
    };

    if (!form.useCondition) {
      return [triggerNode, actionNode];
    }

    const conditionNode: Node = {
      id: "condition-1",
      type: "default",
      position: { x: 390, y: 70 },
      data: { label: t("settings.automationBuilderConditionNode") },
      draggable: false,
      selectable: false,
    };

    return [triggerNode, conditionNode, actionNode];
  }, [form.actionType, form.eventType, form.useCondition, selectedEvent, t]);

  const graphEdges = useMemo<Edge[]>(() => {
    if (!form.useCondition) {
      return [{ id: "e-trigger-action", source: "trigger-1", target: "action-1" }];
    }
    return [
      { id: "e-trigger-condition", source: "trigger-1", target: "condition-1" },
      { id: "e-condition-action", source: "condition-1", target: "action-1" },
    ];
  }, [form.useCondition]);

  const submit = () => {
    if (!selectedEvent || !form.name.trim()) return;

    const trigger = {
      module: selectedEvent.module,
      eventType: selectedEvent.eventType,
      entityType: selectedEvent.entityType,
      source: selectedEvent.source,
      label: selectedEvent.label,
    } as const;

    const action =
      form.actionType === "send_sms" || form.actionType === "send_sms_request"
        ? {
            type: form.actionType,
            phonePath: form.smsPhonePath.trim() || "patientPhone",
            messageTemplate: form.smsMessageTemplate.trim(),
          }
        : form.actionType === "send_email"
          ? {
              type: "send_email" as const,
              templateEventType: form.emailTemplateEventType.trim() || selectedEvent.eventType,
              recipientEmailPath: form.emailRecipientPath.trim() || "patientEmail",
              recipientNamePath: form.emailRecipientNamePath.trim() || undefined,
            }
          : form.actionType === "create_notification"
            ? {
                type: "create_notification" as const,
                userIdPath: form.notificationUserIdPath.trim() || "employeeId",
                titleTemplate: form.notificationTitleTemplate.trim(),
                messageTemplate: form.notificationMessageTemplate.trim(),
                linkTemplate: form.notificationLinkTemplate.trim() || undefined,
              }
            : {
                type: "write_activity" as const,
                activityAction: form.activityAction,
                descriptionTemplate: form.activityDescriptionTemplate.trim(),
                entityTypePath: form.activityEntityTypePath.trim() || undefined,
                entityIdPath: form.activityEntityIdPath.trim() || undefined,
              };

    const condition = form.useCondition
      ? {
          path: form.conditionPath.trim(),
          operator: form.conditionOperator,
          value:
            form.conditionOperator === "is_truthy" || form.conditionOperator === "is_falsy"
              ? undefined
              : form.conditionValue,
        }
      : null;

    const graph = {
      nodes: [
        {
          id: "trigger-1",
          type: "trigger" as const,
          positionX: 60,
          positionY: 70,
          trigger,
        },
        ...(condition
          ? [
              {
                id: "condition-1",
                type: "condition" as const,
                positionX: 390,
                positionY: 70,
                condition,
              },
            ]
          : []),
        {
          id: "action-1",
          type: "action" as const,
          positionX: condition ? 720 : 390,
          positionY: 70,
          action,
        },
      ],
      edges: condition
        ? [
            {
              id: "e-trigger-condition",
              source: "trigger-1",
              target: "condition-1",
              branch: "default" as const,
            },
            {
              id: "e-condition-action",
              source: "condition-1",
              target: "action-1",
              branch: "true" as const,
            },
          ]
        : [
            {
              id: "e-trigger-action",
              source: "trigger-1",
              target: "action-1",
              branch: "default" as const,
            },
          ],
    };

    onSubmit({
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      module: trigger.module,
      eventType: trigger.eventType,
      entityType: trigger.entityType,
      enabled: form.enabled,
      trigger,
      graph,
      conditions: condition ? [condition] : [],
      actions: [action],
    });
  };

  return (
    <div className="space-y-4" data-testid="automation-graph-builder">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{t("common.name")}</Label>
          <Input
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder={t("settings.automationNamePlaceholder")}
            data-testid="automation-name-input"
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("settings.automationEventLabel")}</Label>
          <Select
            value={form.eventType}
            onValueChange={(value) => setForm((prev) => ({ ...prev, eventType: value }))}
          >
            <SelectTrigger data-testid="automation-event-trigger">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {eventCatalog.map((event) => (
                <SelectItem key={`${event.module}:${event.eventType}`} value={event.eventType}>
                  {event.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>{t("common.description")}</Label>
        <Textarea
          value={form.description}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, description: event.target.value }))
          }
          placeholder={t("settings.automationDescriptionPlaceholder")}
          data-testid="automation-description-input"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{t("settings.automationActionTypeLabel")}</Label>
          <Select
            value={form.actionType}
            onValueChange={(value) =>
              setForm((prev) => ({
                ...prev,
                actionType: value as AutomationBuilderInitialValue["actionType"],
              }))
            }
          >
            <SelectTrigger data-testid="automation-action-type-trigger">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {supportedActionTypes.map((actionType) => (
                <SelectItem key={actionType} value={actionType}>
                  {t(`settings.automationActionTypes.${actionType}`, {
                    defaultValue: actionType,
                  })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between rounded-md border px-3 py-2">
          <div>
            <p className="text-sm font-medium">{t("settings.automationEnabled")}</p>
            <p className="text-xs text-muted-foreground">
              {t("settings.automationEnabledHint")}
            </p>
          </div>
          <Switch
            checked={form.enabled}
            onCheckedChange={(checked) => setForm((prev) => ({ ...prev, enabled: checked }))}
            data-testid="automation-enabled-switch"
          />
        </div>
      </div>

      <div className="rounded-md border" data-testid="automation-graph-canvas">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-medium">{t("settings.automationBuilderTitle")}</p>
          <Badge variant="outline">@xyflow/react</Badge>
        </div>
        <div className="h-56">
          <ReactFlow
            nodes={graphNodes}
            edges={graphEdges}
            fitView
            nodesConnectable={false}
            nodesDraggable={false}
            elementsSelectable={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </div>

      <div className="rounded-md border p-3 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{t("settings.automationBuilderConditionLabel")}</p>
          <Switch
            checked={form.useCondition}
            onCheckedChange={(checked) => setForm((prev) => ({ ...prev, useCondition: checked }))}
            data-testid="automation-condition-enabled-switch"
          />
        </div>
        {form.useCondition ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              value={form.conditionPath}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, conditionPath: event.target.value }))
              }
              placeholder="payload.path"
              data-testid="automation-condition-path-input"
            />
            <Select
              value={form.conditionOperator}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  conditionOperator: value as AutomationBuilderInitialValue["conditionOperator"],
                }))
              }
            >
              <SelectTrigger data-testid="automation-condition-operator-trigger">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="equals">equals</SelectItem>
                <SelectItem value="not_equals">not_equals</SelectItem>
                <SelectItem value="contains">contains</SelectItem>
                <SelectItem value="greater_than">greater_than</SelectItem>
                <SelectItem value="less_than">less_than</SelectItem>
                <SelectItem value="is_truthy">is_truthy</SelectItem>
                <SelectItem value="is_falsy">is_falsy</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={form.conditionValue}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, conditionValue: event.target.value }))
              }
              placeholder={t("settings.automationBuilderConditionValue")}
              disabled={
                form.conditionOperator === "is_truthy" ||
                form.conditionOperator === "is_falsy"
              }
              data-testid="automation-condition-value-input"
            />
          </div>
        ) : null}
      </div>

      {(form.actionType === "send_sms" || form.actionType === "send_sms_request") && (
        <div className="space-y-2 rounded-md border p-3" data-testid="automation-action-send-sms-config">
          <Input
            value={form.smsPhonePath}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, smsPhonePath: event.target.value }))
            }
            placeholder="patientPhone"
            data-testid="automation-sms-phone-path-input"
          />
          <Textarea
            value={form.smsMessageTemplate}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, smsMessageTemplate: event.target.value }))
            }
            placeholder={t("settings.automationSmsMessagePlaceholder")}
            data-testid="automation-sms-message-input"
          />
        </div>
      )}

      {form.actionType === "send_email" && (
        <div className="space-y-2 rounded-md border p-3" data-testid="automation-action-send-email-config">
          <Input
            value={form.emailTemplateEventType}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, emailTemplateEventType: event.target.value }))
            }
            placeholder="email template event type"
            data-testid="automation-email-template-event-type-input"
          />
          <Input
            value={form.emailRecipientPath}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, emailRecipientPath: event.target.value }))
            }
            placeholder="patientEmail"
            data-testid="automation-email-recipient-path-input"
          />
          <Input
            value={form.emailRecipientNamePath}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, emailRecipientNamePath: event.target.value }))
            }
            placeholder="patientName"
            data-testid="automation-email-recipient-name-path-input"
          />
        </div>
      )}

      {form.actionType === "create_notification" && (
        <div
          className="space-y-2 rounded-md border p-3"
          data-testid="automation-action-create-notification-config"
        >
          <Input
            value={form.notificationUserIdPath}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, notificationUserIdPath: event.target.value }))
            }
            placeholder="employeeId"
            data-testid="automation-notification-user-path-input"
          />
          <Input
            value={form.notificationTitleTemplate}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, notificationTitleTemplate: event.target.value }))
            }
            placeholder={t("settings.automationNotificationTitlePlaceholder")}
            data-testid="automation-notification-title-input"
          />
          <Textarea
            value={form.notificationMessageTemplate}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, notificationMessageTemplate: event.target.value }))
            }
            placeholder={t("settings.automationNotificationMessagePlaceholder")}
            data-testid="automation-notification-message-input"
          />
          <Input
            value={form.notificationLinkTemplate}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, notificationLinkTemplate: event.target.value }))
            }
            placeholder={t("settings.automationNotificationLinkPlaceholder")}
            data-testid="automation-notification-link-input"
          />
        </div>
      )}

      {form.actionType === "write_activity" && (
        <div className="space-y-2 rounded-md border p-3" data-testid="automation-action-write-activity-config">
          <Input
            value={form.activityAction}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                activityAction: event.target.value as AutomationBuilderInitialValue["activityAction"],
              }))
            }
            placeholder="status_changed"
            data-testid="automation-activity-action-input"
          />
          <Textarea
            value={form.activityDescriptionTemplate}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, activityDescriptionTemplate: event.target.value }))
            }
            placeholder="{{patientName}} status changed"
            data-testid="automation-activity-description-input"
          />
          <Input
            value={form.activityEntityTypePath}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, activityEntityTypePath: event.target.value }))
            }
            placeholder="entityType"
            data-testid="automation-activity-entity-type-path-input"
          />
          <Input
            value={form.activityEntityIdPath}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, activityEntityIdPath: event.target.value }))
            }
            placeholder="entityId"
            data-testid="automation-activity-entity-id-path-input"
          />
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button onClick={submit} disabled={isSubmitting || !form.name.trim()} data-testid="automation-save-button">
          {isSubmitting ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </div>
  );
}

export function createAutomationBuilderInitialValue(
  eventCatalog: AutomationBuilderEventCatalogEntry[],
): AutomationBuilderInitialValue {
  return {
    name: "",
    description: "",
    enabled: true,
    eventType: eventCatalog[0]?.eventType ?? "gabinet.appointment.created",
    actionType: "send_sms",
    smsPhonePath: "patientPhone",
    smsMessageTemplate:
      "{{patientName}}, masz nową wizytę {{date}} o {{startTime}}. Zabieg: {{treatmentName}}.",
    emailTemplateEventType: "",
    emailRecipientPath: "patientEmail",
    emailRecipientNamePath: "patientName",
    notificationUserIdPath: "employeeId",
    notificationTitleTemplate: "Nowa wizyta: {{patientName}}",
    notificationMessageTemplate: "{{patientName}} ma wizytę {{date}} o {{startTime}}.",
    notificationLinkTemplate: "/dashboard/gabinet/appointments/{{appointmentId}}",
    activityAction: "status_changed",
    activityDescriptionTemplate: "Zaktualizowano status wizyty {{appointmentId}}.",
    activityEntityTypePath: "entityType",
    activityEntityIdPath: "appointmentId",
    useCondition: false,
    conditionPath: "",
    conditionOperator: "equals",
    conditionValue: "",
  };
}

