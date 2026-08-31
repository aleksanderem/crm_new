import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TFunction } from "i18next";
import type { MappedGabinetAppointment } from "@/lib/supabase/mappers/gabinet/appointments";

type PaymentMethod = "cash" | "card" | "transfer" | "package" | "gratis" | "barter" | "other";

export function EditPaymentDialog({
  editingPaymentId,
  paymentEditAmount,
  setPaymentEditAmount,
  paymentEditMethod,
  setPaymentEditMethod,
  paymentEditNotes,
  setPaymentEditNotes,
  paymentEditAppointmentId,
  paymentEditDiscountType,
  setPaymentEditDiscountType,
  paymentEditDiscountValue,
  setPaymentEditDiscountValue,
  paymentEditGratisReason,
  setPaymentEditGratisReason,
  paymentEditBarterDescription,
  setPaymentEditBarterDescription,
  isPaymentEditSubmitting,
  onClose,
  onSubmit,
  patientAppointments,
  getApptPrice,
  t,
}: {
  editingPaymentId: string | null;
  paymentEditAmount: string;
  setPaymentEditAmount: (v: string) => void;
  paymentEditMethod: PaymentMethod;
  setPaymentEditMethod: (v: PaymentMethod) => void;
  paymentEditNotes: string;
  setPaymentEditNotes: (v: string) => void;
  paymentEditAppointmentId: string | null;
  paymentEditDiscountType: "amount" | "percent";
  setPaymentEditDiscountType: (v: "amount" | "percent") => void;
  paymentEditDiscountValue: string;
  setPaymentEditDiscountValue: (v: string) => void;
  paymentEditGratisReason: string;
  setPaymentEditGratisReason: (v: string) => void;
  paymentEditBarterDescription: string;
  setPaymentEditBarterDescription: (v: string) => void;
  isPaymentEditSubmitting: boolean;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  patientAppointments: MappedGabinetAppointment[] | undefined;
  getApptPrice: (apt?: MappedGabinetAppointment | null) => number;
  t: TFunction;
}) {
  const isFixedAmount = paymentEditMethod === "gratis";

  return (
    <Dialog
      open={editingPaymentId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("gabinet.payments.editPayment")}</DialogTitle>
          <DialogDescription>
            {t("gabinet.payments.editPaymentDesc")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>{t("gabinet.payments.amount")}</Label>
            <Input
              type="text"
              inputMode="decimal"
              value={isFixedAmount ? "0.00" : paymentEditAmount}
              disabled={isFixedAmount}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
                  setPaymentEditAmount(v);
                }
              }}
              placeholder="0.00"
            />
            {isFixedAmount && (
              <p className="text-xs text-muted-foreground mt-1">
                {t("gabinet.payments.amountLockedToTreatment")}
              </p>
            )}
          </div>
          <div>
            <Label>{t("gabinet.payments.method")}</Label>
            <Select
              value={paymentEditMethod}
              onValueChange={(v) => {
                const method = v as PaymentMethod;
                setPaymentEditMethod(method);
                if (method !== "gratis") setPaymentEditGratisReason("");
                if (method !== "barter") setPaymentEditBarterDescription("");
                if (method === "gratis") setPaymentEditAmount("0");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">
                  {t("gabinet.payments.methods.cash")}
                </SelectItem>
                <SelectItem value="card">
                  {t("gabinet.payments.methods.card")}
                </SelectItem>
                <SelectItem value="transfer">
                  {t("gabinet.payments.methods.transfer")}
                </SelectItem>
                <SelectItem value="package">
                  {t("gabinet.payments.methods.package")}
                </SelectItem>
                <SelectItem value="gratis">
                  {t("gabinet.payments.methods.gratis")}
                </SelectItem>
                <SelectItem value="barter">
                  {t("gabinet.payments.methods.barter")}
                </SelectItem>
                <SelectItem value="other">
                  {t("gabinet.payments.methods.other")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {paymentEditMethod === "gratis" && (
            <div>
              <Label>{t("gabinet.payments.gratisReason", "Powód gratis")}</Label>
              <Input
                value={paymentEditGratisReason}
                onChange={(e) => setPaymentEditGratisReason(e.target.value)}
                placeholder={t(
                  "gabinet.payments.gratisReasonPlaceholder",
                  "Np. reklamacja, promocja, upominek...",
                )}
              />
            </div>
          )}
          {paymentEditMethod === "barter" && (
            <div>
              <Label>{t("gabinet.payments.barterDescription", "Opis barteru")}</Label>
              <Input
                value={paymentEditBarterDescription}
                onChange={(e) => setPaymentEditBarterDescription(e.target.value)}
                placeholder={t(
                  "gabinet.payments.barterDescriptionPlaceholder",
                  "Np. współpraca Instagram, wymiana usług...",
                )}
              />
            </div>
          )}
          {paymentEditAppointmentId &&
            paymentEditMethod !== "gratis" &&
            paymentEditMethod !== "barter" &&
            (() => {
              const apt = (patientAppointments ?? []).find(
                (a) => a._id === paymentEditAppointmentId,
              );
              const treatmentPrice = getApptPrice(apt);
              if (treatmentPrice <= 0) return null;
              return (
                <div>
                  <Label>{t("gabinet.payments.discount")}</Label>
                  <div className="flex gap-2 mt-1">
                    <Select
                      value={paymentEditDiscountType}
                      onValueChange={(v) => {
                        setPaymentEditDiscountType(v as "amount" | "percent");
                        setPaymentEditDiscountValue("");
                        setPaymentEditAmount(treatmentPrice.toFixed(2));
                      }}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="amount">
                          {t("gabinet.payments.discountTypeAmount")}
                        </SelectItem>
                        <SelectItem value="percent">
                          {t("gabinet.payments.discountTypePercent")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="relative flex-1">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={paymentEditDiscountValue}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
                            setPaymentEditDiscountValue(v);
                            const parsed =
                              parseFloat(v.replace(",", ".")) || 0;
                            const disc =
                              paymentEditDiscountType === "amount"
                                ? Math.min(parsed, treatmentPrice)
                                : Math.round(
                                    ((treatmentPrice * Math.min(parsed, 100)) /
                                      100) *
                                      100,
                                  ) / 100;
                            setPaymentEditAmount(
                              Math.max(0, treatmentPrice - disc).toFixed(2),
                            );
                          }
                        }}
                        placeholder={
                          paymentEditDiscountType === "percent" ? "0" : "0.00"
                        }
                        className={
                          paymentEditDiscountType === "percent" ? "pr-8" : ""
                        }
                      />
                      {paymentEditDiscountType === "percent" && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                          %
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          <div>
            <Label>{t("common.notes")}</Label>
            <Input
              type="text"
              value={paymentEditNotes}
              onChange={(e) => setPaymentEditNotes(e.target.value)}
              placeholder={t("gabinet.payments.notePlaceholder")}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={onSubmit} disabled={isPaymentEditSubmitting}>
            {isPaymentEditSubmitting ? t("common.processing") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
