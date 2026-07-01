import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { toast } from "sonner";
import { api } from "@cvx/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/gabinet/rich-text-editor";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSupabaseGabinetTreatmentPackagesActive } from "@/hooks/use-supabase-gabinet-packages";
import { useSupabaseProductsList } from "@/hooks/use-supabase-products";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Check, ChevronsUpDown, Plus, Trash2 } from "@/lib/ez-icons";
import { cn } from "@/lib/utils";
import { formatActionError } from "@/lib/format-action-error";
import {
  TreatmentRequiredDocumentsField,
  type RequiredFormTemplateValue,
} from "@/components/documents/treatment-required-documents-field";
import type { Id } from "@cvx/_generated/dataModel";

export interface TreatmentProductLine {
  productId: string;
  quantity: number;
  unit?: string | null;
}

export interface TreatmentFormData {
  name: string;
  description?: string | null;
  duration: number;
  price: number;
  currency?: string;
  taxRate?: number;
  taxExempt?: boolean;
  requiredEquipment?: string[];
  requiredEquipmentIds?: Id<"gabinetEquipment">[];
  contraindications?: string | null;
  preparationInstructions?: string | null;
  aftercareInstructions?: string | null;
  requiresApproval?: boolean;
  color?: string | null;
  treatmentCount?: number;
  packageId?: string | null;
  requiredFormTemplates?: RequiredFormTemplateValue[];
  products?: TreatmentProductLine[];
  materials?: TreatmentProductLine[];
}

interface TreatmentFormProps {
  organizationId: Id<"organizations">;
  initialData?: Partial<TreatmentFormData>;
  onSubmit: (data: TreatmentFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  categorySelector?: React.ReactNode;
  children?: React.ReactNode;
  // Server-rejection messages keyed by TreatmentFormData field name. Lets the
  // route surface "Cena — to pole jest wymagane" next to the bad input
  // instead of only as a toast (#1972).
  fieldErrors?: Partial<Record<keyof TreatmentFormData, string>>;
}

// VAT-exempt ("zwolniony") is tracked as a separate boolean (taxExempt) on the
// treatment. The "zw" option is selected when the boolean is true; otherwise
// the numeric percentage is used.
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
  if (taxRate === -1) return "zw"; // legacy sentinel still in flight
  if (taxRate == null) return "8";
  return String(taxRate);
}

export function TreatmentForm({
  organizationId,
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
  categorySelector,
  children,
  fieldErrors,
}: TreatmentFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialData?.name ?? "");
  const [duration, setDuration] = useState(String(initialData?.duration ?? ""));
  const [price, setPrice] = useState(String(initialData?.price ?? ""));
  const [currency, setCurrency] = useState(initialData?.currency ?? "PLN");
  const [taxRate, setTaxRate] = useState(
    initialTaxRateFormValue(initialData?.taxRate, initialData?.taxExempt),
  );
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<Id<"gabinetEquipment">[]>(
    initialData?.requiredEquipmentIds ?? []
  );
  const [equipmentOpen, setEquipmentOpen] = useState(false);
  const [notes, setNotes] = useState(initialData?.description ?? "");
  const [requiredFormTemplates, setRequiredFormTemplates] = useState<
    RequiredFormTemplateValue[]
  >(initialData?.requiredFormTemplates ?? []);
  const [requiresApproval, setRequiresApproval] = useState(initialData?.requiresApproval ?? false);
  const initialTreatmentCount = initialData?.treatmentCount;
  const initialPackageId = initialData?.packageId ?? null;
  const [isPackage, setIsPackage] = useState(
    !!initialPackageId ||
      (initialTreatmentCount != null && initialTreatmentCount > 1),
  );
  const [selectedPackageId, setSelectedPackageId] = useState<string>(
    initialPackageId ?? "",
  );

  const [productLines, setProductLines] = useState<TreatmentProductLine[]>(
    initialData?.products ?? [],
  );
  const [productPickerOpen, setProductPickerOpen] = useState<number | null>(null);

  const [materialLines, setMaterialLines] = useState<TreatmentProductLine[]>(
    initialData?.materials ?? [],
  );
  const [materialPickerOpen, setMaterialPickerOpen] = useState<number | null>(null);

  const { data: packagesList } =
    useSupabaseGabinetTreatmentPackagesActive(organizationId);

  const { data: treatmentProducts } = useSupabaseProductsList(organizationId, {
    productSection: "treatment",
  });

  const { data: disposableProducts } = useSupabaseProductsList(organizationId, {
    productSection: "disposable",
  });

  const queryClient = useQueryClient();
  const listEquipmentAction = useAction(api.gabinet.equipment.listEquipment);
  const createEquipmentAction = useAction(api.gabinet.equipment.createEquipment);
  const equipmentQueryKey = ["gabinet.equipment.listEquipment", organizationId];
  const { data: equipmentList } = useQuery({
    queryKey: equipmentQueryKey,
    queryFn: () => listEquipmentAction({ organizationId }),
    enabled: !!organizationId,
  });

  const [addingNewEquipment, setAddingNewEquipment] = useState(false);
  const [newEquipmentName, setNewEquipmentName] = useState("");
  const [creatingEquipment, setCreatingEquipment] = useState(false);

  const legacyEquipment = initialData?.requiredEquipment ?? [];
  const hasLegacyEquipment =
    legacyEquipment.length > 0 && selectedEquipmentIds.length === 0;

  const toggleEquipment = (id: Id<"gabinetEquipment">) => {
    setSelectedEquipmentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const getEquipmentName = (id: Id<"gabinetEquipment">) => {
    return equipmentList?.find((e) => e._id === id)?.name ?? id;
  };

  const addProductLine = () => {
    setProductLines((prev) => [...prev, { productId: "", quantity: 1, unit: null }]);
  };

  const removeProductLine = (index: number) => {
    setProductLines((prev) => prev.filter((_, i) => i !== index));
    if (productPickerOpen === index) setProductPickerOpen(null);
  };

  const updateProductLine = (index: number, patch: Partial<TreatmentProductLine>) => {
    setProductLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const selectProduct = (index: number, productId: string) => {
    const product = (treatmentProducts ?? []).find((p) => p._id === productId);
    updateProductLine(index, { productId, unit: product?.stockUnit ?? null });
    setProductPickerOpen(null);
  };

  const addMaterialLine = () => {
    setMaterialLines((prev) => [...prev, { productId: "", quantity: 1, unit: null }]);
  };

  const removeMaterialLine = (index: number) => {
    setMaterialLines((prev) => prev.filter((_, i) => i !== index));
    if (materialPickerOpen === index) setMaterialPickerOpen(null);
  };

  const updateMaterialLine = (index: number, patch: Partial<TreatmentProductLine>) => {
    setMaterialLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const selectMaterial = (index: number, productId: string) => {
    const product = (disposableProducts ?? []).find((p) => p._id === productId);
    updateMaterialLine(index, { productId, unit: product?.stockUnit ?? null });
    setMaterialPickerOpen(null);
  };

  const resetAddEquipmentForm = () => {
    setAddingNewEquipment(false);
    setNewEquipmentName("");
  };

  const handleCreateEquipment = async () => {
    const trimmed = newEquipmentName.trim();
    if (!trimmed || creatingEquipment) return;
    setCreatingEquipment(true);
    try {
      const newId = (await createEquipmentAction({
        organizationId,
        name: trimmed,
      })) as Id<"gabinetEquipment">;
      await queryClient.invalidateQueries({ queryKey: equipmentQueryKey });
      setSelectedEquipmentIds((prev) =>
        prev.includes(newId) ? prev : [...prev, newId]
      );
      resetAddEquipmentForm();
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.equipment.errors.createFailed",
          defaultValue: "Nie udało się dodać sprzętu.",
        }),
      );
    } finally {
      setCreatingEquipment(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const isExempt = taxRate === "zw";
    const numericTaxRate = !isExempt && taxRate !== ""
      ? Number.isFinite(parseFloat(taxRate))
        ? parseFloat(taxRate)
        : undefined
      : undefined;

    const validProducts = productLines.filter((p) => p.productId.trim() !== "" && p.quantity > 0);
    const validMaterials = materialLines.filter((m) => m.productId.trim() !== "" && m.quantity > 0);

    onSubmit({
      name,
      description: notes || null,
      duration: parseInt(duration) || 30,
      price: parseFloat(price.replace(",", ".")) || 0,
      currency: currency || undefined,
      taxRate: numericTaxRate,
      taxExempt: isExempt ? true : undefined,
      requiredEquipmentIds: selectedEquipmentIds.length > 0 ? selectedEquipmentIds : undefined,
      contraindications: initialData?.contraindications ?? null,
      preparationInstructions: initialData?.preparationInstructions ?? null,
      aftercareInstructions: initialData?.aftercareInstructions ?? null,
      requiresApproval: requiresApproval || undefined,
      color: initialData?.color ?? null,
      packageId: isPackage && selectedPackageId ? selectedPackageId : null,
      requiredFormTemplates,
      products: validProducts,
      materials: validMaterials,
    });
  };

  const fieldErr = (key: keyof TreatmentFormData) => fieldErrors?.[key];
  const errorClass = "border-destructive focus-visible:ring-destructive";
  const renderFieldError = (key: keyof TreatmentFormData) => {
    const msg = fieldErr(key);
    if (!msg) return null;
    return (
      <p className="text-xs text-destructive" role="alert">
        {msg}
      </p>
    );
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
            aria-invalid={!!fieldErr("name")}
            className={fieldErr("name") ? errorClass : undefined}
          />
          {renderFieldError("name")}
        </div>
        <div className="space-y-1.5">
          <Label>
            {t("gabinet.treatments.durationMinutes")} <span className="text-destructive">*</span>
          </Label>
          <Input
            type="number"
            inputMode="numeric"
            min="1"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
            placeholder="30"
            required
            aria-invalid={!!fieldErr("duration")}
            className={fieldErr("duration") ? errorClass : undefined}
          />
          {renderFieldError("duration")}
        </div>
        <div className="space-y-1.5">
          <Label>
            {t("gabinet.treatments.price")} <span className="text-destructive">*</span>
          </Label>
          <Input
            type="text"
            inputMode="decimal"
            value={price}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
                setPrice(v);
              }
            }}
            placeholder="0.00"
            required
            aria-invalid={!!fieldErr("price")}
            className={fieldErr("price") ? errorClass : undefined}
          />
          {renderFieldError("price")}
        </div>
        <div className="space-y-1.5">
          <Label>{t("gabinet.treatments.currency")}</Label>
          <Input
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            placeholder="PLN"
            aria-invalid={!!fieldErr("currency")}
            className={fieldErr("currency") ? errorClass : undefined}
          />
          {renderFieldError("currency")}
        </div>
        <div className="space-y-1.5">
          <Label>{t("gabinet.treatments.taxRate")}</Label>
          <Select value={taxRate} onValueChange={setTaxRate}>
            <SelectTrigger
              aria-invalid={!!fieldErr("taxRate")}
              className={fieldErr("taxRate") ? errorClass : undefined}
            >
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
          {renderFieldError("taxRate")}
        </div>
        <div className="space-y-1.5">
          <Label>{t("gabinet.treatments.package", "Pakiet")}</Label>
          <div className="flex h-9 items-center gap-2">
            <Checkbox
              id="treatment-is-package"
              checked={isPackage}
              onCheckedChange={(checked) => {
                const next = !!checked;
                setIsPackage(next);
                if (!next) {
                  setSelectedPackageId("");
                }
              }}
            />
            <Label htmlFor="treatment-is-package" className="cursor-pointer font-normal">
              {t("gabinet.treatments.isPackageLabel", "Ten zabieg to pakiet")}
            </Label>
          </div>
        </div>
        {isPackage && (
          <div className="space-y-1.5">
            <Label>{t("gabinet.treatments.linkedPackage", "Powiązany pakiet")}</Label>
            <Select
              value={selectedPackageId}
              onValueChange={setSelectedPackageId}
            >
              <SelectTrigger
                aria-invalid={!!fieldErr("packageId")}
                className={fieldErr("packageId") ? errorClass : undefined}
              >
                <SelectValue
                  placeholder={t(
                    "gabinet.treatments.selectPackagePlaceholder",
                    "Wybierz pakiet...",
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                {(packagesList ?? []).length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    {t(
                      "gabinet.treatments.noPackagesAvailable",
                      "Brak pakietów. Dodaj pakiet w zakładce \"Pakiety\".",
                    )}
                  </div>
                ) : (
                  (packagesList ?? []).map((pkg) => (
                    <SelectItem key={pkg._id} value={pkg._id}>
                      {pkg.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {renderFieldError("packageId")}
            <p className="text-xs text-muted-foreground">
              {t(
                "gabinet.treatments.linkedPackageHint",
                "Wybierz pakiet z zakładki \"Pakiety\" — liczba zabiegów zostanie pobrana z pakietu.",
              )}
            </p>
          </div>
        )}
        <div className="space-y-1.5">
          <Label>{t("gabinet.treatments.category")}</Label>
          {categorySelector}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t("gabinet.treatments.requiredEquipment")}</Label>
          <Popover
            open={equipmentOpen}
            onOpenChange={(open) => {
              setEquipmentOpen(open);
              if (!open) resetAddEquipmentForm();
            }}
          >
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={equipmentOpen}
                className="w-full justify-between font-normal"
              >
                {selectedEquipmentIds.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {selectedEquipmentIds.length <= 2 ? (
                      selectedEquipmentIds.map((id) => (
                        <Badge key={id} variant="secondary" className="rounded-sm font-normal">
                          {getEquipmentName(id)}
                        </Badge>
                      ))
                    ) : (
                      <Badge variant="secondary" className="rounded-sm font-normal">
                        {selectedEquipmentIds.length} {t("gabinet.treatments.equipmentSelected", "selected")}
                      </Badge>
                    )}
                  </div>
                ) : (
                  <span className="text-muted-foreground">
                    {t("gabinet.treatments.selectEquipment", "Select equipment...")}
                  </span>
                )}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[var(--radix-popover-trigger-width)] p-0"
              align="start"
              style={{
                maxHeight: "var(--radix-popover-content-available-height)",
              }}
            >
              {addingNewEquipment ? (
                <div className="p-2 space-y-2">
                  <Label className="text-xs">
                    {t("gabinet.equipment.addEquipment")}
                  </Label>
                  <Input
                    autoFocus
                    value={newEquipmentName}
                    onChange={(e) => setNewEquipmentName(e.target.value)}
                    placeholder={t("gabinet.equipment.name")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleCreateEquipment();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        resetAddEquipmentForm();
                      }
                    }}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={resetAddEquipmentForm}
                      disabled={creatingEquipment}
                    >
                      {t("common.cancel")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleCreateEquipment()}
                      disabled={!newEquipmentName.trim() || creatingEquipment}
                    >
                      {creatingEquipment ? t("common.saving") : t("common.create")}
                    </Button>
                  </div>
                </div>
              ) : (
                <Command>
                  <CommandInput
                    placeholder={t("gabinet.treatments.searchEquipment", "Search equipment...")}
                    onClose={() => setEquipmentOpen(false)}
                    closeLabel={t("common.close")}
                  />
                  <CommandList className="flex-1 min-h-0">
                    <CommandEmpty>{t("common.noResults", "No results found.")}</CommandEmpty>
                    <CommandGroup>
                      {(equipmentList ?? []).map((eq) => {
                        const isSelected = selectedEquipmentIds.includes(eq._id as Id<"gabinetEquipment">);
                        return (
                          <CommandItem
                            key={eq._id}
                            value={eq.name}
                            onSelect={() => {
                              toggleEquipment(eq._id as Id<"gabinetEquipment">);
                              setEquipmentOpen(false);
                            }}
                          >
                            <div
                              className={cn(
                                "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                isSelected
                                  ? "bg-primary text-primary-foreground"
                                  : "opacity-50 [&_svg]:invisible"
                              )}
                            >
                              <Check className="h-4 w-4" />
                            </div>
                            <span>{eq.name}</span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                    <CommandSeparator />
                    <CommandGroup>
                      <CommandItem
                        value="__add_new_equipment__"
                        onSelect={() => setAddingNewEquipment(true)}
                        className="text-primary"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        <span>{t("gabinet.equipment.addEquipment")}</span>
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              )}
            </PopoverContent>
          </Popover>
          {renderFieldError("requiredEquipmentIds")}
          {hasLegacyEquipment && (
            <p className="text-xs text-muted-foreground">
              {t("gabinet.treatments.legacyEquipment", "Legacy (text):")} {legacyEquipment.join(", ")}
            </p>
          )}
        </div>
      </div>

      {/* Preparaty do zabiegu */}
      <div className="space-y-3 border-t pt-4">
        <div>
          <Label className="text-sm font-medium">
            Preparaty do zabiegu
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Preparaty używane podczas jednej wizyty, np. ampułka, serum, krem znieczulający.
          </p>
        </div>

        {productLines.length > 0 && (
          <div className="space-y-2">
            {productLines.map((line, index) => {
              const selectedProduct = (treatmentProducts ?? []).find(
                (p) => p._id === line.productId,
              );
              return (
                <div
                  key={index}
                  className="flex flex-col gap-2 rounded-md border p-2 sm:flex-row sm:items-center"
                >
                  {/* Product picker */}
                  <Popover
                    open={productPickerOpen === index}
                    onOpenChange={(open) =>
                      setProductPickerOpen(open ? index : null)
                    }
                  >
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={productPickerOpen === index}
                        className="flex-1 justify-between font-normal min-w-0"
                      >
                        <span className="truncate">
                          {selectedProduct
                            ? selectedProduct.name
                            : <span className="text-muted-foreground">Wybierz preparat...</span>}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-72 p-0"
                      align="start"
                      style={{
                        maxHeight: "var(--radix-popover-content-available-height)",
                      }}
                    >
                      <Command>
                        <CommandInput placeholder="Szukaj preparatu..." />
                        <CommandList>
                          <CommandEmpty>Brak wyników.</CommandEmpty>
                          <CommandGroup>
                            {(treatmentProducts ?? []).map((product) => (
                              <CommandItem
                                key={product._id}
                                value={product.name}
                                onSelect={() => selectProduct(index, product._id)}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    line.productId === product._id
                                      ? "opacity-100"
                                      : "opacity-0",
                                  )}
                                />
                                <span className="truncate">{product.name}</span>
                                {product.stockUnit && (
                                  <span className="ml-auto text-xs text-muted-foreground shrink-0">
                                    {product.stockUnit}
                                  </span>
                                )}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>

                  {/* Quantity + unit + remove */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-muted-foreground">Ilość:</span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={line.quantity}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!Number.isNaN(val) && val >= 0) {
                          updateProductLine(index, { quantity: val });
                        }
                      }}
                      onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                      className="w-16 text-right"
                      aria-label="Ilość"
                    />
                    {line.unit ? (
                      <span className="text-sm text-muted-foreground min-w-[2rem]">{line.unit}</span>
                    ) : (
                      <span className="min-w-[2rem]" />
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive shrink-0"
                      onClick={() => removeProductLine(index)}
                      aria-label="Usuń preparat"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {productLines.length === 0 && (
          <p className="text-sm text-muted-foreground py-1">
            Brak przypisanych preparatów.
          </p>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addProductLine}
          className="w-full sm:w-auto"
        >
          <Plus className="mr-2 h-4 w-4" />
          Dodaj preparat
        </Button>
      </div>

      {/* Materiały jednorazowe / zużywalne */}
      <div className="space-y-3 border-t pt-4">
        <div>
          <Label className="text-sm font-medium">
            Materiały jednorazowe / zużywalne
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Materiały zużywane podczas jednej wizyty, np. igły, gaziki, rękawiczki.
          </p>
        </div>

        {materialLines.length > 0 && (
          <div className="space-y-2">
            {materialLines.map((line, index) => {
              const selectedMaterial = (disposableProducts ?? []).find(
                (p) => p._id === line.productId,
              );
              return (
                <div
                  key={index}
                  className="flex flex-col gap-2 rounded-md border p-2 sm:flex-row sm:items-center"
                >
                  {/* Material picker */}
                  <Popover
                    open={materialPickerOpen === index}
                    onOpenChange={(open) =>
                      setMaterialPickerOpen(open ? index : null)
                    }
                  >
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={materialPickerOpen === index}
                        className="flex-1 justify-between font-normal min-w-0"
                      >
                        <span className="truncate">
                          {selectedMaterial
                            ? selectedMaterial.name
                            : <span className="text-muted-foreground">Wybierz materiał...</span>}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-72 p-0"
                      align="start"
                      style={{
                        maxHeight: "var(--radix-popover-content-available-height)",
                      }}
                    >
                      <Command>
                        <CommandInput placeholder="Szukaj materiału..." />
                        <CommandList>
                          <CommandEmpty>Brak wyników.</CommandEmpty>
                          <CommandGroup>
                            {(disposableProducts ?? []).map((product) => (
                              <CommandItem
                                key={product._id}
                                value={product.name}
                                onSelect={() => selectMaterial(index, product._id)}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    line.productId === product._id
                                      ? "opacity-100"
                                      : "opacity-0",
                                  )}
                                />
                                <span className="truncate">{product.name}</span>
                                {product.stockUnit && (
                                  <span className="ml-auto text-xs text-muted-foreground shrink-0">
                                    {product.stockUnit}
                                  </span>
                                )}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>

                  {/* Quantity + unit + remove */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-muted-foreground">Ilość:</span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={line.quantity}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!Number.isNaN(val) && val >= 0) {
                          updateMaterialLine(index, { quantity: val });
                        }
                      }}
                      onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
                      className="w-16 text-right"
                      aria-label="Ilość"
                    />
                    {line.unit ? (
                      <span className="text-sm text-muted-foreground min-w-[2rem]">{line.unit}</span>
                    ) : (
                      <span className="min-w-[2rem]" />
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive shrink-0"
                      onClick={() => removeMaterialLine(index)}
                      aria-label="Usuń materiał"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {materialLines.length === 0 && (
          <p className="text-sm text-muted-foreground py-1">
            Brak przypisanych materiałów.
          </p>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addMaterialLine}
          className="w-full sm:w-auto"
        >
          <Plus className="mr-2 h-4 w-4" />
          Dodaj materiał
        </Button>
      </div>

      <div className="space-y-4 border-t pt-4">
        <div className="space-y-1.5">
          <Label>
            {t("gabinet.treatments.requiredDocuments", "Wymagane dokumenty")}
          </Label>
          <TreatmentRequiredDocumentsField
            organizationId={organizationId}
            value={requiredFormTemplates}
            onChange={setRequiredFormTemplates}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("gabinet.treatments.notes", "Uwagi / Notatki")}</Label>
          <RichTextEditor
            value={notes}
            onChange={(v) => setNotes(v ?? "")}
            minHeight="80px"
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

      {children}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
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
