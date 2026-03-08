import { useState, useEffect, useRef, useCallback } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Eye, Trash2 } from "@/lib/ez-icons";
import {
  EmailBuilderLazy,
  type EmailBuilderHandle,
  type MergeTagGroup,
} from "@/components/email-builder";
import { toast } from "sonner";
import { useSidebarSlot } from "@/components/layout/sidebar-slot-context";
import type { Id } from "@cvx/_generated/dataModel";
import type { ProjectData } from "grapesjs";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/email-templates/$templateId",
)({
  component: EditEmailTemplatePage,
});

const MODULE_OPTIONS = [
  { value: "", label: "Wszystkie moduły" },
  { value: "crm", label: "CRM" },
  { value: "gabinet", label: "Gabinet" },
];

interface TemplateVariable {
  key: string;
  label: string;
  source: string;
}

function EditEmailTemplatePage() {
  const { templateId: templateIdParam } = Route.useParams();
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const templateId = templateIdParam as Id<"emailTemplates">;
  const editorRef = useRef<EmailBuilderHandle>(null);

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("");
  const [module, setModule] = useState("");
  const [variables, setVariables] = useState<TemplateVariable[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [initialProjectData, setInitialProjectData] =
    useState<ProjectData | null>(null);
  const [sidebarTarget, setSidebarTarget] = useState<HTMLElement | null>(null);

  // Inject portal target into app sidebar Column 2
  const { setContent: setSidebarContent } = useSidebarSlot();
  useEffect(() => {
    setSidebarContent(
      <div
        ref={setSidebarTarget}
        className="flex h-full flex-col overflow-y-auto"
      />,
    );
    return () => {
      setSidebarContent(null);
      setSidebarTarget(null);
    };
  }, [setSidebarContent]);

  const updateTemplate = useMutation(api.emailTemplates.update);
  const removeTemplate = useMutation(api.emailTemplates.remove);

  const { data: template } = useQuery(
    convexQuery(api.emailTemplates.getById, {
      organizationId,
      templateId,
    }),
  );

  const { data: variableSources } = useQuery(
    convexQuery(api.emailTemplates.listVariableSources, {
      module: module || undefined,
    }),
  );

  // Map variableSources to MergeTagGroup[]
  const mergeTags: MergeTagGroup[] = (variableSources ?? []).map((s) => ({
    key: s.key,
    label: s.label,
    fields: s.fields.map((f) => ({ key: f.key, label: f.label })),
  }));

  // Init form from DB
  useEffect(() => {
    if (template && !initialized) {
      setName(template.name);
      setSubject(template.subject);
      setCategory(template.category ?? "");
      setModule(template.module ?? "");
      setIsActive(template.isActive);
      setVariables(template.variables);

      // Parse body — try GrapesJS format { projectData, html },
      // then Unlayer format { design, html }, fallback to blank
      if (template.body) {
        try {
          const parsed = JSON.parse(template.body);
          if (parsed?.projectData) {
            setInitialProjectData(parsed.projectData);
          }
          // Legacy Unlayer format — design can't be loaded into GrapesJS,
          // but HTML is preserved in the body for sending
        } catch {
          // Legacy format — ignore, editor starts blank
        }
      }
      setInitialized(true);
    }
  }, [template, initialized]);

  const insertVariable = (
    field: "subject",
    sourceKey: string,
    fieldKey: string,
    fieldLabel: string,
    sourceLabel: string,
  ) => {
    const varTag = `{{${sourceKey}.${fieldKey}}}`;
    if (field === "subject") {
      setSubject((prev) => prev + varTag);
    }
    setVariables((prev) => {
      const key = `${sourceKey}.${fieldKey}`;
      if (prev.some((v) => v.key === key)) return prev;
      return [
        ...prev,
        { key, label: `${sourceLabel} > ${fieldLabel}`, source: sourceKey },
      ];
    });
  };

  const handleSave = useCallback(async () => {
    if (!name.trim() || !subject.trim()) {
      toast.error("Nazwa i temat są wymagane");
      return;
    }
    setSaving(true);
    try {
      const output = await editorRef.current?.getOutput();
      const body = JSON.stringify({
        projectData: output?.projectData ?? {},
        html: output?.html ?? "",
      });
      await updateTemplate({
        organizationId,
        templateId,
        name: name.trim(),
        subject: subject.trim(),
        body,
        category: category.trim() || undefined,
        module: module || undefined,
        variables,
        isActive,
      });
      toast.success("Szablon został zapisany");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Błąd podczas zapisywania";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [
    name,
    subject,
    category,
    module,
    variables,
    isActive,
    organizationId,
    templateId,
    updateTemplate,
  ]);

  const handleDelete = async () => {
    try {
      await removeTemplate({ organizationId, templateId });
      toast.success("Szablon został usunięty");
      navigate({ to: "/dashboard/email-templates" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Błąd podczas usuwania";
      toast.error(msg);
    }
  };

  const handlePreview = useCallback(async () => {
    if (showPreview) {
      setShowPreview(false);
      return;
    }
    const output = await editorRef.current?.getOutput();
    setPreviewHtml(output?.html ?? "");
    setShowPreview(true);
  }, [showPreview]);

  if (!template) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header bar */}
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <Link to="/dashboard/email-templates">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link
            to="/dashboard/email-templates"
            className="hover:text-foreground"
          >
            {t("emailTemplates.title")}
          </Link>
          <span>/</span>
          <span className="text-foreground">{template.name}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">
              {isActive ? t("common.active") : t("common.inactive")}
            </span>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon">
                <Trash2 className="h-4 w-4" variant="stroke" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("common.confirmDelete")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("common.actionCannotBeUndone")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>
                  {t("common.delete")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button variant="outline" size="sm" onClick={handlePreview}>
            <Eye className="mr-1.5 h-4 w-4" variant="stroke" />
            {t("emailTemplates.preview")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </div>

      {/* GrapesJS editor — fills remaining space */}
      <div className="min-h-0 flex-1">
        {initialized && variableSources !== undefined ? (
          <EmailBuilderLazy
            ref={editorRef}
            initialProjectData={initialProjectData}
            mergeTags={mergeTags}
            sidebarPortalTarget={sidebarTarget}
            sidebarHeader={
              <div className="space-y-2 border-b p-2">
                <div className="space-y-1">
                  <Label className="text-xs">{t("common.module")}</Label>
                  <Select
                    value={module}
                    onValueChange={(v) => setModule(v === "all" ? "" : v)}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Wszystkie moduły" />
                    </SelectTrigger>
                    <SelectContent>
                      {MODULE_OPTIONS.map((opt) => (
                        <SelectItem
                          key={opt.value || "all"}
                          value={opt.value || "all"}
                        >
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("common.name")} *</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("emailTemplates.namePlaceholder")}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">{t("inbox.subject")} *</Label>
                    <VariablePicker
                      sources={variableSources ?? []}
                      onInsert={(sk, fk, fl, sl) =>
                        insertVariable("subject", sk, fk, fl, sl)
                      }
                      label={t("emailTemplates.insertVariable")}
                    />
                  </div>
                  <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder={t("emailTemplates.subjectPlaceholder")}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("common.category")}</Label>
                  <Input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder={t("emailTemplates.categoryPlaceholder")}
                    className="h-7 text-xs"
                  />
                </div>
                {variables.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {variables.map((v) => (
                      <Badge
                        key={v.key}
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0"
                      >
                        {`{{${v.key}}}`}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            }
            fallback={
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  {t("common.loading")}
                </p>
              </div>
            }
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">
              {t("common.loading")}
            </p>
          </div>
        )}
      </div>

      {/* Preview dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("emailTemplates.preview")}</DialogTitle>
          </DialogHeader>
          {previewHtml ? (
            <div
              className="mx-auto"
              style={{ width: "600px" }}
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Dodaj bloki, aby zobaczyć podgląd
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Variable Picker
// ---------------------------------------------------------------------------

interface VariableSource {
  key: string;
  label: string;
  fields: { key: string; label: string }[];
}

function VariablePicker({
  sources,
  onInsert,
  label,
}: {
  sources: VariableSource[];
  onInsert: (
    sourceKey: string,
    fieldKey: string,
    fieldLabel: string,
    sourceLabel: string,
  ) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 text-xs">
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="end">
        <div className="max-h-60 overflow-y-auto">
          {sources.map((source) => (
            <div key={source.key} className="mb-2">
              <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                {source.label}
              </p>
              {source.fields.map((field) => (
                <button
                  key={`${source.key}.${field.key}`}
                  type="button"
                  className="w-full rounded-sm px-2 py-1 text-left text-sm hover:bg-accent"
                  onClick={() => {
                    onInsert(source.key, field.key, field.label, source.label);
                    setOpen(false);
                  }}
                >
                  {field.label}
                  <span className="ml-1 text-xs text-muted-foreground">
                    {`{{${source.key}.${field.key}}}`}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
