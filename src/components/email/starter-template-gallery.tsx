import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { Id } from "@cvx/_generated/dataModel";
import { wrapBodyWithLayout, type EmailLayoutData } from "@/components/email/blocks-to-html";

import starterTemplates from "@/data/email-starter-templates.json";

interface StarterTemplate {
  name: string;
  nameEn: string;
  subject: string;
  category: string;
  module: string;
  body: string;
  eventType?: string;
  variables?: string[];
  /** MJML source for GrapesJS editing (system templates) */
  mjml?: string;
}

interface StarterTemplateGalleryProps {
  onCreated: (templateId: string) => void;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  "appointment.created": "Nowa wizyta",
  "appointment.reminder": "Przypomnienie",
  "appointment.cancelled": "Odwołanie wizyty",
  "contact.welcome": "Powitanie kontaktu",
  "lead.status_changed": "Zmiana statusu",
  "lead.assigned": "Przypisanie opiekuna",
};

const MODULE_LABELS: Record<string, string> = {
  gabinet: "Gabinet",
  crm: "CRM",
};

export function StarterTemplateGallery({
  onCreated,
}: StarterTemplateGalleryProps) {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const createTemplate = useMutation(api.emailTemplates.create);
  const upsertBinding = useMutation(api.emailEventBindings.upsertBinding);

  // Load org layout for preview wrapping
  const { data: rawLayout } = useQuery(
    convexQuery(api.emailLayouts.get, { organizationId }),
  );

  // Convert Convex doc (JSON string blocks) to EmailLayoutData (parsed blocks)
  const layout: EmailLayoutData | null = useMemo(() => {
    if (!rawLayout) return null;
    return {
      ...rawLayout,
      headerBlocks: typeof rawLayout.headerBlocks === "string"
        ? JSON.parse(rawLayout.headerBlocks)
        : rawLayout.headerBlocks,
      footerBlocks: typeof rawLayout.footerBlocks === "string"
        ? JSON.parse(rawLayout.footerBlocks)
        : rawLayout.footerBlocks,
    };
  }, [rawLayout]);

  const [previewTemplate, setPreviewTemplate] =
    useState<StarterTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<"all" | "gabinet" | "crm">("all");

  const filteredTemplates = (starterTemplates as StarterTemplate[]).filter(
    (tpl) => {
      if (filter === "gabinet") return tpl.module === "gabinet";
      if (filter === "crm") return tpl.module === "crm";
      return true;
    },
  );

  /** Wrap template body with org's email layout for realistic preview. */
  const wrappedPreviewHtml = useMemo(() => {
    if (!previewTemplate) return "";
    return wrapBodyWithLayout(previewTemplate.body, layout ?? null);
  }, [previewTemplate, layout]);

  const handleUseTemplate = async (tpl: StarterTemplate) => {
    setCreating(true);
    try {
      // Save as {mjml, html} so GrapesJS can edit them.
      const body = tpl.mjml
        ? JSON.stringify({ mjml: tpl.mjml, html: tpl.body })
        : tpl.body;

      const templateId = await createTemplate({
        organizationId,
        name: tpl.name,
        subject: tpl.subject,
        body,
        category: tpl.category,
        module: tpl.module,
        eventType: tpl.eventType,
        variables: (tpl.variables ?? []).map((v) => ({
          key: v,
          label: v,
          source: "event",
        })),
      });

      // Auto-bind to event type if it's a system template
      if (tpl.eventType && templateId) {
        try {
          await upsertBinding({
            organizationId,
            eventType: tpl.eventType,
            templateId: templateId as Id<"emailTemplates">,
            enabled: true,
            priority: 0,
          });
          toast.success(
            `Szablon utworzony i powiązany z zdarzeniem "${EVENT_TYPE_LABELS[tpl.eventType] ?? tpl.eventType}"`,
          );
        } catch {
          // Template created but binding failed — still useful
          toast.success("Szablon utworzony (powiązanie nie powiodło się)");
        }
      } else {
        toast.success("Szablon został utworzony");
      }

      setPreviewTemplate(null);
      onCreated(templateId as unknown as string);
    } catch {
      toast.error("Błąd podczas tworzenia szablonu");
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      {/* Filter tabs */}
      <div className="mb-4 flex gap-2">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("all")}
        >
          Wszystkie ({(starterTemplates as StarterTemplate[]).length})
        </Button>
        <Button
          variant={filter === "gabinet" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("gabinet")}
        >
          Gabinet (
          {
            (starterTemplates as StarterTemplate[]).filter(
              (t) => t.module === "gabinet",
            ).length
          }
          )
        </Button>
        <Button
          variant={filter === "crm" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("crm")}
        >
          CRM (
          {
            (starterTemplates as StarterTemplate[]).filter(
              (t) => t.module === "crm",
            ).length
          }
          )
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {filteredTemplates.map((tpl) => (
          <Card
            key={tpl.nameEn}
            className="group cursor-pointer transition-shadow hover:shadow-md"
            onClick={() => setPreviewTemplate(tpl)}
          >
            <CardContent className="p-0">
              {/* Miniature preview — wrapped with layout */}
              <div className="relative h-48 overflow-hidden rounded-t-lg border-b bg-white">
                <iframe
                  srcDoc={wrapBodyWithLayout(tpl.body, layout ?? null)}
                  title={tpl.name}
                  className="pointer-events-none h-[600px] w-[600px] origin-top-left"
                  style={{
                    transform: "scale(0.3)",
                    transformOrigin: "top left",
                  }}
                  sandbox=""
                />
              </div>
              <div className="space-y-1 p-3">
                <p className="text-sm font-medium">{tpl.name}</p>
                <div className="flex flex-wrap items-center gap-1">
                  <Badge variant="outline" className="text-[10px]">
                    {MODULE_LABELS[tpl.module] ?? tpl.module}
                  </Badge>
                  {tpl.eventType && (
                    <Badge variant="secondary" className="text-[10px]">
                      {EVENT_TYPE_LABELS[tpl.eventType] ?? tpl.eventType}
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Preview dialog */}
      <Dialog
        open={previewTemplate !== null}
        onOpenChange={(open) => !open && setPreviewTemplate(null)}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewTemplate?.name}</DialogTitle>
          </DialogHeader>
          {previewTemplate && (
            <>
              {/* Event type + variables info */}
              {previewTemplate.eventType && (
                <div className="rounded-md border bg-muted/50 p-3">
                  <p className="text-sm font-medium">
                    Zdarzenie:{" "}
                    <Badge variant="default" className="ml-1">
                      {EVENT_TYPE_LABELS[previewTemplate.eventType] ??
                        previewTemplate.eventType}
                    </Badge>
                  </p>
                  {previewTemplate.variables &&
                    previewTemplate.variables.length > 0 && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Zmienne:{" "}
                        {previewTemplate.variables
                          .map((v) => `{{${v}}}`)
                          .join(", ")}
                      </p>
                    )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Po użyciu szablon zostanie automatycznie powiązany z tym
                    zdarzeniem.
                  </p>
                </div>
              )}
              {/* Preview wrapped with org layout (header + footer + colors) */}
              <div className="rounded border bg-white">
                <iframe
                  srcDoc={wrappedPreviewHtml}
                  title={previewTemplate.name}
                  className="h-[600px] w-full"
                  sandbox=""
                />
              </div>
            </>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewTemplate(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() =>
                previewTemplate && handleUseTemplate(previewTemplate)
              }
              disabled={creating}
            >
              {creating ? t("common.saving") : "Użyj tego szablonu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
