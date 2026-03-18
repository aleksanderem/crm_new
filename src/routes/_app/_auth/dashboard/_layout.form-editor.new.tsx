import { useState, useRef, useCallback, lazy, Suspense } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Settings, PanelLeft } from "@/lib/ez-icons";
import { Menu, FileUp } from "lucide-react";
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

const PdfmeDesignerLazy = lazy(() =>
  import("@/components/documents/survey-creator-editor").then((m) => ({
    default: m.PdfmeDesigner,
  })),
);

export const Route = createFileRoute("/_app/_auth/dashboard/_layout/form-editor/new")({
  component: NewFormEditorPage,
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function NewFormEditorPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { organizationId } = useOrganization();
  const designerRef = useRef<PdfmeDesignerHandle>(null);

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(true);
  const [navOpen, setNavOpen] = useState(false);
  const [formJson, setFormJson] = useState("{}");
  const [usedPaths, setUsedPaths] = useState<Set<string>>(new Set());

  // Template metadata (managed via settings sheet)
  const [settings, setSettings] = useState<TemplateSettings>({
    name: "",
    description: "",
    category: "custom" as FormCategory,
    modules: ["platform"] as Module[],
    entityTypes: [] as EntityType[],
    requiresSignature: false,
    signatureMethod: "click" as SignatureMethod,
    signerRole: "client" as SignerRole,
  });

  // @ts-expect-error — TS2589 deep type instantiation in generated Convex API; resolves at runtime
  const createTemplate = useMutation(api.documents.templates.create);

  const handleSave = async () => {
    if (!settings.name.trim()) {
      toast.error(t("settings.formTemplates.nameRequired"));
      setSettingsOpen(true);
      return;
    }

    // Get latest template from designer
    const latestJson = designerRef.current?.getTemplate() ?? formJson;

    setSaving(true);
    try {
      const templateId = await createTemplate({
        organizationId,
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

      toast.success(t("settings.formTemplates.created"));
      navigate({
        to: "/dashboard/form-editor/$id",
        params: { id: templateId },
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDesignerChange = useCallback((json: string) => {
    setFormJson(json);
    // Sync used paths from the JSON
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
      // Optimistically add to used paths
      setUsedPaths((prev) => new Set([...prev, variable.path]));
    },
    [],
  );

  const handleBack = () => {
    navigate({ to: "/dashboard/settings/form-templates" });
  };

  const handlePdfUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (result instanceof ArrayBuffer) {
          // Convert to base64 data URI for PDFme
          const bytes = new Uint8Array(result);
          let binary = "";
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);
          const dataUri = `data:application/pdf;base64,${base64}`;
          designerRef.current?.updateBasePdf(dataUri);
          toast.success(t("formEditor.pdfUploaded", "Wgrano PDF jako tlo szablonu"));
        }
      };
      reader.readAsArrayBuffer(file);
      // Reset input so same file can be re-uploaded
      e.target.value = "";
    },
    [t],
  );

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

        {/* Upload base PDF */}
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => pdfInputRef.current?.click()}
          title={t("formEditor.uploadPdf", "Wgraj PDF jako tło")}
        >
          <FileUp className="h-4 w-4" />
          <span className="hidden sm:inline">
            {t("formEditor.uploadPdfShort", "Wgraj PDF")}
          </span>
        </Button>
        <input
          ref={pdfInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handlePdfUpload}
        />

        <div className="mx-2 h-5 w-px bg-border" />

        {/* Center: Template name input */}
        <div className="flex min-w-0 flex-1 items-center justify-center">
          <Input
            value={settings.name}
            onChange={(e) =>
              setSettings((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder={t("formEditor.namePlaceholder", "Nazwa szablonu...")}
            className="h-8 max-w-md border-transparent bg-transparent text-center text-sm font-medium hover:border-input focus:border-input"
          />
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
          disabled={saving}
          className="min-w-[5rem]"
        >
          {saving
            ? t("common.saving")
            : t("formEditor.save", "Zapisz")}
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
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {t("common.loading")}
              </div>
            }
          >
            <PdfmeDesignerLazy
              ref={designerRef}
              onChange={handleDesignerChange}
            />
          </Suspense>
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
