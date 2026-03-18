import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { useMutation } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, FileText, Loader2, Search } from "@/lib/ez-icons";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { SurveyFormRenderer } from "./survey-form-renderer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = "pick_template" | "fill_form";

interface GenerateDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: string;
  entityId: string;
  organizationId: Id<"organizations">;
  onDocumentCreated?: (docId: Id<"formDocuments">) => void;
}

// ---------------------------------------------------------------------------
// Category labels (Polish)
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<string, string> = {
  consent: "Zgoda",
  medical_record: "Karta medyczna",
  prescription: "Recepta",
  referral: "Skierowanie",
  contract: "Umowa",
  invoice: "Faktura",
  protocol: "Protokol",
  intake: "Ankieta",
  custom: "Inne",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GenerateDocumentDialog({
  open,
  onOpenChange,
  entityType,
  entityId,
  organizationId,
  onDocumentCreated,
}: GenerateDocumentDialogProps) {
  const { t } = useTranslation();

  const [step, setStep] = useState<Step>("pick_template");
  const [selectedTemplateId, setSelectedTemplateId] =
    useState<Id<"formTemplates"> | null>(null);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const generateDocument = useMutation(api.documents.generate.generateDocument);

  // --- Reset state on close ---

  const handleOpenChange = useCallback(
    (value: boolean) => {
      if (!value) {
        setStep("pick_template");
        setSelectedTemplateId(null);
        setSearch("");
        setSubmitting(false);
      }
      onOpenChange(value);
    },
    [onOpenChange],
  );

  // --- Step 1: Template list ---

  const { data: templates, isLoading: templatesLoading } = useQuery({
    ...convexQuery(api.documents.templates.listByEntityType, {
      organizationId,
      entityType,
    }),
    enabled: open,
  });

  const filteredTemplates = templates
    ? search.trim()
      ? templates.filter(
          (tpl) =>
            tpl.name.toLowerCase().includes(search.toLowerCase()) ||
            (tpl.description ?? "").toLowerCase().includes(search.toLowerCase()),
        )
      : templates
    : [];

  // Group templates by category
  const groupedTemplates = filteredTemplates.reduce<
    Record<string, typeof filteredTemplates>
  >((acc, tpl) => {
    const cat = tpl.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(tpl);
    return acc;
  }, {});

  const sortedCategories = Object.keys(groupedTemplates).sort((a, b) =>
    (CATEGORY_LABELS[a] ?? a).localeCompare(CATEGORY_LABELS[b] ?? b),
  );

  const handleTemplateSelect = useCallback(
    (templateId: Id<"formTemplates">) => {
      setSelectedTemplateId(templateId);
      setStep("fill_form");
    },
    [],
  );

  // --- Step 2: Preview + fill data ---

  const { data: previewData, isLoading: previewLoading } = useQuery({
    ...convexQuery(api.documents.generate.previewDocumentData, {
      organizationId,
      templateId: selectedTemplateId!,
      entityType,
      entityId,
    }),
    enabled: !!selectedTemplateId && step === "fill_form",
  });

  const selectedTemplate = templates?.find(
    (t) => t._id === selectedTemplateId,
  );

  const handleComplete = useCallback(
    async (data: Record<string, unknown>) => {
      if (!selectedTemplateId) return;
      setSubmitting(true);
      try {
        const docId = await generateDocument({
          organizationId,
          templateId: selectedTemplateId,
          entityType,
          entityId,
          responseData: JSON.stringify(data),
          title: selectedTemplate?.name,
        });
        toast.success(
          t("documents.generated", "Dokument zostal wygenerowany"),
        );
        handleOpenChange(false);
        onDocumentCreated?.(docId);
      } catch (e: unknown) {
        const message =
          e instanceof Error ? e.message : "Wystapil blad";
        toast.error(message);
      } finally {
        setSubmitting(false);
      }
    },
    [
      selectedTemplateId,
      generateDocument,
      organizationId,
      entityType,
      entityId,
      selectedTemplate?.name,
      t,
      handleOpenChange,
      onDocumentCreated,
    ],
  );

  const handleBack = useCallback(() => {
    setStep("pick_template");
    setSelectedTemplateId(null);
  }, []);

  // --- Render ---

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "flex flex-col gap-0 p-0",
          step === "fill_form"
            ? "max-w-4xl max-h-[90vh]"
            : "max-w-2xl max-h-[80vh]",
        )}
      >
        {/* --- Step 1: Template picker --- */}
        {step === "pick_template" && (
          <>
            <DialogHeader className="px-6 pt-6 pb-4">
              <DialogTitle>
                {t("documents.selectTemplate", "Wybierz szablon dokumentu")}
              </DialogTitle>
              <DialogDescription>
                {t(
                  "documents.selectTemplateDesc",
                  "Wybierz szablon, na podstawie ktorego zostanie wygenerowany dokument.",
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="px-6 pb-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t(
                    "documents.searchTemplate",
                    "Szukaj szablonu...",
                  )}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <ScrollArea className="flex-1 min-h-0 px-6 pb-6">
              {templatesLoading && (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-lg" />
                  ))}
                </div>
              )}

              {!templatesLoading && filteredTemplates.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground gap-2">
                  <FileText className="h-8 w-8" />
                  <span>
                    {t("documents.noTemplates", "Brak szablonow")}
                  </span>
                </div>
              )}

              <div className="space-y-6">
                {sortedCategories.map((category) => (
                  <div key={category}>
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">
                      {CATEGORY_LABELS[category] ?? category}
                    </h3>
                    <div className="space-y-2">
                      {groupedTemplates[category].map((tpl) => (
                        <button
                          key={tpl._id}
                          type="button"
                          onClick={() => handleTemplateSelect(tpl._id)}
                          className="w-full text-left rounded-lg border p-3 transition-colors hover:bg-accent hover:border-accent-foreground/20 cursor-pointer"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-medium truncate">
                                  {tpl.name}
                                </span>
                                <Badge
                                  variant="secondary"
                                  className="text-xs shrink-0"
                                >
                                  {CATEGORY_LABELS[tpl.category] ??
                                    tpl.category}
                                </Badge>
                              </div>
                              {tpl.description && (
                                <p className="text-xs text-muted-foreground line-clamp-2">
                                  {tpl.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        )}

        {/* --- Step 2: Form fill --- */}
        {step === "fill_form" && (
          <>
            <DialogHeader className="px-6 pt-6 pb-4 border-b space-y-1.5">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={handleBack}
                  disabled={submitting}
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span className="sr-only">
                    {t("common.back", "Powrot")}
                  </span>
                </Button>
                <div>
                  <DialogTitle>
                    {selectedTemplate?.name ??
                      t("documents.newDocument", "Nowy dokument")}
                  </DialogTitle>
                  <DialogDescription>
                    {t(
                      "documents.fillFormDesc",
                      "Wypelnij formularz i zatwierdz, aby wygenerowac dokument.",
                    )}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <ScrollArea className="flex-1 min-h-0">
              <div className="p-6">
                {previewLoading && (
                  <div className="flex items-center justify-center py-24 text-sm text-muted-foreground gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("common.loading", "Ladowanie...")}
                  </div>
                )}

                {!previewLoading && selectedTemplate && (
                  <>
                    {submitting && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      </div>
                    )}
                    <SurveyFormRenderer
                      formJson={selectedTemplate.formJson}
                      prefilledData={
                        previewData?.prefilledData as
                          | Record<string, unknown>
                          | undefined
                      }
                      onComplete={handleComplete}
                    />
                  </>
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export type { GenerateDocumentDialogProps };
