import { useState, useMemo, useEffect, useCallback } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMutation, useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useTranslation } from "react-i18next";
import { SectionHeader } from "@untitled/app/section-headers/section-headers";
import { UntitledAlert } from "@/components/ui/untitled-alert";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Tree,
  TreeItem,
  TreeItemLabel,
  TreeDragLine,
} from "@/components/reui/tree";
import {
  syncDataLoaderFeature,
  hotkeysCoreFeature,
  dragAndDropFeature,
  selectionFeature,
} from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
import {
  Plus,
  FileText,
  Menu,
  Pencil,
  Trash2,
  CopyIcon,
  Search,
  Folder,
  FolderOpen,
  FolderPlus,
  GripVertical,
  ChevronDown,
} from "@/lib/ez-icons";
import { toast } from "sonner";
import type { Id } from "@cvx/_generated/dataModel";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/form-templates/",
)({
  component: FormTemplatesListPage,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FormCategory =
  | "consent"
  | "medical_record"
  | "prescription"
  | "referral"
  | "contract"
  | "invoice"
  | "protocol"
  | "intake"
  | "custom";

interface FormTemplateRecord {
  _id: Id<"formTemplates">;
  name: string;
  description?: string;
  category: string;
  folderPath?: string;
  templateType?: "document" | "pdfme";
  modules: string[];
  entityTypes: string[];
  version: number;
  isActive: boolean;
  requiresSignature: boolean;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Tree data model
// ---------------------------------------------------------------------------

interface TreeNodeData {
  name: string;
  children?: string[];
  isFolder: boolean;
  /** Full folder path for folders, e.g. "Gabinet/Zgody". undefined for root. */
  folderFullPath?: string;
  /** Template-specific data */
  templateId?: Id<"formTemplates">;
  template?: FormTemplateRecord;
}

const TREE_INDENT = 20;

function buildFolderTreeData(
  templates: FormTemplateRecord[],
  search: string,
): {
  items: Record<string, TreeNodeData>;
  expandedIds: string[];
} {
  const searchLower = search.toLowerCase().trim();
  const filtered = searchLower
    ? templates.filter(
        (t) =>
          t.name.toLowerCase().includes(searchLower) ||
          (t.description ?? "").toLowerCase().includes(searchLower),
      )
    : templates;

  const items: Record<string, TreeNodeData> = {};
  const folderChildren = new Map<string, Set<string>>();
  const rootChildren = new Set<string>();

  for (const tpl of filtered) {
    const tplId = `tpl:${tpl._id}`;
    items[tplId] = {
      name: tpl.name,
      isFolder: false,
      templateId: tpl._id,
      template: tpl,
    };

    if (!tpl.folderPath) {
      rootChildren.add(tplId);
      continue;
    }

    const segments = tpl.folderPath.split("/");

    for (let i = 1; i <= segments.length; i++) {
      const path = segments.slice(0, i).join("/");
      const folderId = `folder:${path}`;

      if (!items[folderId]) {
        items[folderId] = {
          name: segments[i - 1],
          children: [],
          isFolder: true,
          folderFullPath: path,
        };
        if (!folderChildren.has(path)) {
          folderChildren.set(path, new Set());
        }
      }

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

    const leafPath = tpl.folderPath;
    if (!folderChildren.has(leafPath)) {
      folderChildren.set(leafPath, new Set());
    }
    folderChildren.get(leafPath)!.add(tplId);
  }

  // Wire children on folder items
  for (const [path, childIds] of folderChildren) {
    const folderId = `folder:${path}`;
    if (items[folderId]) {
      items[folderId].children = Array.from(childIds).sort((a, b) => {
        const aFolder = a.startsWith("folder:");
        const bFolder = b.startsWith("folder:");
        if (aFolder && !bFolder) return -1;
        if (!aFolder && bFolder) return 1;
        return (items[a]?.name ?? "").localeCompare(items[b]?.name ?? "");
      });
    }
  }

  const sortedRoot = Array.from(rootChildren).sort((a, b) => {
    const aFolder = a.startsWith("folder:");
    const bFolder = b.startsWith("folder:");
    if (aFolder && !bFolder) return -1;
    if (!aFolder && bFolder) return 1;
    return (items[a]?.name ?? "").localeCompare(items[b]?.name ?? "");
  });

  items["__root__"] = {
    name: "Root",
    children: sortedRoot,
    isFolder: true,
    folderFullPath: undefined,
  };

  const expandedIds = Object.keys(items).filter((id) =>
    id.startsWith("folder:"),
  );

  return { items, expandedIds };
}

/** Count templates (recursively) inside a folder path. */
function countTemplatesInFolder(
  templates: FormTemplateRecord[],
  folderPath: string | undefined,
): number {
  if (folderPath === undefined) {
    return templates.filter((t) => !t.folderPath).length;
  }
  return templates.filter(
    (t) => t.folderPath === folderPath || t.folderPath?.startsWith(folderPath + "/"),
  ).length;
}

// ---------------------------------------------------------------------------
// Tree sub-component
// ---------------------------------------------------------------------------

function TemplateTree({
  templates,
  search,
  onEditTemplate,
  onDeleteTemplate,
  onDuplicateTemplate,
  onToggleActive,
  onMoveTemplate,
  onRenameFolder,
  onDeleteFolder,
  t,
}: {
  templates: FormTemplateRecord[];
  search: string;
  onEditTemplate: (id: Id<"formTemplates">) => void;
  onDeleteTemplate: (tpl: FormTemplateRecord) => void;
  onDuplicateTemplate: (tpl: FormTemplateRecord) => void;
  onToggleActive: (tpl: FormTemplateRecord, active: boolean) => void;
  onMoveTemplate: (
    templateId: Id<"formTemplates">,
    newFolderPath: string | undefined,
  ) => void;
  onRenameFolder: (oldPath: string, newName: string) => void;
  onDeleteFolder: (folderPath: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}) {
  const treeData = useMemo(
    () => buildFolderTreeData(templates, search),
    [templates, search],
  );

  const tree = useTree<TreeNodeData>({
    initialState: {
      expandedItems: treeData.expandedIds,
    },
    indent: TREE_INDENT,
    rootItemId: "__root__",
    getItemName: (item) => item.getItemData().name,
    isItemFolder: (item) => item.getItemData()?.isFolder ?? false,
    canReorder: false,
    canDrag: (items) => items.every((i) => !i.getItemData().isFolder),
    canDrop: (_items, target) => target.item.getItemData()?.isFolder ?? false,
    onDrop: (items, target) => {
      const targetData = target.item.getItemData();
      const newFolderPath = targetData.folderFullPath;
      for (const item of items) {
        const data = item.getItemData();
        if (data.templateId) {
          onMoveTemplate(data.templateId, newFolderPath);
        }
      }
    },
    dataLoader: {
      getItem: (itemId) => treeData.items[itemId],
      getChildren: (itemId) => treeData.items[itemId]?.children ?? [],
    },
    features: [
      syncDataLoaderFeature,
      selectionFeature,
      hotkeysCoreFeature,
      dragAndDropFeature,
    ],
  });

  // Rebuild when underlying data changes
  const treeDataKey = useMemo(
    () => Object.keys(treeData.items).sort().join(","),
    [treeData.items],
  );
  useEffect(() => {
    tree.rebuildTree();
  }, [treeDataKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative">
      <Tree indent={TREE_INDENT} tree={tree} toggleIconType="chevron">
        {tree.getItems().map((item) => {
          const data = item.getItemData();
          if (!data) return null;

          // --- Folder node ---
          if (item.isFolder()) {
            const count = countTemplatesInFolder(
              templates,
              data.folderFullPath,
            );
            return (
              <TreeItem key={item.getId()} item={item}>
                <div className="flex items-center w-full group/folder">
                  <TreeItemLabel className="flex-1 before:bg-background relative before:absolute before:inset-x-0 before:-inset-y-0.5 before:-z-10 font-medium">
                    <span className="flex items-center gap-2">
                      {item.isExpanded() ? (
                        <FolderOpen className="text-amber-500 pointer-events-none size-4" />
                      ) : (
                        <Folder className="text-amber-500 pointer-events-none size-4" />
                      )}
                      <span>{item.getItemName()}</span>
                      <span className="text-xs text-muted-foreground font-normal">
                        ({count})
                      </span>
                    </span>
                  </TreeItemLabel>
                  {data.folderFullPath && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0 sm:opacity-0 sm:group-hover/folder:opacity-100 sm:transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Menu className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            const currentName =
                              data.folderFullPath!.split("/").pop() ?? "";
                            const newName = window.prompt(
                              t(
                                "settings.formTemplates.renameFolderPrompt",
                                "Nowa nazwa folderu:",
                              ),
                              currentName,
                            );
                            if (newName && newName !== currentName) {
                              onRenameFolder(data.folderFullPath!, newName);
                            }
                          }}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          {t("settings.formTemplates.renameFolder", "Zmień nazwę")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteFolder(data.folderFullPath!);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t("settings.formTemplates.deleteFolder", "Usuń folder")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </TreeItem>
            );
          }

          // --- Template node ---
          const tpl = data.template;
          if (!tpl) return null;

          return (
            <TreeItem key={item.getId()} item={item} className="!ps-0">
              <div
                style={{
                  paddingLeft: `${item.getItemMeta().level * TREE_INDENT}px`,
                }}
                className="flex flex-wrap items-center gap-x-2 gap-y-1.5 w-full rounded-md border bg-card px-3 py-2 group/tpl hover:bg-accent/50 transition-colors cursor-grab active:cursor-grabbing"
              >
                <div className="flex items-center gap-2 min-w-0 basis-full sm:basis-0 sm:flex-1">
                  <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <button
                    type="button"
                    className="flex-1 min-w-0 text-left"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditTemplate(tpl._id);
                    }}
                  >
                    <span className="text-sm font-medium truncate block">
                      {tpl.name}
                    </span>
                  </button>
                </div>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {t(`settings.formTemplates.categories.${tpl.category}`)}
                </Badge>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  v{tpl.version}
                </span>
                <Switch
                  checked={tpl.isActive}
                  onCheckedChange={(checked) => onToggleActive(tpl, checked)}
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0"
                  aria-label={t("settings.formTemplates.toggleActive")}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 sm:opacity-0 sm:group-hover/tpl:opacity-100 sm:transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Menu className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditTemplate(tpl._id);
                      }}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      {t("common.edit")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onDuplicateTemplate(tpl);
                      }}
                    >
                      <CopyIcon className="mr-2 h-4 w-4" />
                      {t("settings.formTemplates.duplicate")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteTemplate(tpl);
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t("common.delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </TreeItem>
          );
        })}
        <TreeDragLine />
      </Tree>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function FormTemplatesListPage() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [deletingTemplate, setDeletingTemplate] =
    useState<FormTemplateRecord | null>(null);
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderParent, setNewFolderParent] = useState("");

  const queryClient = useQueryClient();
  const templatesQueryKey = useMemo(
    () => ["documents.templates.list", organizationId] as const,
    [organizationId],
  );

  const listTemplatesAction = useAction(api.documents.templates.list);
  const { data: templates, isPending } = useQuery({
    queryKey: templatesQueryKey,
    queryFn: () => listTemplatesAction({ organizationId }),
    enabled: !!organizationId,
  });

  const invalidateTemplates = useCallback(
    () => queryClient.invalidateQueries({ queryKey: templatesQueryKey }),
    [queryClient, templatesQueryKey],
  );

  const updateTemplate = useAction(api.documents.templates.update);
  const createTemplate = useAction(api.documents.templates.create);
  const duplicateTemplate = useAction(api.documents.templates.duplicate);
  const removeTemplate = useAction(api.documents.templates.remove);
  const seedTemplates = useMutation(api.documents.seed.seedFormTemplates);
  const migrateFolders = useMutation(api.documents.seed.migrateFolderPaths);

  const allTemplates = useMemo<FormTemplateRecord[]>(
    () => templates ?? [],
    [templates],
  );

  const handleToggleActive = useCallback(
    async (template: FormTemplateRecord, active: boolean) => {
      try {
        await updateTemplate({
          organizationId,
          templateId: template._id,
          isActive: active,
        });
        await invalidateTemplates();
        toast.success(
          active
            ? t("settings.formTemplates.activated")
            : t("settings.formTemplates.deactivated"),
        );
      } catch {
        toast.error(t("settings.formTemplates.toggleError"));
      }
    },
    [organizationId, updateTemplate, invalidateTemplates, t],
  );

  const handleDuplicate = useCallback(
    async (template: FormTemplateRecord) => {
      try {
        await duplicateTemplate({
          organizationId,
          templateId: template._id,
        });
        await invalidateTemplates();
        toast.success(t("settings.formTemplates.duplicated"));
      } catch {
        toast.error(t("settings.formTemplates.duplicateError"));
      }
    },
    [organizationId, duplicateTemplate, invalidateTemplates, t],
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deletingTemplate) return;
    try {
      await removeTemplate({
        organizationId,
        templateId: deletingTemplate._id,
      });
      await invalidateTemplates();
      toast.success(t("settings.formTemplates.deleted"));
    } catch {
      toast.error(t("settings.formTemplates.deleteError"));
    } finally {
      setDeletingTemplate(null);
    }
  }, [deletingTemplate, organizationId, removeTemplate, invalidateTemplates, t]);

  const handleMoveTemplate = useCallback(
    async (
      templateId: Id<"formTemplates">,
      newFolderPath: string | undefined,
    ) => {
      try {
        await updateTemplate({
          organizationId,
          templateId,
          folderPath: newFolderPath ?? "",
        });
        await invalidateTemplates();
        toast.success(
          t("settings.formTemplates.moved", "Przeniesiono szablon"),
        );
      } catch {
        toast.error(
          t("settings.formTemplates.moveError", "Nie udało się przenieść"),
        );
      }
    },
    [organizationId, updateTemplate, invalidateTemplates, t],
  );

  const handleRenameFolder = useCallback(
    async (oldPath: string, newName: string) => {
      const segments = oldPath.split("/");
      segments[segments.length - 1] = newName;
      const newPath = segments.join("/");

      const affectedTemplates = allTemplates.filter(
        (t) =>
          t.folderPath === oldPath || t.folderPath?.startsWith(oldPath + "/"),
      );

      try {
        await Promise.all(
          affectedTemplates.map((tpl) =>
            updateTemplate({
              organizationId,
              templateId: tpl._id,
              folderPath: tpl.folderPath!.replace(oldPath, newPath),
            }),
          ),
        );
        await invalidateTemplates();
        toast.success(
          t("settings.formTemplates.folderRenamed", "Zmieniono nazwę folderu"),
        );
      } catch {
        toast.error(
          t(
            "settings.formTemplates.folderRenameError",
            "Nie udało się zmienić nazwy",
          ),
        );
      }
    },
    [allTemplates, organizationId, updateTemplate, invalidateTemplates, t],
  );

  const handleDeleteFolder = useCallback(
    async (folderPath: string) => {
      const affectedTemplates = allTemplates.filter(
        (t) =>
          t.folderPath === folderPath ||
          t.folderPath?.startsWith(folderPath + "/"),
      );

      if (affectedTemplates.length === 0) return;

      // Move templates to parent folder or root
      const parentPath =
        folderPath.includes("/")
          ? folderPath.split("/").slice(0, -1).join("/")
          : undefined;

      try {
        await Promise.all(
          affectedTemplates.map((tpl) =>
            updateTemplate({
              organizationId,
              templateId: tpl._id,
              folderPath: parentPath ?? "",
            }),
          ),
        );
        await invalidateTemplates();
        toast.success(
          t("settings.formTemplates.folderDeleted", "Usunięto folder"),
        );
      } catch {
        toast.error(
          t(
            "settings.formTemplates.folderDeleteError",
            "Nie udało się usunąć folderu",
          ),
        );
      }
    },
    [allTemplates, organizationId, updateTemplate, invalidateTemplates, t],
  );

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return;
    const folderPath = newFolderParent
      ? `${newFolderParent}/${newFolderName.trim()}`
      : newFolderName.trim();

    // Create a placeholder template to make the folder appear
    // Actually — just create with the folderPath so the folder shows up
    try {
      await createTemplate({
        organizationId,
        name: t("settings.formTemplates.newTemplateName"),
        category: "custom" as FormCategory,
        folderPath,
        formJson: "{}",
        modules: ["gabinet"],
        entityTypes: ["patient"],
        requiresSignature: false,
      });
      await invalidateTemplates();
      toast.success(
        t("settings.formTemplates.folderCreated", "Utworzono folder z nowym szablonem"),
      );
    } catch {
      toast.error(
        t("settings.formTemplates.folderCreateError", "Nie udało się utworzyć"),
      );
    } finally {
      setNewFolderDialogOpen(false);
      setNewFolderName("");
      setNewFolderParent("");
    }
  }, [
    newFolderName,
    newFolderParent,
    organizationId,
    createTemplate,
    invalidateTemplates,
    t,
  ]);

  const uniqueFolders = useMemo(
    () =>
      Array.from(
        new Set(
          allTemplates
            .map((t) => t.folderPath)
            .filter(Boolean) as string[],
        ),
      ).sort(),
    [allTemplates],
  );

  // Force TemplateTree to remount when the visible set changes.
  // headless-tree's sync dataLoader keeps internal item IDs; the
  // useEffect-based rebuildTree runs after render, so the first render
  // after filtering would crash inside the loader (see fix #1102).
  const templateTreeKey = useMemo(() => {
    const searchLower = search.toLowerCase().trim();
    const visible = searchLower
      ? allTemplates.filter(
          (tpl) =>
            tpl.name.toLowerCase().includes(searchLower) ||
            (tpl.description ?? "").toLowerCase().includes(searchLower),
        )
      : allTemplates;
    return visible.map((tpl) => tpl._id).join(",");
  }, [allTemplates, search]);

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <SectionHeader.Root className="pt-4">
        <SectionHeader.Group>
          <SectionHeader.Heading className="flex-1">
            {t("settings.formTemplates.title")}
          </SectionHeader.Heading>
          <SectionHeader.Actions>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  {t("settings.formTemplates.moreActions", "Więcej")}
                  <ChevronDown className="ml-2 h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => setNewFolderDialogOpen(true)}
                >
                  <FolderPlus className="mr-2 h-4 w-4" />
                  {t("settings.formTemplates.newFolder")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    try {
                      const result = await seedTemplates({ organizationId });
                      await invalidateTemplates();
                      toast.success(t("settings.formTemplates.seedSuccess", { count: result.count }));
                    } catch (e) {
                      toast.error(
                        e instanceof Error ? e.message : t("common.error"),
                      );
                    }
                  }}
                >
                  {t("settings.formTemplates.seedExamples")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    try {
                      const result = await migrateFolders({ organizationId });
                      await invalidateTemplates();
                      toast.success(
                        t("settings.formTemplates.migrateSuccess", { count: result.patched }),
                      );
                    } catch (e) {
                      toast.error(
                        e instanceof Error ? e.message : t("common.error"),
                      );
                    }
                  }}
                >
                  {t("settings.formTemplates.migrateFolders")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="outline" asChild>
              <Link to="/dashboard/document-editor/new">
                <Plus className="mr-2 h-4 w-4" variant="stroke" />
                {t("settings.formTemplates.newTemplate")}
              </Link>
            </Button>
          </SectionHeader.Actions>
        </SectionHeader.Group>
        <UntitledAlert>{t("settings.formTemplates.description")}</UntitledAlert>
      </SectionHeader.Root>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("settings.formTemplates.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <span className="text-sm text-muted-foreground">
          {allTemplates.length}{" "}
          {t("settings.formTemplates.templateCount", "szablonów")}
        </span>
      </div>

      {/* Tree or empty state */}
      {!isPending && allTemplates.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t("settings.formTemplates.emptyTitle")}
          description={t("settings.formTemplates.emptyDescription")}
          action={
            <Button asChild>
              <Link to="/dashboard/document-editor/new">
                <Plus className="mr-2 h-4 w-4" variant="stroke" />
                {t("settings.formTemplates.newTemplate")}
              </Link>
            </Button>
          }
        />
      ) : (
        !isPending && (
          <div className="rounded-lg border bg-card p-4">
            <TemplateTree
              key={templateTreeKey}
              templates={allTemplates}
              search={search}
              onEditTemplate={(id) => {
                navigate({ to: "/dashboard/document-editor/$id", params: { id } });
              }}
              onDeleteTemplate={setDeletingTemplate}
              onDuplicateTemplate={handleDuplicate}
              onToggleActive={handleToggleActive}
              onMoveTemplate={handleMoveTemplate}
              onRenameFolder={handleRenameFolder}
              onDeleteFolder={handleDeleteFolder}
              t={t}
            />
          </div>
        )
      )}

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deletingTemplate}
        onOpenChange={(open) => !open && setDeletingTemplate(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.formTemplates.deleteConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.formTemplates.deleteConfirmDescription", {
                name: deletingTemplate?.name,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* New folder dialog */}
      <Dialog
        open={newFolderDialogOpen}
        onOpenChange={setNewFolderDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("settings.formTemplates.newFolder")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "settings.formTemplates.newFolderDesc",
                "Podaj nazwę nowego folderu. Zostanie utworzony z przykładowym szablonem.",
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>
                {t("settings.formTemplates.parentFolder", "Folder nadrzędny")}
              </Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={newFolderParent}
                onChange={(e) => setNewFolderParent(e.target.value)}
              >
                <option value="">
                  {t("settings.formTemplates.rootLevel", "— Poziom główny —")}
                </option>
                {uniqueFolders.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>
                {t("settings.formTemplates.folderName", "Nazwa folderu")}
              </Label>
              <Input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder={t(
                  "settings.formTemplates.folderNamePlaceholder",
                  "np. Zgody, Recepty...",
                )}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateFolder();
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setNewFolderDialogOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
              {t("settings.formTemplates.createFolder", "Utwórz")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
