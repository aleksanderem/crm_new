import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  Plus,
  FileText,
  MoreHorizontal,
  Pencil,
  Trash2,
  CopyIcon,
  Search,
} from "@/lib/ez-icons";
import { toast } from "sonner";
import type { Id } from "@cvx/_generated/dataModel";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/form-templates/",
)({
  component: FormTemplatesListPage,
});

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

const CATEGORY_OPTIONS: FormCategory[] = [
  "consent",
  "medical_record",
  "prescription",
  "referral",
  "contract",
  "invoice",
  "protocol",
  "intake",
  "custom",
];

interface FormTemplateRecord {
  _id: Id<"formTemplates">;
  name: string;
  description?: string;
  category: string;
  folderPath?: string;
  modules: string[];
  entityTypes: string[];
  version: number;
  isActive: boolean;
  requiresSignature: boolean;
  createdAt: number;
  updatedAt: number;
}

function FormTemplatesListPage() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [folderFilter, setFolderFilter] = useState<string>("all");
  const [deletingTemplate, setDeletingTemplate] =
    useState<FormTemplateRecord | null>(null);

  const { data: templates, isPending } = useQuery(
    convexQuery(api.documents.templates.list, { organizationId }),
  );

  const updateTemplate = useMutation(api.documents.templates.update);
  const createTemplate = useMutation(api.documents.templates.create);
  const removeTemplate = useMutation(api.documents.templates.remove);
  // @ts-expect-error — TS2589
  const seedTemplates = useMutation(api.documents.seed.seedFormTemplates);

  const uniqueFolders = Array.from(
    new Set(
      (templates ?? [])
        .map((tpl) => (tpl as FormTemplateRecord).folderPath)
        .filter(Boolean) as string[],
    ),
  ).sort();

  const filtered = (templates ?? []).filter((tpl) => {
    const t = tpl as FormTemplateRecord;
    if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
    if (folderFilter !== "all") {
      if (folderFilter === "__none__" && t.folderPath) return false;
      if (folderFilter !== "__none__" && t.folderPath !== folderFilter) return false;
    }
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });

  const handleToggleActive = async (
    template: FormTemplateRecord,
    active: boolean,
  ) => {
    try {
      await updateTemplate({
        organizationId,
        templateId: template._id,
        isActive: active,
      });
      toast.success(
        active
          ? t("settings.formTemplates.activated")
          : t("settings.formTemplates.deactivated"),
      );
    } catch {
      toast.error(t("settings.formTemplates.toggleError"));
    }
  };

  const handleDuplicate = async (template: FormTemplateRecord) => {
    try {
      await createTemplate({
        organizationId,
        name: `${template.name} (${t("common.copy")})`,
        description: template.description,
        category: template.category as FormCategory,
        folderPath: template.folderPath || undefined,
        formJson: "{}",
        modules: template.modules,
        entityTypes: template.entityTypes,
        requiresSignature: template.requiresSignature,
      });
      toast.success(t("settings.formTemplates.duplicated"));
    } catch {
      toast.error(t("settings.formTemplates.duplicateError"));
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingTemplate) return;
    try {
      await removeTemplate({
        organizationId,
        templateId: deletingTemplate._id,
      });
      toast.success(t("settings.formTemplates.deleted"));
    } catch {
      toast.error(t("settings.formTemplates.deleteError"));
    } finally {
      setDeletingTemplate(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("settings.formTemplates.title")}
        description={t("settings.formTemplates.description")}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  // @ts-expect-error — TS2589
                  const result = await seedTemplates({ organizationId });
                  toast.success(`Załadowano ${result.count} szablonów`);
                } catch (e: any) {
                  toast.error(e.message);
                }
              }}
            >
              {t("settings.formTemplates.seedExamples", "Załaduj przykłady")}
            </Button>
            <Button asChild size="sm">
              <Link to="/dashboard/form-editor/new">
                <Plus className="mr-2 h-4 w-4" variant="stroke" />
                {t("settings.formTemplates.newTemplate")}
              </Link>
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("settings.formTemplates.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue
              placeholder={t("settings.formTemplates.allCategories")}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {t("settings.formTemplates.allCategories")}
            </SelectItem>
            {CATEGORY_OPTIONS.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {t(`settings.formTemplates.categories.${cat}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={folderFilter} onValueChange={setFolderFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue
              placeholder={t("settings.formTemplates.allFolders")}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {t("settings.formTemplates.allFolders")}
            </SelectItem>
            <SelectItem value="__none__">
              {t("settings.formTemplates.noFolder")}
            </SelectItem>
            {uniqueFolders.map((folder) => (
              <SelectItem key={folder} value={folder}>
                {folder}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table or empty state */}
      {!isPending && filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t("settings.formTemplates.emptyTitle")}
          description={t("settings.formTemplates.emptyDescription")}
          action={
            <Button asChild>
              <Link to="/dashboard/form-editor/new">
                <Plus className="mr-2 h-4 w-4" variant="stroke" />
                {t("settings.formTemplates.newTemplate")}
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("settings.formTemplates.colName")}</TableHead>
                <TableHead>{t("settings.formTemplates.colCategory")}</TableHead>
                <TableHead>{t("settings.formTemplates.colFolder")}</TableHead>
                <TableHead>{t("settings.formTemplates.colModules")}</TableHead>
                <TableHead>
                  {t("settings.formTemplates.colEntityTypes")}
                </TableHead>
                <TableHead className="text-center">
                  {t("settings.formTemplates.colVersion")}
                </TableHead>
                <TableHead className="text-center">
                  {t("settings.formTemplates.colStatus")}
                </TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((tpl) => {
                const template = tpl as FormTemplateRecord;
                return (
                  <TableRow
                    key={template._id}
                    className="cursor-pointer"
                    onClick={() =>
                      navigate({
                        to: "/dashboard/form-editor/$id",
                        params: { id: template._id },
                      })
                    }
                  >
                    <TableCell className="font-medium">
                      {template.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {t(
                          `settings.formTemplates.categories.${template.category}`,
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {template.folderPath ? (
                        <Badge variant="outline" className="text-xs font-normal">
                          {template.folderPath}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {template.modules.map((mod) => (
                          <Badge key={mod} variant="secondary" className="text-xs">
                            {t(`settings.formTemplates.modules.${mod}`)}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {template.entityTypes.map((et) => (
                          <Badge key={et} variant="secondary" className="text-xs">
                            {t(`settings.formTemplates.entityTypes.${et}`)}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">
                      v{template.version}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={template.isActive}
                        onCheckedChange={(checked) => {
                          handleToggleActive(template, checked);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={t("settings.formTemplates.toggleActive")}
                      />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate({
                                to: "/dashboard/form-editor/$id",
                                params: { id: template._id },
                              });
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            {t("common.edit")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDuplicate(template);
                            }}
                          >
                            <CopyIcon className="mr-2 h-4 w-4" />
                            {t("settings.formTemplates.duplicate")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingTemplate(template);
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t("common.delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
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
    </div>
  );
}
