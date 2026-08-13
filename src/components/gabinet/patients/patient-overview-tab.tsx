import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, Heart, Star, ChevronDown } from "@/lib/ez-icons";
import { cn } from "@/lib/utils";
import { formatPhoneNumber } from "@/lib/phone";
import { displayReferralSource } from "@/lib/options";
import type { MappedGabinetAppointment } from "@/lib/supabase/mappers/gabinet/appointments";
import { AppointmentRow } from "./appointment-row";
import { groupIntakeSummary } from "./intake-utils";

type LatestIntake = { intakeSummary: string[] } | null | undefined;

export function PatientOverviewTab({
  patient,
  upcomingAppointments,
  pastAppointments,
  hasMedicalInfo,
  latestIntake,
  lastAppointmentsExpanded,
  setLastAppointmentsExpanded,
  getApptTreatmentDisplay,
  getVisitCountLabel,
  navigate,
  t,
}: {
  patient: {
    isActive?: boolean;
    createdAt: number;
    referralSource?: string | null;
    emergencyContactName?: string | null;
    emergencyContactPhone?: string | null;
  };
  upcomingAppointments: MappedGabinetAppointment[];
  pastAppointments: MappedGabinetAppointment[];
  hasMedicalInfo: boolean;
  latestIntake: LatestIntake;
  lastAppointmentsExpanded: boolean;
  setLastAppointmentsExpanded: (v: boolean | ((prev: boolean) => boolean)) => void;
  getApptTreatmentDisplay: (apt?: MappedGabinetAppointment | null) => string | undefined;
  getVisitCountLabel: (apt: MappedGabinetAppointment) => { label: string; title: string } | null;
  navigate: (opts: { to: string; params?: Record<string, string> }) => void;
  t: (key: string, opts?: Record<string, unknown> | string) => string;
}) {
  return (
    <div className="flex flex-col space-y-6">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" variant="stroke" />
            {t("gabinet.patients.upcomingAppointments")}
          </h3>
          {upcomingAppointments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("gabinet.patients.noUpcomingAppointments")}
            </p>
          ) : (
            <div className="space-y-2">
              {upcomingAppointments.map((apt) => (
                <AppointmentRow
                  key={apt._id}
                  apt={apt}
                  visitCount={getVisitCountLabel(apt)}
                  treatmentDisplayName={getApptTreatmentDisplay(apt)}
                  onClick={() =>
                    navigate({
                      to: "/dashboard/gabinet/appointments/$appointmentId",
                      params: { appointmentId: apt._id },
                    })
                  }
                  t={t}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="order-last grid gap-4 sm:grid-cols-3 md:order-none">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Heart className="h-4 w-4 text-muted-foreground" variant="stroke" />
              <div>
                <p className="text-sm text-muted-foreground">{t("common.status")}</p>
                <p className="font-medium">
                  {patient.isActive ? t("common.active") : t("common.inactive")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground" variant="stroke" />
              <div>
                <p className="text-sm text-muted-foreground">{t("gabinet.patients.added")}</p>
                <p className="font-medium">
                  {new Date(patient.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Star className="h-4 w-4 text-muted-foreground" variant="stroke" />
              <div>
                <p className="text-sm text-muted-foreground">
                  {t("gabinet.patients.referralSource")}
                </p>
                <p className="font-medium">
                  {patient.referralSource
                    ? displayReferralSource(patient.referralSource, t)
                    : "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <button
            type="button"
            onClick={() => setLastAppointmentsExpanded((v) => !v)}
            aria-expanded={lastAppointmentsExpanded}
            className="flex w-full items-center justify-between gap-2 text-left md:hidden"
          >
            <span className="text-sm font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" variant="stroke" />
              {t("gabinet.patients.lastAppointments")}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                lastAppointmentsExpanded && "rotate-180",
              )}
              variant="stroke"
            />
          </button>
          <h3 className="hidden text-sm font-semibold md:flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" variant="stroke" />
            {t("gabinet.patients.lastAppointments")}
          </h3>
          <div
            className={cn(
              "space-y-4",
              !lastAppointmentsExpanded && "hidden md:block",
            )}
          >
            {pastAppointments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("gabinet.patients.noHistoryDesc")}
              </p>
            ) : (
              <div className="space-y-2">
                {pastAppointments.map((apt) => (
                  <AppointmentRow
                    key={apt._id}
                    apt={apt}
                    visitCount={getVisitCountLabel(apt)}
                    treatmentDisplayName={getApptTreatmentDisplay(apt)}
                    onClick={() =>
                      navigate({
                        to: "/dashboard/gabinet/appointments/$appointmentId",
                        params: { appointmentId: apt._id },
                      })
                    }
                    t={t}
                  />
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Heart className="h-4 w-4 text-muted-foreground" variant="stroke" />
            {t("gabinet.patients.medicalInfo")}
          </h3>
          {!hasMedicalInfo ? (
            <p className="text-sm text-muted-foreground">
              {t("gabinet.patients.noMedicalInfo")}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {latestIntake && latestIntake.intakeSummary.length > 0 && (
                <div className="sm:col-span-2 space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {t("gabinet.patients.intakeSummarySection")}
                  </p>
                  <div className="space-y-2">
                    {groupIntakeSummary(latestIntake.intakeSummary).map((group) => (
                      <div key={group.key}>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                          {t(`gabinet.patients.intakeGroups.${group.key}`)}
                        </p>
                        <ul className="space-y-0.5">
                          {group.items.map((item, i) => (
                            <li key={i} className="text-sm text-muted-foreground">
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(patient.emergencyContactName || patient.emergencyContactPhone) && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">
                    {t("gabinet.patients.emergencyContact")}
                  </p>
                  <p className="text-sm font-medium">
                    {[
                      patient.emergencyContactName,
                      patient.emergencyContactPhone
                        ? formatPhoneNumber(patient.emergencyContactPhone)
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
