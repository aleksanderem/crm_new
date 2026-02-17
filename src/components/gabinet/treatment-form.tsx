import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

export interface TreatmentFormData {
  name: string;
  description?: string;
  category?: string;
  duration: number;
  price: number;
  currency?: string;
  taxRate?: number;
  requiredEquipment?: string[];
  contraindications?: string;
  preparationInstructions?: string;
  aftercareInstructions?: string;
  requiresApproval?: boolean;
  color?: string;
  sortOrder?: number;
}

interface TreatmentFormProps {
  initialData?: Partial<TreatmentFormData>;
  onSubmit: (data: TreatmentFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

const COLOR_OPTIONS = [
  { value: "#3b82f6", label: "Blue" },
  { value: "#22c55e", label: "Green" },
  { value: "#ef4444", label: "Red" },
  { value: "#f59e0b", label: "Yellow" },
  { value: "#8b5cf6", label: "Purple" },
  { value: "#ec4899", label: "Pink" },
  { value: "#f97316", label: "Orange" },
  { value: "#6b7280", label: "Gray" },
];

export function TreatmentForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: TreatmentFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialData?.name ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [category, setCategory] = useState(initialData?.category ?? "");
  const [duration, setDuration] = useState(String(initialData?.duration ?? ""));
  const [price, setPrice] = useState(String(initialData?.price ?? ""));
  const [currency, setCurrency] = useState(initialData?.currency ?? "PLN");
  const [taxRate, setTaxRate] = useState(String(initialData?.taxRate ?? "23"));
  const [requiredEquipment, setRequiredEquipment] = useState(
    initialData?.requiredEquipment?.join(", ") ?? ""
  );
  const [contraindications, setContraindications] = useState(initialData?.contraindications ?? "");
  const [preparationInstructions, setPreparationInstructions] = useState(
    initialData?.preparationInstructions ?? ""
  );
  const [aftercareInstructions, setAftercareInstructions] = useState(
    initialData?.aftercareInstructions ?? ""
  );
  const [requiresApproval, setRequiresApproval] = useState(initialData?.requiresApproval ?? false);
  const [color, setColor] = useState(initialData?.color ?? "");
  const [sortOrder, setSortOrder] = useState(String(initialData?.sortOrder ?? "0"));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const equipmentArr = requiredEquipment
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    onSubmit({
      name,
      description: description || undefined,
      category: category || undefined,
      duration: parseInt(duration) || 30,
      price: parseFloat(price) || 0,
      currency: currency || undefined,
      taxRate: parseFloat(taxRate) || undefined,
      requiredEquipment: equipmentArr.length > 0 ? equipmentArr : undefined,
      contraindications: contraindications || undefined,
      preparationInstructions: preparationInstructions || undefined,
      aftercareInstructions: aftercareInstructions || undefined,
      requiresApproval: requiresApproval || undefined,
      color: color || undefined,
      sortOrder: parseInt(sortOrder) || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>
            {t("gabinet.treatments.name")} <span className="text-destructive">*</span>
          </Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>
            {t("gabinet.treatments.durationMinutes")} <span className="text-destructive">*</span>
          </Label>
          <Input
            type="number"
            min="1"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="30"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>
            {t("gabinet.treatments.price")} <span className="text-destructive">*</span>
          </Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("gabinet.treatments.currency")}</Label>
          <Input
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            placeholder="PLN"
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("gabinet.treatments.taxRate")}</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={taxRate}
            onChange={(e) => setTaxRate(e.target.value)}
            placeholder="23"
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("gabinet.treatments.category")}</Label>
          <Input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("gabinet.treatments.sortOrder")}</Label>
          <Input
            type="number"
            min="0"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t("common.description")}</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
        </div>
      </div>

      {/* Color picker */}
      <div className="space-y-2">
        <Label>{t("gabinet.treatments.color")}</Label>
        <div className="flex gap-2">
          {COLOR_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`h-7 w-7 rounded-full border-2 transition-all ${
                color === opt.value
                  ? "border-foreground scale-110"
                  : "border-transparent hover:border-muted-foreground/40"
              }`}
              style={{ backgroundColor: opt.value }}
              onClick={() => setColor(color === opt.value ? "" : opt.value)}
              title={opt.label}
            />
          ))}
        </div>
      </div>

      <div className="space-y-4 border-t pt-4">
        <div className="space-y-1.5">
          <Label>{t("gabinet.treatments.requiredEquipment")}</Label>
          <Input
            value={requiredEquipment}
            onChange={(e) => setRequiredEquipment(e.target.value)}
            placeholder="Comma-separated list"
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("gabinet.treatments.contraindications")}</Label>
          <Textarea
            value={contraindications}
            onChange={(e) => setContraindications(e.target.value)}
            rows={2}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("gabinet.treatments.preparationInstructions")}</Label>
          <Textarea
            value={preparationInstructions}
            onChange={(e) => setPreparationInstructions(e.target.value)}
            rows={2}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("gabinet.treatments.aftercareInstructions")}</Label>
          <Textarea
            value={aftercareInstructions}
            onChange={(e) => setAftercareInstructions(e.target.value)}
            rows={2}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          checked={requiresApproval}
          onCheckedChange={(checked) => setRequiresApproval(!!checked)}
        />
        <Label className="cursor-pointer">{t("gabinet.treatments.requiresApproval")}</Label>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={!name.trim() || !duration || !price || isSubmitting}>
          {isSubmitting
            ? t("common.saving")
            : initialData
              ? t("common.save")
              : t("gabinet.treatments.createTreatment")}
        </Button>
      </div>
    </form>
  );
}
