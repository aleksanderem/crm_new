import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/gabinet/rich-text-editor";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown } from "@/lib/ez-icons";
import { cn } from "@/lib/utils";
import type { Id } from "@cvx/_generated/dataModel";

export interface TreatmentFormData {
  name: string;
  description?: string;
  duration: number;
  price: number;
  currency?: string;
  taxRate?: number;
  requiredEquipment?: string[];
  requiredEquipmentIds?: Id<"gabinetEquipment">[];
  contraindications?: string;
  preparationInstructions?: string;
  aftercareInstructions?: string;
  requiresApproval?: boolean;
  color?: string;
  sortOrder?: number;
  treatmentCount?: number;
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
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [duration, setDuration] = useState(String(initialData?.duration ?? ""));
  const [price, setPrice] = useState(String(initialData?.price ?? ""));
  const [currency, setCurrency] = useState(initialData?.currency ?? "PLN");
  const [taxRate, setTaxRate] = useState(String(initialData?.taxRate ?? "23"));
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<Id<"gabinetEquipment">[]>(
    initialData?.requiredEquipmentIds ?? []
  );
  const [equipmentOpen, setEquipmentOpen] = useState(false);
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
  const [treatmentCount, setTreatmentCount] = useState(String(initialData?.treatmentCount ?? ""));

  const listEquipmentAction = useAction(api.gabinet.equipment.listEquipment);
  const { data: equipmentList } = useQuery({
    queryKey: ["gabinet.equipment.listEquipment", organizationId],
    queryFn: () => listEquipmentAction({ organizationId }),
    enabled: !!organizationId,
  });

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    onSubmit({
      name,
      description: description || undefined,
      duration: parseInt(duration) || 30,
      price: parseFloat(price) || 0,
      currency: currency || undefined,
      taxRate: parseFloat(taxRate) || undefined,
      requiredEquipmentIds: selectedEquipmentIds.length > 0 ? selectedEquipmentIds : undefined,
      contraindications: contraindications || undefined,
      preparationInstructions: preparationInstructions || undefined,
      aftercareInstructions: aftercareInstructions || undefined,
      requiresApproval: requiresApproval || undefined,
      color: color || undefined,
      sortOrder: parseInt(sortOrder) || undefined,
      treatmentCount: parseInt(treatmentCount) > 1 ? parseInt(treatmentCount) : undefined,
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
          {categorySelector}
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
        <div className="space-y-1.5">
          <Label>{t("gabinet.treatments.treatmentCount", "Liczba zabiegów")}</Label>
          <Input
            type="number"
            min="1"
            value={treatmentCount}
            onChange={(e) => setTreatmentCount(e.target.value)}
            placeholder="1"
          />
          <p className="text-xs text-muted-foreground">
            {t("gabinet.treatments.treatmentCountHint", "Ilość zabiegów w cyklu (np. 20). Automatycznie tworzy pakiet przy pierwszej wizycie.")}
          </p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t("common.description")}</Label>
          <RichTextEditor
            value={description}
            onChange={(v) => setDescription(v ?? "")}
            minHeight="80px"
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
          <Popover open={equipmentOpen} onOpenChange={setEquipmentOpen}>
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
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
              <Command>
                <CommandInput placeholder={t("gabinet.treatments.searchEquipment", "Search equipment...")} />
                <CommandList>
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
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {hasLegacyEquipment && (
            <p className="text-xs text-muted-foreground">
              {t("gabinet.treatments.legacyEquipment", "Legacy (text):")} {legacyEquipment.join(", ")}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>{t("gabinet.treatments.contraindications")}</Label>
          <RichTextEditor
            value={contraindications}
            onChange={(v) => setContraindications(v ?? "")}
            minHeight="80px"
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("gabinet.treatments.preparationInstructions")}</Label>
          <RichTextEditor
            value={preparationInstructions}
            onChange={(v) => setPreparationInstructions(v ?? "")}
            minHeight="80px"
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("gabinet.treatments.aftercareInstructions")}</Label>
          <RichTextEditor
            value={aftercareInstructions}
            onChange={(v) => setAftercareInstructions(v ?? "")}
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
