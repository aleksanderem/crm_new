import { useState, useEffect, useRef, useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery as useConvexQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Settings, PanelLeft, CopyIcon, Eye } from "@/lib/ez-icons";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { VariablePicker } from "@/components/documents/variable-picker";
import {
  TemplateSettingsSheet,
  type TemplateSettings,
  type FormCategory,
  type Module,
  type EntityType,
  type SignatureMethod,
  type SignerRole,
} from "@/components/documents/template-settings-sheet";
import {
  DocumentTemplateEditor,
  type DocumentTemplateEditorHandle,
} from "@/components/documents/document-template-editor";
import { TemplatePreviewSheet } from "@/components/documents/template-preview-sheet";
import type { VariableField } from "@/lib/document-variables";
import type { Id } from "@cvx/_generated/dataModel";
import { Menu } from "lucide-react";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/document-editor/$id",
)({
  component: EditDocumentEditorPage,
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function EditDocumentEditorPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { organizationId } = useOrganization();
  const editorRef = useRef<DocumentTemplateEditorHandle>(null);

  const templateId = id as Id<"formTemplates">;

  const template = useConvexQuery(api.documents.templates.getById, {
    organizationId,
    templateId,
  });

  const updateTemplate = useMutation(api.documents.templates.update);
  const duplicateTemplate = useMutation(api.documents.templates.duplicate);

  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(true);
  const [navOpen, setNavOpen] = useState(false);
  const [contentJson, setContentJson] = useState("");
  const [previewContentJson, setPreviewContentJson] = useState("");

  const [settings, setSettings] = useState<TemplateSettings>({
    name: "",
    description: "",
    category: "custom" as FormCategory,
    folderPath: "",
    modules: [] as Module[],
    entityTypes: [] as EntityType[],
    requiresSignature: false,
    signatureMethod: "click" as SignatureMethod,
    signerRole: "client" as SignerRole,
  });

  // Initialize from loaded template
  useEffect(() => {
    if (template && !initialized) {
      setSettings({
        name: template.name,
        description: template.description ?? "",
        category: template.category as FormCategory,
        folderPath: template.folderPath ?? "",
        modules: (template.modules ?? []) as Module[],
        entityTypes: (template.entityTypes ?? []) as EntityType[],
        requiresSignature: template.requiresSignature,
        signatureMethod: (template.signatureConfig?.method ??
          "click") as SignatureMethod,
        signerRole: (template.signatureConfig?.signerRole ??
          "client") as SignerRole,
      });
      setContentJson(template.contentJson ?? "");
      setInitialized(true);
    }
  }, [template, initialized]);

  const handleSave = async () => {
    if (!settings.name.trim()) {
      toast.error(t("settings.formTemplates.nameRequired"));
      setSettingsOpen(true);
      return;
    }

    const latestJson = editorRef.current
      ? JSON.stringify(editorRef.current.getJSON())
      : contentJson;

    setSaving(true);
    try {
      await updateTemplate({
        organizationId,
        templateId,
        name: settings.name.trim(),
        description: settings.description.trim() || undefined,
        category: settings.category,
        folderPath: settings.folderPath || undefined,
        contentJson: latestJson,
        modules: settings.modules,
        entityTypes: settings.entityTypes,
        requiresSignature: settings.requiresSignature,
        ...(settings.requiresSignature
          ? {
              signatureConfig: {
                method: settings.signatureMethod,
                signerRole: settings.signerRole,
              },
            }
          : {}),
      });

      toast.success(t("settings.formTemplates.saved"));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = useCallback(async () => {
    // Save current content first, then duplicate server-side
    const latestJson = editorRef.current
      ? JSON.stringify(editorRef.current.getJSON())
      : contentJson;

    try {
      // Save current state before duplicating
      await updateTemplate({
        organizationId,
        templateId,
        contentJson: latestJson,
      });
      const newId = await duplicateTemplate({
        organizationId,
        templateId,
      });
      toast.success(t("settings.formTemplates.duplicated", "Zduplikowano szablon"));
      navigate({
        to: "/dashboard/document-editor/$id",
        params: { id: newId },
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(message);
    }
  }, [contentJson, organizationId, templateId, updateTemplate, duplicateTemplate, navigate, t]);

  const handleAddVariable = useCallback((variable: VariableField) => {
    editorRef.current?.insertVariable(variable.path);
  }, []);

  const handleBack = () => {
    navigate({ to: "/dashboard/settings/form-templates" });
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
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          onClick={() => setNavOpen(true)}
          title={t("formEditor.navigation", "Nawigacja")}
        >
          <Menu className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={handleBack}
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">
            {t("formEditor.back", "Wstecz")}
          </span>
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          onClick={() => setPickerOpen((v) => !v)}
          title={t("formEditor.toggleVariables", "Pokaż/ukryj zmienne")}
        >
          <PanelLeft className="h-4 w-4" />
        </Button>

        <div className="mx-2 h-5 w-px bg-border" />

        <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
          <Input
            value={settings.name}
            onChange={(e) =>
              setSettings((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder={t(
              "formEditor.namePlaceholder",
              "Nazwa szablonu...",
            )}
            className="h-8 max-w-md border-transparent bg-transparent text-center text-sm font-medium hover:border-input focus:border-input"
          />
          <Badge variant="outline" className="shrink-0 text-[10px]">
            v{template.version}
          </Badge>
          <Badge
            variant={template.isActive ? "default" : "secondary"}
            className="shrink-0 text-[10px]"
          >
            {template.isActive
              ? t("settings.formTemplates.statusActive")
              : t("settings.formTemplates.statusInactive")}
          </Badge>
        </div>

        <div className="mx-2 h-5 w-px bg-border" />

        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={handleDuplicate}
          title={t("settings.formTemplates.duplicate", "Duplikuj")}
        >
          <CopyIcon className="h-4 w-4" />
          <span className="hidden sm:inline">
            {t("settings.formTemplates.duplicate", "Duplikuj")}
          </span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => {
            const latestJson = editorRef.current
              ? JSON.stringify(editorRef.current.getJSON())
              : contentJson;
            setPreviewContentJson(latestJson);
            setPreviewOpen(true);
          }}
          title={t("formEditor.preview", "Podgląd")}
        >
          <Eye className="h-4 w-4" />
          <span className="hidden sm:inline">
            {t("formEditor.preview", "Podgląd")}
          </span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings className="h-4 w-4" />
          <span className="hidden sm:inline">
            {t("formEditor.settingsBtn", "Ustawienia")}
          </span>
        </Button>

        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving || !settings.name.trim()}
          className="min-w-[5rem]"
        >
          {saving ? t("common.saving") : t("common.save")}
        </Button>
      </header>

      {/* Main area */}
      <div className="flex min-h-0 flex-1">
        <div
          className={cn(
            "shrink-0 border-r bg-background transition-all duration-200",
            pickerOpen ? "w-60" : "w-0 overflow-hidden border-r-0",
          )}
        >
          {pickerOpen && (
            <VariablePicker
              entityTypes={settings.entityTypes}
              onAddVariable={handleAddVariable}
              usedPaths={new Set()}
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          {initialized && (
            <DocumentTemplateEditor
              ref={editorRef}
              value={contentJson}
              onChange={setContentJson}
              entityTypes={settings.entityTypes}
            />
          )}
        </div>
      </div>

      <TemplateSettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onSettingsChange={setSettings}
      />

      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle className="text-sm font-medium">
              {t("formEditor.navigation", "Nawigacja")}
            </SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-1 p-2">
            {[
              { href: "/dashboard", label: "Dashboard" },
              {
                href: "/dashboard/contacts",
                label: t("nav.contacts", "Kontakty"),
              },
              {
                href: "/dashboard/leads",
                label: t("nav.leads", "Leady"),
              },
              {
                href: "/dashboard/companies",
                label: t("nav.companies", "Firmy"),
              },
              {
                href: "/dashboard/documents",
                label: t("nav.documents", "Dokumenty"),
              },
              {
                href: "/dashboard/settings/form-templates",
                label: t(
                  "settings.formTemplates.title",
                  "Szablony formularzy",
                ),
              },
            ].map((item) => (
              <Button
                key={item.href}
                variant="ghost"
                size="sm"
                className="w-full justify-start text-sm"
                onClick={() => {
                  setNavOpen(false);
                  navigate({ to: item.href });
                }}
              >
                {item.label}
              </Button>
            ))}
          </nav>
        </SheetContent>
      </Sheet>

      <TemplatePreviewSheet
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        organizationId={organizationId}
        contentJson={previewContentJson}
        entityTypes={settings.entityTypes}
      />
    </div>
  );
}
