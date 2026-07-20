import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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

export function generateSku(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "PRD-";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// VAT-exempt ("zwolniony") is tracked as a separate boolean (taxExempt) on the
// product. The "zw" option is selected when the boolean is true; otherwise the
// numeric percentage is used. Mirrors the gabinet treatment form.
const STOCK_UNIT_OPTIONS = [
  { value: "szt.", label: "szt." },
  { value: "ml", label: "ml" },
  { value: "l", label: "l" },
  { value: "g", label: "g" },
  { value: "kg", label: "kg" },
  { value: "op.", label: "op." },
  { value: "para", label: "para" },
  { value: "zestaw", label: "zestaw" },
];

// Normalize legacy values (e.g. "szt", "Szt" → "szt.") and detect custom ones.
function normalizeStockUnit(value: string | null | undefined): {
  selectValue: string;
  customValue: string;
} {
  if (!value) return { selectValue: "", customValue: "" };
  const v = value.trim();
  // Normalize common "szt." variants
  if (["szt", "Szt", "Szt.", "sztuka"].includes(v) || v.toLowerCase() === "szt.") {
    return { selectValue: "szt.", customValue: "" };
  }
  // Exact match against known options (case-insensitive)
  for (const opt of STOCK_UNIT_OPTIONS) {
    if (opt.value.toLowerCase() === v.toLowerCase()) {
      return { selectValue: opt.value, customValue: "" };
    }
  }
  // Unknown value → "inne" with preserved text
  return { selectValue: "inne", customValue: v };
}

const TAX_RATE_OPTIONS = [
  { value: "zw", label: "ZW" },
  { value: "0", label: "0%" },
  { value: "5", label: "5%" },
  { value: "8", label: "8%" },
  { value: "23", label: "23%" },
];

function initialTaxRateFormValue(
  taxRate: number | undefined | null,
  taxExempt: boolean | undefined,
): string {
  if (taxExempt) return "zw";
  if (taxRate == null) return "23";
  return String(taxRate);
}

function getTaxMultiplier(taxRateStr: string): number {
  if (taxRateStr === "zw") return 1;
  const rate = parseFloat(taxRateStr);
  return Number.isFinite(rate) ? 1 + rate / 100 : 1;
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

export const PRODUCT_SECTIONS = ["sale", "treatment", "disposable"] as const;
export type ProductSection = (typeof PRODUCT_SECTIONS)[number];

export interface ProductFormData {
  name: string;
  description?: string | null;
  sku: string;
  unitPrice: number;
  taxRate?: number | null;
  taxExempt?: boolean;
  isActive: boolean;
  tagIds?: Id<"tagDefinitions">[];
  categoryId?: Id<"categoryDefinitions"> | null;
  productSection?: ProductSection | null;
  trackStock?: boolean;
  stockUnit?: string | null;
  initialStock?: number | null;
  minStock?: number | null;
  manufacturer?: string | null;
  catalogNumber?: string | null;
  stockNote?: string | null;
  purchasePrice?: number | null;
  salePrice?: number | null;
}

interface ProductFormProps {
  initialData?: Partial<ProductFormData>;
  /** Pre-selects a product section in create mode when initialData is absent. */
  defaultSection?: ProductSection | null;
  onSubmit: (data: ProductFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  tagDefinitions?: TagDef[];
  categoryDefinitions?: CategoryDef[];
  organizationId?: Id<"organizations">;
}

export function ProductForm({
  initialData,
  defaultSection,
  onSubmit,
  onCancel,
  isSubmitting = false,
  tagDefinitions = [],
  categoryDefinitions = [],
  organizationId,
}: ProductFormProps) {
  const { t } = useTranslation();
  const isCreate = !initialData;
  const [name, setName] = useState(initialData?.name ?? "");
  const [nameError, setNameError] = useState("");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [sku, setSku] = useState(initialData?.sku ?? generateSku());
  const [unitPrice, setUnitPrice] = useState(String(initialData?.unitPrice ?? ""));
  const [taxRate, setTaxRate] = useState(
    initialTaxRateFormValue(initialData?.taxRate, initialData?.taxExempt),
  );
  const [isActive, setIsActive] = useState(initialData?.isActive ?? true);
  const [tagIds, setTagIds] = useState<Id<"tagDefinitions">[]>(initialData?.tagIds ?? []);
  const [categoryId, setCategoryId] = useState<Id<"categoryDefinitions"> | undefined>(initialData?.categoryId ?? undefined);
  const [productSection, setProductSection] = useState<ProductSection | "">(initialData?.productSection ?? defaultSection ?? "");
  const [trackStock, setTrackStock] = useState(initialData?.trackStock ?? false);
  const _initialUnit = normalizeStockUnit(initialData?.stockUnit);
  const [stockUnit, setStockUnit] = useState(_initialUnit.selectValue);
  const [customStockUnit, setCustomStockUnit] = useState(_initialUnit.customValue);
  const [initialStock, setInitialStock] = useState("");
  const [minStock, setMinStock] = useState(
    initialData?.minStock != null ? String(initialData.minStock) : "",
  );
  const [manufacturer, setManufacturer] = useState(initialData?.manufacturer ?? "");
  const [catalogNumber, setCatalogNumber] = useState(initialData?.catalogNumber ?? "");
  const [stockNote, setStockNote] = useState(initialData?.stockNote ?? "");
  const [purchasePrice, setPurchasePrice] = useState(
    initialData?.purchasePrice != null ? String(initialData.purchasePrice) : "",
  );
  const [salePrice, setSalePrice] = useState(
    initialData?.salePrice != null ? String(initialData.salePrice) : "",
  );
  const [salePriceNet, setSalePriceNet] = useState(() => {
    if (initialData?.salePrice != null) {
      const multiplier = getTaxMultiplier(
        initialTaxRateFormValue(initialData?.taxRate, initialData?.taxExempt),
      );
      return String(Math.round((initialData.salePrice / multiplier) * 100) / 100);
    }
    return "";
  });

  const handleTaxRateChange = (newRate: string) => {
    setTaxRate(newRate);
    const multiplier = getTaxMultiplier(newRate);
    // Sale: keep gross, update net
    const parsedSaleGross = parseFloat(salePrice.replace(",", "."));
    if (Number.isFinite(parsedSaleGross) && parsedSaleGross >= 0) {
      setSalePriceNet(String(Math.round((parsedSaleGross / multiplier) * 100) / 100));
    }
    // Purchase: keep net (unitPrice), update gross (purchasePrice)
    const parsedPurchaseNet = parseFloat(unitPrice.replace(",", "."));
    if (Number.isFinite(parsedPurchaseNet) && parsedPurchaseNet >= 0) {
      setPurchasePrice(String(Math.round(parsedPurchaseNet * multiplier * 100) / 100));
    }
  };

  const handleUnitPriceChange = (v: string) => {
    if (v !== "" && !/^[0-9]*[.,]?[0-9]*$/.test(v)) return;
    setUnitPrice(v);
    const parsed = parseFloat(v.replace(",", "."));
    if (Number.isFinite(parsed) && parsed >= 0) {
      const multiplier = getTaxMultiplier(taxRate);
      setPurchasePrice(String(Math.round(parsed * multiplier * 100) / 100));
    } else {
      setPurchasePrice("");
    }
  };

  const handlePurchasePriceChange = (v: string) => {
    if (v !== "" && !/^[0-9]*[.,]?[0-9]*$/.test(v)) return;
    setPurchasePrice(v);
    const parsed = parseFloat(v.replace(",", "."));
    if (Number.isFinite(parsed) && parsed >= 0) {
      const multiplier = getTaxMultiplier(taxRate);
      setUnitPrice(String(Math.round((parsed / multiplier) * 100) / 100));
    }
  };

  const handleSalePriceGrossChange = (v: string) => {
    if (v !== "" && !/^[0-9]*[.,]?[0-9]*$/.test(v)) return;
    setSalePrice(v);
    const parsed = parseFloat(v.replace(",", "."));
    if (Number.isFinite(parsed) && parsed >= 0) {
      const multiplier = getTaxMultiplier(taxRate);
      setSalePriceNet(String(Math.round((parsed / multiplier) * 100) / 100));
    } else {
      setSalePriceNet("");
    }
  };

  const handleSalePriceNetChange = (v: string) => {
    if (v !== "" && !/^[0-9]*[.,]?[0-9]*$/.test(v)) return;
    setSalePriceNet(v);
    const parsed = parseFloat(v.replace(",", "."));
    if (Number.isFinite(parsed) && parsed >= 0) {
      const multiplier = getTaxMultiplier(taxRate);
      setSalePrice(String(Math.round(parsed * multiplier * 100) / 100));
    } else {
      setSalePrice("");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError(t("products.form.nameRequired", { defaultValue: "Nazwa produktu jest wymagana." }));
      return;
    }
    setNameError("");
    const isExempt = taxRate === "zw";
    const numericTaxRate = !isExempt
      ? Number.isFinite(parseFloat(taxRate))
        ? parseFloat(taxRate)
        : null
      : null;
    const normalizedUnitPrice = unitPrice.replace(",", ".");
    const normalizedInitialStock = (() => {
      if (!initialStock.trim()) return null;
      const parsed = parseFloat(initialStock.replace(",", "."));
      return Number.isFinite(parsed) ? parsed : null;
    })();
    const normalizedMinStock = (() => {
      if (!minStock.trim()) return null;
      const parsed = parseFloat(minStock.replace(",", "."));
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    })();
    const normalizedPurchasePrice = (() => {
      if (!purchasePrice.trim()) return null;
      const parsed = parseFloat(purchasePrice.replace(",", "."));
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    })();
    const normalizedSalePrice = (() => {
      if (!salePrice.trim()) return null;
      const parsed = parseFloat(salePrice.replace(",", "."));
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    })();
    onSubmit({
      name: trimmedName,
      description: description || null,
      sku,
      unitPrice: parseFloat(normalizedUnitPrice) || 0,
      taxRate: numericTaxRate,
      taxExempt: isExempt,
      isActive,
      tagIds: tagIds.length > 0 ? tagIds : undefined,
      categoryId: categoryId || null,
      productSection: productSection || null,
      trackStock,
      stockUnit: stockUnit === "inne" ? customStockUnit.trim() || null : stockUnit || null,
      initialStock: normalizedInitialStock,
      minStock: normalizedMinStock,
      manufacturer: manufacturer.trim() || null,
      catalogNumber: catalogNumber.trim() || null,
      stockNote: stockNote.trim() || null,
      purchasePrice: normalizedPurchasePrice,
      salePrice: normalizedSalePrice,
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
            onChange={(e) => {
              setName(e.target.value);
              if (nameError) setNameError("");
            }}
            placeholder={t("products.form.namePlaceholder")}
          />
          {nameError && <p className="text-sm text-destructive">{nameError}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>{t("products.form.sku")}</Label>
          <Input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder={t("products.form.skuPlaceholder")}
          />
        </div>
        <div className="space-y-3 sm:col-span-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("products.manufacturer", { defaultValue: "Producent" })}</Label>
              <Input
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                placeholder={t("products.manufacturerPlaceholder", { defaultValue: "Nazwa producenta" })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("products.catalogNumber", { defaultValue: "Nr katalogowy" })}</Label>
              <Input
                value={catalogNumber}
                onChange={(e) => setCatalogNumber(e.target.value)}
                placeholder={t("products.catalogNumberPlaceholder", { defaultValue: "np. CAT-12345" })}
              />
            </div>
          </div>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t("products.sections.label", { defaultValue: "Grupa przeznaczenia produktu" })}</Label>
          <Select value={productSection || "none"} onValueChange={(v) => setProductSection(v === "none" ? "" : v as ProductSection)}>
            <SelectTrigger className={!productSection ? "border-purple-300 bg-purple-50/50 dark:border-purple-700 dark:bg-purple-950/20" : ""}>
              <SelectValue placeholder={t("products.sections.placeholder", { defaultValue: "Wybierz rodzaj produktu" })} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("products.sections.none", { defaultValue: "Brak" })}</SelectItem>
              {PRODUCT_SECTIONS.map((section) => (
                <SelectItem key={section} value={section}>
                  {t(`products.sections.${section}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!productSection && (
            <p className="text-xs text-purple-600 dark:text-purple-400">
              {t("products.sections.hint", { defaultValue: "Wybierz rodzaj produktu, aby poprawnie organizować magazyn." })}
            </p>
          )}
        </div>
        {/* ─── Zakup ─── */}
        <div className="sm:col-span-2 border-t pt-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {t("products.form.sections.purchase", { defaultValue: "Zakup" })}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>
            {t("products.form.unitPrice")} <span className="text-destructive">*</span>
          </Label>
          <Input
            type="text"
            inputMode="decimal"
            value={unitPrice}
            onChange={(e) => handleUnitPriceChange(e.target.value)}
            placeholder="0.00"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("products.form.taxRate")}</Label>
          <Select value={taxRate} onValueChange={handleTaxRateChange}>
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
        <div className="space-y-1.5 sm:col-span-2">
          <Label>
            {t("products.stock.purchasePriceLabel", { defaultValue: "Cena zakupu brutto" })}
          </Label>
          <Input
            type="text"
            inputMode="decimal"
            value={purchasePrice}
            onChange={(e) => handlePurchasePriceChange(e.target.value)}
            placeholder={t("products.stock.purchasePricePlaceholder", { defaultValue: "np. 120,00" })}
          />
          <p className="text-xs text-muted-foreground">
            {t("products.stock.purchasePriceHelp", { defaultValue: "Używana do wyliczenia wartości magazynu. Opcjonalna." })}
          </p>
        </div>
        {/* ─── Sprzedaż ─── */}
        <div className="sm:col-span-2 border-t pt-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {t("products.form.sections.sales", { defaultValue: "Sprzedaż" })}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>{t("products.form.salePriceNet", { defaultValue: "Cena sprzedaży netto" })}</Label>
          <Input
            type="text"
            inputMode="decimal"
            value={salePriceNet}
            onChange={(e) => handleSalePriceNetChange(e.target.value)}
            placeholder={t("products.form.salePriceNetPlaceholder", { defaultValue: "np. 121,95" })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("products.form.salePrice", { defaultValue: "Cena sprzedaży brutto" })}</Label>
          <Input
            type="text"
            inputMode="decimal"
            value={salePrice}
            onChange={(e) => handleSalePriceGrossChange(e.target.value)}
            placeholder={t("products.form.salePricePlaceholder", { defaultValue: "np. 150,00" })}
          />
        </div>
        <p className="text-xs text-muted-foreground sm:col-span-2">
          {t("products.form.salePriceHelp", { defaultValue: "Cena brutto w złotych, po której sprzedajesz produkt. Opcjonalna." })}
        </p>
        <div className="flex items-center gap-2 self-end">
          <Switch checked={isActive} onCheckedChange={setIsActive} />
          <Label>{t("products.form.isActive")}</Label>
        </div>
        {/* Stock tracking */}
        <div className="space-y-3 rounded-md border bg-muted/30 px-3 py-3 sm:col-span-2">
          <div className="flex items-start gap-2">
            <Checkbox
              id="product-form-track-stock"
              checked={trackStock}
              onCheckedChange={(checked) => setTrackStock(!!checked)}
              className="mt-0.5"
            />
            <div className="space-y-1">
              <Label htmlFor="product-form-track-stock" className="cursor-pointer">
                {t("products.stock.trackToggle", { defaultValue: "Śledź stan magazynowy" })}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("products.stock.trackHelp", {
                  defaultValue:
                    "Każda zmiana stanu zapisuje się w historii ruchów.",
                })}
              </p>
            </div>
          </div>

          {trackStock && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>
                    {t("products.stock.unitLabel", { defaultValue: "Jednostka" })}
                  </Label>
                  <Select value={stockUnit} onValueChange={setStockUnit}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("products.stock.unitPlaceholder", { defaultValue: "Wybierz jednostkę" })} />
                    </SelectTrigger>
                    <SelectContent>
                      {STOCK_UNIT_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                      <SelectItem value="inne">
                        {t("products.stock.unitOther", { defaultValue: "Inne" })}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {stockUnit === "inne" && (
                    <Input
                      value={customStockUnit}
                      onChange={(e) => setCustomStockUnit(e.target.value)}
                      placeholder={t("products.stock.customUnitPlaceholder", { defaultValue: "Wpisz własną jednostkę" })}
                    />
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>
                    {t("products.stock.minLabel", { defaultValue: "Min. stan" })}
                  </Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={minStock}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) setMinStock(v);
                    }}
                    placeholder="0"
                  />
                </div>
              </div>
              {isCreate && (
                <div className="space-y-1.5">
                  <Label>
                    {t("products.stock.initialLabel", { defaultValue: "Stan początkowy" })}
                  </Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={initialStock}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^-?[0-9]*[.,]?[0-9]*$/.test(v)) setInitialStock(v);
                    }}
                    placeholder="0"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Warehouse note */}
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t("products.stock.noteLabel", { defaultValue: "Notatka magazynowa" })}</Label>
          <Textarea
            value={stockNote}
            onChange={(e) => setStockNote(e.target.value)}
            placeholder={t("products.stock.notePlaceholder", {
              defaultValue: "Warunki przechowywania, uwagi dla magazyniera…",
            })}
            rows={2}
          />
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
