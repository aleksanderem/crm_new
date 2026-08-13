import { Calendar, Trophy, CreditCard, AlertCircle } from "@/lib/ez-icons";
import type { MappedGabinetAppointment } from "@/lib/supabase/mappers/gabinet/appointments";
import { PatientPackagesCard } from "@/components/gabinet/patient-packages-card";
import { PatientTreatmentsCard } from "@/components/gabinet/patient-treatments-card";
import { plateJsonToText } from "@/components/gabinet/rich-text-editor";
import { formatCurrencyPLN } from "@/lib/format-currency";
import { groupIntakeSummary } from "./intake-utils";

type LatestIntake = { intakeSummary: string[] } | null | undefined;
type LoyaltyBalance = { balance: number } | null | undefined;
type Payment = { status: string; amount?: number; kind?: string };

export function PatientSidebarExtra({
  patient,
  patientId,
  organizationId,
  patientAppointments,
  patientPayments,
  loyaltyBalance,
  latestIntake,
  t,
}: {
  patient: {
    medicalNotes?: unknown;
  };
  patientId: string;
  organizationId: string;
  patientAppointments: MappedGabinetAppointment[] | undefined;
  patientPayments: Payment[] | undefined;
  loyaltyBalance: LoyaltyBalance;
  latestIntake: LatestIntake;
  t: (key: string, opts?: Record<string, unknown> | string) => string;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          {t("gabinet.treatmentDetail.statistics")}
        </p>
        <div className="rounded-md border p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar size={12} variant="stroke" />
              {t("gabinet.patients.totalAppointments")}
            </span>
            <span className="text-xs font-semibold tabular-nums">
              {patientAppointments?.length ?? 0}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Trophy size={12} variant="stroke" />
              {t("gabinet.loyalty.balance")}
            </span>
            <span className="text-xs font-semibold tabular-nums">
              {loyaltyBalance?.balance ?? 0}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CreditCard size={12} variant="stroke" />
              {t("gabinet.payments.totalSpent")}
            </span>
            <span className="text-xs font-semibold tabular-nums">
              {formatCurrencyPLN(
                (patientPayments ?? [])
                  .filter((p) => p.status === "completed")
                  .reduce((sum, p) => sum + (p.amount ?? 0), 0),
              )}
            </span>
          </div>
          {(() => {
            const unpaidCount = (patientPayments ?? []).filter(
              (p) => p.status === "pending" && p.kind !== "credit_refund",
            ).length;
            if (!unpaidCount) return null;
            return (
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <AlertCircle size={12} variant="stroke" />
                  {t("gabinet.payments.unpaidAppointments")}
                </span>
                <span className="text-xs font-semibold tabular-nums text-destructive">
                  {unpaidCount}
                </span>
              </div>
            );
          })()}
        </div>
      </div>
      <div className="space-y-3">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          {t("gabinet.patients.medicalNotes")}
        </p>
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            {t("gabinet.patients.intakeSummarySection")}
          </p>
          {latestIntake && latestIntake.intakeSummary.length > 0 ? (
            <div className="rounded-md border p-2.5 space-y-2.5">
              {groupIntakeSummary(latestIntake.intakeSummary).map((group) => (
                <div key={group.key}>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    {t(`gabinet.patients.intakeGroups.${group.key}`)}
                  </p>
                  <ul className="space-y-0.5">
                    {group.items.map((item, i) => (
                      <li key={i} className="text-xs text-muted-foreground">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border p-2.5">
              <p className="text-xs text-muted-foreground italic">
                {t("gabinet.patients.noIntakeSummary")}
              </p>
            </div>
          )}
        </div>
        {(() => {
          const medicalNotesText = plateJsonToText(
            patient.medicalNotes ?? undefined,
          ).trim();
          if (!medicalNotesText) return null;
          return (
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                {t("gabinet.patients.staffNotesSection")}
              </p>
              <div className="rounded-md border p-2.5">
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                  {medicalNotesText}
                </p>
              </div>
            </div>
          );
        })()}
      </div>
      <PatientPackagesCard patientId={patientId} organizationId={organizationId} />
      <PatientTreatmentsCard patientId={patientId} organizationId={organizationId} />
    </div>
  );
}
