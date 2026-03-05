import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export interface ProductFormData {
  name: string;
  description?: string;
  sku: string;
  unitPrice: number;
  taxRate: number;
  isActive: boolean;
}

interface ProductFormProps {
  initialData?: Partial<ProductFormData>;
  onSubmit: (data: ProductFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function ProductForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: ProductFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialData?.name ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [sku, setSku] = useState(initialData?.sku ?? "");
  const [unitPrice, setUnitPrice] = useState(initialData?.unitPrice ?? 0);
  const [taxRate, setTaxRate] = useState(initialData?.taxRate ?? 23);
  const [isActive, setIsActive] = useState(initialData?.isActive ?? true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      description: description || undefined,
      sku,
      unitPrice,
      taxRate,
      isActive,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>
            {t("products.form.name")} <span className="text-destructive">*</span>
          </Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("products.form.namePlaceholder")}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>
            {t("products.form.sku")} <span className="text-destructive">*</span>
          </Label>
          <Input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder={t("products.form.skuPlaceholder")}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>
            {t("products.form.unitPrice")} <span className="text-destructive">*</span>
          </Label>
          <Input
            type="number"
            min={0}
            step={0.01}
            value={unitPrice}
            onChange={(e) => setUnitPrice(parseFloat(e.target.value) || 0)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("products.form.taxRate")}</Label>
          <Input
            type="number"
            min={0}
            max={100}
            step={1}
            value={taxRate}
            onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
          />
        </div>
        <div className="flex items-center gap-2 self-end">
          <Switch checked={isActive} onCheckedChange={setIsActive} />
          <Label>{t("products.form.isActive")}</Label>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t("products.form.description")}</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("products.form.descriptionPlaceholder")}
            rows={3}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}
