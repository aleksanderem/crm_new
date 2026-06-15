import { useState, useCallback, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
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
  AlertTriangle,
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
import { DocumentFormFiller } from "./document-form-filler";
import {
  extractFormFields,
  extractVariablePaths,
  renderDocument,
} from "./document-renderer";
import { VARIABLE_REGISTRY } from "@/lib/document-variables";
import type { VariableField } from "@/lib/document-variables";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = "pick_template" | "complete_data" | "fill_form";

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
  const allFormFields = extractFormFields(json);
  const employeeFields = allFormFields.filter((f) => (f.filledBy || "employee") === "employee");
  const clientFields = allFormFields.filter((f) => f.filledBy === "client");
  const hasClientFields = clientFields.length > 0;

  if (employeeFields.length === 0) {
    // No employee form fields — auto-resolve variables and generate directly
    const resolvedHtml = renderDocument(contentJson, prefilledData);
    return (
      <div className="space-y-4">
        <div
          className="prose prose-sm max-w-none rounded-lg border bg-white p-6 text-gray-900 [&_*]:!text-gray-900 [&_a]:!text-blue-700 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-gray-300 [&_td]:p-2 [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-100 [&_th]:p-2"
          dangerouslySetInnerHTML={{ __html: resolvedHtml }}
        />
        <div className="flex gap-2">
          <Button
            className="flex-1"
            onClick={() =>
              onComplete({ html: resolvedHtml, formFieldValues: {}, hasClientFields, scopeData: prefilledData })
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
      formFields={allFormFields}
      filledByFilter="employee"
      onComplete={(fieldValues) => {
        const resolvedHtml = renderDocument(
          contentJson,
          prefilledData,
          fieldValues,
        );
        onComplete({ html: resolvedHtml, formFieldValues: fieldValues, hasClientFields, scopeData: prefilledData });
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
// Missing data helpers
// ---------------------------------------------------------------------------

/** Build a flat lookup from VARIABLE_REGISTRY for label resolution. */
function buildVariableLabelMap(): Map<string, VariableField> {
  const map = new Map<string, VariableField>();
  for (const fields of Object.values(VARIABLE_REGISTRY)) {
    for (const f of fields) {
      map.set(f.path, f);
    }
  }
  return map;
}

const VARIABLE_LABEL_MAP = buildVariableLabelMap();

/**
 * Detect which template variables are missing from the prefilled scope data.
 * Excludes system.* and organization.* which are always auto-populated.
 */
function detectMissingVariables(
  contentJson: string,
  prefilledData: Record<string, string>,
): string[] {
  let json: unknown;
  try {
    json = JSON.parse(contentJson);
  } catch {
    return [];
  }
  const paths = extractVariablePaths(json as Parameters<typeof extractVariablePaths>[0]);
  return paths.filter((path) => {
    // system.* and organization.* are always available
    if (path.startsWith("system.") || path.startsWith("organization.")) return false;
    const value = prefilledData[path];
    return !value || value.trim() === "";
  });
}

// ---------------------------------------------------------------------------
// Missing data form step
// ---------------------------------------------------------------------------

function MissingDataFormStep({
  missingVars,
  onComplete,
  onCancel,
  saving,
}: {
  missingVars: string[];
  onComplete: (data: Record<string, string>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language === "en";
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const path of missingVars) init[path] = "";
    return init;
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      // Only submit non-empty values
      const filled: Record<string, string> = {};
      for (const [k, v] of Object.entries(values)) {
        if (v.trim()) filled[k] = v.trim();
      }
      onComplete(filled);
    },
    [values, onComplete],
  );

  // Group by entity prefix for display
  const grouped = useMemo(() => {
    const groups: Record<string, string[]> = {};
    for (const path of missingVars) {
      const dotIdx = path.indexOf(".");
      const prefix = dotIdx > -1 ? path.substring(0, dotIdx) : "other";
      if (!groups[prefix]) groups[prefix] = [];
      groups[prefix].push(path);
    }
    return groups;
  }, [missingVars]);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {Object.entries(grouped).map(([prefix, paths]) => (
        <div key={prefix} className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground capitalize">
            {prefix}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {paths.map((path) => {
              const varInfo = VARIABLE_LABEL_MAP.get(path);
              const label = varInfo
                ? isEn
                  ? varInfo.labelEn
                  : varInfo.label
                : path;
              const fieldType = varInfo?.type ?? "text";
              return (
                <div key={path} className="space-y-1.5">
                  <Label htmlFor={`missing-${path}`} className="text-sm">
                    {label}
                  </Label>
                  {fieldType === "phone" ? (
                    <PhoneInput
                      id={`missing-${path}`}
                      value={values[path] ?? ""}
                      onChange={(v) =>
                        setValues((prev) => ({ ...prev, [path]: v }))
                      }
                      placeholder={label}
                    />
                  ) : (
                    <Input
                      id={`missing-${path}`}
                      type={fieldType === "date" ? "date" : "text"}
                      value={values[path] ?? ""}
                      onChange={(e) =>
                        setValues((prev) => ({
                          ...prev,
                          [path]: e.target.value,
                        }))
                      }
                      placeholder={fieldType === "date" ? undefined : label}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="flex gap-2 pt-2">
        <Button type="submit" className="flex-1" disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("documents.saveAndContinue", "Zapisz i kontynuuj")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={saving}
        >
          {t("common.back", "Powrot")}
        </Button>
      </div>
    </form>
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

  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("pick_template");
  const [selectedTemplateId, setSelectedTemplateId] =
    useState<Id<"formTemplates"> | null>(null);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [savingMissingData, setSavingMissingData] = useState(false);
  const [missingDataHandled, setMissingDataHandled] = useState(false);

  const generateDocument = useAction(api.documents.generate.generateDocument);
  const completeMissingDataMutation = useAction(api.documents.completeMissingData.completeMissingData);

  // --- Reset state on close ---

  const handleOpenChange = useCallback(
    (value: boolean) => {
      if (!value) {
        setStep("pick_template");
        setSelectedTemplateId(null);
        setSearch("");
        setSubmitting(false);
        setSavingMissingData(false);
        setMissingDataHandled(false);
      }
      onOpenChange(value);
    },
    [onOpenChange],
  );

  // --- Step 1: Template list ---

  const listTemplatesByEntityType = useAction(api.documents.templates.listByEntityType);
  const { data: templatesRaw, isLoading: templatesLoading } = useQuery({
    queryKey: ["documents.templates.listByEntityType", organizationId, entityType],
    queryFn: () =>
      listTemplatesByEntityType({
        organizationId,
        entityType,
      }),
    enabled: open && !!organizationId && !!entityType,
  });
  const templates = templatesRaw as unknown as
    | Array<{
        _id: Id<"formTemplates">;
        name: string;
        folderPath?: string;
        category: string;
        description?: string;
        formJson: string;
        requiresSignature: boolean;
      }>
    | undefined;

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

  // --- Step 2/3: Preview + fill data (also needed for complete_data step) ---

  const previewDocumentDataAction = useAction(api.documents.generate.previewDocumentData);
  const { data: previewData, isLoading: previewLoading } = useQuery({
    queryKey: [
      "documents.generate.previewDocumentData",
      organizationId,
      selectedTemplateId,
      entityType,
      entityId,
    ],
    queryFn: () =>
      previewDocumentDataAction({
        organizationId,
        templateId: selectedTemplateId as unknown as string,
        entityType,
        entityId,
      }),
    enabled: !!selectedTemplateId && (step === "fill_form" || step === "complete_data"),
  });

  const selectedTemplate = templates?.find(
    (t) => t._id === selectedTemplateId,
  );

  // Detect missing variables once previewData arrives
  const missingVars = useMemo(() => {
    if (!previewData?.contentJson || !previewData?.prefilledData) return [];
    return detectMissingVariables(previewData.contentJson, previewData.prefilledData);
  }, [previewData?.contentJson, previewData?.prefilledData]);

  // Auto-redirect to complete_data if missing vars detected on first load
  // (only once per template selection — after the user fills in missing data we skip)
  useEffect(() => {
    if (step === "fill_form" && !previewLoading && missingVars.length > 0 && !missingDataHandled) {
      setStep("complete_data");
    }
  }, [step, previewLoading, missingVars.length, missingDataHandled]);

  // Handler for completing missing data
  const handleMissingDataComplete = useCallback(
    async (data: Record<string, string>) => {
      if (Object.keys(data).length === 0) {
        // Nothing filled, just proceed
        setMissingDataHandled(true);
        setStep("fill_form");
        return;
      }
      setSavingMissingData(true);
      try {
        await completeMissingDataMutation({
          organizationId,
          entityType,
          entityId,
          data,
        });
        // Invalidate the preview query so it re-fetches with the updated entity data
        await queryClient.invalidateQueries({
          queryKey: [
            "documents.generate.previewDocumentData",
            organizationId,
            selectedTemplateId,
            entityType,
            entityId,
          ],
        });
        setMissingDataHandled(true);
        setStep("fill_form");
      } catch (e) {
        const message = e instanceof Error ? e.message : "Error saving data";
        toast.error(message);
      } finally {
        setSavingMissingData(false);
      }
    },
    [completeMissingDataMutation, organizationId, entityType, entityId, queryClient, selectedTemplateId],
  );

  const handleComplete = useCallback(
    async (data: Record<string, unknown>) => {
      if (!selectedTemplateId) return;
      setSubmitting(true);
      try {
        const hasClientFields = data.hasClientFields === true;
        const docId = await generateDocument({
          organizationId,
          templateId: selectedTemplateId,
          entityType,
          entityId,
          responseData: JSON.stringify(data),
          title: selectedTemplate?.name,
          hasClientFields,
        });
        toast.success(
          t("documents.generated", "Dokument zostal wygenerowany"),
        );
        handleOpenChange(false);
        onDocumentCreated?.(docId.documentId as Id<"formDocuments">);
      } catch (e) {
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
    setMissingDataHandled(false);
  }, []);

  // --- Render ---

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={`${step === "fill_form" ? "max-w-4xl" : "max-w-2xl"} max-h-[90vh] flex flex-col gap-0 p-0`} aria-describedby={undefined}>
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
                    key={filteredTemplates.map((tpl) => tpl._id).join(",")}
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

        {/* --- Step 2: Complete missing data --- */}
        {step === "complete_data" && (
          <>
            <div className="flex items-center gap-2 px-6 pt-6 pb-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={handleBack}
                disabled={savingMissingData}
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="sr-only">
                  {t("common.back", "Powrot")}
                </span>
              </Button>
              <div className="flex-1 min-w-0">
                <DialogHeader className="space-y-1 text-left">
                  <DialogTitle>
                    {t("documents.completeMissingData", "Uzupełnij brakujące dane")}
                  </DialogTitle>
                  <DialogDescription>
                    {t(
                      "documents.completeMissingDataDesc",
                      "Poniższe dane są wymagane do wygenerowania dokumentu. Po uzupełnieniu zostaną zapisane w profilu.",
                    )}
                  </DialogDescription>
                </DialogHeader>
              </div>
            </div>

            <div className="px-6 pt-2 pb-4 flex-1 min-h-0 overflow-y-auto">
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 mb-4 dark:border-amber-800 dark:bg-amber-950/30">
                <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 dark:text-amber-500 shrink-0" />
                <p className="text-xs text-amber-800 dark:text-amber-400 leading-relaxed">
                  {t(
                    "documents.missingDataWarning",
                    "Szablon wymaga danych, które nie są jeszcze uzupełnione w profilu. Uzupełnij je poniżej — zostaną zapisane automatycznie.",
                  )}
                </p>
              </div>

              {previewLoading ? (
                <div className="flex items-center justify-center py-24 text-sm text-muted-foreground gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("common.loading", "Ladowanie...")}
                </div>
              ) : (
                <MissingDataFormStep
                  missingVars={missingVars}
                  onComplete={handleMissingDataComplete}
                  onCancel={handleBack}
                  saving={savingMissingData}
                />
              )}
            </div>
          </>
        )}

        {/* --- Step 3: Form fill --- */}
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
                  {previewData?.contentJson ? (
                    <DocumentTemplateFormStep
                      contentJson={previewData.contentJson}
                      prefilledData={previewData.prefilledData}
                      onComplete={handleComplete}
                      onCancel={handleBack}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                      <FileText className="h-7 w-7" />
                      <p className="text-sm">
                        {t("documents.noContentAvailable", "Brak tresci szablonu do wyswietlenia.")}
                      </p>
                    </div>
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
