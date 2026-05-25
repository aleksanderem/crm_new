import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/gabinet/rich-text-editor";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TagsPicker } from "@/components/categories-tags/tags-picker";
import { CategoryPicker } from "@/components/categories-tags/category-picker";
import type { Id } from "@cvx/_generated/dataModel";

// VAT-exempt ("zwolniony") is tracked as a separate boolean (taxExempt) on the
// product. The "zw" option is selected when the boolean is true; otherwise the
// numeric percentage is used. Mirrors the gabinet treatment form.
const TAX_RATE_OPTIONS = [
  { value: "zw", label: "ZW" },
  { value: "0", label: "0%" },
  { value: "5", label: "5%" },
  { value: "8", label: "8%" },
  { value: "23", label: "23%" },
];

function initialTaxRateFormValue(
  taxRate: number | undefined,
  taxExempt: boolean | undefined,
): string {
  if (taxExempt) return "zw";
  if (taxRate == null) return "23";
  return String(taxRate);
}

interface TagDef {
  _id: Id<"tagDefinitions">;
  name: string;
  color: string;
}

interface CategoryDef {
  _id: Id<"categoryDefinitions">;
  name: string;
  parentId?: Id<"categoryDefinitions">;
  color?: string;
}

export interface ProductFormData {
  name: string;
  description?: string;
  sku: string;
  unitPrice: number;
  taxRate?: number;
  taxExempt?: boolean;
  isActive: boolean;
  tagIds?: Id<"tagDefinitions">[];
  categoryId?: Id<"categoryDefinitions">;
}

interface ProductFormProps {
  initialData?: Partial<ProductFormData>;
  onSubmit: (data: ProductFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  tagDefinitions?: TagDef[];
  categoryDefinitions?: CategoryDef[];
  organizationId?: Id<"organizations">;
}

export function ProductForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
  tagDefinitions = [],
  categoryDefinitions = [],
  organizationId,
}: ProductFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialData?.name ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [sku, setSku] = useState(initialData?.sku ?? "");
  const [unitPrice, setUnitPrice] = useState(initialData?.unitPrice ?? 0);
  const [taxRate, setTaxRate] = useState(
    initialTaxRateFormValue(initialData?.taxRate, initialData?.taxExempt),
  );
  const [isActive, setIsActive] = useState(initialData?.isActive ?? true);
  const [tagIds, setTagIds] = useState<Id<"tagDefinitions">[]>(initialData?.tagIds ?? []);
  const [categoryId, setCategoryId] = useState<Id<"categoryDefinitions"> | undefined>(initialData?.categoryId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isExempt = taxRate === "zw";
    const numericTaxRate = !isExempt
      ? Number.isFinite(parseFloat(taxRate))
        ? parseFloat(taxRate)
        : undefined
      : undefined;
    onSubmit({
      name,
      description: description || undefined,
      sku,
      unitPrice,
      taxRate: numericTaxRate,
      taxExempt: isExempt,
      isActive,
      tagIds: tagIds.length > 0 ? tagIds : undefined,
      categoryId: categoryId || undefined,
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
          <Select value={taxRate} onValueChange={setTaxRate}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TAX_RATE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 self-end">
          <Switch checked={isActive} onCheckedChange={setIsActive} />
          <Label>{t("products.form.isActive")}</Label>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t("products.form.description")}</Label>
          <RichTextEditor
            value={description}
            onChange={(v) => setDescription(v ?? "")}
            placeholder={t("products.form.descriptionPlaceholder")}
            minHeight="80px"
          />
        </div>
        {tagDefinitions.length > 0 && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t('common.tags', { defaultValue: "Tagi" })}</Label>
            <TagsPicker
              tags={tagDefinitions}
              selectedIds={tagIds}
              onChange={setTagIds}
            />
          </div>
        )}
        {organizationId && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t('common.category', { defaultValue: "Kategoria" })}</Label>
            <CategoryPicker
              categories={categoryDefinitions}
              selectedId={categoryId}
              onChange={setCategoryId}
              organizationId={organizationId}
              entityType="product"
            />
          </div>
        )}
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
