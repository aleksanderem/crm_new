import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { useMutation } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useTranslation } from "react-i18next";
import { SectionHeader } from "@untitled/app/section-headers/section-headers";
import { UntitledAlert } from "@/components/ui/untitled-alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { type AutomationRuleRecord } from "@/components/settings/automation-builder/automation-simple-presets";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/automations/",
)({
  component: AutomationSettingsOverview,
});

type RuleRecord = AutomationRuleRecord & {
  _id: Id<"automationRules">;
  lastRun?: {
    status: string;
    createdAt: number;
    occurredAt?: number;
  } | null;
};

function getActionTypes(rule: RuleRecord) {
  return Array.from(new Set(rule.actions.map((action) => action.type)));
}

function AutomationSettingsOverview() {
  const { t, i18n } = useTranslation();
  const { organizationId } = useOrganization();
  const [deletingRule, setDeletingRule] = useState<RuleRecord | null>(null);

  const updateRule = useMutation(api.automation.updateRule);
  const deleteRule = useMutation(api.automation.deleteRule);

  const {
    data: rules = [],
    isPending: isRulesPending,
    isError: isRulesError,
  } = useQuery(
    convexQuery(api.automation.listRules, {
      organizationId,
    }),
  );

  const typedRules = rules as RuleRecord[];

  const {
    data: runs = [],
    isPending: isRunsPending,
    isError: isRunsError,
  } = useQuery(
    convexQuery(api.automation.listRuns, {
      organizationId,
      limit: 20,
    }),
  );

  const formatDateTime = (timestamp: number) =>
    new Date(timestamp).toLocaleString(i18n.language);

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
    <div className="flex h-full w-full flex-col gap-6">
      <SectionHeader.Root className="pt-4">
        <SectionHeader.Group>
          <SectionHeader.Heading className="flex-1">
            {t("settings.automations")}
          </SectionHeader.Heading>
          <SectionHeader.Actions>
            <Button asChild size="sm" data-testid="automation-create-rule-button">
              <Link to="/dashboard/settings/automations/new">
                <Plus className="mr-1 h-4 w-4" />
                {t("settings.automationCreateRule")}
              </Link>
            </Button>
          </SectionHeader.Actions>
        </SectionHeader.Group>
        <UntitledAlert>{t("settings.automationsDescription")}</UntitledAlert>
      </SectionHeader.Root>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.automationRules")}</CardTitle>
            <CardDescription>{typedRules.length}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isRulesError ? (
              <p className="text-sm text-destructive">
                {t("settings.automationLoadError")}
              </p>
            ) : isRulesPending ? (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : typedRules.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("settings.automationNoRules")}
              </p>
            ) : (
              typedRules.map((rule) => {
                const actionTypes = getActionTypes(rule);
                const visibleActionTypes = actionTypes.slice(0, 2);
                const hiddenActionCount = Math.max(actionTypes.length - visibleActionTypes.length, 0);
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
                          {visibleActionTypes.map((actionType) => (
                            <Badge key={actionType} variant="outline">
                              {t(`settings.automationActionTypes.${actionType}`, {
                                defaultValue: actionType,
                              })}
                            </Badge>
                          ))}
                          {hiddenActionCount > 0 ? (
                            <Badge variant="outline">
                              {t("settings.automationActionsMore", {
                                count: hiddenActionCount,
                                defaultValue: `+${hiddenActionCount} more`,
                              })}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {rule.description ||
                            t(`settings.automationEventTypes.${rule.eventType}`, {
                              defaultValue: rule.eventType,
                            })}
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
                          asChild
                          variant="outline"
                          size="sm"
                          data-testid={`automation-edit-${rule._id}`}
                        >
                          <Link
                            to="/dashboard/settings/automations/$ruleId"
                            params={{ ruleId: rule._id }}
                          >
                            <Pencil className="mr-1 h-4 w-4" />
                            {t("common.edit")}
                          </Link>
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
            {isRunsError ? (
              <p className="text-sm text-destructive">
                {t("settings.automationLoadError")}
              </p>
            ) : isRunsPending ? (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : runs.length === 0 ? (
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
                      <p className="font-medium">
                        {t(`settings.automationEventTypes.${run.eventType}`, {
                          defaultValue: run.eventType,
                        })}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t("settings.automationRunsSubtitle", {
                          module: run.module,
                        })}
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
