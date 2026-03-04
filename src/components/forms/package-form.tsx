import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
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
import { Plus, Trash2 } from "@/lib/ez-icons";

export interface PackageFormData {
  name: string;
  description?: string;
  totalPrice: number;
  validityDays?: number;
  discountPercent?: number;
  loyaltyPointsAwarded?: number;
  treatments: Array<{ treatmentId: Id<"gabinetTreatments">; quantity: number }>;
}

interface PackageFormProps {
  initialData?: Partial<PackageFormData>;
  onSubmit: (data: PackageFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function PackageForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: PackageFormProps) {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();

  const { data: treatments } = useQuery(
    convexQuery(api.gabinet.treatments.listActive, { organizationId })
  );

  const [name, setName] = useState(initialData?.name ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [totalPrice, setTotalPrice] = useState(String(initialData?.totalPrice ?? ""));
  const [validityDays, setValidityDays] = useState(
    initialData?.validityDays ? String(initialData.validityDays) : ""
  );
  const [discountPercent, setDiscountPercent] = useState(
    initialData?.discountPercent ? String(initialData.discountPercent) : ""
  );
  const [loyaltyPoints, setLoyaltyPoints] = useState(
    initialData?.loyaltyPointsAwarded ? String(initialData.loyaltyPointsAwarded) : ""
  );
  const [selectedTreatments, setSelectedTreatments] = useState<
    Array<{ treatmentId: string; quantity: number }>
  >(initialData?.treatments?.map((t) => ({ treatmentId: t.treatmentId, quantity: t.quantity })) ?? []);

  const addTreatment = () => {
    if (treatments && treatments.length > 0) {
      setSelectedTreatments((prev) => [
        ...prev,
        { treatmentId: treatments[0]._id, quantity: 1 },
      ]);
    }
  };

  const removeTreatment = (index: number) => {
    setSelectedTreatments((prev) => prev.filter((_, i) => i !== index));
  };

  const updateTreatment = (
    index: number,
    field: "treatmentId" | "quantity",
    value: string | number
  ) => {
    setSelectedTreatments((prev) =>
      prev.map((t, i) => (i === index ? { ...t, [field]: value } : t))
    );
  };

  // Calculate suggested price based on selected treatments
  const suggestedPrice = useMemo(() => {
    if (!treatments) return 0;
    return selectedTreatments.reduce((sum, st) => {
      const tr = treatments.find((t) => t._id === st.treatmentId);
      return sum + (tr?.price ?? 0) * st.quantity;
    }, 0);
  }, [treatments, selectedTreatments]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !totalPrice || selectedTreatments.length === 0) return;

    onSubmit({
      name,
      description: description || undefined,
      totalPrice: parseFloat(totalPrice),
      validityDays: validityDays ? parseInt(validityDays) : undefined,
      discountPercent: discountPercent ? parseFloat(discountPercent) : undefined,
      loyaltyPointsAwarded: loyaltyPoints ? parseInt(loyaltyPoints) : undefined,
      treatments: selectedTreatments.map((t) => ({
        treatmentId: t.treatmentId as Id<"gabinetTreatments">,
        quantity: t.quantity,
      })),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>
            {t("gabinet.packages.name")} <span className="text-destructive">*</span>
          </Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("gabinet.packages.namePlaceholder")}
            required
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t("gabinet.packages.description")}</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder={t("gabinet.packages.descriptionPlaceholder")}
          />
        </div>
        <div className="space-y-1.5">
          <Label>
            {t("gabinet.packages.totalPrice")} <span className="text-destructive">*</span>
          </Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={totalPrice}
            onChange={(e) => setTotalPrice(e.target.value)}
            placeholder="0.00"
            required
          />
          {suggestedPrice > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("gabinet.packages.suggestedPrice")}: {suggestedPrice.toFixed(2)} zł
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>{t("gabinet.packages.validityDays")}</Label>
          <Input
            type="number"
            min="1"
            value={validityDays}
            onChange={(e) => setValidityDays(e.target.value)}
            placeholder={t("gabinet.packages.validityDaysPlaceholder")}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("gabinet.packages.discountPercent")}</Label>
          <Input
            type="number"
            min="0"
            max="100"
            value={discountPercent}
            onChange={(e) => setDiscountPercent(e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("gabinet.packages.loyaltyPoints")}</Label>
          <Input
            type="number"
            min="0"
            value={loyaltyPoints}
            onChange={(e) => setLoyaltyPoints(e.target.value)}
            placeholder="0"
          />
        </div>
      </div>

      {/* Treatments list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>
            {t("gabinet.packages.treatments")} <span className="text-destructive">*</span>
          </Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addTreatment}
            disabled={!treatments?.length}
          >
            <Plus className="mr-1 h-[17px] w-[17px]" variant="stroke" />
            {t("common.add")}
          </Button>
        </div>

        {selectedTreatments.length === 0 && (
          <p className="text-sm text-muted-foreground py-2">
            {t("gabinet.packages.noTreatments")}
          </p>
        )}

        {selectedTreatments.map((st, index) => {
          // tr available for future use (e.g., showing treatment details)
          return (
            <div key={index} className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t("gabinet.packages.treatment")}
                </Label>
                <Select
                  value={st.treatmentId}
                  onValueChange={(v) => updateTreatment(index, "treatmentId", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {treatments?.map((t) => (
                      <SelectItem key={t._id} value={t._id}>
                        {t.name} ({t.duration} min · {t.price} zł)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-20 space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t("gabinet.packages.quantity")}
                </Label>
                <Input
                  type="number"
                  min="1"
                  value={st.quantity}
                  onChange={(e) =>
                    updateTreatment(index, "quantity", parseInt(e.target.value) || 1)
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeTreatment(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          );
        })}

        {selectedTreatments.length > 0 && (
          <div className="text-sm text-muted-foreground border-t pt-3">
            {t("gabinet.packages.totalSessions")}:{" "}
            {selectedTreatments.reduce((sum, st) => sum + st.quantity, 0)}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button
          type="submit"
          disabled={!name.trim() || !totalPrice || selectedTreatments.length === 0 || isSubmitting}
        >
          {isSubmitting
            ? t("common.saving")
            : initialData
              ? t("common.save")
              : t("gabinet.packages.create")}
        </Button>
      </div>
    </form>
  );
}
