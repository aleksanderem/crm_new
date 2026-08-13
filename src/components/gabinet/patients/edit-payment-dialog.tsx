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
import type { MappedGabinetAppointment } from "@/lib/supabase/mappers/gabinet/appointments";

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
  paymentEditMethod: "cash" | "card" | "transfer" | "package" | "other";
  setPaymentEditMethod: (v: "cash" | "card" | "transfer" | "package" | "other") => void;
  paymentEditNotes: string;
  setPaymentEditNotes: (v: string) => void;
  paymentEditAppointmentId: string | null;
  paymentEditDiscountType: "amount" | "percent";
  setPaymentEditDiscountType: (v: "amount" | "percent") => void;
  paymentEditDiscountValue: string;
  setPaymentEditDiscountValue: (v: string) => void;
  isPaymentEditSubmitting: boolean;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  patientAppointments: MappedGabinetAppointment[] | undefined;
  getApptPrice: (apt?: MappedGabinetAppointment | null) => number;
  t: (key: string, opts?: Record<string, unknown> | string) => string;
}) {
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
              value={paymentEditAmount}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
                  setPaymentEditAmount(v);
                }
              }}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label>{t("gabinet.payments.method")}</Label>
            <Select
              value={paymentEditMethod}
              onValueChange={(v) =>
                setPaymentEditMethod(
                  v as "cash" | "card" | "transfer" | "package" | "other",
                )
              }
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
                <SelectItem value="other">
                  {t("gabinet.payments.methods.other")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {paymentEditAppointmentId &&
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
