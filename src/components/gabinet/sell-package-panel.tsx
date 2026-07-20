import { useMemo, useState } from "react";
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
import { usePackagePaymentForm } from "@/hooks/use-package-payment-form";
import { PackageSplitPaymentSection } from "./package-split-payment-section";

interface SellPackagePanelProps {
  organizationId: Id<"organizations">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SaleMode = "patient" | "gift";

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

  const [saleMode, setSaleMode] = useState<SaleMode>("patient");
  const [patientId, setPatientId] = useState<string>("");
  const [packageId, setPackageId] = useState<string>("");
  const [giftRecipientName, setGiftRecipientName] = useState("");
  const [giftRecipientPhone, setGiftRecipientPhone] = useState("");
  const [giftRecipientEmail, setGiftRecipientEmail] = useState("");

  const selectedPkg = useMemo(
    () => (packagesData ?? []).find((p) => p._id === packageId),
    [packagesData, packageId],
  );

  const {
    paymentMethod,
    setPaymentMethod,
    splitPayment,
    setSplitPayment,
    firstSplitMethod,
    setFirstSplitMethod,
    secondSplitMethod,
    setSecondSplitMethod,
    firstSplitAmount,
    setFirstSplitAmount,
    secondSplitAmount,
    setSecondSplitAmount,
    submitting,
    setSubmitting,
    parsedFirstSplit,
    parsedSecondSplit,
    splitTotal,
    splitExpectedTotal,
    splitMismatch,
    splitMissingAmount,
    splitSameMethod,
    resetPaymentForm,
  } = usePackagePaymentForm(selectedPkg?.totalPrice ?? 0);

  const reset = () => {
    setSaleMode("patient");
    setPatientId("");
    setPackageId("");
    setGiftRecipientName("");
    setGiftRecipientPhone("");
    setGiftRecipientEmail("");
    resetPaymentForm();
  };

  const handleSubmit = async () => {
    if (!packageId || !selectedPkg) return;
    if (saleMode === "patient" && !patientId) return;
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
      const isGift = saleMode === "gift";
      const usagePaymentMethod = splitPayment ? "split" : paymentMethod;
      const usageId = await purchasePackage({
        organizationId,
        patientId: isGift ? undefined : patientId,
        packageId,
        paidAmount: selectedPkg.totalPrice,
        paymentMethod: usagePaymentMethod,
        isGift,
        giftRecipientName: isGift && giftRecipientName ? giftRecipientName : undefined,
        giftRecipientPhone: isGift && giftRecipientPhone ? giftRecipientPhone : undefined,
        giftRecipientEmail: isGift && giftRecipientEmail ? giftRecipientEmail : undefined,
      });

      const paymentPatientId = isGift ? undefined : (patientId as Id<"gabinetPatients">);

      if (splitPayment) {
        const parts: Array<{ method: typeof firstSplitMethod; amount: number }> = [];
        if (parsedFirstSplit > 0)
          parts.push({ method: firstSplitMethod, amount: parsedFirstSplit });
        if (parsedSecondSplit > 0)
          parts.push({ method: secondSplitMethod, amount: parsedSecondSplit });
        for (const part of parts) {
          await createPayment({
            organizationId,
            patientId: paymentPatientId,
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
          patientId: paymentPatientId,
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

  const canSubmit =
    !!packageId &&
    !submitting &&
    (saleMode === "gift" || !!patientId) &&
    !(splitPayment && (splitMissingAmount || splitMismatch || splitSameMethod));

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
        {/* Sale mode toggle */}
        <div className="space-y-1.5">
          <Label>{t("gabinet.packages.saleMode", "Tryb sprzedaży")}</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={saleMode === "patient" ? "default" : "outline"}
              size="sm"
              onClick={() => setSaleMode("patient")}
            >
              {t("gabinet.packages.saleModePatient", "Istniejący klient")}
            </Button>
            <Button
              type="button"
              variant={saleMode === "gift" ? "default" : "outline"}
              size="sm"
              onClick={() => setSaleMode("gift")}
            >
              {t("gabinet.packages.saleModeGift", "Sprzedaj jako prezent")}
            </Button>
          </div>
        </div>

        {/* Patient selector — only in patient mode */}
        {saleMode === "patient" && (
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
        )}

        {/* Gift recipient details — only in gift mode */}
        {saleMode === "gift" && (
          <div className="rounded-lg border p-3 space-y-3">
            <p className="text-sm font-medium text-muted-foreground">
              {t("gabinet.packages.giftRecipientDetails", "Dane osoby obdarowanej (opcjonalnie)")}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="gift-recipient-name">
                {t("gabinet.packages.giftRecipientName", "Imię i nazwisko")}
              </Label>
              <Input
                id="gift-recipient-name"
                value={giftRecipientName}
                onChange={(e) => setGiftRecipientName(e.target.value)}
                placeholder={t("gabinet.packages.giftRecipientNamePlaceholder", "np. Jan Kowalski")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gift-recipient-phone">
                {t("gabinet.packages.giftRecipientPhone", "Numer telefonu")}
              </Label>
              <Input
                id="gift-recipient-phone"
                type="tel"
                value={giftRecipientPhone}
                onChange={(e) => setGiftRecipientPhone(e.target.value)}
                placeholder={t("gabinet.packages.giftRecipientPhonePlaceholder", "np. +48 123 456 789")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gift-recipient-email">
                {t("gabinet.packages.giftRecipientEmail", "Adres e-mail")}
              </Label>
              <Input
                id="gift-recipient-email"
                type="email"
                value={giftRecipientEmail}
                onChange={(e) => setGiftRecipientEmail(e.target.value)}
                placeholder={t("gabinet.packages.giftRecipientEmailPlaceholder", "np. jan@example.com")}
              />
            </div>
          </div>
        )}

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
            onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}
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
          <PackageSplitPaymentSection
            firstSplitMethod={firstSplitMethod}
            onFirstSplitMethodChange={setFirstSplitMethod}
            secondSplitMethod={secondSplitMethod}
            onSecondSplitMethodChange={setSecondSplitMethod}
            firstSplitAmount={firstSplitAmount}
            onFirstSplitAmountChange={setFirstSplitAmount}
            secondSplitAmount={secondSplitAmount}
            onSecondSplitAmountChange={setSecondSplitAmount}
            splitTotal={splitTotal}
            splitExpectedTotal={splitExpectedTotal}
            splitMismatch={splitMismatch}
            splitSameMethod={splitSameMethod}
            currency={selectedPkg?.currency ?? "PLN"}
          />
        )}

        <Button
          className="w-full"
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          {submitting && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" variant="stroke" />
          )}
          {saleMode === "gift"
            ? t("gabinet.packages.purchaseGiftButton", "Sprzedaj jako prezent")
            : t("gabinet.packages.purchaseButton")}
        </Button>
      </div>
    </SidePanel>
  );
}
