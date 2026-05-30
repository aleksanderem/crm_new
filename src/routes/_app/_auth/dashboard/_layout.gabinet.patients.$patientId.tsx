import { useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { toast } from "sonner";
import { formatActionError } from "@/lib/format-action-error";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useSupabaseGabinetPatient } from "@/hooks/use-supabase-gabinet-patients";
import { useSupabaseActivitiesByEntity } from "@/hooks/use-supabase-activities";
import {
  useSupabaseGabinetAppointmentsByPatient,
  useSupabaseGabinetAppointmentPackagePositions,
  useSupabaseGabinetAppointmentRecurringPositions,
} from "@/hooks/use-supabase-gabinet-appointments";
import type { MappedGabinetAppointment } from "@/lib/supabase/mappers/gabinet/appointments";
import { useSupabaseGabinetLoyaltyBalance, useSupabaseGabinetLoyaltyTransactions } from "@/hooks/use-supabase-gabinet-loyalty";
import { useSupabaseGabinetTreatmentsList } from "@/hooks/use-supabase-gabinet-treatments";
import {
  useSupabaseGabinetPackageUsageByPatient,
  useSupabaseGabinetTreatmentPackagesList,
} from "@/hooks/use-supabase-gabinet-packages";
import { useSupabasePaymentsByPatient } from "@/hooks/use-supabase-payments";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { SidePanel } from "@/components/crm/side-panel";
import { PatientForm } from "@/components/forms/patient-form";
import {
  EntityDetailLayout,
  type DetailField,
} from "@/components/crm/entity-detail-layout";
import { useSidebarSlot } from "@/components/layout/sidebar-slot-context";
import { ActivityFeed } from "@/components/crm/activity-feed";
import { activitiesToFeedEntries } from "@/components/crm/activity-feed-adapter";
import { EntityDocumentsTab } from "@/components/documents/entity-documents-tab";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  Heart,
  Star,
  Trophy,
  Plus,
  Minus,
  ArrowUpRight,
  ArrowDownRight,
  CreditCard,
} from "@/lib/ez-icons";

import { useTranslation } from "react-i18next";
import { PatientPackagesCard } from "@/components/gabinet/patient-packages-card";
import { PatientTreatmentsCard } from "@/components/gabinet/patient-treatments-card";
import { plateJsonToText } from "@/components/gabinet/rich-text-editor";
import { appointmentStatusBadgeClass } from "@/lib/gabinet-appointment-status";
import { displayReferralSource } from "@/lib/options";
import { formatPhoneNumber } from "@/lib/phone";
import { formatCurrencyPLN } from "@/lib/format-currency";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/patients/$patientId",
)({
  component: PatientDetail,
});

function PatientDetail() {
  const { patientId } = Route.useParams();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const { t } = useTranslation();
  // @ts-ignore — TS2589: deep type instantiation in Convex codegen for this action
  const updatePatient = useAction(api.gabinet.patients.update);
  // @ts-ignore — TS2589: deep type instantiation in Convex codegen for this action
  const removePatient = useAction(api.gabinet.patients.remove);
  const trackView = useAction(api.recentlyViewed.track);
  const queryClient = useQueryClient();

  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: patient, isLoading } = useSupabaseGabinetPatient(
    organizationId,
    patientId,
  );

  useEffect(() => {
    if (patient && organizationId) {
      const label = `${patient.firstName} ${patient.lastName}`.trim();
      trackView({ organizationId, entityType: "gabinetPatients", entityId: patient._id, entityLabel: label });
    }
  }, [patient?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Collapse app sidebar to icon-only so EntityDetailLayout sidebar has room
  const { setShellSidebarMode } = useSidebarSlot();
  useEffect(() => {
    setShellSidebarMode("icon-only");
    return () => setShellSidebarMode("default");
  }, [setShellSidebarMode]);

  const { data: activities } = useSupabaseActivitiesByEntity(
    organizationId,
    "gabinetPatient",
    patientId,
  );

  const { data: patientAppointments } = useSupabaseGabinetAppointmentsByPatient(
    organizationId,
    patientId,
  );

  const { data: loyaltyBalance } = useSupabaseGabinetLoyaltyBalance(
    organizationId,
    patientId,
  );

  const { data: loyaltyTransactions } = useSupabaseGabinetLoyaltyTransactions(
    organizationId,
    patientId,
  );

  const { data: treatmentsData } = useSupabaseGabinetTreatmentsList(organizationId);

  const { data: patientPayments } = useSupabasePaymentsByPatient(
    organizationId,
    patientId,
  );

  const { data: patientPackageUsage } = useSupabaseGabinetPackageUsageByPatient(
    organizationId,
    patientId,
  );

  const { data: treatmentPackages } = useSupabaseGabinetTreatmentPackagesList(
    organizationId,
  );

  const getPaymentForLabel = (payment: {
    appointmentId?: string;
    packageUsageId?: string;
    notes?: string;
  }): string => {
    if (payment.appointmentId) {
      const apt = patientAppointments?.find((a) => a._id === payment.appointmentId);
      const treatmentName = apt?.treatmentId
        ? treatmentsData?.find((tr) => tr._id === apt.treatmentId)?.name
        : undefined;
      if (treatmentName) return treatmentName;
    }
    if (payment.packageUsageId) {
      const usage = patientPackageUsage?.find((u) => u._id === payment.packageUsageId);
      const pkgName = usage
        ? treatmentPackages?.find((p) => p._id === usage.packageId)?.name
        : undefined;
      if (pkgName) return pkgName;
    }
    if (payment.notes) return payment.notes;
    return "—";
  };

  // Treatment-number indicator IDs ("X/Y" like in the calendar — issue #1086).
  // Package usage takes precedence; recurring series is the fallback.
  const packageUsageIds = Array.from(
    new Set(
      (patientAppointments ?? [])
        .map((a) => a.packageUsageId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const recurringGroupIds = Array.from(
    new Set(
      (patientAppointments ?? [])
        .map((a) => a.recurringGroupId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const { data: packagePositions } =
    useSupabaseGabinetAppointmentPackagePositions(
      organizationId,
      packageUsageIds,
    );
  const { data: recurringPositions } =
    useSupabaseGabinetAppointmentRecurringPositions(
      organizationId,
      recurringGroupIds,
    );

  const getVisitCountLabel = (
    apt: MappedGabinetAppointment,
  ): { label: string; title: string } | null => {
    const pkgPos = apt.packageUsageId
      ? packagePositions?.get(apt._id)
      : undefined;
    if (pkgPos) {
      return {
        label: `${pkgPos.position}/${pkgPos.total}`,
        title: t(
          "gabinet.calendar.indicators.packageVisit",
          "Wizyta pakietowa",
        ),
      };
    }
    if (apt.isRecurring && apt.recurringRule) {
      const rule = apt.recurringRule as { count?: number };
      if (typeof rule.count === "number" && rule.count > 0) {
        const dynamicPos = apt.recurringGroupId
          ? recurringPositions?.get(apt._id)
          : undefined;
        const pos = dynamicPos ?? (apt.recurringIndex ?? 0) + 1;
        return {
          label: `${pos}/${rule.count}`,
          title: t(
            "gabinet.calendar.indicators.recurringVisit",
            "Wizyta cykliczna",
          ),
        };
      }
    }
    return null;
  };

  // Build fields for EntityDetailLayout sidebar
  const detailFields: DetailField[] = (() => {
    if (!patient) return [];
    const fields: DetailField[] = [];
    if (patient.email) fields.push({ label: t("common.email"), value: patient.email, fieldKey: "email" });
    if (patient.phone) fields.push({ label: t("common.phone"), value: formatPhoneNumber(patient.phone), fieldKey: "phone" });
    if (patient.dateOfBirth) fields.push({ label: t("gabinet.patients.dateOfBirth"), value: patient.dateOfBirth, fieldKey: "dob" });
    if (patient.gender) fields.push({ label: t("gabinet.patients.gender"), value: t(`gabinet.patients.genderOptions.${patient.gender}`), fieldKey: "gender" });
    if (patient.pesel) fields.push({ label: t("gabinet.patients.pesel"), value: patient.pesel, fieldKey: "pesel" });
    if (patient.bloodType) fields.push({ label: t("gabinet.patients.bloodType"), value: <Badge variant="outline" className="text-[10px]">{patient.bloodType}</Badge>, fieldKey: "bloodType" });
    if (patient.allergies) fields.push({ label: t("gabinet.patients.allergies"), value: patient.allergies, fieldKey: "allergies" });
    if (patient.address) {
      const patientAddr = patient.address as { street?: string; postalCode?: string; city?: string };
      const addr = [patientAddr.street, patientAddr.postalCode, patientAddr.city].filter(Boolean).join(", ");
      if (addr) fields.push({ label: t("gabinet.patients.address"), value: addr, fieldKey: "address" });
    }
    if (patient.referralSource) fields.push({ label: t("gabinet.patients.referralSource"), value: displayReferralSource(patient.referralSource, t), fieldKey: "referral" });
    return fields;
  })();

  // Sidebar extra: statistics + medical notes + packages
  const sidebarExtra = patient ? (
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
            <span className="text-xs font-semibold tabular-nums">{patientAppointments?.length ?? 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Trophy size={12} variant="stroke" />
              {t("gabinet.loyalty.balance")}
            </span>
            <span className="text-xs font-semibold tabular-nums">{loyaltyBalance?.balance ?? 0}</span>
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
        </div>
      </div>
      {(() => {
        const medicalNotesText = plateJsonToText(patient.medicalNotes ?? undefined).trim();
        if (!medicalNotesText) return null;
        return (
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              {t("gabinet.patients.medicalNotes")}
            </p>
            <div className="rounded-md border p-2.5">
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                {medicalNotesText}
              </p>
            </div>
          </div>
        );
      })()}
      <PatientPackagesCard
        patientId={patientId}
        organizationId={organizationId}
      />
      <PatientTreatmentsCard
        patientId={patientId}
        organizationId={organizationId}
      />
    </div>
  ) : null;

  const fullName = patient
    ? `${patient.firstName} ${patient.lastName}`.trim()
    : "";

  const handleEditSubmit = async (formData: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    pesel?: string;
    dateOfBirth?: string;
    gender?: "male" | "female" | "other";
    address?: { street?: string; city?: string; postalCode?: string };
    medicalNotes?: string;
    allergies?: string;
    bloodType?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    referralSource?: string;
  }) => {
    setIsSubmitting(true);
    try {
      await updatePatient({
        organizationId,
        patientId,
        ...formData,
      });
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetPatients.detail(organizationId, patientId) });
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetPatients.list(organizationId) });
      setEditDrawerOpen(false);
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.patients.errors.saveFailed",
          defaultValue: "Nie udało się zapisać zmian klienta.",
        }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm(t("gabinet.patients.confirmDelete"))) {
      await removePatient({
        organizationId,
        patientId,
      });
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetPatients.list(organizationId) });
      navigate({ to: "/dashboard/gabinet/patients" });
    }
  };

  // --- Tabs ---
  const today = new Date().toISOString().split("T")[0];
  const upcomingAppointments = (patientAppointments ?? [])
    .filter(
      (apt) =>
        apt.date >= today &&
        apt.status !== "cancelled" &&
        apt.status !== "no_show",
    )
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
    .slice(0, 3);
  const pastAppointments = (patientAppointments ?? [])
    .filter((apt) => apt.date < today)
    .sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime))
    .slice(0, 3);
  const hasMedicalInfo = Boolean(
    patient?.allergies ||
      patient?.bloodType ||
      patient?.emergencyContactName ||
      patient?.emergencyContactPhone,
  );

  const renderAppointmentRow = (apt: MappedGabinetAppointment) => {
    const treatmentName = treatmentsData?.find(
      (tr) => tr._id === apt.treatmentId,
    )?.name;
    const visitCount = getVisitCountLabel(apt);
    return (
      <div
        key={apt._id}
        className="flex items-center gap-4 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() =>
          navigate({
            to: "/dashboard/gabinet/appointments/$appointmentId",
            params: { appointmentId: apt._id },
          })
        }
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Calendar className="h-4 w-4 text-primary" variant="stroke" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-sm font-medium truncate">
              {treatmentName ?? t("common.unknown")}
            </p>
            {visitCount && (
              <Badge
                variant="outline"
                title={visitCount.title}
                className="shrink-0 border-sky-500/40 bg-sky-500/10 px-1.5 py-0 text-[10px] font-semibold tabular-nums text-sky-700 dark:text-sky-300"
              >
                {visitCount.label}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {apt.date} &middot; {apt.startTime}–{apt.endTime}
          </p>
        </div>
        <Badge
          variant="outline"
          className={appointmentStatusBadgeClass(apt.status)}
        >
          {t(`gabinet.appointments.statuses.${apt.status}`)}
        </Badge>
      </div>
    );
  };

  const tabs = [
    {
      label: t("gabinet.patients.tabs.overview"),
      content: (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Heart
                    className="h-4 w-4 text-muted-foreground"
                    variant="stroke"
                  />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {t("common.status")}
                    </p>
                    <p className="font-medium">
                      {patient?.isActive
                        ? t("common.active")
                        : t("common.inactive")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Calendar
                    className="h-4 w-4 text-muted-foreground"
                    variant="stroke"
                  />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {t("gabinet.patients.added")}
                    </p>
                    <p className="font-medium">
                      {patient
                        ? new Date(patient.createdAt).toLocaleDateString()
                        : "—"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Star
                    className="h-4 w-4 text-muted-foreground"
                    variant="stroke"
                  />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {t("gabinet.patients.referralSource")}
                    </p>
                    <p className="font-medium">
                      {patient?.referralSource ? displayReferralSource(patient.referralSource, t) : "—"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-6 space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Calendar
                  className="h-4 w-4 text-muted-foreground"
                  variant="stroke"
                />
                {t("gabinet.patients.upcomingAppointments")}
              </h3>
              {upcomingAppointments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("gabinet.patients.noUpcomingAppointments")}
                </p>
              ) : (
                <div className="space-y-2">
                  {upcomingAppointments.map(renderAppointmentRow)}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Calendar
                  className="h-4 w-4 text-muted-foreground"
                  variant="stroke"
                />
                {t("gabinet.patients.lastAppointments")}
              </h3>
              {pastAppointments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("gabinet.patients.noHistoryDesc")}
                </p>
              ) : (
                <div className="space-y-2">
                  {pastAppointments.map(renderAppointmentRow)}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Heart
                  className="h-4 w-4 text-muted-foreground"
                  variant="stroke"
                />
                {t("gabinet.patients.medicalInfo")}
              </h3>
              {!hasMedicalInfo ? (
                <p className="text-sm text-muted-foreground">
                  {t("gabinet.patients.noMedicalInfo")}
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {patient?.allergies && (
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {t("gabinet.patients.allergies")}
                      </p>
                      <p className="text-sm font-medium">{patient.allergies}</p>
                    </div>
                  )}
                  {patient?.bloodType && (
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {t("gabinet.patients.bloodType")}
                      </p>
                      <p className="text-sm font-medium">
                        <Badge variant="outline" className="text-[10px]">
                          {patient.bloodType}
                        </Badge>
                      </p>
                    </div>
                  )}
                  {(patient?.emergencyContactName ||
                    patient?.emergencyContactPhone) && (
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
      ),
    },
    {
      label: t("gabinet.patients.tabs.appointments"),
      count: patientAppointments?.length,
      content: (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              {t("gabinet.patients.tabs.appointments")}
            </h3>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                navigate({ to: "/dashboard/gabinet/calendar" })
              }
            >
              <Plus className="mr-1 h-4 w-4" variant="stroke" />
              {t("gabinet.appointments.createAppointment")}
            </Button>
          </div>
          {!patientAppointments ||
          patientAppointments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Calendar className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                {t("gabinet.appointments.noAppointments")}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {[...patientAppointments]
                .sort((a, b) =>
                  (b.date + b.startTime).localeCompare(
                    a.date + a.startTime,
                  ),
                )
                .map((apt) => {
                  const treatmentName = treatmentsData?.find(
                    (tr) => tr._id === apt.treatmentId,
                  )?.name;
                  const isPast =
                    apt.date < new Date().toISOString().split("T")[0];
                  const visitCount = getVisitCountLabel(apt);
                  return (
                    <div
                      key={apt._id}
                      className={`flex items-center gap-4 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors ${isPast ? "opacity-60" : ""}`}
                      onClick={() =>
                        navigate({
                          to: "/dashboard/gabinet/appointments/$appointmentId",
                          params: { appointmentId: apt._id },
                        })
                      }
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <Calendar
                          className="h-4 w-4 text-primary"
                          variant="stroke"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {treatmentName ?? t("common.unknown")}
                          </p>
                          {visitCount && (
                            <Badge
                              variant="outline"
                              title={visitCount.title}
                              className="shrink-0 border-sky-500/40 bg-sky-500/10 px-1.5 py-0 text-[10px] font-semibold tabular-nums text-sky-700 dark:text-sky-300"
                            >
                              {visitCount.label}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {apt.date} &middot; {apt.startTime}–
                          {apt.endTime}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={appointmentStatusBadgeClass(apt.status)}
                      >
                        {t(
                          `gabinet.appointments.statuses.${apt.status}`,
                        )}
                      </Badge>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      ),
    },
    {
      label: t("gabinet.payments.payments"),
      count: patientPayments?.length ?? 0,
      content: (() => {
        const completedPayments = (patientPayments ?? []).filter(
          (p) => p.status === "completed",
        );
        const totalSpent = completedPayments.reduce(
          (sum, p) => sum + (p.amount ?? 0),
          0,
        );
        const pendingPayments = (patientPayments ?? []).filter(
          (p) => p.status === "pending",
        );
        const outstanding = pendingPayments.reduce(
          (sum, p) => sum + (p.amount ?? 0),
          0,
        );
        const lastPayment = patientPayments?.[0];
        return (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <CreditCard
                      className="h-4 w-4 text-green-600"
                      variant="stroke"
                    />
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {t("gabinet.payments.totalSpent")}
                      </p>
                      <p className="text-2xl font-bold">
                        {formatCurrencyPLN(totalSpent)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <CreditCard
                      className="h-4 w-4 text-amber-600"
                      variant="stroke"
                    />
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {t("gabinet.payments.outstanding")}
                      </p>
                      <p className="text-2xl font-bold">
                        {formatCurrencyPLN(outstanding)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <Calendar
                      className="h-4 w-4 text-muted-foreground"
                      variant="stroke"
                    />
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {t("gabinet.payments.lastPayment")}
                      </p>
                      <p className="font-medium">
                        {lastPayment
                          ? new Date(lastPayment.createdAt).toLocaleDateString(
                              "pl-PL",
                            )
                          : "—"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardContent className="pt-6 space-y-4">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <CreditCard
                    className="h-4 w-4 text-muted-foreground"
                    variant="stroke"
                  />
                  {t("gabinet.payments.paymentHistory")}
                </h3>
                {!patientPayments || patientPayments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <CreditCard className="h-10 w-10 text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">
                      {t("gabinet.payments.noPayments")}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-3 text-sm font-medium">
                            {t("gabinet.payments.amount")}
                          </th>
                          <th className="text-left p-3 text-sm font-medium">
                            {t("gabinet.payments.for")}
                          </th>
                          <th className="text-left p-3 text-sm font-medium">
                            {t("gabinet.payments.method")}
                          </th>
                          <th className="text-left p-3 text-sm font-medium">
                            {t("common.date")}
                          </th>
                          <th className="text-left p-3 text-sm font-medium">
                            {t("common.status")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {patientPayments.map((payment) => (
                          <tr
                            key={payment._id}
                            className={`border-b last:border-0 hover:bg-muted/30 ${
                              payment.appointmentId
                                ? "cursor-pointer"
                                : ""
                            }`}
                            onClick={() => {
                              if (payment.appointmentId) {
                                navigate({
                                  to: "/dashboard/gabinet/appointments/$appointmentId",
                                  params: {
                                    appointmentId: payment.appointmentId,
                                  },
                                });
                              }
                            }}
                          >
                            <td className="p-3 font-medium">
                              {formatCurrencyPLN(
                                payment.amount,
                                payment.currency ?? "PLN",
                              )}
                            </td>
                            <td className="p-3 text-sm">
                              <div
                                className="max-w-[260px] truncate"
                                title={getPaymentForLabel(payment)}
                              >
                                {getPaymentForLabel(payment)}
                              </div>
                            </td>
                            <td className="p-3">
                              <Badge variant="outline">
                                {t(
                                  `gabinet.payments.methods.${payment.paymentMethod}`,
                                )}
                              </Badge>
                            </td>
                            <td className="p-3 text-sm text-muted-foreground">
                              {new Date(
                                payment.createdAt,
                              ).toLocaleDateString("pl-PL")}
                            </td>
                            <td className="p-3">
                              <Badge
                                variant={
                                  payment.status === "completed"
                                    ? "default"
                                    : payment.status === "refunded"
                                      ? "destructive"
                                      : "secondary"
                                }
                              >
                                {t(
                                  `gabinet.payments.status.${payment.status}`,
                                )}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );
      })(),
    },
    {
      label: t("gabinet.patients.tabs.documents"),
      content: (
        <EntityDocumentsTab
          entityType="patient"
          entityId={patientId}
          organizationId={organizationId}
        />
      ),
    },
    {
      label: t("gabinet.patients.tabs.loyalty"),
      content: (
        <div className="space-y-6">
          {/* Balance cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Trophy
                    className="h-4 w-4 text-yellow-500"
                    variant="stroke"
                  />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {t("gabinet.loyalty.balance")}
                    </p>
                    <p className="text-2xl font-bold">
                      {loyaltyBalance?.balance ?? 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <ArrowUpRight
                    className="h-4 w-4 text-green-500"
                    variant="stroke"
                  />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {t("gabinet.loyalty.totalEarned")}
                    </p>
                    <p className="text-2xl font-bold">
                      {loyaltyBalance?.lifetimeEarned ?? 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <ArrowDownRight
                    className="h-4 w-4 text-red-500"
                    variant="stroke"
                  />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {t("gabinet.loyalty.totalSpent")}
                    </p>
                    <p className="text-2xl font-bold">
                      {loyaltyBalance?.lifetimeSpent ?? 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {loyaltyBalance?.tier && (
            <div className="flex items-center gap-2">
              <Star
                className="h-4 w-4 text-yellow-500"
                variant="stroke"
              />
              <span className="text-sm font-medium">
                {t("gabinet.loyalty.tier")}:{" "}
                {t(`gabinet.loyalty.tiers.${loyaltyBalance.tier}`)}
              </span>
            </div>
          )}

          {/* Transaction history */}
          <div>
            <h4 className="text-sm font-semibold mb-3">
              {t("gabinet.loyalty.transactionHistory")}
            </h4>
            {!loyaltyTransactions ||
            loyaltyTransactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Star className="h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">
                  {t("gabinet.loyalty.noTransactions")}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {[...loyaltyTransactions]
                  .sort((a, b) => b.createdAt - a.createdAt)
                  .slice(0, 20)
                  .map((tx) => (
                    <div
                      key={tx._id}
                      className="flex items-center gap-3 rounded-lg border p-3"
                    >
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full ${
                          tx.type === "earn"
                            ? "bg-green-100 text-green-600"
                            : tx.type === "spend"
                              ? "bg-red-100 text-red-600"
                              : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {tx.type === "earn" ? (
                          <Plus
                            className="h-4 w-4"
                            variant="stroke"
                          />
                        ) : tx.type === "spend" ? (
                          <Minus
                            className="h-4 w-4"
                            variant="stroke"
                          />
                        ) : (
                          <Star
                            className="h-4 w-4"
                            variant="stroke"
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">
                          {tx.reason}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(tx.createdAt).toLocaleDateString(
                            "pl-PL",
                          )}
                        </p>
                      </div>
                      <span
                        className={`text-sm font-semibold ${
                          tx.type === "earn"
                            ? "text-green-600"
                            : tx.type === "spend"
                              ? "text-red-600"
                              : "text-muted-foreground"
                        }`}
                      >
                        {tx.type === "earn"
                          ? "+"
                          : tx.type === "spend"
                            ? "−"
                            : ""}
                        {tx.points}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      label: t("gabinet.patients.tabs.activity"),
      content: (
        <ActivityFeed
          entries={activitiesToFeedEntries((activities ?? []) as any[], t)}
          maxHeight="600px"
        />
      ),
    },
  ];

  return (
    <>
      <EntityDetailLayout
        isLoading={isLoading}
        notFound={!patient && !isLoading}
        onBack={() => navigate({ to: "/dashboard/gabinet/patients" })}
        title={fullName}
        subtitle={
          <span className="flex items-center gap-2">
            {t("gabinet.patients.patient")}
            {patient && !patient.isActive && (
              <Badge variant="outline" className="text-xs">{t("common.inactive")}</Badge>
            )}
          </span>
        }
        avatarFallback={patient ? `${patient.firstName?.[0] ?? ""}${patient.lastName?.[0] ?? ""}`.toUpperCase() : "?"}
        onEdit={() => setEditDrawerOpen(true)}
        secondaryActions={[
          { label: t("common.delete"), onClick: handleDelete, variant: "destructive" as const },
        ]}
        fields={detailFields}
        expandedFieldCount={5}
        sidebarExtra={sidebarExtra}
        tabs={tabs}
      />

      {/* Edit patient drawer */}
      {patient && (
        <SidePanel
          open={editDrawerOpen}
          onOpenChange={setEditDrawerOpen}
          title={t("common.edit")}
        >
          <PatientForm
            initialData={{
              firstName: patient.firstName,
              lastName: patient.lastName,
              email: patient.email,
              phone: patient.phone ?? undefined,
              pesel: patient.pesel ?? undefined,
              dateOfBirth: patient.dateOfBirth ?? undefined,
              gender: (patient.gender as "male" | "female" | "other" | undefined) ?? undefined,
              address: (patient.address as { street?: string; city?: string; postalCode?: string } | undefined) ?? undefined,
              medicalNotes: patient.medicalNotes ?? undefined,
              allergies: patient.allergies ?? undefined,
              bloodType: patient.bloodType ?? undefined,
              emergencyContactName: patient.emergencyContactName ?? undefined,
              emergencyContactPhone: patient.emergencyContactPhone ?? undefined,
              referralSource: patient.referralSource ?? undefined,
            }}
            onSubmit={handleEditSubmit}
            onCancel={() => setEditDrawerOpen(false)}
            isSubmitting={isSubmitting}
            organizationId={organizationId}
          />
        </SidePanel>
      )}

    </>
  );
}
