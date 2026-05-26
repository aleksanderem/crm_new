import { useState, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
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
import { ArrowLeft, Lock } from "lucide-react";
import { toast } from "sonner";
import { DocumentTemplateEditor } from "@/components/documents/document-template-editor";
import type { Id } from "@cvx/_generated/dataModel";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/document-components/$id",
)({
  component: EditDocumentComponentPage,
});

type ComponentCategory = "header" | "footer" | "patient_data" | "treatment_data" | "signature" | "table" | "legal" | "custom";

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

function EditDocumentComponentPage() {
  const navigate = useNavigate();
  const { id } = Route.useParams();
  const { organizationId } = useOrganization();

  const getComponentById = useAction(api.documents.components.getById);
  const { data: component } = useQuery({
    queryKey: ["documents.components.getById", organizationId, id],
    queryFn: () =>
      getComponentById({
        organizationId,
        componentId: id as string,
      }),
    enabled: !!organizationId && !!id,
  });

  const updateMutation = useAction(api.documents.components.update);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ComponentCategory>("custom");
  const [contentJson, setContentJson] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load component data when fetched
  useEffect(() => {
    if (component && !loaded) {
      setName(component.name as string);
      setDescription((component.description as string | undefined) ?? "");
      setCategory(component.category as ComponentCategory);
      setContentJson(component.contentJson as string);
      setLoaded(true);
    }
  }, [component, loaded]);

  const isSystem = component?.scope === "system";

  const handleSave = async () => {
    if (!name.trim() || isSystem) return;
    setSaving(true);
    try {
      await updateMutation({
        organizationId,
        componentId: id as Id<"documentComponents">,
        name: name.trim(),
        description: description.trim() || undefined,
        category,
        contentJson,
      });
      toast.success("Komponent zaktualizowany");
      navigate({ to: "/dashboard/settings/document-components" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Błąd podczas zapisu");
    } finally {
      setSaving(false);
    }
  };

  const entityTypes = ["patient", "contact", "company", "lead", "appointment", "treatment", "employee"];

  if (!component) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Ładowanie...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/dashboard/settings/document-components">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h2 className="text-lg font-semibold">
          {isSystem ? "Podgląd komponentu" : "Edycja komponentu"}
        </h2>
        {isSystem && (
          <Lock className="h-4 w-4 text-amber-500" />
        )}
      </div>

      {/* Metadata */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Nazwa</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={isSystem} />
        </div>
        <div className="space-y-1.5">
          <Label>Kategoria</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as ComponentCategory)} disabled={isSystem}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Opis</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isSystem}
            rows={2}
          />
        </div>
      </div>

      {/* Content editor */}
      <div className="space-y-1.5">
        <Label>Treść komponentu</Label>
        <div className="overflow-hidden rounded-lg border" style={{ height: 500 }}>
          {contentJson && (
            <DocumentTemplateEditor
              value={contentJson}
              onChange={isSystem ? () => {} : setContentJson}
              entityTypes={entityTypes}
            />
          )}
        </div>
      </div>

      {/* Actions */}
      {!isSystem && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" asChild>
            <Link to="/dashboard/settings/document-components">Anuluj</Link>
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? "Zapisywanie..." : "Zapisz zmiany"}
          </Button>
        </div>
      )}
    </div>
  );
}
