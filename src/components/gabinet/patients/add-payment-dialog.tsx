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

type Payment = {
  appointmentId?: string;
  status: string;
  amount?: number;
  creditApplied?: number | null;
};

export function AddPaymentDialog({
  open,
  addPaymentAmount,
  setAddPaymentAmount,
  addPaymentMethod,
  setAddPaymentMethod,
  addPaymentNotes,
  setAddPaymentNotes,
  addPaymentAppointmentId,
  setAddPaymentAppointmentId,
  addPaymentDiscountType,
  setAddPaymentDiscountType,
  addPaymentDiscountValue,
  setAddPaymentDiscountValue,
  isAddPaymentSubmitting,
  onClose,
  onSubmit,
  patientAppointments,
  patientPayments,
  getApptTreatmentDisplay,
  getApptPrice,
  t,
}: {
  open: boolean;
  addPaymentAmount: string;
  setAddPaymentAmount: (v: string) => void;
  addPaymentMethod: "cash" | "card" | "transfer" | "other";
  setAddPaymentMethod: (v: "cash" | "card" | "transfer" | "other") => void;
  addPaymentNotes: string;
  setAddPaymentNotes: (v: string) => void;
  addPaymentAppointmentId: string;
  setAddPaymentAppointmentId: (v: string) => void;
  addPaymentDiscountType: "amount" | "percent";
  setAddPaymentDiscountType: (v: "amount" | "percent") => void;
  addPaymentDiscountValue: string;
  setAddPaymentDiscountValue: (v: string) => void;
  isAddPaymentSubmitting: boolean;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  patientAppointments: MappedGabinetAppointment[] | undefined;
  patientPayments: Payment[] | undefined;
  getApptTreatmentDisplay: (apt?: MappedGabinetAppointment | null) => string | undefined;
  getApptPrice: (apt?: MappedGabinetAppointment | null) => number;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("gabinet.payments.addPayment")}</DialogTitle>
          <DialogDescription>
            {t("gabinet.payments.addPaymentPatientDesc")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>{t("gabinet.payments.amount")}</Label>
            <Input
              type="text"
              inputMode="decimal"
              value={addPaymentAmount}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
                  setAddPaymentAmount(v);
                }
              }}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label>{t("gabinet.payments.method")}</Label>
            <Select
              value={addPaymentMethod}
              onValueChange={(v) =>
                setAddPaymentMethod(v as "cash" | "card" | "transfer" | "other")
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
                <SelectItem value="other">
                  {t("gabinet.payments.methods.other")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>
              {t("gabinet.payments.linkedAppointment")}{" "}
              <span className="text-xs text-muted-foreground">
                ({t("common.optional")})
              </span>
            </Label>
            <Select
              value={addPaymentAppointmentId || "none"}
              onValueChange={(v) => {
                setAddPaymentAppointmentId(v === "none" ? "" : v);
                setAddPaymentDiscountType("amount");
                setAddPaymentDiscountValue("");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  {t("gabinet.payments.noAppointmentToCredit")}
                </SelectItem>
                {(() => {
                  const today = new Date().toISOString().split("T")[0];
                  const upcoming = (patientAppointments ?? [])
                    .filter(
                      (a) =>
                        a.date >= today &&
                        a.status !== "cancelled" &&
                        a.status !== "no_show",
                    )
                    .sort((a, b) =>
                      (a.date + a.startTime).localeCompare(b.date + b.startTime),
                    )
                    .slice(0, 20);
                  return upcoming.map((apt) => {
                    const treatmentDisplayName =
                      getApptTreatmentDisplay(apt) ?? t("common.unknown");
                    return (
                      <SelectItem key={apt._id} value={apt._id}>
                        {apt.date} · {apt.startTime} · {treatmentDisplayName}
                      </SelectItem>
                    );
                  });
                })()}
              </SelectContent>
            </Select>
            {!addPaymentAppointmentId && (
              <p className="text-xs text-muted-foreground mt-1">
                {t("gabinet.payments.fullAmountToCreditHint")}
              </p>
            )}
          </div>
          {addPaymentAppointmentId &&
            (() => {
              const apt = (patientAppointments ?? []).find(
                (a) => a._id === addPaymentAppointmentId,
              );
              const aptTreatmentPrice = getApptPrice(apt);
              const paidForVisit = (patientPayments ?? [])
                .filter(
                  (p) =>
                    p.appointmentId === addPaymentAppointmentId &&
                    p.status === "completed",
                )
                .reduce(
                  (sum, p) =>
                    sum +
                    (p.amount ?? 0) +
                    ((p as { creditApplied?: number | null }).creditApplied ?? 0),
                  0,
                );
              const outstandingForVisit = Math.max(
                0,
                aptTreatmentPrice - paidForVisit,
              );
              if (outstandingForVisit <= 0) return null;
              return (
                <div>
                  <Label>{t("gabinet.payments.discount")}</Label>
                  <div className="flex gap-2 mt-1">
                    <Select
                      value={addPaymentDiscountType}
                      onValueChange={(v) => {
                        setAddPaymentDiscountType(v as "amount" | "percent");
                        setAddPaymentDiscountValue("");
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
                        value={addPaymentDiscountValue}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
                            setAddPaymentDiscountValue(v);
                            const parsed = parseFloat(v.replace(",", ".")) || 0;
                            const disc =
                              addPaymentDiscountType === "amount"
                                ? Math.min(parsed, outstandingForVisit)
                                : Math.round(
                                    ((outstandingForVisit *
                                      Math.min(parsed, 100)) /
                                      100) *
                                      100,
                                  ) / 100;
                            setAddPaymentAmount(
                              Math.max(0, outstandingForVisit - disc).toFixed(2),
                            );
                          }
                        }}
                        placeholder={
                          addPaymentDiscountType === "percent" ? "0" : "0.00"
                        }
                        className={
                          addPaymentDiscountType === "percent" ? "pr-8" : ""
                        }
                      />
                      {addPaymentDiscountType === "percent" && (
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
              value={addPaymentNotes}
              onChange={(e) => setAddPaymentNotes(e.target.value)}
              placeholder={t("gabinet.payments.notePlaceholder")}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={onSubmit} disabled={isAddPaymentSubmitting}>
            {isAddPaymentSubmitting
              ? t("common.processing")
              : t("gabinet.payments.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
