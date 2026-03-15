import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { useMutation } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/layout/page-header";
import type {
  AutomationBuilderEventCatalogEntry,
  AutomationBuilderSubmitPayload,
} from "@/components/settings/automation-builder/automation-graph-builder";
import { AutomationSimpleMode } from "@/components/settings/automation-builder/automation-simple-mode";
import {
  classifyAutomationPlaygroundRule,
  type AutomationActionCapability,
  type AutomationCustomFieldDefinition,
  type AutomationEmailTemplateRecord,
  type AutomationRuleRecord,
  type AutomationUpdateFieldTargetEntityType,
} from "@/components/settings/automation-builder/automation-simple-presets";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import type { Id } from "@cvx/_generated/dataModel";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/automations/$ruleId",
)({
  component: EditAutomationRulePage,
});

type RuleRecord = AutomationRuleRecord & {
  _id: Id<"automationRules">;
};

function EditAutomationRulePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { organizationId } = useOrganization();
  const { ruleId } = Route.useParams();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateRule = useMutation(api.automation.updateRule);
  const deleteRule = useMutation(api.automation.deleteRule);

  const {
    data: rules,
    isPending: isRulesPending,
    isError: isRulesError,
  } = useQuery(
    convexQuery(api.automation.listRules, {
      organizationId,
    }),
  );

  const {
    data: eventCatalog,
    isPending: isEventCatalogPending,
    isError: isEventCatalogError,
  } = useQuery(
    convexQuery(api.automation.listEventCatalog, {
      organizationId,
    }),
  );

  const {
    data: actionCapabilities,
    isPending: isActionCapabilitiesPending,
    isError: isActionCapabilitiesError,
  } = useQuery(
    convexQuery(api.automation.listActionCapabilities, {
      organizationId,
    }),
  );

  const {
    data: emailTemplates,
    isPending: isEmailTemplatesPending,
    isError: isEmailTemplatesError,
  } = useQuery(
    convexQuery(api.emailTemplates.list, {
      organizationId,
      activeOnly: true,
    }),
  );

  const customFieldEntityTypes = useMemo<AutomationUpdateFieldTargetEntityType[]>(
    () => ["gabinetPatient", "gabinetAppointment", "gabinetEmployee", "lead"],
    [],
  );

  const customFieldResults = useQueries({
    queries: customFieldEntityTypes.map((entityType) =>
      convexQuery(api.customFields.getDefinitions, {
        organizationId,
        entityType,
      }),
    ),
  });

  const customFieldsByEntityType = useMemo<
    Partial<Record<AutomationUpdateFieldTargetEntityType, AutomationCustomFieldDefinition[]>>
  >(() => {
    return customFieldEntityTypes.reduce(
      (acc, entityType, index) => {
        acc[entityType] =
          (customFieldResults[index]?.data as AutomationCustomFieldDefinition[] | undefined) ?? [];
        return acc;
      },
      {} as Partial<
        Record<AutomationUpdateFieldTargetEntityType, AutomationCustomFieldDefinition[]>
      >,
    );
  }, [customFieldEntityTypes, customFieldResults]);

  const isCustomFieldsPending = customFieldResults.some((result) => result.isPending);
  const isCustomFieldsError = customFieldResults.some((result) => result.isError);

  const isLoading =
    isRulesPending ||
    isEventCatalogPending ||
    isActionCapabilitiesPending ||
    isEmailTemplatesPending ||
    isCustomFieldsPending;

  const isError =
    isRulesError ||
    isEventCatalogError ||
    isActionCapabilitiesError ||
    isEmailTemplatesError ||
    isCustomFieldsError;

  const typedRules = (rules ?? []) as RuleRecord[];
  const rule = typedRules.find((item) => item._id === ruleId);

  const playgroundValue = useMemo(
    () =>
      rule && actionCapabilities
        ? classifyAutomationPlaygroundRule(
            rule,
            (eventCatalog ?? []) as AutomationBuilderEventCatalogEntry[],
            actionCapabilities,
          )
        : null,
    [actionCapabilities, eventCatalog, rule],
  );

  const handleCancel = () => {
    navigate({ to: "/dashboard/settings/automations" });
  };

  const handleDelete = async () => {
    if (!rule) return;

    setIsSubmitting(true);
    try {
      await deleteRule({
        organizationId,
        ruleId: rule._id,
      });
      toast.success(t("settings.automationRuleDeleted"));
      navigate({ to: "/dashboard/settings/automations" });
    } catch {
      toast.error(t("settings.automationDeleteError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (payload: AutomationBuilderSubmitPayload) => {
    if (!rule || !payload.name.trim()) return;

    setIsSubmitting(true);
    try {
      await updateRule({
        organizationId,
        ruleId: rule._id,
        name: payload.name,
        description: payload.description,
        module: payload.module,
        eventType: payload.eventType,
        entityType: payload.entityType,
        trigger: payload.trigger,
        graph: payload.graph,
        definitionVersion: 1,
        conditions: payload.conditions,
        actions: payload.actions,
        enabled: payload.enabled,
      });
      toast.success(t("settings.automationRuleUpdated"));
      navigate({ to: "/dashboard/settings/automations" });
    } catch {
      toast.error(t("settings.automationSaveError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLegacyRename = async (name: string) => {
    if (!rule || !name.trim()) return;

    setIsSubmitting(true);
    try {
      await updateRule({
        organizationId,
        ruleId: rule._id,
        name: name.trim(),
      });
      toast.success(t("settings.automationRuleUpdated"));
    } catch {
      toast.error(t("settings.automationSaveError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLegacyToggle = async (enabled: boolean) => {
    if (!rule) return;

    setIsSubmitting(true);
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
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading || isError) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t("settings.automationEditRule")}
          description={isError ? t("settings.automationLoadError") : t("common.loading")}
          actions={
            <Button asChild variant="outline">
              <Link to="/dashboard/settings/automations">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t("common.back")}
              </Link>
            </Button>
          }
        />
        {isError ? (
          <Card>
            <CardContent className="py-6 text-sm text-destructive">
              {t("settings.automationLoadError")}
            </CardContent>
          </Card>
        ) : null}
      </div>
    );
  }

  if (!rule) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t("settings.automationEditRule")}
          description={t("settings.automationNotFoundDescription")}
          actions={
            <Button asChild variant="outline">
              <Link to="/dashboard/settings/automations">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t("common.back")}
              </Link>
            </Button>
          }
        />
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            {t("settings.automationNotFoundDescription")}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("settings.automationEditRule")}
        description={
          playgroundValue
            ? t("settings.automationPlayground.editPageDescription", {
                name: rule.name,
              })
            : t("settings.automationPlayground.legacy.editPageDescription", {
                name: rule.name,
              })
        }
        actions={
          <Button asChild variant="outline">
            <Link to="/dashboard/settings/automations">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("common.back")}
            </Link>
          </Button>
        }
      />

      {playgroundValue ? (
        <AutomationSimpleMode
          eventCatalog={(eventCatalog ?? []) as AutomationBuilderEventCatalogEntry[]}
          actionCapabilities={actionCapabilities as AutomationActionCapability[]}
          emailTemplates={emailTemplates as AutomationEmailTemplateRecord[]}
          customFieldsByEntityType={customFieldsByEntityType}
          initialValue={playgroundValue}
          isSubmitting={isSubmitting}
          onCancel={handleCancel}
          onSubmit={handleSubmit}
        />
      ) : (
        <LegacyAutomationFallback
          rule={rule}
          isSubmitting={isSubmitting}
          onCancel={handleCancel}
          onDelete={handleDelete}
          onRename={handleLegacyRename}
          onToggle={handleLegacyToggle}
        />
      )}
    </div>
  );
}

type LegacyAutomationFallbackProps = {
  rule: RuleRecord;
  isSubmitting: boolean;
  onCancel: () => void;
  onDelete: () => void;
  onRename: (name: string) => Promise<void>;
  onToggle: (enabled: boolean) => Promise<void>;
};

function LegacyAutomationFallback({
  rule,
  isSubmitting,
  onCancel,
  onDelete,
  onRename,
  onToggle,
}: LegacyAutomationFallbackProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(rule.name);

  return (
    <Card data-testid="automation-legacy-fallback-card">
      <CardHeader>
        <CardTitle>{t("settings.automationPlayground.legacy.title")}</CardTitle>
        <CardDescription>
          {t("settings.automationPlayground.legacy.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("common.name")}</p>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            data-testid="automation-legacy-name-input"
          />
        </div>

        <div className="space-y-2 rounded-lg border p-4 text-sm text-muted-foreground">
          <p>{t("settings.automationPlayground.legacy.summaryLabel")}</p>
          <p>{rule.description || rule.eventType}</p>
          <p>
            {t("settings.automationActionCount", {
              count: rule.actions.length,
            })}
          </p>
        </div>

        <div className="flex items-center justify-between rounded-lg border px-4 py-3">
          <div>
            <p className="text-sm font-medium">
              {t("settings.automationPlayground.enabledLabel")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("settings.automationPlayground.legacy.enabledHint")}
            </p>
          </div>
          <Button
            type="button"
            variant={rule.enabled ? "default" : "outline"}
            onClick={() => onToggle(!rule.enabled)}
            disabled={isSubmitting}
            data-testid="automation-legacy-toggle-button"
          >
            {rule.enabled
              ? t("settings.automationRuleStates.enabled")
              : t("settings.automationRuleStates.disabled")}
          </Button>
        </div>

        <div className="flex flex-wrap justify-between gap-3">
          <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
            {t("common.cancel")}
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onRename(name)}
              disabled={isSubmitting || !name.trim() || name.trim() === rule.name}
              data-testid="automation-legacy-rename-button"
            >
              {t("common.save")}
            </Button>
            <Button
              variant="destructive"
              onClick={onDelete}
              disabled={isSubmitting}
              data-testid="automation-legacy-delete-button"
            >
              {t("common.delete")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
