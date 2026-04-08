import { useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
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
} from "@/lib/ez-icons";
import type { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { PatientPackagesCard } from "@/components/gabinet/patient-packages-card";

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
  // @ts-ignore — TS2589: deep type instantiation in Convex codegen for this mutation
  const updatePatient = useMutation(api.gabinet.patients.update);
  // @ts-ignore — TS2589: deep type instantiation in Convex codegen for this mutation
  const removePatient = useMutation(api.gabinet.patients.remove);
  const trackView = useMutation(api.recentlyViewed.track);
  const queryClient = useQueryClient();

  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const patientDetailQuery = convexQuery(api.gabinet.patients.getById, {
    organizationId,
    patientId: patientId as Id<"gabinetPatients">,
  });

  // @ts-ignore — TS2589: deep type instantiation in Convex codegen for this query shape
  const { data: patient, isLoading } = useQuery(patientDetailQuery);

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

  const { data: activitiesData } = useQuery(
    convexQuery(api.activities.getForEntity, {
      organizationId,
      entityType: "gabinetPatient",
      entityId: patientId,
      paginationOpts: { numItems: 50, cursor: null },
    }),
  );
  const activities = activitiesData?.page;

  const { data: patientAppointments } = useQuery(
    convexQuery(api.gabinet.appointments.listByPatient, {
      organizationId,
      patientId: patientId as Id<"gabinetPatients">,
    }),
  );

  const { data: loyaltyBalance } = useQuery(
    convexQuery(api.gabinet.loyalty.getBalance, {
      organizationId,
      patientId: patientId as Id<"gabinetPatients">,
    }),
  );

  const { data: loyaltyTransactions } = useQuery(
    convexQuery(api.gabinet.loyalty.getTransactions, {
      organizationId,
      patientId: patientId as Id<"gabinetPatients">,
    }),
  );

  const { data: treatmentsData } = useQuery(
    convexQuery(api.gabinet.treatments.listActive, { organizationId }),
  );

  // Build fields for EntityDetailLayout sidebar
  const detailFields: DetailField[] = (() => {
    if (!patient) return [];
    const fields: DetailField[] = [];
    if (patient.email) fields.push({ label: t("common.email"), value: patient.email, fieldKey: "email" });
    if (patient.phone) fields.push({ label: t("common.phone"), value: patient.phone, fieldKey: "phone" });
    if (patient.dateOfBirth) fields.push({ label: t("gabinet.patients.dateOfBirth"), value: patient.dateOfBirth, fieldKey: "dob" });
    if (patient.gender) fields.push({ label: t("gabinet.patients.gender"), value: t(`gabinet.patients.genderOptions.${patient.gender}`), fieldKey: "gender" });
    if (patient.pesel) fields.push({ label: t("gabinet.patients.pesel"), value: patient.pesel, fieldKey: "pesel" });
    if (patient.bloodType) fields.push({ label: t("gabinet.patients.bloodType"), value: <Badge variant="outline" className="text-[10px]">{patient.bloodType}</Badge>, fieldKey: "bloodType" });
    if (patient.allergies) fields.push({ label: t("gabinet.patients.allergies"), value: patient.allergies, fieldKey: "allergies" });
    if (patient.address) {
      const addr = [patient.address.street, patient.address.postalCode, patient.address.city].filter(Boolean).join(", ");
      if (addr) fields.push({ label: t("gabinet.patients.address"), value: addr, fieldKey: "address" });
    }
    if (patient.referralSource) fields.push({ label: t("gabinet.patients.referralSource"), value: patient.referralSource, fieldKey: "referral" });
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
        </div>
      </div>
      {patient.medicalNotes && (
        <div className="space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            {t("gabinet.patients.medicalNotes")}
          </p>
          <div className="rounded-md border p-2.5">
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">
              {patient.medicalNotes}
            </p>
          </div>
        </div>
      )}
      <PatientPackagesCard
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
        patientId: patientId as Id<"gabinetPatients">,
        ...formData,
      });
      void queryClient.invalidateQueries({ queryKey: patientDetailQuery.queryKey });
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetPatients.detail(organizationId, patientId) });
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetPatients.list(organizationId) });
      setEditDrawerOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm(t("gabinet.patients.confirmDelete"))) {
      await removePatient({
        organizationId,
        patientId: patientId as Id<"gabinetPatients">,
      });
      void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetPatients.list(organizationId) });
      navigate({ to: "/dashboard/gabinet/patients" });
    }
  };

  // --- Tabs ---
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
                      {t("common.created")}
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
                      {patient?.referralSource || "—"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
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
                        <p className="text-sm font-medium truncate">
                          {treatmentName ?? t("common.unknown")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {apt.date} &middot; {apt.startTime}–
                          {apt.endTime}
                        </p>
                      </div>
                      <Badge
                        variant={
                          apt.status === "completed"
                            ? "default"
                            : apt.status === "cancelled"
                              ? "destructive"
                              : apt.status === "no_show"
                                ? "destructive"
                                : "secondary"
                        }
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
          entries={activitiesToFeedEntries((activities ?? []) as any[])}
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
          />
        </SidePanel>
      )}

    </>
  );
}
