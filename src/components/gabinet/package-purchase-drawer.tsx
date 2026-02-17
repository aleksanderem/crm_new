import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  const purchasePackage = useMutation(api["gabinet/packages"].purchasePackage);
  const createPayment = useMutation(api.payments.create);

  const [selectedPkgId, setSelectedPkgId] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [submitting, setSubmitting] = useState(false);

  const { data: activePackages } = useQuery(
    convexQuery(api["gabinet/packages"].listActive, { organizationId })
  );

  const { data: treatments } = useQuery(
    convexQuery(api["gabinet/treatments"].listActive, { organizationId })
  );

  const treatmentMap = new Map(
    (treatments ?? []).map((tr) => [tr._id, tr.name])
  );

  const selectedPkg = (activePackages ?? []).find((p) => p._id === selectedPkgId);

  const handlePurchase = async () => {
    if (!selectedPkg) return;
    setSubmitting(true);
    try {
      const usageId = await purchasePackage({
        organizationId,
        patientId: patientId as Id<"gabinetPatients">,
        packageId: selectedPkg._id,
        paidAmount: selectedPkg.totalPrice,
        paymentMethod,
      });

      await createPayment({
        organizationId,
        patientId: patientId as Id<"gabinetPatients">,
        packageUsageId: usageId,
        amount: selectedPkg.totalPrice,
        currency: selectedPkg.currency ?? "PLN",
        paymentMethod: paymentMethod as "cash" | "card" | "transfer",
        notes: `Package: ${selectedPkg.name}`,
      });

      toast.success(t("gabinet.packages.purchased", "Package purchased successfully"));
      setSelectedPkgId("");
      setPaymentMethod("cash");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setSelectedPkgId("");
      setPaymentMethod("cash");
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
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
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

          <Button
            className="w-full"
            disabled={!selectedPkg || submitting}
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
