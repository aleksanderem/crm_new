import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
  type AutomationActionCapability,
  type AutomationCustomFieldDefinition,
  type AutomationEmailTemplateRecord,
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

  const createRule = useMutation(api.automation.createRule);

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

  const {
    data: patientCustomFields,
    isPending: isPatientCustomFieldsPending,
    isError: isPatientCustomFieldsError,
  } = useQuery(
    convexQuery(api.customFields.getDefinitions, {
      organizationId,
      entityType: "gabinetPatient",
    }),
  );

  const {
    data: appointmentCustomFields,
    isPending: isAppointmentCustomFieldsPending,
    isError: isAppointmentCustomFieldsError,
  } = useQuery(
    convexQuery(api.customFields.getDefinitions, {
      organizationId,
      entityType: "gabinetAppointment",
    }),
  );

  const {
    data: employeeCustomFields,
    isPending: isEmployeeCustomFieldsPending,
    isError: isEmployeeCustomFieldsError,
  } = useQuery(
    convexQuery(api.customFields.getDefinitions, {
      organizationId,
      entityType: "gabinetEmployee",
    }),
  );

  const gabinetEvents = useMemo(
    () =>
      (eventCatalog ?? []).filter(
        (event) => event.module === "gabinet",
      ) as AutomationBuilderEventCatalogEntry[],
    [eventCatalog],
  );

  const isLoading =
    isEventCatalogPending ||
    isActionCapabilitiesPending ||
    isEmailTemplatesPending ||
    isPatientCustomFieldsPending ||
    isAppointmentCustomFieldsPending ||
    isEmployeeCustomFieldsPending;

  const isError =
    isEventCatalogError ||
    isActionCapabilitiesError ||
    isEmailTemplatesError ||
    isPatientCustomFieldsError ||
    isAppointmentCustomFieldsError ||
    isEmployeeCustomFieldsError;

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
          eventCatalog={gabinetEvents}
          actionCapabilities={actionCapabilities as AutomationActionCapability[]}
          emailTemplates={emailTemplates as AutomationEmailTemplateRecord[]}
          patientCustomFields={patientCustomFields as AutomationCustomFieldDefinition[]}
          appointmentCustomFields={appointmentCustomFields as AutomationCustomFieldDefinition[]}
          employeeCustomFields={employeeCustomFields as AutomationCustomFieldDefinition[]}
          isSubmitting={isSubmitting}
          onCancel={handleCancel}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
