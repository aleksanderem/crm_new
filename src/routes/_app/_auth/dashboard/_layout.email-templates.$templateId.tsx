import { useState, useEffect, useRef, useCallback } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useSupabaseEmailTemplate } from "@/hooks/use-supabase-email-templates";
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
import { ArrowLeft, Trash2 } from "@/lib/ez-icons";
import { useSidebarSlot } from "@/components/layout/sidebar-slot-context";
import { EmailTemplateEditor } from "@/components/email/template-editor";
import type { EmailTemplateEditorHandle } from "@/components/email/template-editor";
import { toast } from "sonner";
import type { Id } from "@cvx/_generated/dataModel";

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
  const editorRef = useRef<EmailTemplateEditorHandle>(null);

  // Collapse sidebar to icon-only like other detail views
  const { setShellSidebarMode } = useSidebarSlot();
  useEffect(() => {
    setShellSidebarMode("icon-only");
    return () => setShellSidebarMode("default");
  }, [setShellSidebarMode]);

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("");
  const [module, setModule] = useState("");
  const [variables, setVariables] = useState<TemplateVariable[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const updateTemplate = useAction(api.emailTemplates.update);
  const removeTemplate = useAction(api.emailTemplates.remove);

  const { data: template } = useSupabaseEmailTemplate(
    organizationId,
    templateId,
  );

  const { data: variableSources } = useQuery(
    convexQuery(api.emailTemplates.listVariableSources, {
      module: module || undefined,
    }),
  );

  // Init form from DB
  useEffect(() => {
    if (template && !initialized) {
      setName(template.name);
      setSubject(template.subject);
      setCategory(template.category ?? "");
      setModule(template.module ?? "");
      setIsActive(template.isActive);
      setVariables(template.variables as TemplateVariable[]);

      // Extract HTML body — try JSON formats, fallback to raw HTML
      let htmlBody = template.body;
      if (template.body) {
        try {
          const parsed = JSON.parse(template.body);
          if (typeof parsed?.html === "string") {
            htmlBody = parsed.html;
          }
        } catch {
          // Raw HTML — use as-is
        }
      }
      setBody(htmlBody);
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
      const bodyPayload = editorRef.current?.getHTML() ?? body;
      await updateTemplate({
        organizationId,
        templateId,
        name: name.trim(),
        subject: subject.trim(),
        body: bodyPayload,
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
  }, [name, subject, category, module, variables, isActive, body, organizationId, templateId, updateTemplate]);

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
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </div>

      {/* Form + Editor */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-[900px] space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>{t("common.name")}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("emailTemplates.namePlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.category")}</Label>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder={t("emailTemplates.categoryPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.module")}</Label>
              <Select
                value={module}
                onValueChange={(v) => setModule(v === "all" ? "" : v)}
              >
                <SelectTrigger>
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
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>{t("inbox.subject")}</Label>
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
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("inbox.body")}</Label>
            {initialized && (
              <EmailTemplateEditor
                ref={editorRef}
                value={body}
                onChange={(html) => setBody(html)}
                organizationId={organizationId}
                requiredSources={module ? [module] : undefined}
              />
            )}
          </div>

          {variables.length > 0 && (
            <div className="space-y-1.5">
              <Label>{t("emailTemplates.usedVariables")}</Label>
              <div className="flex flex-wrap gap-1">
                {variables.map((v) => (
                  <Badge key={v.key} variant="secondary" className="text-xs">
                    {`{{${v.key}}}`}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
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
        <Button variant="ghost" size="sm" className="h-7 text-xs">
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
