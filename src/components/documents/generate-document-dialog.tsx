import { useState, useCallback, useMemo } from "react";
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
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
} from "@/lib/ez-icons";
import { Input } from "@heroui/input";
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
// Category icons
// ---------------------------------------------------------------------------

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
// Folder tree helpers
// ---------------------------------------------------------------------------

type FolderNode<T> = {
  name: string;
  fullPath: string;
  templates: T[];
  children: FolderNode<T>[];
};

/** Build a tree structure from templates' folderPath values. */
function buildFolderTree<T extends { folderPath?: string }>(
  templates: T[],
): { root: T[]; folders: FolderNode<T>[] } {
  const root: T[] = [];
  const folderMap = new Map<
    string,
    { templates: T[]; children: Map<string, true> }
  >();

  for (const tpl of templates) {
    if (!tpl.folderPath) {
      root.push(tpl);
      continue;
    }

    const segments = tpl.folderPath.split("/");
    for (let i = 1; i <= segments.length; i++) {
      const path = segments.slice(0, i).join("/");
      if (!folderMap.has(path)) {
        folderMap.set(path, { templates: [], children: new Map() });
      }
    }
    folderMap.get(tpl.folderPath)!.templates.push(tpl);

    for (let i = 2; i <= segments.length; i++) {
      const parentPath = segments.slice(0, i - 1).join("/");
      const childPath = segments.slice(0, i).join("/");
      folderMap.get(parentPath)!.children.set(childPath, true);
    }
  }

  function buildNode(path: string): FolderNode<T> {
    const entry = folderMap.get(path)!;
    const childPaths = Array.from(entry.children.keys()).sort();
    return {
      name: path.split("/").pop()!,
      fullPath: path,
      templates: entry.templates,
      children: childPaths.map(buildNode),
    };
  }

  const topPaths = Array.from(folderMap.keys())
    .filter((p) => !p.includes("/"))
    .sort();

  return { root, folders: topPaths.map(buildNode) };
}

function countTemplatesInNode<T>(node: FolderNode<T>): number {
  return (
    node.templates.length +
    node.children.reduce(
      (sum, child) => sum + countTemplatesInNode(child),
      0,
    )
  );
}

function collectAllPaths<T>(nodes: FolderNode<T>[]): string[] {
  return nodes.flatMap((node) => [
    node.fullPath,
    ...collectAllPaths(node.children),
  ]);
}

// ---------------------------------------------------------------------------
// Sub-components for tree rendering
// ---------------------------------------------------------------------------

function TemplateItem({
  tpl,
  onSelect,
  t,
}: {
  tpl: { _id: Id<"formTemplates">; name: string; category: string; description?: string; formJson: string; requiresSignature: boolean };
  onSelect: (id: Id<"formTemplates">) => void;
  t: (key: string, defaultValue?: string, options?: Record<string, unknown>) => string;
}) {
  const CategoryIcon = CATEGORY_ICONS[tpl.category] ?? FileText;
  const fieldCount = countFormFields(tpl.formJson);
  return (
    <button
      type="button"
      onClick={() => onSelect(tpl._id)}
      className="w-full text-left rounded-lg border p-3 transition-colors hover:bg-accent hover:border-accent-foreground/20 cursor-pointer group"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted group-hover:bg-background transition-colors">
          <CategoryIcon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium truncate">{tpl.name}</span>
            {tpl.requiresSignature && (
              <Badge
                variant="outline"
                className="text-[10px] shrink-0 gap-1 border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400"
              >
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
          {fieldCount > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {t("documents.fieldCount", "{{count}} pol do wypelnienia", {
                count: fieldCount,
              })}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function FolderTreeBranch({
  node,
  expanded,
  onToggle,
  onSelect,
  t,
  depth = 0,
}: {
  node: FolderNode<any>;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (id: Id<"formTemplates">) => void;
  t: (key: string, defaultValue?: string, options?: Record<string, unknown>) => string;
  depth?: number;
}) {
  const isExpanded = expanded.has(node.fullPath);
  const hasContent = node.templates.length > 0 || node.children.length > 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => onToggle(node.fullPath)}
        className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        {isExpanded ? (
          <FolderOpen className="h-4 w-4 text-amber-500 shrink-0" />
        ) : (
          <Folder className="h-4 w-4 text-amber-500 shrink-0" />
        )}
        <span className="font-medium truncate">{node.name}</span>
        <span className="text-xs text-muted-foreground ml-auto shrink-0">
          {countTemplatesInNode(node)}
        </span>
      </button>

      {isExpanded && hasContent && (
        <div>
          {node.children.map((child) => (
            <FolderTreeBranch
              key={child.fullPath}
              node={child}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              t={t}
              depth={depth + 1}
            />
          ))}
          <div
            className="space-y-2 mt-1"
            style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}
          >
            {node.templates.map((tpl: any) => (
              <TemplateItem
                key={tpl._id}
                tpl={tpl}
                onSelect={onSelect}
                t={t}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
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

  // Build folder tree from folderPath values
  const folderTree = useMemo(
    () => buildFolderTree(filteredTemplates),
    [filteredTemplates],
  );

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(),
  );

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  // Auto-expand all folders when searching
  const effectiveExpanded = useMemo(
    () =>
      search.trim()
        ? new Set(collectAllPaths(folderTree.folders))
        : expandedFolders,
    [search, folderTree.folders, expandedFolders],
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
        body: "px-6 pt-2 pb-4",
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
                  <div className="pb-3">
                    <Input
                      variant="bordered"
                      placeholder={t(
                        "documents.searchTemplate",
                        "Szukaj szablonu...",
                      )}
                      value={search}
                      onValueChange={setSearch}
                      startContent={<Search className="h-4 w-4 text-muted-foreground" />}
                      isClearable
                      onClear={() => setSearch("")}
                    />
                  </div>

                  <ScrollShadow className="flex-1 min-h-0 overflow-y-auto pb-4">
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

                    <div className="space-y-1">
                      {/* Folder tree */}
                      {folderTree.folders.map((folder) => (
                        <FolderTreeBranch
                          key={folder.fullPath}
                          node={folder}
                          expanded={effectiveExpanded}
                          onToggle={toggleFolder}
                          onSelect={handleTemplateSelect}
                          t={t}
                        />
                      ))}

                      {/* Root-level templates (no folder) */}
                      {folderTree.root.length > 0 && (
                        <div className="space-y-2 mt-3">
                          {folderTree.folders.length > 0 && (
                            <div className="mb-2">
                              <Badge variant="secondary" className="text-xs">
                                {t("settings.formTemplates.noFolder", "Bez katalogu")}
                              </Badge>
                            </div>
                          )}
                          {folderTree.root.map((tpl) => (
                            <TemplateItem
                              key={tpl._id}
                              tpl={tpl}
                              onSelect={handleTemplateSelect}
                              t={t}
                            />
                          ))}
                        </div>
                      )}
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
