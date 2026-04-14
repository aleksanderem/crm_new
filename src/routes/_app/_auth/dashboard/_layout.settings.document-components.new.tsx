import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { DocumentTemplateEditor } from "@/components/documents/document-template-editor";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/document-components/new",
)({
  component: NewDocumentComponentPage,
});

type ComponentCategory = "header" | "footer" | "patient_data" | "treatment_data" | "signature" | "table" | "legal" | "custom";
type ComponentScope = "org" | "user";

const CATEGORY_OPTIONS: { value: ComponentCategory; label: string }[] = [
  { value: "header", label: "Nagłówek" },
  { value: "footer", label: "Stopka" },
  { value: "patient_data", label: "Dane pacjenta" },
  { value: "treatment_data", label: "Dane zabiegu" },
  { value: "signature", label: "Podpis" },
  { value: "table", label: "Tabela" },
  { value: "legal", label: "Prawne" },
  { value: "custom", label: "Inne" },
];

function NewDocumentComponentPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { organizationId } = useOrganization();

  const createMutation = useMutation(api.documents.components.create);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ComponentCategory>("custom");
  const [scope, setScope] = useState<ComponentScope>("org");
  const [contentJson, setContentJson] = useState('{"type":"doc","content":[{"type":"paragraph"}]}');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Nazwa jest wymagana");
      return;
    }
    setSaving(true);
    try {
      await createMutation({
        organizationId,
        scope,
        name: name.trim(),
        description: description.trim() || undefined,
        category,
        contentJson,
      });
      toast.success("Komponent utworzony");
      navigate({ to: "/dashboard/settings/document-components" });
    } catch (err: any) {
      toast.error(err.message ?? "Błąd podczas tworzenia");
    } finally {
      setSaving(false);
    }
  };

  // Entity types for variable picker — components can use any variable
  const entityTypes = ["patient", "contact", "company", "lead", "appointment", "treatment", "employee"];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/dashboard/settings/document-components">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h2 className="text-lg font-semibold">
          {t("settings.documentComponents.create", "Nowy komponent")}
        </h2>
      </div>

      {/* Metadata */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Nazwa</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nagłówek dokumentu..." />
        </div>
        <div className="space-y-1.5">
          <Label>Kategoria</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as ComponentCategory)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Zakres</Label>
          <Select value={scope} onValueChange={(v) => setScope(v as ComponentScope)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="org">Organizacyjny</SelectItem>
              <SelectItem value="user">Osobisty</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Opis (opcjonalnie)</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Krótki opis komponentu..."
            rows={2}
          />
        </div>
      </div>

      {/* Content editor */}
      <div className="space-y-1.5">
        <Label>Treść komponentu</Label>
        <div className="overflow-hidden rounded-lg border" style={{ height: 500 }}>
          <DocumentTemplateEditor
            value={contentJson}
            onChange={setContentJson}
            entityTypes={entityTypes}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" asChild>
          <Link to="/dashboard/settings/document-components">Anuluj</Link>
        </Button>
        <Button onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? "Zapisywanie..." : "Zapisz komponent"}
        </Button>
      </div>
    </div>
  );
}
