import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Calendar,
  Clock,
  User,
  Mail,
  Phone,
  FileText,
  CreditCard,
  History,
  StickyNote,
  Activity,
  UserCircle,
} from "@/lib/ez-icons";
import { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/appointments/$appointmentId"
)({
  component: AppointmentDetail,
});

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline" | "success"> = {
  scheduled: "secondary",
  confirmed: "default",
  in_progress: "default",
  completed: "success",
  cancelled: "destructive",
  no_show: "destructive",
};

function AppointmentDetail() {
  const { appointmentId } = Route.useParams();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const { data: detail, isLoading } = useQuery(
    convexQuery(api.gabinet.appointments.getFullDetail, {
      organizationId,
      appointmentId: appointmentId as Id<"gabinetAppointments">,
    })
  );

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-3 gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96 col-span-2" />
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">{t("common.notFound")}</p>
        <Button variant="outline" onClick={() => navigate({ to: "/dashboard/gabinet/calendar" })}>
          <ArrowLeft className="mr-2 h-4 w-4" variant="stroke" />
          {t("common.back")}
        </Button>
      </div>
    );
  }

  const { appointment, patient, treatment, employee, documents, payments, notes, patientHistory, loyaltyBalance, loyaltyTier } = detail;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
  };

  const formatTime = (time: string) => {
    return time.slice(0, 5);
  };

  const getPatientInitials = () => {
    if (!patient) return "?";
    return `${patient.firstName?.[0] ?? ""}${patient.lastName?.[0] ?? ""}`.toUpperCase();
  };

  const getEmployeeName = () => {
    if (!employee) return "-";
    return employee.name ?? employee.email ?? "-";
  };

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb */}
      <div className="border-b px-6 py-3">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/dashboard" className="hover:text-foreground">
            {t("nav.home")}
          </Link>
          <span>/</span>
          <Link to="/dashboard/gabinet/calendar" className="hover:text-foreground">
            {t("nav.gabinet")} / {t("nav.calendar")}
          </Link>
          <span>/</span>
          <span className="text-foreground">
            {t("gabinet.appointments.appointment")} #{appointment._id.slice(-6)}
          </span>
        </nav>
      </div>

      {/* Header */}
      <div className="border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/dashboard/gabinet/calendar" })}>
            <ArrowLeft className="h-4 w-4" variant="stroke" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">
              {treatment?.name ?? t("gabinet.appointments.appointment")} - {patient?.firstName} {patient?.lastName}
            </h1>
            <p className="text-sm text-muted-foreground">
              {formatDate(appointment.date)} • {formatTime(appointment.startTime)} - {formatTime(appointment.endTime)}
            </p>
          </div>
        </div>
        <Badge variant={statusColors[appointment.status] ?? "secondary"} className="text-sm">
          {t(`gabinet.appointments.status.${appointment.status}`)}
        </Badge>
      </div>

      {/* Content */}
      <div className="flex-1 grid grid-cols-3 gap-6 p-6">
        {/* Left sidebar - Patient & Appointment info */}
        <div className="space-y-4">
          {/* Patient card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4" variant="stroke" />
                {t("gabinet.patients.patient")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback>{getPatientInitials()}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">
                    {patient?.firstName} {patient?.lastName}
                  </p>
                  {patient?.email && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Mail className="h-3 w-3" variant="stroke" />
                      {patient.email}
                    </p>
                  )}
                </div>
              </div>
              {patient?.phone && (
                <p className="text-sm flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" variant="stroke" />
                  {patient.phone}
                </p>
              )}
              {loyaltyBalance > 0 && (
                <div className="pt-2">
                  <Badge variant="outline">
                    ⭐ {loyaltyBalance} {t("gabinet.loyalty.points")}
                  </Badge>
                  {loyaltyTier && <span className="ml-2 text-xs text-muted-foreground">{loyaltyTier}</span>}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Appointment details card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4" variant="stroke" />
                {t("gabinet.appointments.details")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t("gabinet.treatments.treatment")}</span>
                <span className="font-medium">{treatment?.name ?? "-"}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" variant="stroke" />
                  {t("common.date")}
                </span>
                <span className="font-medium">{formatDate(appointment.date)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t("common.time")}</span>
                <span className="font-medium">
                  {formatTime(appointment.startTime)} - {formatTime(appointment.endTime)}
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <UserCircle className="h-3 w-3" variant="stroke" />
                  {t("gabinet.employees.employee")}
                </span>
                <span className="font-medium">{getEmployeeName()}</span>
              </div>
              {treatment?.price !== undefined && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{t("common.price")}</span>
                    <span className="font-medium">
                      {treatment.price.toFixed(2)} {treatment.currency ?? "PLN"}
                    </span>
                  </div>
                </>
              )}
              {appointment.notes && (
                <>
                  <Separator />
                  <div>
                    <span className="text-sm text-muted-foreground">{t("common.notes")}</span>
                    <p className="text-sm mt-1">{appointment.notes}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Quick stats */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("common.stats")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold">{documents.length}</p>
                  <p className="text-xs text-muted-foreground">{t("gabinet.documents.documents")}</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{payments.length}</p>
                  <p className="text-xs text-muted-foreground">{t("gabinet.payments.payments")}</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{notes.length}</p>
                  <p className="text-xs text-muted-foreground">{t("common.notes")}</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{patientHistory.length}</p>
                  <p className="text-xs text-muted-foreground">{t("gabinet.patients.history")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right main area - Tabs */}
        <div className="col-span-2">
          <Tabs defaultValue="details" className="h-full">
            <TabsList>
              <TabsTrigger value="details">
                <Activity className="mr-2 h-4 w-4" variant="stroke" />
                {t("gabinet.appointments.tabs.details")}
              </TabsTrigger>
              <TabsTrigger value="documents">
                <FileText className="mr-2 h-4 w-4" variant="stroke" />
                {t("gabinet.documents.documents")}
              </TabsTrigger>
              <TabsTrigger value="payments">
                <CreditCard className="mr-2 h-4 w-4" variant="stroke" />
                {t("gabinet.payments.payments")}
              </TabsTrigger>
              <TabsTrigger value="history">
                <History className="mr-2 h-4 w-4" variant="stroke" />
                {t("gabinet.patients.history")}
              </TabsTrigger>
              <TabsTrigger value="notes">
                <StickyNote className="mr-2 h-4 w-4" variant="stroke" />
                {t("common.notes")}
              </TabsTrigger>
              <TabsTrigger value="body-chart">{t("gabinet.appointments.tabs.bodyChart")}</TabsTrigger>
            </TabsList>

            <ScrollArea className="h-[calc(100vh-320px)] mt-4">
              <TabsContent value="details" className="m-0">
                <Card>
                  <CardHeader>
                    <CardTitle>{t("gabinet.appointments.tabs.details")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">{t("common.comingSoon")}</p>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="documents" className="m-0">
                <Card>
                  <CardHeader>
                    <CardTitle>{t("gabinet.documents.documents")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {documents.length === 0 ? (
                      <p className="text-muted-foreground">{t("common.noResults")}</p>
                    ) : (
                      <div className="space-y-2">
                        {documents.map((doc) => (
                          <div key={doc._id} className="flex items-center justify-between p-3 border rounded-lg">
                            <div>
                              <p className="font-medium">{doc.title}</p>
                              <p className="text-sm text-muted-foreground">{doc.type}</p>
                            </div>
                            <Badge variant={doc.status === "signed" ? "success" : "secondary"}>{doc.status}</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="payments" className="m-0">
                <Card>
                  <CardHeader>
                    <CardTitle>{t("gabinet.payments.payments")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {payments.length === 0 ? (
                      <p className="text-muted-foreground">{t("common.noResults")}</p>
                    ) : (
                      <div className="space-y-2">
                        {payments.map((payment) => (
                          <div key={payment._id} className="flex items-center justify-between p-3 border rounded-lg">
                            <div>
                              <p className="font-medium">
                                {payment.amount.toFixed(2)} {payment.currency ?? "PLN"}
                              </p>
                              <p className="text-sm text-muted-foreground">{payment.method}</p>
                            </div>
                            <Badge variant={payment.status === "completed" ? "success" : "secondary"}>
                              {payment.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="history" className="m-0">
                <Card>
                  <CardHeader>
                    <CardTitle>{t("gabinet.patients.history")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {patientHistory.length === 0 ? (
                      <p className="text-muted-foreground">{t("common.noResults")}</p>
                    ) : (
                      <div className="space-y-2">
                        {patientHistory.map((appt) => (
                          <div key={appt._id} className="flex items-center justify-between p-3 border rounded-lg">
                            <div>
                              <p className="font-medium">{(appt as any).treatment?.name ?? "-"}</p>
                              <p className="text-sm text-muted-foreground">
                                {formatDate(appt.date)} • {formatTime(appt.startTime)}
                              </p>
                            </div>
                            <Badge variant={statusColors[appt.status] ?? "secondary"}>{appt.status}</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="notes" className="m-0">
                <Card>
                  <CardHeader>
                    <CardTitle>{t("common.notes")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {notes.length === 0 ? (
                      <p className="text-muted-foreground">{t("common.noResults")}</p>
                    ) : (
                      <div className="space-y-3">
                        {notes.map((note) => (
                          <div key={note._id} className="p-3 border rounded-lg">
                            <p className="text-sm">{note.content}</p>
                            <p className="text-xs text-muted-foreground mt-2">
                              {new Date(note.createdAt).toLocaleString("pl-PL")}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="body-chart" className="m-0">
                <Card>
                  <CardHeader>
                    <CardTitle>{t("gabinet.appointments.tabs.bodyChart")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">{t("common.comingSoon")}</p>
                  </CardContent>
                </Card>
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
