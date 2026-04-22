import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { useSupabaseEmailTemplatesList } from "@/hooks/use-supabase-email-templates";
import { useSupabaseCustomFieldDefinitions } from "@/hooks/use-supabase-custom-fields";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/layout/page-header";
import type {
  AutomationBuilderEventCatalogEntry,
  AutomationBuilderSubmitPayload,
} from "@/components/settings/automation-builder/automation-graph-builder";
import { AutomationSimpleMode } from "@/components/settings/automation-builder/automation-simple-mode";
import {
  type AutomationActionCapability,
  type AutomationCustomFieldDefinition,
  type AutomationEmailTemplateRecord,
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
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/automations/new",
)({
  component: NewAutomationRulePage,
});

function NewAutomationRulePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { organizationId } = useOrganization();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createRule = useAction(api.automation.createRule);
  const queryClient = useQueryClient();

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
  } = useSupabaseEmailTemplatesList(organizationId, { activeOnly: true });

  const customFieldEntityTypes = useMemo<AutomationUpdateFieldTargetEntityType[]>(
    () => ["gabinetPatient", "gabinetAppointment", "gabinetEmployee", "lead"],
    [],
  );

  const cfGabinetPatient = useSupabaseCustomFieldDefinitions(organizationId, "gabinetPatient");
  const cfGabinetAppointment = useSupabaseCustomFieldDefinitions(organizationId, "gabinetAppointment");
  const cfGabinetEmployee = useSupabaseCustomFieldDefinitions(organizationId, "gabinetEmployee");
  const cfLead = useSupabaseCustomFieldDefinitions(organizationId, "lead");

  const customFieldResults = [cfGabinetPatient, cfGabinetAppointment, cfGabinetEmployee, cfLead];

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customFieldEntityTypes, cfGabinetPatient.data, cfGabinetAppointment.data, cfGabinetEmployee.data, cfLead.data]);

  const isCustomFieldsPending = customFieldResults.some((result) => result.isPending);
  const isCustomFieldsError = customFieldResults.some((result) => result.isError);

  const isLoading =
    isEventCatalogPending ||
    isActionCapabilitiesPending ||
    isEmailTemplatesPending ||
    isCustomFieldsPending;

  const isError =
    isEventCatalogError ||
    isActionCapabilitiesError ||
    isEmailTemplatesError ||
    isCustomFieldsError;

  const handleCancel = () => {
    navigate({ to: "/dashboard/settings/automations" });
  };

  const handleSubmit = async (payload: AutomationBuilderSubmitPayload) => {
    if (!payload.name.trim()) return;

    setIsSubmitting(true);
    try {
      await createRule({
        organizationId,
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
      toast.success(t("settings.automationRuleCreated"));
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.automationRules.all });
      navigate({ to: "/dashboard/settings/automations" });
    } catch {
      toast.error(t("settings.automationSaveError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("settings.automationCreateRule")}
        description={
          isError
            ? t("settings.automationLoadError")
            : isLoading
              ? t("common.loading")
              : t("settings.automationPlayground.pageDescription")
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

      {isError ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.automationCreateRule")}</CardTitle>
            <CardDescription>{t("settings.automationLoadError")}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-destructive">
            {t("settings.automationLoadError")}
          </CardContent>
        </Card>
      ) : isLoading ? null : (
        <AutomationSimpleMode
          eventCatalog={(eventCatalog ?? []) as AutomationBuilderEventCatalogEntry[]}
          actionCapabilities={actionCapabilities as AutomationActionCapability[]}
          emailTemplates={emailTemplates as unknown as AutomationEmailTemplateRecord[]}
          customFieldsByEntityType={customFieldsByEntityType}
          isSubmitting={isSubmitting}
          onCancel={handleCancel}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
