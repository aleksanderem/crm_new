import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "@/lib/ez-icons";

interface PackagePurchaseDrawerProps {
  patientId: string;
  organizationId: Id<"organizations">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PackagePurchaseDrawer({
  patientId,
  organizationId,
  open,
  onOpenChange,
}: PackagePurchaseDrawerProps) {
  const { t } = useTranslation();
  const purchasePackage = useAction(api.gabinet.packages.purchasePackage);
  const createPayment = useAction(api.payments.create);

  const [selectedPkgId, setSelectedPkgId] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [splitPayment, setSplitPayment] = useState(false);
  const [cashAmount, setCashAmount] = useState<string>("");
  const [cardAmount, setCardAmount] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const listActivePackages = useAction(api.gabinet.packages.listActive);
  const { data: activePackages } = useQuery({
    queryKey: ["gabinet.packages.listActive", organizationId],
    queryFn: () => listActivePackages({ organizationId }),
    enabled: !!organizationId,
  });

  const listActiveTreatments = useAction(api.gabinet.treatments.listActive);
  const { data: treatments } = useQuery({
    queryKey: ["gabinet.treatments.listActive", organizationId],
    queryFn: () => listActiveTreatments({ organizationId }),
    enabled: !!organizationId,
  });

  const treatmentMap = new Map(
    (treatments ?? []).map((tr) => [tr._id, tr.name])
  );

  const selectedPkg = (activePackages ?? []).find((p) => p._id === selectedPkgId);

  const parsedCash = Number.parseFloat(cashAmount) || 0;
  const parsedCard = Number.parseFloat(cardAmount) || 0;
  const splitTotal = Math.round((parsedCash + parsedCard) * 100) / 100;
  const expectedTotal = selectedPkg ? Math.round(selectedPkg.totalPrice * 100) / 100 : 0;
  const splitMismatch = splitPayment && selectedPkg && splitTotal !== expectedTotal;
  const splitMissingMethod = splitPayment && parsedCash <= 0 && parsedCard <= 0;

  const resetForm = () => {
    setSelectedPkgId("");
    setPaymentMethod("cash");
    setSplitPayment(false);
    setCashAmount("");
    setCardAmount("");
  };

  const handlePurchase = async () => {
    if (!selectedPkg) return;
    if (splitPayment) {
      if (splitMissingMethod) {
        toast.error(
          t(
            "gabinet.packages.splitMissingAmount",
            "Enter at least one payment amount",
          ),
        );
        return;
      }
      if (splitMismatch) {
        toast.error(
          t(
            "gabinet.packages.splitMismatchError",
            "Split payment amounts must add up to the total price",
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
        packageId: selectedPkg._id,
        paidAmount: selectedPkg.totalPrice,
        paymentMethod: usagePaymentMethod,
      });

      if (splitPayment) {
        const parts: Array<{ method: "cash" | "card"; amount: number }> = [];
        if (parsedCash > 0) parts.push({ method: "cash", amount: parsedCash });
        if (parsedCard > 0) parts.push({ method: "card", amount: parsedCard });
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
          patientId: patientId as Id<"gabinetPatients">,
          packageUsageId: usageId,
          amount: selectedPkg.totalPrice,
          currency,
          paymentMethod: paymentMethod as "cash" | "card" | "transfer",
          notes: `Package: ${selectedPkg.name}`,
        });
      }

      toast.success(t("gabinet.packages.purchased", "Package purchased successfully"));
      resetForm();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      resetForm();
    }
    onOpenChange(v);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("gabinet.packages.purchasePackage", "Purchase Package")}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <div className="space-y-1.5">
            <Label>{t("gabinet.packages.selectPackage", "Package")}</Label>
            <Select value={selectedPkgId} onValueChange={setSelectedPkgId}>
              <SelectTrigger>
                <SelectValue placeholder={t("gabinet.packages.selectPackagePlaceholder", "Select a package...")} />
              </SelectTrigger>
              <SelectContent>
                {(activePackages ?? []).map((pkg) => (
                  <SelectItem key={pkg._id} value={pkg._id}>
                    {pkg.name} — {pkg.totalPrice} {pkg.currency ?? "PLN"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedPkg && (
            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-sm font-medium">{selectedPkg.name}</p>
              {selectedPkg.description && (
                <p className="text-xs text-muted-foreground">{selectedPkg.description}</p>
              )}
              <div className="space-y-1">
                {selectedPkg.treatments.map((tr) => (
                  <div key={String(tr.treatmentId)} className="flex items-center justify-between text-xs">
                    <span>{treatmentMap.get(tr.treatmentId) ?? t("common.unknown")}</span>
                    <span className="text-muted-foreground">&times;{tr.quantity}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-1 border-t text-sm">
                <span className="font-medium">{t("gabinet.packages.totalPrice")}</span>
                <span className="font-bold">{selectedPkg.totalPrice} {selectedPkg.currency ?? "PLN"}</span>
              </div>
              {selectedPkg.validityDays && (
                <p className="text-xs text-muted-foreground">
                  {t("gabinet.packages.validFor", "Valid for")} {selectedPkg.validityDays} {t("gabinet.packages.days")}
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{t("gabinet.packages.paymentMethod", "Payment Method")}</Label>
            <Select
              value={paymentMethod}
              onValueChange={setPaymentMethod}
              disabled={splitPayment}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">{t("gabinet.packages.paymentMethods.cash", "Cash")}</SelectItem>
                <SelectItem value="card">{t("gabinet.packages.paymentMethods.card", "Card")}</SelectItem>
                <SelectItem value="transfer">{t("gabinet.packages.paymentMethods.transfer", "Transfer")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="split-payment"
              checked={splitPayment}
              onCheckedChange={(v) => setSplitPayment(v === true)}
            />
            <Label htmlFor="split-payment" className="cursor-pointer text-sm font-normal">
              {t("gabinet.packages.splitPayment", "Split payment between cash and card")}
            </Label>
          </div>

          {splitPayment && selectedPkg && (
            <div className="rounded-lg border p-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="split-cash" className="text-xs">
                    {t("gabinet.packages.paymentMethods.cash", "Cash")}
                  </Label>
                  <Input
                    id="split-cash"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={cashAmount}
                    onChange={(e) => setCashAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="split-card" className="text-xs">
                    {t("gabinet.packages.paymentMethods.card", "Card")}
                  </Label>
                  <Input
                    id="split-card"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={cardAmount}
                    onChange={(e) => setCardAmount(e.target.value)}
                  />
                </div>
              </div>
              <div
                className={`flex items-center justify-between text-xs ${
                  splitMismatch ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                <span>
                  {t("gabinet.packages.splitSum", "Sum")}: {splitTotal.toFixed(2)} /{" "}
                  {expectedTotal.toFixed(2)} {selectedPkg.currency ?? "PLN"}
                </span>
                {splitMismatch && (
                  <span>
                    {t("gabinet.packages.splitMismatch", "Must equal total")}
                  </span>
                )}
              </div>
            </div>
          )}

          <Button
            className="w-full"
            disabled={
              !selectedPkg ||
              submitting ||
              (splitPayment && (splitMissingMethod || !!splitMismatch))
            }
            onClick={handlePurchase}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("gabinet.packages.purchaseButton", "Purchase")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
