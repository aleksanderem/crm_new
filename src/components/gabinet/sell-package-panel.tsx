import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { SidePanel } from "@/components/crm/side-panel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "@/lib/ez-icons";
import { useSupabaseGabinetTreatmentPackagesList } from "@/hooks/use-supabase-gabinet-packages";
import { useSupabaseGabinetPatientsList } from "@/hooks/use-supabase-gabinet-patients";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { formatActionError } from "@/lib/format-action-error";

interface SellPackagePanelProps {
  organizationId: Id<"organizations">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SellPackagePanel({
  organizationId,
  open,
  onOpenChange,
}: SellPackagePanelProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const purchasePackage = useAction(api.gabinet.packages.purchasePackage);
  const createPayment = useAction(api.payments.create);

  const { data: packagesData } = useSupabaseGabinetTreatmentPackagesList(organizationId);
  const { data: patientsData } = useSupabaseGabinetPatientsList(organizationId);

  const [patientId, setPatientId] = useState<string>("");
  const [packageId, setPackageId] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [submitting, setSubmitting] = useState(false);

  const reset = useCallback(() => {
    setPatientId("");
    setPackageId("");
    setPaymentMethod("cash");
  }, []);

  const handleSubmit = async () => {
    if (!patientId || !packageId) return;
    const pkg = (packagesData ?? []).find((p) => p._id === packageId);
    if (!pkg) return;
    setSubmitting(true);
    try {
      const usageId = await purchasePackage({
        organizationId,
        patientId,
        packageId,
        paidAmount: pkg.totalPrice,
        paymentMethod,
      });
      await createPayment({
        organizationId,
        patientId,
        packageUsageId: usageId,
        amount: pkg.totalPrice,
        currency: pkg.currency ?? "PLN",
        paymentMethod: paymentMethod as "cash" | "card" | "transfer",
        notes: `Package: ${pkg.name}`,
      });
      toast.success(t("gabinet.packages.purchased"));
      void queryClient.invalidateQueries({
        queryKey: supabaseKeys.gabinetTreatmentPackages.list(organizationId),
      });
      void queryClient.invalidateQueries({
        queryKey: supabaseKeys.gabinetPackageUsage.list(organizationId),
      });
      onOpenChange(false);
      reset();
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.packages.errors.purchaseFailed",
          defaultValue: "Nie udało się sprzedać pakietu.",
        }),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SidePanel
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
      title={t("nav.actions.assignPackage")}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>{t("gabinet.packages.selectPatient", "Patient")}</Label>
          <Select value={patientId} onValueChange={setPatientId}>
            <SelectTrigger>
              <SelectValue
                placeholder={t(
                  "gabinet.packages.selectPatientPlaceholder",
                  "Select a patient...",
                )}
              />
            </SelectTrigger>
            <SelectContent>
              {(patientsData ?? []).map((p) => (
                <SelectItem key={p._id} value={p._id}>
                  {p.firstName} {p.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>{t("gabinet.packages.selectPackage")}</Label>
          <Select value={packageId} onValueChange={setPackageId}>
            <SelectTrigger>
              <SelectValue
                placeholder={t("gabinet.packages.selectPackagePlaceholder")}
              />
            </SelectTrigger>
            <SelectContent>
              {(packagesData ?? [])
                .filter((p) => p.isActive)
                .map((pkg) => (
                  <SelectItem key={pkg._id} value={pkg._id}>
                    {pkg.name} — {pkg.totalPrice} {pkg.currency ?? "PLN"}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>{t("gabinet.packages.paymentMethod")}</Label>
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">
                {t("gabinet.packages.paymentMethods.cash")}
              </SelectItem>
              <SelectItem value="card">
                {t("gabinet.packages.paymentMethods.card")}
              </SelectItem>
              <SelectItem value="transfer">
                {t("gabinet.packages.paymentMethods.transfer")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          className="w-full"
          disabled={!patientId || !packageId || submitting}
          onClick={handleSubmit}
        >
          {submitting && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" variant="stroke" />
          )}
          {t("gabinet.packages.purchaseButton")}
        </Button>
      </div>
    </SidePanel>
  );
}
