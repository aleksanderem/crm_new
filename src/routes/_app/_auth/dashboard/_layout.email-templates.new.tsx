import { useState, useRef, useCallback, useEffect } from "react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Eye } from "@/lib/ez-icons";
import {
  EmailBuilderLazy,
  type EmailBuilderHandle,
  type MergeTagGroup,
} from "@/components/email-builder";
import { toast } from "sonner";
import { useSidebarSlot } from "@/components/layout/sidebar-slot-context";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/email-templates/new",
)({
  component: NewEmailTemplatePage,
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

function NewEmailTemplatePage() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const editorRef = useRef<EmailBuilderHandle>(null);

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("");
  const [module, setModule] = useState("");
  const [variables, setVariables] = useState<TemplateVariable[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [saving, setSaving] = useState(false);
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
  const createTemplate = useMutation(api.emailTemplates.create);

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
      const templateId = await createTemplate({
        organizationId,
        name: name.trim(),
        subject: subject.trim(),
        body,
        category: category.trim() || undefined,
        module: module || undefined,
        variables,
      });
      toast.success("Szablon został utworzony");
      navigate({
        to: "/dashboard/email-templates/$templateId",
        params: { templateId: templateId as string },
      });
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
    organizationId,
    createTemplate,
    navigate,
  ]);

  const handlePreview = useCallback(async () => {
    if (showPreview) {
      setShowPreview(false);
      return;
    }
    const output = await editorRef.current?.getOutput();
    setPreviewHtml(output?.html ?? "");
    setShowPreview(true);
  }, [showPreview]);

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
          <span className="text-foreground">
            {t("emailTemplates.createTemplate")}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePreview}>
            <Eye className="mr-1.5 h-4 w-4" variant="stroke" />
            {t("emailTemplates.preview")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t("common.saving") : t("common.create")}
          </Button>
        </div>
      </div>

      {/* GrapesJS editor — fills remaining space */}
      <div className="min-h-0 flex-1">
        {variableSources === undefined ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">
              {t("common.loading")}
            </p>
          </div>
        ) : (
          <EmailBuilderLazy
            ref={editorRef}
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
                    autoFocus
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
