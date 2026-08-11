import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SettlementForm } from "@/components/gabinet/appointment-shared/settlement-form";
import { formatCurrencyPLN } from "@/lib/format-currency";

type JunctionTreatment = {
  id: string;
  treatmentId: string;
  priceAtBooking?: number | null;
};

type TreatmentListItem = {
  _id: string;
  name: string;
  duration: number;
  price?: number;
  currency?: string;
};

type PackageUsageEntry = {
  _id: string;
  packageName?: string | null;
  status: string;
  totalUsed: number;
  totalCount: number;
  treatmentsUsed: Array<{
    treatmentId: string;
    treatmentName?: string | null;
    usedCount?: number;
    totalCount?: number;
  }>;
};

type SameDayAppointment = {
  id: string;
  startTime: string;
  endTime: string;
  treatmentNames: string[];
  totalPrice: number;
};

export function PaymentAppointmentDialog({
  open,
  onOpenChange,
  organizationId,
  appointmentId,
  patientId,
  junctionTreatments,
  legacyTreatmentPrice,
  treatmentsList,
  payments,
  patientPackageUsage,
  linkedPackageUsageId,
  sameDayOtherAppointments,
  selectedAdditionalIds,
  availableTransitions,
  onToggleAdditional,
  onMarkCompleted,
  onSuccess,
  onCancel,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  appointmentId: string;
  patientId: string;
  junctionTreatments: JunctionTreatment[];
  legacyTreatmentPrice: number | undefined;
  treatmentsList: TreatmentListItem[] | undefined;
  payments: Record<string, unknown>[];
  patientPackageUsage: PackageUsageEntry[];
  linkedPackageUsageId: string | null;
  sameDayOtherAppointments: SameDayAppointment[] | undefined;
  selectedAdditionalIds: Set<string>;
  availableTransitions: string[];
  onToggleAdditional: (id: string, checked: boolean) => void;
  onMarkCompleted: () => Promise<void>;
  onSuccess: () => void;
  onCancel: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("gabinet.payments.addPayment")}</DialogTitle>
          <DialogDescription>
            {t("gabinet.payments.addPaymentDesc")}
          </DialogDescription>
        </DialogHeader>
        {sameDayOtherAppointments && sameDayOtherAppointments.length > 0 && (
          <div className="rounded-md border bg-muted/20 p-3 space-y-2 text-sm">
            <p className="font-medium text-muted-foreground">
              {t(
                "gabinet.appointments.batchSettleTitle",
                "Inne wizyty tego pacjenta w tym dniu — uwzględnij w rozliczeniu:",
              )}
            </p>
            {sameDayOtherAppointments.map((appt) => (
              <div key={appt.id} className="flex items-start gap-2">
                <Checkbox
                  id={`batch-detail-${appt.id}`}
                  checked={selectedAdditionalIds.has(appt.id)}
                  onCheckedChange={(checked) =>
                    onToggleAdditional(appt.id, Boolean(checked))
                  }
                  className="mt-0.5"
                />
                <label
                  htmlFor={`batch-detail-${appt.id}`}
                  className="cursor-pointer leading-snug"
                >
                  <span className="font-medium">
                    {appt.startTime.slice(0, 5)}–{appt.endTime.slice(0, 5)}
                  </span>
                  {appt.treatmentNames.length > 0 && (
                    <span className="text-muted-foreground ml-1">
                      · {appt.treatmentNames.join(", ")}
                    </span>
                  )}
                  {appt.totalPrice > 0 && (
                    <span className="text-muted-foreground ml-1">
                      · {formatCurrencyPLN(appt.totalPrice)}
                    </span>
                  )}
                </label>
              </div>
            ))}
          </div>
        )}
        {open && (
          <SettlementForm
            organizationId={organizationId}
            appointmentId={appointmentId}
            patientId={patientId}
            junctionTreatments={junctionTreatments}
            legacyTreatmentPrice={legacyTreatmentPrice}
            treatmentsList={treatmentsList}
            payments={payments}
            patientPackageUsage={patientPackageUsage}
            linkedPackageUsageId={linkedPackageUsageId}
            additionalAppointments={
              (sameDayOtherAppointments ?? [])
                .filter((a) => selectedAdditionalIds.has(a.id))
                .map((a) => ({
                  id: a.id,
                  totalPrice: a.totalPrice,
                  label: [
                    `${a.startTime.slice(0, 5)}–${a.endTime.slice(0, 5)}`,
                    ...(a.treatmentNames.length > 0
                      ? [a.treatmentNames.join(", ")]
                      : []),
                  ].join(" · "),
                }))
            }
            showMarkCompleted={availableTransitions.includes("completed")}
            onMarkCompleted={onMarkCompleted}
            onSuccess={onSuccess}
            onCancel={onCancel}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
