import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { useMutation } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@heroui/modal";
import { Button } from "@/components/ui/button";
import { ScrollShadow } from "@/components/ui/scroll-shadow";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  FileText,
  Loader2,
  Search,
  ShieldCheck,
  ClipboardList,
  Stethoscope,
  Handshake,
  FileSignature,
  FilePlus,
  Settings,
  Info,
} from "@/lib/ez-icons";
import { Input } from "@/components/ui/input";
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

const CATEGORY_ICONS: Record<string, typeof FileText> = {
  consent: ShieldCheck,
  medical_record: Stethoscope,
  prescription: FilePlus,
  referral: FileSignature,
  contract: Handshake,
  invoice: FileText,
  protocol: FileText,
  intake: ClipboardList,
  custom: FileText,
};

/** Parse the template's formJson to count user-fillable fields. */
function countFormFields(formJson: string | null | undefined): number {
  if (!formJson) return 0;
  try {
    const parsed = JSON.parse(formJson);
    if (Array.isArray(parsed)) return parsed.length;
    if (parsed.fields && Array.isArray(parsed.fields)) return parsed.fields.length;
    if (parsed.pages && Array.isArray(parsed.pages)) {
      return parsed.pages.reduce(
        (sum: number, page: { elements?: unknown[] }) =>
          sum + (page.elements?.length ?? 0),
        0,
      );
    }
    return Object.keys(parsed).length;
  } catch {
    return 0;
  }
}

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
        onDocumentCreated?.(docId.documentId);
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
    <Modal
      isOpen={open}
      onOpenChange={handleOpenChange}
      size={step === "fill_form" ? "4xl" : "2xl"}
      scrollBehavior="inside"
      backdrop="blur"
      classNames={{
        base: "max-h-[90vh]",
        body: "p-0",
      }}
    >
      <ModalContent>
        {() => (
          <>
            {/* --- Step 1: Template picker --- */}
            {step === "pick_template" && (
              <>
                <ModalHeader className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-semibold">
                      {t("documents.selectTemplate", "Wybierz szablon dokumentu")}
                    </h2>
                    <p className="text-sm text-default-500 font-normal mt-0.5">
                      {t(
                        "documents.selectTemplateDesc",
                        "Wybierz szablon, na podstawie ktorego zostanie wygenerowany dokument.",
                      )}
                    </p>
                  </div>
                  <span className="text-xs text-default-400 font-medium shrink-0">
                    {t("documents.stepOf", "Krok {{current}} z {{total}}", { current: 1, total: 2 })}
                  </span>
                </ModalHeader>

                <ModalBody>
                  <div className="px-1 pb-3">
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

                  <ScrollShadow className="flex-1 min-h-0 overflow-y-auto px-1 pb-4">
                    {templatesLoading && (
                      <div className="space-y-3">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <Skeleton key={i} className="h-16 w-full rounded-lg" />
                        ))}
                      </div>
                    )}

                    {!templatesLoading && filteredTemplates.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                          <FileText className="h-7 w-7" />
                        </div>
                        <div className="text-center space-y-1">
                          <p className="text-sm font-medium text-foreground">
                            {search.trim()
                              ? t("documents.noTemplatesSearch", "Nie znaleziono szablonow")
                              : t("documents.noTemplates", "Brak szablonow")}
                          </p>
                          <p className="text-xs max-w-[240px]">
                            {search.trim()
                              ? t("documents.noTemplatesSearchDesc", "Sprobuj zmienic fraze wyszukiwania.")
                              : t("documents.noTemplatesDesc", "Dodaj szablony dokumentow w ustawieniach, aby moc generowac dokumenty.")}
                          </p>
                        </div>
                        {!search.trim() && (
                          <Button variant="outline" size="sm" className="mt-1" asChild>
                            <a href="/dashboard/settings">
                              <Settings className="h-3.5 w-3.5 mr-1.5" />
                              {t("documents.goToSettings", "Przejdz do ustawien")}
                            </a>
                          </Button>
                        )}
                      </div>
                    )}

                    <div className="space-y-6">
                      {sortedCategories.map((category) => (
                        <div key={category}>
                          <h3 className="text-sm font-medium text-muted-foreground mb-2">
                            {CATEGORY_LABELS[category] ?? category}
                          </h3>
                          <div className="space-y-2">
                            {groupedTemplates[category].map((tpl) => {
                              const CategoryIcon = CATEGORY_ICONS[tpl.category] ?? FileText;
                              const fieldCount = countFormFields(tpl.formJson);
                              return (
                                <button
                                  key={tpl._id}
                                  type="button"
                                  onClick={() => handleTemplateSelect(tpl._id)}
                                  className="w-full text-left rounded-lg border p-3 transition-colors hover:bg-accent hover:border-accent-foreground/20 cursor-pointer group"
                                >
                                  <div className="flex items-start gap-3">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted group-hover:bg-background transition-colors">
                                      <CategoryIcon className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-0.5">
                                        <span className="text-sm font-medium truncate">
                                          {tpl.name}
                                        </span>
                                        {(tpl as Record<string, unknown>).requiresSignature && (
                                          <Badge variant="outline" className="text-[10px] shrink-0 gap-1 border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400">
                                            <FileSignature className="h-3 w-3" />
                                            {t("documents.requiresSignature", "Wymaga podpisu")}
                                          </Badge>
                                        )}
                                      </div>
                                      {tpl.description && (
                                        <p className="text-xs text-muted-foreground line-clamp-2 mb-1.5">
                                          {tpl.description}
                                        </p>
                                      )}
                                      <div className="flex items-center gap-2">
                                        <Badge variant="secondary" className="text-[10px] shrink-0">
                                          {CATEGORY_LABELS[tpl.category] ?? tpl.category}
                                        </Badge>
                                        {fieldCount > 0 && (
                                          <span className="text-[10px] text-muted-foreground">
                                            {t("documents.fieldCount", "{{count}} pol do wypelnienia", { count: fieldCount })}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollShadow>
                </ModalBody>
              </>
            )}

            {/* --- Step 2: Form fill --- */}
            {step === "fill_form" && (
              <>
                <ModalHeader className="flex items-center gap-2">
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
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-semibold">
                        {selectedTemplate?.name ??
                          t("documents.newDocument", "Nowy dokument")}
                      </h2>
                      <span className="text-xs text-default-400 font-medium shrink-0 ml-2">
                        {t("documents.stepOf", "Krok {{current}} z {{total}}", { current: 2, total: 2 })}
                      </span>
                    </div>
                    <p className="text-sm text-default-500 font-normal">
                      {t(
                        "documents.fillFormDesc",
                        "Wypelnij formularz i zatwierdz, aby wygenerowac dokument.",
                      )}
                    </p>
                  </div>
                </ModalHeader>

                <ModalBody>
                  {/* Template info bar */}
                  {selectedTemplate?.description && (
                    <div className="flex items-start gap-2 rounded-md bg-muted/50 border px-3 py-2 mb-4">
                      <Info className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {selectedTemplate.description}
                      </p>
                    </div>
                  )}

                  {previewLoading && (
                    <div className="flex items-center justify-center py-24 text-sm text-muted-foreground gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("common.loading", "Ladowanie...")}
                    </div>
                  )}

                  {!previewLoading && selectedTemplate && (
                    <div className="relative">
                      {submitting && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 rounded-lg">
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
                    </div>
                  )}
                </ModalBody>
              </>
            )}
          </>
        )}
      </ModalContent>
    </Modal>
  );
}

export type { GenerateDocumentDialogProps };
