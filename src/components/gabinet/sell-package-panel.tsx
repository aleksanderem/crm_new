import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { SidePanel } from "@/components/crm/side-panel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
import { useSupabaseGabinetTreatmentsList } from "@/hooks/use-supabase-gabinet-treatments";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { formatActionError } from "@/lib/format-action-error";
import { formatCurrencyPLN } from "@/lib/format-currency";
import { cn } from "@/lib/utils";

type PaymentMethod = "cash" | "card" | "transfer" | "other";

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
  const { data: treatmentsData } = useSupabaseGabinetTreatmentsList(organizationId);

  const treatmentMap = useMemo(
    () => new Map((treatmentsData ?? []).map((tr) => [tr._id, tr.name])),
    [treatmentsData],
  );

  const [patientId, setPatientId] = useState<string>("");
  const [packageId, setPackageId] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [splitPayment, setSplitPayment] = useState(false);
  const [firstSplitMethod, setFirstSplitMethod] = useState<PaymentMethod>("cash");
  const [secondSplitMethod, setSecondSplitMethod] = useState<PaymentMethod>("card");
  const [firstSplitAmount, setFirstSplitAmount] = useState<string>("");
  const [secondSplitAmount, setSecondSplitAmount] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const selectedPkg = useMemo(
    () => (packagesData ?? []).find((p) => p._id === packageId),
    [packagesData, packageId],
  );

  const parsedFirstSplit = Number.parseFloat(firstSplitAmount.replace(",", ".")) || 0;
  const parsedSecondSplit = Number.parseFloat(secondSplitAmount.replace(",", ".")) || 0;
  const splitTotal = Math.round((parsedFirstSplit + parsedSecondSplit) * 100) / 100;
  const splitExpectedTotal = selectedPkg
    ? Math.round(selectedPkg.totalPrice * 100) / 100
    : 0;
  const splitMismatch = splitPayment && !!selectedPkg && splitTotal !== splitExpectedTotal;
  const splitMissingAmount = splitPayment && parsedFirstSplit <= 0 && parsedSecondSplit <= 0;
  const splitSameMethod = splitPayment && firstSplitMethod === secondSplitMethod;

  const reset = useCallback(() => {
    setPatientId("");
    setPackageId("");
    setPaymentMethod("cash");
    setSplitPayment(false);
    setFirstSplitMethod("cash");
    setSecondSplitMethod("card");
    setFirstSplitAmount("");
    setSecondSplitAmount("");
  }, []);

  const handleSubmit = async () => {
    if (!patientId || !packageId || !selectedPkg) return;
    if (splitPayment) {
      if (splitMissingAmount) {
        toast.error(
          t(
            "gabinet.packages.splitMissingAmount",
            "Podaj kwotę co najmniej jednej metody płatności",
          ),
        );
        return;
      }
      if (splitMismatch) {
        toast.error(
          t(
            "gabinet.packages.splitMismatchError",
            "Suma rozdzielonych płatności musi być równa cenie pakietu",
          ),
        );
        return;
      }
      if (splitSameMethod) {
        toast.error(
          t(
            "gabinet.packages.splitSameMethodError",
            "Wybierz dwie różne metody płatności",
          ),
        );
        return;
      }
    }
    setSubmitting(true);
    try {
      const currency = selectedPkg.currency ?? "PLN";
      const usagePaymentMethod = splitPayment ? "split" : paymentMethod;
      const usageId = await purchasePackage({
        organizationId,
        patientId,
        packageId,
        paidAmount: selectedPkg.totalPrice,
        paymentMethod: usagePaymentMethod,
      });

      if (splitPayment) {
        const parts: Array<{ method: PaymentMethod; amount: number }> = [];
        if (parsedFirstSplit > 0)
          parts.push({ method: firstSplitMethod, amount: parsedFirstSplit });
        if (parsedSecondSplit > 0)
          parts.push({ method: secondSplitMethod, amount: parsedSecondSplit });
        for (const part of parts) {
          await createPayment({
            organizationId,
            patientId: patientId as Id<"gabinetPatients">,
            packageUsageId: usageId,
            amount: part.amount,
            currency,
            paymentMethod: part.method,
            notes: `Package: ${selectedPkg.name} (split: ${part.method})`,
          });
        }
      } else {
        await createPayment({
          organizationId,
          patientId,
          packageUsageId: usageId,
          amount: selectedPkg.totalPrice,
          currency,
          paymentMethod,
          notes: `Package: ${selectedPkg.name}`,
        });
      }
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

        {selectedPkg && (
          <div className="rounded-lg border p-3 space-y-2 text-sm">
            <p className="font-medium">{selectedPkg.name}</p>
            <div className="space-y-1">
              {selectedPkg.treatments.map((tr) => (
                <div
                  key={tr.treatmentId}
                  className="flex items-center justify-between text-xs"
                >
                  <span>{treatmentMap.get(tr.treatmentId) ?? t("common.unknown")}</span>
                  <span className="text-muted-foreground">&times;{tr.quantity}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t pt-1">
              <span>{t("gabinet.packages.totalPrice")}</span>
              <span className="font-bold">
                {formatCurrencyPLN(selectedPkg.totalPrice, selectedPkg.currency ?? "PLN")}
              </span>
            </div>
            {selectedPkg.validityDays && (
              <p className="text-xs text-muted-foreground">
                {t("gabinet.packages.validFor", "Ważny przez")}{" "}
                {selectedPkg.validityDays}{" "}
                {t("gabinet.packages.days", "dni")}
              </p>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label>{t("gabinet.packages.paymentMethod")}</Label>
          <Select
            value={paymentMethod}
            onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
            disabled={splitPayment}
          >
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

        <Label
          htmlFor="sell-package-split-payment"
          className="-mx-2 flex min-h-11 select-none items-center gap-3 rounded-md px-2 py-2.5 cursor-pointer text-sm font-normal transition-colors hover:bg-accent/40 active:bg-accent"
        >
          <Checkbox
            id="sell-package-split-payment"
            checked={splitPayment}
            onCheckedChange={(v) => setSplitPayment(v === true)}
          />
          {t("gabinet.packages.splitPayment", "Podziel płatność")}
        </Label>

        {splitPayment && (
          <div className="rounded-lg border p-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border p-2 space-y-2">
                <Label className="text-xs font-medium">
                  {t("gabinet.packages.firstMethod", "Pierwsza metoda")}
                </Label>
                <Select
                  value={firstSplitMethod}
                  onValueChange={(v) => setFirstSplitMethod(v as PaymentMethod)}
                >
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
                    <SelectItem value="other">
                      {t("gabinet.packages.paymentMethods.other", "Inna")}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={firstSplitAmount}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
                      setFirstSplitAmount(v);
                    }
                  }}
                />
              </div>
              <div className="rounded-md border p-2 space-y-2">
                <Label className="text-xs font-medium">
                  {t("gabinet.packages.secondMethod", "Druga metoda")}
                </Label>
                <Select
                  value={secondSplitMethod}
                  onValueChange={(v) => setSecondSplitMethod(v as PaymentMethod)}
                >
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
                    <SelectItem value="other">
                      {t("gabinet.packages.paymentMethods.other", "Inna")}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={secondSplitAmount}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
                      setSecondSplitAmount(v);
                    }
                  }}
                />
              </div>
            </div>
            <div
              className={cn(
                "flex items-center justify-between text-xs",
                splitMismatch || splitSameMethod
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
            >
              <span>
                {t("gabinet.packages.splitSum", "Suma")}: {splitTotal.toFixed(2)}
                {selectedPkg
                  ? ` / ${formatCurrencyPLN(splitExpectedTotal, selectedPkg.currency ?? "PLN")}`
                  : ""}
              </span>
              {splitSameMethod ? (
                <span>
                  {t("gabinet.packages.splitSameMethod", "Metody muszą się różnić")}
                </span>
              ) : splitMismatch ? (
                <span>
                  {t("gabinet.packages.splitMismatch", "Musi się zgadzać z ceną")}
                </span>
              ) : null}
            </div>
          </div>
        )}

        <Button
          className="w-full"
          disabled={
            !patientId ||
            !packageId ||
            submitting ||
            (splitPayment && (splitMissingAmount || splitMismatch || splitSameMethod))
          }
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
