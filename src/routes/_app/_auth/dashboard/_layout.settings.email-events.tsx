import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Id } from "@cvx/_generated/dataModel";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/email-events"
)({
  component: EmailEventsSettings,
});

interface EventType {
  _id: Id<"emailEventTypes">;
  eventType: string;
  module: string;
  displayName: string;
  description?: string;
  isActive: boolean;
}

interface Binding {
  _id: Id<"emailEventBindings">;
  eventType: string;
  templateId: Id<"emailTemplates">;
  enabled: boolean;
  priority: number;
  templateName: string | null;
  templateIsActive: boolean;
}

function EmailEventsSettings() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();

  const [selectedModule, setSelectedModule] = useState<string>("all");

  // Fetch event types
  const { data: eventTypes, isLoading: loadingEvents } = useQuery(
    convexQuery(api.emailEvents.listEventTypes, {
      organizationId,
      module: selectedModule === "all" 
        ? undefined 
        : selectedModule as "crm" | "gabinet" | "platform",
    }),
  );

  // Fetch bindings
  const { data: bindings, isLoading: loadingBindings } = useQuery(
    convexQuery(api.emailEventBindings.listBindings, { organizationId }),
  );

  // Fetch templates for dropdown
  const { data: templates } = useQuery(
    convexQuery(api.emailTemplates.list, { organizationId }),
  );

  // Mutations
  const upsertBinding = useMutation(api.emailEventBindings.upsertBinding);
  const toggleBinding = useMutation(api.emailEventBindings.toggleBinding);
  const deleteBinding = useMutation(api.emailEventBindings.deleteBinding);

  const [bindingInProgress, setBindingInProgress] = useState<string | null>(null);

  const isLoading = loadingEvents || loadingBindings;

  // Create a map of eventType -> binding for quick lookup
  const bindingMap = new Map<string, Binding>();
  bindings?.forEach((b) => bindingMap.set(b.eventType, b));

  const handleBindTemplate = async (eventType: string, templateId: string) => {
    setBindingInProgress(eventType);
    try {
      await upsertBinding({
        organizationId,
        eventType,
        templateId: templateId as Id<"emailTemplates">,
        enabled: true,
      });
      toast.success(t("emailEvents.bindingSaved"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBindingInProgress(null);
    }
  };

  const handleToggleBinding = async (binding: Binding) => {
    setBindingInProgress(binding.eventType);
    try {
      await toggleBinding({
        organizationId,
        bindingId: binding._id,
        enabled: !binding.enabled,
      });
      toast.success(t("emailEvents.bindingSaved"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBindingInProgress(null);
    }
  };

  const handleUnbind = async (binding: Binding) => {
    if (!window.confirm(t("emailEvents.confirmUnbind"))) return;
    setBindingInProgress(binding.eventType);
    try {
      await deleteBinding({
        organizationId,
        bindingId: binding._id,
      });
      toast.success(t("emailEvents.bindingDeleted"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBindingInProgress(null);
    }
  };

  const getModuleLabel = (module: string) => {
    switch (module) {
      case "crm":
        return t("emailEvents.crm");
      case "gabinet":
        return t("emailEvents.gabinet");
      case "platform":
        return t("emailEvents.platform");
      default:
        return module;
    }
  };

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <PageHeader
        title={t("emailEvents.title")}
        description={t("emailEvents.description")}
      />

      {/* Module filter */}
      <div className="flex items-center gap-4">
        <Label>{t("emailEvents.module")}:</Label>
        <Select
          value={selectedModule}
          onValueChange={setSelectedModule}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("emailEvents.all")}</SelectItem>
            <SelectItem value="crm">{t("emailEvents.crm")}</SelectItem>
            <SelectItem value="gabinet">{t("emailEvents.gabinet")}</SelectItem>
            <SelectItem value="platform">{t("emailEvents.platform")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Events list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-3">
          {(!eventTypes || eventTypes.length === 0) && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("emailEvents.noBindings")}
            </p>
          )}
          {eventTypes?.map((event: EventType) => {
            const binding = bindingMap.get(event.eventType);
            const isProcessing = bindingInProgress === event.eventType;

            return (
              <Card key={event._id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{event.displayName}</p>
                      <Badge variant="outline">{getModuleLabel(event.module)}</Badge>
                    </div>
                    {event.description && (
                      <p className="text-sm text-muted-foreground">
                        {event.description}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground font-mono mt-1">
                      {event.eventType}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    {binding ? (
                      <>
                        <div className="text-right">
                          <p className="text-sm font-medium">
                            {binding.templateName || t("emailEvents.noTemplate")}
                          </p>
                          {binding.templateName && (
                            <p className="text-xs text-muted-foreground">
                              {binding.templateIsActive
                                ? t("emailEvents.active")
                                : t("emailEvents.inactive")}
                            </p>
                          )}
                        </div>

                        <Switch
                          checked={binding.enabled}
                          onCheckedChange={() => handleToggleBinding(binding)}
                          disabled={isProcessing}
                          aria-label={binding.enabled ? t("emailEvents.enabled") : t("emailEvents.disabled")}
                        />

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleUnbind(binding)}
                          disabled={isProcessing}
                        >
                          {t("emailEvents.unbind")}
                        </Button>
                      </>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Select
                          onValueChange={(templateId) => {
                            if (templateId) {
                              handleBindTemplate(event.eventType, templateId);
                            }
                          }}
                          disabled={isProcessing}
                        >
                          <SelectTrigger className="w-[250px]">
                            <SelectValue
                              placeholder={t("emailEvents.selectTemplate")}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {templates?.map((template) => (
                              <SelectItem
                                key={template._id}
                                value={template._id}
                              >
                                {template.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
