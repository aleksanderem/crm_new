import { useState, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { SidePanel } from "@/components/crm/side-panel";
import { PatientForm } from "@/components/forms/patient-form";
import { ActivityTimeline } from "@/components/activity-timeline/activity-timeline";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  ChevronUp,
  Pencil,
  Settings2,
  Heart,
  Calendar,
  FileText,
  Star,
  Clock,
  Trophy,
  Plus,
  Minus,
  ArrowUpRight,
  ArrowDownRight,
} from "@/lib/ez-icons";
import { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { PatientPackagesCard } from "@/components/gabinet/patient-packages-card";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/patients/$patientId"
)({
  component: PatientDetail,
});

function PatientDetail() {
  const { patientId } = Route.useParams();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const updatePatient = useMutation(api["gabinet/patients"].update);
  const removePatient = useMutation(api["gabinet/patients"].remove);

  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAllFields, setShowAllFields] = useState(false);

  const { data: patient, isLoading } = useQuery(
    convexQuery(api["gabinet/patients"].getById, {
      organizationId,
      patientId: patientId as Id<"gabinetPatients">,
    })
  );

  const { data: activitiesData } = useQuery(
    convexQuery(api.activities.getForEntity, {
      organizationId,
      entityType: "gabinetPatient",
      entityId: patientId,
      paginationOpts: { numItems: 50, cursor: null },
    })
  );
  const activities = activitiesData?.page;

  const { data: patientAppointments } = useQuery(
    convexQuery(api["gabinet/appointments"].listByPatient, {
      organizationId,
      patientId: patientId as Id<"gabinetPatients">,
    })
  );

  const { data: patientDocuments } = useQuery(
    convexQuery(api["gabinet/documents"].listByPatient, {
      organizationId,
      patientId: patientId as Id<"gabinetPatients">,
    })
  );

  const { data: loyaltyBalance } = useQuery(
    convexQuery(api["gabinet/loyalty"].getBalance, {
      organizationId,
      patientId: patientId as Id<"gabinetPatients">,
    })
  );

  const { data: loyaltyTransactions } = useQuery(
    convexQuery(api["gabinet/loyalty"].getTransactions, {
      organizationId,
      patientId: patientId as Id<"gabinetPatients">,
    })
  );

  const { data: treatmentsData } = useQuery(
    convexQuery(api["gabinet/treatments"].listActive, { organizationId })
  );

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-12 w-64" />
        <div className="flex gap-6">
          <Skeleton className="h-96 w-[420px]" />
          <Skeleton className="h-96 flex-1" />
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Patient not found.</p>
      </div>
    );
  }

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
      navigate({ to: "/dashboard/gabinet/patients" });
    }
  };

  const fullName = `${patient.firstName} ${patient.lastName}`.trim();
  const avatarFallback = `${patient.firstName[0]}${patient.lastName[0]}`;

  const allFields = [
    { label: t("common.email"), value: patient.email, fieldKey: "email" },
    { label: t("common.phone"), value: patient.phone, fieldKey: "phone" },
    { label: t("gabinet.patients.pesel"), value: patient.pesel, fieldKey: "pesel" },
    { label: t("gabinet.patients.dateOfBirth"), value: patient.dateOfBirth, fieldKey: "dateOfBirth" },
    {
      label: t("gabinet.patients.gender"),
      value: patient.gender ? t(`gabinet.patients.genderOptions.${patient.gender}`) : undefined,
      fieldKey: "gender",
    },
    { label: t("gabinet.patients.bloodType"), value: patient.bloodType, fieldKey: "bloodType" },
    { label: t("gabinet.patients.allergies"), value: patient.allergies, fieldKey: "allergies" },
    { label: t("gabinet.patients.referralSource"), value: patient.referralSource, fieldKey: "referralSource" },
    {
      label: t("gabinet.patients.emergencyContactName"),
      value: patient.emergencyContactName,
      fieldKey: "emergencyContactName",
    },
    {
      label: t("gabinet.patients.emergencyContactPhone"),
      value: patient.emergencyContactPhone,
      fieldKey: "emergencyContactPhone",
    },
    {
      label: t("gabinet.patients.address"),
      value: [patient.address?.street, patient.address?.postalCode, patient.address?.city]
        .filter(Boolean)
        .join(", ") || undefined,
      fieldKey: "address",
    },
    {
      label: t("common.created"),
      value: new Date(patient.createdAt).toLocaleDateString("pl-PL", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      fieldKey: "createdAt",
    },
  ];

  const defaultVisibleCount = 4;
  const visibleFields = showAllFields
    ? allFields
    : allFields.slice(0, defaultVisibleCount);
  const hiddenCount = allFields.length - defaultVisibleCount;

  const tabTriggerClass =
    "rounded-none border-b-2 border-transparent px-4 pb-2.5 pt-1.5 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none";

  return (
    <>
      <div className="flex h-full flex-col bg-muted/30">
        {/* Top header bar */}
        <div className="flex items-center justify-between border-b bg-background px-6 py-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9 border-2 border-primary/20">
              <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                {avatarFallback}
              </AvatarFallback>
            </Avatar>
            <h1 className="text-xl font-bold">{fullName}</h1>
            {!patient.isActive && (
              <Badge variant="outline" className="text-muted-foreground">
                {t("common.inactive")}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  {t("detail.actions.actions")}
                  <ChevronDown className="ml-1 h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setEditDrawerOpen(true)}>
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  {t("detail.actions.edit")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleDelete}
                  className="text-destructive focus:text-destructive"
                >
                  {t("common.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Main content: sidebar + tabs */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left sidebar */}
          <ScrollArea className="w-[420px] shrink-0 border-r bg-background">
            <div className="p-5 space-y-4">
              {/* Details card */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{t("detail.sidebar.details")}</CardTitle>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setEditDrawerOpen(true)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <Settings2 className="h-3.5 w-3.5" />
                      </Button>
                      {hiddenCount > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-muted-foreground"
                          onClick={() => setShowAllFields(!showAllFields)}
                        >
                          {showAllFields
                            ? t("detail.sidebar.showLess")
                            : t("detail.sidebar.showMore", { count: hiddenCount })}
                          {showAllFields ? (
                            <ChevronUp className="ml-1 h-3 w-3" />
                          ) : (
                            <ChevronDown className="ml-1 h-3 w-3" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {visibleFields.map((field) => (
                    <div key={field.fieldKey} className="flex items-start gap-4">
                      <span className="w-28 shrink-0 text-right text-sm text-muted-foreground">
                        {field.label}
                      </span>
                      <span className="text-sm font-medium text-primary">
                        {field.value || "—"}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Medical Notes card */}
              {patient.medicalNotes && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{t("gabinet.patients.medicalNotes")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {patient.medicalNotes}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Packages card */}
              <PatientPackagesCard
                patientId={patientId}
                organizationId={organizationId}
              />
            </div>
          </ScrollArea>

          {/* Right content area with tabs */}
          <div className="flex flex-1 flex-col overflow-hidden bg-background">
            <Tabs defaultValue="overview" className="flex flex-1 flex-col">
              <div className="shrink-0 border-b px-6 pt-2">
                <TabsList className="h-10 bg-transparent p-0 gap-0">
                  <TabsTrigger value="overview" className={tabTriggerClass}>
                    {t("gabinet.patients.tabs.overview")}
                  </TabsTrigger>
                  <TabsTrigger value="appointments" className={tabTriggerClass}>
                    {t("gabinet.patients.tabs.appointments")}
                  </TabsTrigger>
                  <TabsTrigger value="documents" className={tabTriggerClass}>
                    {t("gabinet.patients.tabs.documents")}
                  </TabsTrigger>
                  <TabsTrigger value="loyalty" className={tabTriggerClass}>
                    {t("gabinet.patients.tabs.loyalty")}
                  </TabsTrigger>
                  <TabsTrigger value="activity" className={tabTriggerClass}>
                    {t("gabinet.patients.tabs.activity")}
                  </TabsTrigger>
                </TabsList>
              </div>

              <ScrollArea className="flex-1">
                {/* Overview tab */}
                <TabsContent value="overview" className="m-0 p-6">
                  <div className="space-y-6">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Card>
                        <CardContent className="pt-6">
                          <div className="flex items-center gap-3">
                            <Heart className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <p className="text-sm text-muted-foreground">
                                {t("common.status")}
                              </p>
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
                            <Calendar className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <p className="text-sm text-muted-foreground">
                                {t("common.created")}
                              </p>
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
                            <Star className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <p className="text-sm text-muted-foreground">
                                {t("gabinet.patients.referralSource")}
                              </p>
                              <p className="font-medium">
                                {patient.referralSource || "—"}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    <ActivityTimeline
                      activities={
                        activities?.map((a) => ({
                          _id: a._id,
                          action: a.action,
                          description: a.description,
                          createdAt: a.createdAt,
                        })) ?? []
                      }
                      maxHeight="400px"
                    />
                  </div>
                </TabsContent>

                {/* Appointments tab */}
                <TabsContent value="appointments" className="m-0 p-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">{t("gabinet.patients.tabs.appointments")}</h3>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate({ to: "/dashboard/gabinet/calendar" })}
                      >
                        <Plus className="mr-1 h-4 w-4" />
                        {t("gabinet.appointments.createAppointment")}
                      </Button>
                    </div>
                    {!patientAppointments || patientAppointments.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <Calendar className="h-10 w-10 text-muted-foreground/40 mb-3" />
                        <p className="text-sm text-muted-foreground">{t("gabinet.appointments.noAppointments")}</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {[...patientAppointments]
                          .sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime))
                          .map((apt) => {
                            const treatmentName = treatmentsData?.find((tr) => tr._id === apt.treatmentId)?.name;
                            const isPast = apt.date < new Date().toISOString().split("T")[0];
                            return (
                              <div
                                key={apt._id}
                                className={`flex items-center gap-4 rounded-lg border p-3 ${isPast ? "opacity-60" : ""}`}
                              >
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                                  <Calendar className="h-5 w-5 text-primary" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">
                                    {treatmentName ?? t("common.unknown")}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {apt.date} &middot; {apt.startTime}–{apt.endTime}
                                  </p>
                                </div>
                                <Badge variant={
                                  apt.status === "completed" ? "default" :
                                  apt.status === "cancelled" ? "destructive" :
                                  apt.status === "no_show" ? "destructive" :
                                  "secondary"
                                }>
                                  {t(`gabinet.appointments.statuses.${apt.status}`)}
                                </Badge>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Documents tab */}
                <TabsContent value="documents" className="m-0 p-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">{t("gabinet.patients.tabs.documents")}</h3>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate({ to: "/dashboard/gabinet/documents" })}
                      >
                        <Plus className="mr-1 h-4 w-4" />
                        {t("gabinet.documents.createDocument")}
                      </Button>
                    </div>
                    {!patientDocuments || patientDocuments.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
                        <p className="text-sm text-muted-foreground">{t("gabinet.documents.noDocuments")}</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {[...patientDocuments]
                          .sort((a, b) => b.createdAt - a.createdAt)
                          .map((doc) => (
                            <div
                              key={doc._id}
                              className="flex items-center gap-4 rounded-lg border p-3"
                            >
                              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                                <FileText className="h-5 w-5 text-blue-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{doc.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  {t(`gabinet.documents.types.${doc.type}`)} &middot;{" "}
                                  {new Date(doc.createdAt).toLocaleDateString("pl-PL")}
                                </p>
                              </div>
                              <Badge variant={
                                doc.status === "signed" ? "default" :
                                doc.status === "archived" ? "secondary" :
                                doc.status === "pending_signature" ? "outline" :
                                "secondary"
                              }>
                                {t(`gabinet.documents.statuses.${doc.status}`)}
                              </Badge>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Loyalty tab */}
                <TabsContent value="loyalty" className="m-0 p-6">
                  <div className="space-y-6">
                    {/* Balance card */}
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Card>
                        <CardContent className="pt-6">
                          <div className="flex items-center gap-3">
                            <Trophy className="h-5 w-5 text-yellow-500" />
                            <div>
                              <p className="text-sm text-muted-foreground">{t("gabinet.loyalty.balance")}</p>
                              <p className="text-2xl font-bold">{loyaltyBalance?.balance ?? 0}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6">
                          <div className="flex items-center gap-3">
                            <ArrowUpRight className="h-5 w-5 text-green-500" />
                            <div>
                              <p className="text-sm text-muted-foreground">{t("gabinet.loyalty.totalEarned")}</p>
                              <p className="text-2xl font-bold">{loyaltyBalance?.lifetimeEarned ?? 0}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6">
                          <div className="flex items-center gap-3">
                            <ArrowDownRight className="h-5 w-5 text-red-500" />
                            <div>
                              <p className="text-sm text-muted-foreground">{t("gabinet.loyalty.totalSpent")}</p>
                              <p className="text-2xl font-bold">{loyaltyBalance?.lifetimeSpent ?? 0}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {loyaltyBalance?.tier && (
                      <div className="flex items-center gap-2">
                        <Star className="h-4 w-4 text-yellow-500" />
                        <span className="text-sm font-medium">
                          {t("gabinet.loyalty.tier")}: {t(`gabinet.loyalty.tiers.${loyaltyBalance.tier}`)}
                        </span>
                      </div>
                    )}

                    {/* Transaction history */}
                    <div>
                      <h4 className="text-sm font-semibold mb-3">{t("gabinet.loyalty.transactionHistory")}</h4>
                      {!loyaltyTransactions || loyaltyTransactions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                          <Star className="h-8 w-8 text-muted-foreground/40 mb-2" />
                          <p className="text-sm text-muted-foreground">{t("gabinet.loyalty.noTransactions")}</p>
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
                                <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
                                  tx.type === "earn" ? "bg-green-100 text-green-600" :
                                  tx.type === "spend" ? "bg-red-100 text-red-600" :
                                  "bg-gray-100 text-gray-600"
                                }`}>
                                  {tx.type === "earn" ? <Plus className="h-4 w-4" /> :
                                   tx.type === "spend" ? <Minus className="h-4 w-4" /> :
                                   <Star className="h-4 w-4" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium">{tx.reason}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {new Date(tx.createdAt).toLocaleDateString("pl-PL")}
                                  </p>
                                </div>
                                <span className={`text-sm font-semibold ${
                                  tx.type === "earn" ? "text-green-600" :
                                  tx.type === "spend" ? "text-red-600" :
                                  "text-muted-foreground"
                                }`}>
                                  {tx.type === "earn" ? "+" : tx.type === "spend" ? "−" : ""}{tx.points}
                                </span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>

                {/* Activity tab */}
                <TabsContent value="activity" className="m-0 p-6">
                  <ActivityTimeline
                    activities={
                      activities?.map((a) => ({
                        _id: a._id,
                        action: a.action,
                        description: a.description,
                        createdAt: a.createdAt,
                      })) ?? []
                    }
                    maxHeight="600px"
                  />
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </div>
        </div>
      </div>

      {/* Edit patient drawer */}
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
            gender: patient.gender ?? undefined,
            address: patient.address ?? undefined,
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
    </>
  );
}
