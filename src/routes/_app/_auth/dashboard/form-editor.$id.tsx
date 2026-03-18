import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery as useConvexQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Settings, PanelLeft } from "@/lib/ez-icons";
import { Menu } from "lucide-react";
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
import type { PdfmeDesignerHandle } from "@/components/documents/survey-creator-editor";
import type { VariableField } from "@/lib/pdfme/variables";
import type { Id } from "@cvx/_generated/dataModel";

const PdfmeDesignerLazy = lazy(() =>
  import("@/components/documents/survey-creator-editor").then((m) => ({
    default: m.PdfmeDesigner,
  })),
);

export const Route = createFileRoute("/_app/_auth/dashboard/form-editor/$id")({
  component: EditFormEditorPage,
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function EditFormEditorPage() {
  const { t } = useTranslation();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { organizationId } = useOrganization();
  const designerRef = useRef<PdfmeDesignerHandle>(null);

  const templateId = id as Id<"formTemplates">;

  const template = useConvexQuery(api.documents.templates.getById, {
    organizationId,
    templateId,
  });

  const updateTemplate = useMutation(api.documents.templates.update);

  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(true);
  const [navOpen, setNavOpen] = useState(false);
  const [formJson, setFormJson] = useState("{}");
  const [usedPaths, setUsedPaths] = useState<Set<string>>(new Set());

  // Template metadata
  const [settings, setSettings] = useState<TemplateSettings>({
    name: "",
    description: "",
    category: "custom" as FormCategory,
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
        modules: (template.modules ?? []) as Module[],
        entityTypes: (template.entityTypes ?? []) as EntityType[],
        requiresSignature: template.requiresSignature,
        signatureMethod: (template.signatureConfig?.method ?? "click") as SignatureMethod,
        signerRole: (template.signatureConfig?.signerRole ?? "client") as SignerRole,
      });
      setFormJson(template.formJson ?? "{}");

      // Extract used paths from existing template
      try {
        const tpl = JSON.parse(template.formJson ?? "{}");
        const paths = new Set<string>();
        for (const page of tpl.schemas ?? []) {
          for (const schema of page) {
            if (typeof schema === "object" && schema !== null && "name" in schema) {
              paths.add(schema.name as string);
            }
          }
        }
        setUsedPaths(paths);
      } catch {
        // ignore
      }

      setInitialized(true);
    }
  }, [template, initialized]);

  const handleSave = async () => {
    if (!settings.name.trim()) {
      toast.error(t("settings.formTemplates.nameRequired"));
      setSettingsOpen(true);
      return;
    }

    const latestJson = designerRef.current?.getTemplate() ?? formJson;

    setSaving(true);
    try {
      await updateTemplate({
        organizationId,
        templateId,
        name: settings.name.trim(),
        description: settings.description.trim() || undefined,
        category: settings.category,
        formJson: latestJson,
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

  const handleDesignerChange = useCallback((json: string) => {
    setFormJson(json);
    try {
      const tpl = JSON.parse(json);
      const paths = new Set<string>();
      for (const page of tpl.schemas ?? []) {
        for (const schema of page) {
          if (typeof schema === "object" && schema !== null && "name" in schema) {
            paths.add(schema.name as string);
          }
        }
      }
      setUsedPaths(paths);
    } catch {
      // ignore
    }
  }, []);

  const handleAddVariable = useCallback(
    (variable: VariableField) => {
      designerRef.current?.addField(variable);
      setUsedPaths((prev) => new Set([...prev, variable.path]));
    },
    [],
  );

  const handleBack = () => {
    navigate({ to: "/dashboard/settings/form-templates" });
  };

  // Loading state
  if (!template) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">
          {t("common.loading")}
        </p>
      </div>
    );
  }

  return (
    <>
      {/* ─── Top bar (48px) ─── */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-3">
        {/* Left: Nav toggle + Back */}
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

        {/* Toggle variable panel */}
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

        {/* Center: Template name input */}
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
          <Input
            value={settings.name}
            onChange={(e) =>
              setSettings((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder={t("formEditor.namePlaceholder", "Nazwa szablonu...")}
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

        {/* Right: Settings + Save */}
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

      {/* ─── Main area: Variable picker + Designer ─── */}
      <div className="flex min-h-0 flex-1">
        {/* Variable picker sidebar */}
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
              usedPaths={usedPaths}
            />
          )}
        </div>

        {/* PDFme Designer — fills all remaining space */}
        <div className="min-w-0 flex-1">
          {initialized && (
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  {t("common.loading")}
                </div>
              }
            >
              <PdfmeDesignerLazy
                ref={designerRef}
                initialTemplate={template.formJson}
                onChange={handleDesignerChange}
              />
            </Suspense>
          )}
        </div>
      </div>

      {/* Settings sheet */}
      <TemplateSettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onSettingsChange={setSettings}
      />

      {/* Navigation overlay sidebar */}
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
              { href: "/dashboard/contacts", label: t("nav.contacts", "Kontakty") },
              { href: "/dashboard/leads", label: t("nav.leads", "Leady") },
              { href: "/dashboard/companies", label: t("nav.companies", "Firmy") },
              { href: "/dashboard/documents", label: t("nav.documents", "Dokumenty") },
              { href: "/dashboard/gabinet/appointments", label: t("nav.gabinet.appointments", "Wizyty") },
              { href: "/dashboard/gabinet/patients", label: t("nav.gabinet.patients", "Pacjenci") },
              { href: "/dashboard/gabinet/documents", label: t("nav.gabinet.documents", "Dokumenty Gabinet") },
              { href: "/dashboard/settings/form-templates", label: t("settings.formTemplates.title", "Szablony formularzy") },
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
    </>
  );
}
