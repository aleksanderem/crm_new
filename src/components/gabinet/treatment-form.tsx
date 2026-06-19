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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Check, ChevronsUpDown, Plus } from "@/lib/ez-icons";
import { cn } from "@/lib/utils";
import { formatActionError } from "@/lib/format-action-error";
import {
  TreatmentRequiredDocumentsField,
  type RequiredFormTemplateValue,
} from "@/components/documents/treatment-required-documents-field";
import type { Id } from "@cvx/_generated/dataModel";

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
}

interface TreatmentFormProps {
  organizationId: Id<"organizations">;
  initialData?: Partial<TreatmentFormData>;
  onSubmit: (data: TreatmentFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  categorySelector?: React.ReactNode;
  children?: React.ReactNode;
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

  const { data: packagesList } =
    useSupabaseGabinetTreatmentPackagesActive(organizationId);

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

    onSubmit({
      name,
      description: notes || null,
      duration: parseInt(duration) || 30,
      price: parseFloat(price.replace(",", ".")) || 0,
      currency: currency || undefined,
      taxRate: numericTaxRate,
      taxExempt: isExempt ? true : false,
      requiredEquipmentIds: selectedEquipmentIds.length > 0 ? selectedEquipmentIds : undefined,
      contraindications: initialData?.contraindications ?? null,
      preparationInstructions: initialData?.preparationInstructions ?? null,
      aftercareInstructions: initialData?.aftercareInstructions ?? null,
      requiresApproval: requiresApproval || undefined,
      color: initialData?.color ?? null,
      packageId: isPackage && selectedPackageId ? selectedPackageId : null,
      requiredFormTemplates,
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
            onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
            placeholder="30"
            required
          />
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
              <SelectTrigger>
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
                            onSelect={() => toggleEquipment(eq._id as Id<"gabinetEquipment">)}
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
          {hasLegacyEquipment && (
            <p className="text-xs text-muted-foreground">
              {t("gabinet.treatments.legacyEquipment", "Legacy (text):")} {legacyEquipment.join(", ")}
            </p>
          )}
        </div>
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
