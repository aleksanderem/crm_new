import { useState, useCallback, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { useMutation } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollShadow } from "@/components/ui/scroll-shadow";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tree,
  TreeItem,
  TreeItemLabel,
} from "@/components/reui/tree";
import {
  hotkeysCoreFeature,
  syncDataLoaderFeature,
} from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
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
} from "@/lib/ez-icons";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { SurveyFormRenderer } from "./survey-form-renderer";
import { DocumentFormFiller } from "./document-form-filler";
import {
  extractFormFields,
  renderDocument,
} from "./document-renderer";

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

/** Extract plain text from a Plate/Slate JSON description string. */
function extractPlainText(raw: string): string {
  try {
    const nodes = JSON.parse(raw);
    if (!Array.isArray(nodes)) return raw;
    const texts: string[] = [];
    const walk = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      const n = node as Record<string, unknown>;
      if (typeof n.text === "string") {
        texts.push(n.text);
      }
      if (Array.isArray(n.children)) {
        for (const child of n.children) walk(child);
      }
    };
    for (const node of nodes) walk(node);
    return texts.join(" ").trim() || raw;
  } catch {
    return raw;
  }
}

/** Parse the template's formJson to count user-fillable fields. */
function countFormFields(formJson: string | null | undefined): number {
  if (!formJson) return 0;
  try {
    const parsed = JSON.parse(formJson);
    if (Array.isArray(parsed)) return parsed.length;
    if (parsed.fields && Array.isArray(parsed.fields))
      return parsed.fields.length;
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
// Document template form step — handles TipTap document-type templates
// ---------------------------------------------------------------------------

function DocumentTemplateFormStep({
  contentJson,
  prefilledData,
  onComplete,
  onCancel,
}: {
  contentJson: string;
  prefilledData: Record<string, string>;
  onComplete: (data: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const json = JSON.parse(contentJson);
  const formFields = extractFormFields(json);

  if (formFields.length === 0) {
    // No form fields — auto-resolve variables and generate directly
    const resolvedHtml = renderDocument(contentJson, prefilledData);
    return (
      <div className="space-y-4">
        <div
          className="prose prose-sm max-w-none rounded-lg border bg-white p-6 dark:bg-card [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:bg-muted [&_th]:p-2"
          dangerouslySetInnerHTML={{ __html: resolvedHtml }}
        />
        <div className="flex gap-2">
          <Button
            className="flex-1"
            onClick={() =>
              onComplete({ html: resolvedHtml, formFieldValues: {} })
            }
          >
            Generuj dokument
          </Button>
          <Button variant="outline" onClick={onCancel}>
            Anuluj
          </Button>
        </div>
      </div>
    );
  }

  return (
    <DocumentFormFiller
      formFields={formFields}
      onComplete={(fieldValues) => {
        const resolvedHtml = renderDocument(
          contentJson,
          prefilledData,
          fieldValues,
        );
        onComplete({ html: resolvedHtml, formFieldValues: fieldValues });
      }}
      onCancel={onCancel}
    />
  );
}

// ---------------------------------------------------------------------------
// Headless-tree data model builder
// ---------------------------------------------------------------------------

interface TreeNodeData {
  name: string;
  children?: string[];
  isFolder: boolean;
  templateId?: Id<"formTemplates">;
  category?: string;
  description?: string;
  formJson?: string;
  requiresSignature?: boolean;
}

/**
 * Convert a flat template array (with folderPath strings) into the record
 * format that @headless-tree expects. Returns { items, rootChildren, expandedIds }.
 */
function buildTreeData(
  templates: Array<{
    _id: Id<"formTemplates">;
    name: string;
    folderPath?: string;
    category: string;
    description?: string;
    formJson: string;
    requiresSignature: boolean;
  }>,
): {
  items: Record<string, TreeNodeData>;
  rootChildren: string[];
  expandedIds: string[];
} {
  const items: Record<string, TreeNodeData> = {};
  const folderChildren = new Map<string, Set<string>>(); // path → child IDs
  const rootChildren = new Set<string>();

  for (const tpl of templates) {
    const tplId = `tpl:${tpl._id}`;
    items[tplId] = {
      name: tpl.name,
      isFolder: false,
      templateId: tpl._id,
      category: tpl.category,
      description: tpl.description,
      formJson: tpl.formJson,
      requiresSignature: tpl.requiresSignature,
    };

    if (!tpl.folderPath) {
      rootChildren.add(tplId);
      continue;
    }

    const segments = tpl.folderPath.split("/");

    // Ensure all ancestor folders exist
    for (let i = 1; i <= segments.length; i++) {
      const path = segments.slice(0, i).join("/");
      const folderId = `folder:${path}`;

      if (!items[folderId]) {
        items[folderId] = {
          name: segments[i - 1],
          children: [],
          isFolder: true,
        };
        if (!folderChildren.has(path)) {
          folderChildren.set(path, new Set());
        }
      }

      // Wire parent → child
      if (i === 1) {
        rootChildren.add(folderId);
      } else {
        const parentPath = segments.slice(0, i - 1).join("/");
        if (!folderChildren.has(parentPath)) {
          folderChildren.set(parentPath, new Set());
        }
        folderChildren.get(parentPath)!.add(folderId);
      }
    }

    // Add template to its leaf folder
    const leafPath = tpl.folderPath;
    if (!folderChildren.has(leafPath)) {
      folderChildren.set(leafPath, new Set());
    }
    folderChildren.get(leafPath)!.add(tplId);
  }

  // Wire children arrays on folder items
  for (const [path, childIds] of folderChildren) {
    const folderId = `folder:${path}`;
    if (items[folderId]) {
      items[folderId].children = Array.from(childIds).sort((a, b) => {
        // Folders first, then templates
        const aIsFolder = a.startsWith("folder:");
        const bIsFolder = b.startsWith("folder:");
        if (aIsFolder && !bIsFolder) return -1;
        if (!aIsFolder && bIsFolder) return 1;
        return (items[a]?.name ?? "").localeCompare(items[b]?.name ?? "");
      });
    }
  }

  // Build root item
  const sortedRootChildren = Array.from(rootChildren).sort((a, b) => {
    const aIsFolder = a.startsWith("folder:");
    const bIsFolder = b.startsWith("folder:");
    if (aIsFolder && !bIsFolder) return -1;
    if (!aIsFolder && bIsFolder) return 1;
    return (items[a]?.name ?? "").localeCompare(items[b]?.name ?? "");
  });

  items["__root__"] = {
    name: "Root",
    children: sortedRootChildren,
    isFolder: true,
  };

  // Collect all folder IDs to expand them by default
  const expandedIds = Object.keys(items).filter((id) =>
    id.startsWith("folder:"),
  );

  return { items, rootChildren: sortedRootChildren, expandedIds };
}

// ---------------------------------------------------------------------------
// Template card (rendered as leaf node content)
// ---------------------------------------------------------------------------

function TemplateCard({
  data,
  onClick,
  t,
}: {
  data: TreeNodeData;
  onClick: () => void;
  t: (key: string, defaultValue?: string, options?: Record<string, unknown>) => string;
}) {
  const CategoryIcon = CATEGORY_ICONS[data.category ?? ""] ?? FileText;
  const fieldCount = countFormFields(data.formJson);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="w-full text-left rounded-lg border p-3 transition-colors hover:bg-accent hover:border-accent-foreground/20 cursor-pointer group"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted group-hover:bg-background transition-colors">
          <CategoryIcon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium truncate">{data.name}</span>
            {data.requiresSignature && (
              <Badge
                variant="outline"
                className="text-[10px] shrink-0 gap-1 border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400"
              >
                <FileSignature className="h-3 w-3" />
                {t("documents.requiresSignature", "Wymaga podpisu")}
              </Badge>
            )}
          </div>
          {data.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mb-1.5">
              {extractPlainText(data.description)}
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

// ---------------------------------------------------------------------------
// Folder tree sub-component (mounts only when data is ready)
// ---------------------------------------------------------------------------

const TREE_INDENT = 20;

function TemplateFolderTree({
  templates,
  search: _search,
  onSelect,
  t,
}: {
  templates: Array<{
    _id: Id<"formTemplates">;
    name: string;
    folderPath?: string;
    category: string;
    description?: string;
    formJson: string;
    requiresSignature: boolean;
  }>;
  search: string;
  onSelect: (id: Id<"formTemplates">) => void;
  t: (key: string, defaultValue?: string, options?: Record<string, unknown>) => string;
}) {
  const treeData = useMemo(() => buildTreeData(templates), [templates]);

  const tree = useTree<TreeNodeData>({
    initialState: {
      expandedItems: treeData.expandedIds,
    },
    indent: TREE_INDENT,
    rootItemId: "__root__",
    getItemName: (item) => item.getItemData().name,
    isItemFolder: (item) => item.getItemData()?.isFolder ?? false,
    dataLoader: {
      getItem: (itemId) => treeData.items[itemId],
      getChildren: (itemId) => treeData.items[itemId]?.children ?? [],
    },
    features: [syncDataLoaderFeature, hotkeysCoreFeature],
  });

  // Rebuild tree when underlying data changes (search filtering, etc.)
  const treeDataKey = useMemo(
    () => Object.keys(treeData.items).sort().join(","),
    [treeData.items],
  );
  useEffect(() => {
    tree.rebuildTree();
  }, [treeDataKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Tree indent={TREE_INDENT} tree={tree} toggleIconType="chevron">
      {tree.getItems().map((item) => {
        const data = item.getItemData();
        if (!data) return null;

        if (!item.isFolder()) {
          return (
            <TreeItem key={item.getId()} item={item} className="!ps-0">
              <div
                style={{
                  paddingLeft: `${item.getItemMeta().level * TREE_INDENT}px`,
                }}
              >
                <TemplateCard
                  data={data}
                  onClick={() => {
                    if (data.templateId) {
                      onSelect(data.templateId);
                    }
                  }}
                  t={t}
                />
              </div>
            </TreeItem>
          );
        }

        return (
          <TreeItem key={item.getId()} item={item}>
            <TreeItemLabel className="before:bg-background relative before:absolute before:inset-x-0 before:-inset-y-0.5 before:-z-10">
              <span className="flex items-center gap-2">
                {item.isExpanded() ? (
                  <FolderOpen className="text-amber-500 pointer-events-none size-4" />
                ) : (
                  <Folder className="text-amber-500 pointer-events-none size-4" />
                )}
                <span className="font-medium">{item.getItemName()}</span>
              </span>
            </TreeItemLabel>
          </TreeItem>
        );
      })}
    </Tree>
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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={`${step === "fill_form" ? "max-w-4xl" : "max-w-2xl"} max-h-[90vh] flex flex-col gap-0 p-0`}>
        {/* --- Step 1: Template picker --- */}
        {step === "pick_template" && (
          <>
            <div className="flex items-center justify-between gap-2 px-6 pt-6 pb-2">
              <DialogHeader className="space-y-1 text-left">
                <DialogTitle>{t("documents.selectTemplate", "Wybierz szablon dokumentu")}</DialogTitle>
                <DialogDescription>
                  {t("documents.selectTemplateDesc", "Wybierz szablon, na podstawie ktorego zostanie wygenerowany dokument.")}
                </DialogDescription>
              </DialogHeader>
              <span className="text-xs text-muted-foreground font-medium shrink-0">
                {t("documents.stepOf", "Krok {{current}} z {{total}}", { current: 1, total: 2 })}
              </span>
            </div>

            <div className="px-6 pt-2 pb-4 flex-1 min-h-0 flex flex-col">
              <div className="pb-3 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder={t("documents.searchTemplate", "Szukaj szablonu...")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
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

                {!templatesLoading && filteredTemplates.length > 0 && (
                  <TemplateFolderTree
                    templates={filteredTemplates}
                    search={search}
                    onSelect={handleTemplateSelect}
                    t={(t as unknown) as (key: string, defaultValue?: string, options?: Record<string, unknown>) => string}
                  />
                )}
              </ScrollShadow>
            </div>
          </>
        )}

        {/* --- Step 2: Form fill --- */}
        {step === "fill_form" && (
          <>
            <div className="flex items-center gap-2 px-6 pt-6 pb-2">
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
                  <span className="text-xs text-muted-foreground font-medium shrink-0 ml-2">
                    {t("documents.stepOf", "Krok {{current}} z {{total}}", { current: 2, total: 2 })}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground font-normal">
                  {t(
                    "documents.fillFormDesc",
                    "Wypelnij formularz i zatwierdz, aby wygenerowac dokument.",
                  )}
                </p>
              </div>
            </div>

            <div className="px-6 pt-2 pb-4 flex-1 min-h-0 overflow-y-auto">
              {/* Template info bar */}
              {selectedTemplate?.description && (
                <div className="flex items-start gap-2 rounded-md bg-muted/50 border px-3 py-2 mb-4">
                  <Info className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {extractPlainText(selectedTemplate.description)}
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
                  {previewData?.templateType === "document" &&
                  previewData.contentJson ? (
                    <DocumentTemplateFormStep
                      contentJson={previewData.contentJson}
                      prefilledData={previewData.prefilledData}
                      onComplete={handleComplete}
                      onCancel={handleBack}
                    />
                  ) : (
                    <SurveyFormRenderer
                      formJson={selectedTemplate.formJson}
                      prefilledData={
                        previewData?.prefilledData as
                          | Record<string, unknown>
                          | undefined
                      }
                      onComplete={handleComplete}
                    />
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export type { GenerateDocumentDialogProps };
