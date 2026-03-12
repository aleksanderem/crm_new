import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { useMutation } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Id } from "@cvx/_generated/dataModel";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/automations",
)({
  component: AutomationSettings,
});

type AutomationActionPreset = "send_sms" | "create_notification";
type AutomationEventType =
  | "gabinet.appointment.created"
  | "gabinet.appointment.status_changed";

type RuleRecord = {
  _id: Id<"automationRules">;
  name: string;
  description?: string;
  module: "gabinet" | "crm" | "platform";
  eventType: string;
  entityType?: string;
  enabled: boolean;
  actions: Array<
    | {
        type: "send_sms";
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
        type: string;
      }
  >;
  lastRun?: {
    status: string;
    createdAt: number;
    occurredAt?: number;
  } | null;
};

type AutomationFormState = {
  name: string;
  description: string;
  module: "gabinet";
  eventType: AutomationEventType;
  enabled: boolean;
  actionPreset: AutomationActionPreset;
  smsMessageTemplate: string;
  notificationTitleTemplate: string;
  notificationMessageTemplate: string;
  notificationLinkTemplate: string;
};

const DEFAULT_SMS_TEMPLATE =
  "{{patientName}}, masz nową wizytę {{date}} o {{startTime}}. Zabieg: {{treatmentName}}.";
const DEFAULT_NOTIFICATION_TITLE = "Nowa wizyta: {{patientName}}";
const DEFAULT_NOTIFICATION_MESSAGE =
  "{{patientName}} ma wizytę {{date}} o {{startTime}}.";
const DEFAULT_NOTIFICATION_LINK = "/dashboard/gabinet/appointments/{{appointmentId}}";

const EMPTY_FORM: AutomationFormState = {
  name: "",
  description: "",
  module: "gabinet",
  eventType: "gabinet.appointment.created",
  enabled: true,
  actionPreset: "send_sms",
  smsMessageTemplate: DEFAULT_SMS_TEMPLATE,
  notificationTitleTemplate: DEFAULT_NOTIFICATION_TITLE,
  notificationMessageTemplate: DEFAULT_NOTIFICATION_MESSAGE,
  notificationLinkTemplate: DEFAULT_NOTIFICATION_LINK,
};

const SMS_PHONE_PATH = "patientPhone";
const NOTIFICATION_USER_PATH = "employeeId";

function getActionPreset(rule: RuleRecord): AutomationActionPreset {
  const firstAction = rule.actions[0];
  return firstAction?.type === "create_notification"
    ? "create_notification"
    : "send_sms";
}

function buildActions(form: AutomationFormState) {
  if (form.actionPreset === "create_notification") {
    return [
      {
        type: "create_notification" as const,
        userIdPath: NOTIFICATION_USER_PATH,
        titleTemplate: form.notificationTitleTemplate.trim(),
        messageTemplate: form.notificationMessageTemplate.trim(),
        linkTemplate: form.notificationLinkTemplate.trim() || undefined,
      },
    ];
  }

  return [
    {
      type: "send_sms" as const,
      phonePath: SMS_PHONE_PATH,
      messageTemplate: form.smsMessageTemplate.trim(),
    },
  ];
}

function ruleToForm(rule: RuleRecord): AutomationFormState {
  const preset = getActionPreset(rule);
  const smsAction = rule.actions.find(
    (action): action is Extract<RuleRecord["actions"][number], { type: "send_sms" }> =>
      action.type === "send_sms",
  );
  const notificationAction = rule.actions.find(
    (
      action,
    ): action is Extract<
      RuleRecord["actions"][number],
      { type: "create_notification" }
    > => action.type === "create_notification",
  );

  return {
    name: rule.name,
    description: rule.description ?? "",
    module: "gabinet",
    eventType:
      rule.eventType === "gabinet.appointment.status_changed"
        ? "gabinet.appointment.status_changed"
        : "gabinet.appointment.created",
    enabled: rule.enabled,
    actionPreset: preset,
    smsMessageTemplate: smsAction?.messageTemplate ?? DEFAULT_SMS_TEMPLATE,
    notificationTitleTemplate:
      notificationAction?.titleTemplate ?? DEFAULT_NOTIFICATION_TITLE,
    notificationMessageTemplate:
      notificationAction?.messageTemplate ?? DEFAULT_NOTIFICATION_MESSAGE,
    notificationLinkTemplate:
      notificationAction?.linkTemplate ?? DEFAULT_NOTIFICATION_LINK,
  };
}

function AutomationSettings() {
  const { t, i18n } = useTranslation();
  const { organizationId } = useOrganization();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RuleRecord | null>(null);
  const [deletingRule, setDeletingRule] = useState<RuleRecord | null>(null);
  const [form, setForm] = useState<AutomationFormState>(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createRule = useMutation(api.automation.createRule);
  const updateRule = useMutation(api.automation.updateRule);
  const deleteRule = useMutation(api.automation.deleteRule);

  const { data: rules = [] } = useQuery(
    convexQuery(api.automation.listRules, {
      organizationId,
      module: "gabinet",
    }),
  );

  const typedRules = rules as RuleRecord[];

  const { data: runs = [] } = useQuery(
    convexQuery(api.automation.listRuns, {
      organizationId,
      module: "gabinet",
      limit: 20,
    }),
  );

  const { data: eventCatalog = [] } = useQuery(
    convexQuery(api.automation.listEventCatalog, {
      organizationId,
    }),
  );

  const gabinetEvents = useMemo(
    () => eventCatalog.filter((event) => event.module === "gabinet"),
    [eventCatalog],
  );

  const formatDateTime = (timestamp: number) =>
    new Date(timestamp).toLocaleString(i18n.language);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingRule(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (rule: RuleRecord) => {
    setEditingRule(rule);
    setForm(ruleToForm(rule));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const hasSmsBody =
      form.actionPreset !== "send_sms" || form.smsMessageTemplate.trim().length > 0;
    const hasNotificationBody =
      form.actionPreset !== "create_notification" ||
      (form.notificationTitleTemplate.trim().length > 0 &&
        form.notificationMessageTemplate.trim().length > 0);

    if (!form.name.trim() || !hasSmsBody || !hasNotificationBody) return;

    setIsSubmitting(true);
    try {
      const payload = {
        organizationId,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        module: form.module,
        eventType: form.eventType,
        entityType: "gabinetAppointment" as const,
        conditions: [],
        actions: buildActions(form),
        enabled: form.enabled,
      };

      if (editingRule) {
        await updateRule({
          ...payload,
          ruleId: editingRule._id,
        });
        toast.success(t("settings.automationRuleUpdated"));
      } else {
        await createRule(payload);
        toast.success(t("settings.automationRuleCreated"));
      }

      setDialogOpen(false);
      resetForm();
    } catch {
      toast.error(t("settings.automationSaveError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleEnabled = async (rule: RuleRecord, enabled: boolean) => {
    try {
      await updateRule({
        organizationId,
        ruleId: rule._id,
        enabled,
      });
      toast.success(
        enabled
          ? t("settings.automationRuleEnabled")
          : t("settings.automationRuleDisabled"),
      );
    } catch {
      toast.error(t("settings.automationToggleError"));
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingRule) return;
    try {
      await deleteRule({
        organizationId,
        ruleId: deletingRule._id,
      });
      toast.success(t("settings.automationRuleDeleted"));
    } catch {
      toast.error(t("settings.automationDeleteError"));
    } finally {
      setDeletingRule(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("settings.automations")}
        description={t("settings.automationsDescription")}
        actions={
          <Button size="sm" onClick={openCreateDialog} data-testid="automation-create-rule-button">
            <Plus className="mr-1 h-4 w-4" />
            {t("settings.automationCreateRule")}
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.automationRules")}</CardTitle>
            <CardDescription>{typedRules.length}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {typedRules.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("settings.automationNoRules")}
              </p>
            ) : (
              typedRules.map((rule) => {
                const preset = getActionPreset(rule);
                return (
                  <div
                    key={rule._id}
                    className="space-y-3 rounded-lg border p-4"
                    data-testid={`automation-rule-${rule._id}`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{rule.name}</p>
                          <Badge variant={rule.enabled ? "default" : "secondary"}>
                            {t(
                              `settings.automationRuleStates.${rule.enabled ? "enabled" : "disabled"}`,
                            )}
                          </Badge>
                          <Badge variant="outline">
                            {t(`settings.automationPresets.${preset}`)}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {rule.description ||
                            t("settings.automationEventTypes." + rule.eventType)}
                        </p>
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline">{rule.module}</Badge>
                          <Badge variant="outline">
                            {t(`settings.automationEventTypes.${rule.eventType}`, {
                              defaultValue: rule.eventType,
                            })}
                          </Badge>
                          <Badge variant="outline">
                            {t("settings.automationActionCount", {
                              count: rule.actions.length,
                            })}
                          </Badge>
                          {rule.lastRun && (
                            <Badge variant="outline">
                              {t("settings.automationLastRunLabel", {
                                status: t(
                                  `settings.automationRunStatuses.${rule.lastRun.status}`,
                                  { defaultValue: rule.lastRun.status },
                                ),
                              })}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={rule.enabled}
                            onCheckedChange={(checked) =>
                              handleToggleEnabled(rule, checked)
                            }
                            aria-label={t("settings.automationToggle")}
                            data-testid={`automation-toggle-${rule._id}`}
                          />
                          <span className="text-xs text-muted-foreground">
                            {t("settings.automationToggle")}
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(rule)}
                          data-testid={`automation-edit-${rule._id}`}
                        >
                          <Pencil className="mr-1 h-4 w-4" />
                          {t("common.edit")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => setDeletingRule(rule)}
                          data-testid={`automation-delete-${rule._id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.automationRuns")}</CardTitle>
            <CardDescription>{runs.length}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("settings.automationNoRuns")}
              </p>
            ) : (
              runs.map((run) => (
                <div
                  key={run._id}
                  className="space-y-2 rounded-lg border p-3"
                  data-testid={`automation-run-${run._id}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{run.eventType}</p>
                      <p className="text-sm text-muted-foreground">
                        {run.entityType && run.entityId
                          ? `${run.entityType} · ${run.entityId}`
                          : run.module}
                      </p>
                    </div>
                    <Badge
                      variant={
                        run.status === "processed"
                          ? "default"
                          : run.status === "failed"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {t(`settings.automationRunStatuses.${run.status}`, {
                        defaultValue: run.status,
                      })}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(run.occurredAt ?? run.createdAt)}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.automationCatalog")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {gabinetEvents.map((event) => (
              <div
                key={`${event.module}:${event.eventType}`}
                className="rounded-lg border p-3"
              >
                <p className="font-medium">{event.label}</p>
                <p className="text-sm text-muted-foreground">{event.eventType}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("settings.automationActions")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Badge variant="outline">
              {t("settings.automationPresets.send_sms")}
            </Badge>
            <Badge variant="outline">
              {t("settings.automationPresets.create_notification")}
            </Badge>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingRule
                ? t("settings.automationEditRule")
                : t("settings.automationCreateRule")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("common.name")}</Label>
                <Input
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder={t("settings.automationNamePlaceholder")}
                  autoFocus
                  data-testid="automation-name-input"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("common.module")}</Label>
                <Select value={form.module} onValueChange={() => undefined}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gabinet">Gabinet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t("common.description")}</Label>
              <Textarea
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder={t("settings.automationDescriptionPlaceholder")}
                data-testid="automation-description-input"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("settings.automationEventLabel")}</Label>
                <Select
                  value={form.eventType}
                  onValueChange={(value: AutomationEventType) =>
                    setForm((prev) => ({ ...prev, eventType: value }))
                  }
                >
                  <SelectTrigger data-testid="automation-event-trigger">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gabinet.appointment.created">
                      {t("settings.automationEventTypes.gabinet.appointment.created")}
                    </SelectItem>
                    <SelectItem value="gabinet.appointment.status_changed">
                      {t(
                        "settings.automationEventTypes.gabinet.appointment.status_changed",
                      )}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>{t("settings.automationActionLabel")}</Label>
                <Select
                  value={form.actionPreset}
                  onValueChange={(value: AutomationActionPreset) =>
                    setForm((prev) => ({ ...prev, actionPreset: value }))
                  }
                >
                  <SelectTrigger data-testid="automation-action-trigger">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="send_sms">
                      {t("settings.automationPresets.send_sms")}
                    </SelectItem>
                    <SelectItem value="create_notification">
                      {t("settings.automationPresets.create_notification")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">{t("settings.automationEnabled")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("settings.automationEnabledHint")}
                </p>
              </div>
              <Switch
                checked={form.enabled}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, enabled: checked }))
                }
                data-testid="automation-enabled-switch"
              />
            </div>

            {form.actionPreset === "send_sms" ? (
              <div className="space-y-4 rounded-lg border p-4">
                <div>
                  <p className="text-sm font-medium">
                    {t("settings.automationSmsRecipientLabel")}
                  </p>
                  <p className="text-xs text-muted-foreground">{SMS_PHONE_PATH}</p>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("settings.automationSmsMessageLabel")}</Label>
                  <Textarea
                    value={form.smsMessageTemplate}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        smsMessageTemplate: e.target.value,
                      }))
                    }
                    placeholder={t("settings.automationSmsMessagePlaceholder")}
                    data-testid="automation-sms-message-input"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4 rounded-lg border p-4">
                <div>
                  <p className="text-sm font-medium">
                    {t("settings.automationNotificationRecipientLabel")}
                  </p>
                  <p className="text-xs text-muted-foreground">{NOTIFICATION_USER_PATH}</p>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("settings.automationNotificationTitleLabel")}</Label>
                  <Input
                    value={form.notificationTitleTemplate}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        notificationTitleTemplate: e.target.value,
                      }))
                    }
                    placeholder={t(
                      "settings.automationNotificationTitlePlaceholder",
                    )}
                    data-testid="automation-notification-title-input"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("settings.automationNotificationMessageLabel")}</Label>
                  <Textarea
                    value={form.notificationMessageTemplate}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        notificationMessageTemplate: e.target.value,
                      }))
                    }
                    placeholder={t(
                      "settings.automationNotificationMessagePlaceholder",
                    )}
                    data-testid="automation-notification-message-input"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("settings.automationNotificationLinkLabel")}</Label>
                  <Input
                    value={form.notificationLinkTemplate}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        notificationLinkTemplate: e.target.value,
                      }))
                    }
                    placeholder={t("settings.automationNotificationLinkPlaceholder")}
                    data-testid="automation-notification-link-input"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSave}
              data-testid="automation-save-button"
              disabled={
                isSubmitting ||
                !form.name.trim() ||
                (form.actionPreset === "send_sms" &&
                  !form.smsMessageTemplate.trim()) ||
                (form.actionPreset === "create_notification" &&
                  (!form.notificationTitleTemplate.trim() ||
                    !form.notificationMessageTemplate.trim()))
              }
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("common.saving")}
                </>
              ) : editingRule ? (
                t("common.save")
              ) : (
                t("common.create")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deletingRule}
        onOpenChange={(open) => !open && setDeletingRule(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.automationDeleteConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.automationDeleteConfirmDescription", {
                name: deletingRule?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteConfirm}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
