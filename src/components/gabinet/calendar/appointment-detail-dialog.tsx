import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/gabinet/rich-text-editor";
import { Id } from "@cvx/_generated/dataModel";
import { toast } from "sonner";
import {
  Calendar,
  Clock,
  User,
  Stethoscope,
  Edit2,
  X,
  CheckCircle,
  PlayCircle,
  XCircle,
  AlertTriangle,
  MessageSquare,
  Send,
  Inbox,
  MapPin,
  Building2,
} from "@/lib/ez-icons";

const STATUS_KEYS: Record<string, string> = {
  pending_confirmation: "gabinet.appointments.statuses.pending_confirmation",
  scheduled: "gabinet.appointments.statuses.scheduled",
  confirmed: "gabinet.appointments.statuses.confirmed",
  in_progress: "gabinet.appointments.statuses.in_progress",
  completed: "gabinet.appointments.statuses.completed",
  cancelled: "gabinet.appointments.statuses.cancelled",
  no_show: "gabinet.appointments.statuses.no_show",
};

const STATUS_COLORS: Record<string, string> = {
  pending_confirmation: "bg-amber-100 text-amber-800",
  scheduled: "bg-blue-100 text-blue-800",
  confirmed: "bg-green-100 text-green-800",
  in_progress: "bg-yellow-100 text-yellow-800",
  completed: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-600",
  no_show: "bg-orange-100 text-orange-600",
};

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending_confirmation: ["scheduled", "confirmed", "cancelled"],
  scheduled: ["confirmed", "cancelled", "no_show"],
  confirmed: ["in_progress", "cancelled", "no_show"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: [],
};

function getSmsSummary(events: any[], appointmentStatus: string) {
  const latestOutbound = events.find(
    (event) =>
      event.direction === "outbound" &&
      event.eventType === "appointment_confirmation_request",
  );
  const latestInbound = events.find(
    (event) =>
      event.direction === "inbound" &&
      event.eventType === "appointment_confirmation_reply",
  );

  if (latestInbound) {
    if (latestInbound.processingStatus === "processed") {
      if (latestInbound.parsedIntent === "confirm") {
        return {
          labelKey: "gabinet.appointmentDetail.sms.summaryConfirmed",
          className: "bg-green-100 text-green-800",
        };
      }
      if (latestInbound.parsedIntent === "cancel") {
        return {
          labelKey: "gabinet.appointmentDetail.sms.summaryCancelled",
          className: "bg-red-100 text-red-700",
        };
      }
    }

    if (latestInbound.processingStatus === "failed") {
      return {
        labelKey: "gabinet.appointmentDetail.sms.summaryFailed",
        className: "bg-red-100 text-red-700",
      };
    }

    return {
      labelKey: "gabinet.appointmentDetail.sms.summaryIgnored",
      className: "bg-slate-100 text-slate-700",
    };
  }

  if (latestOutbound) {
    if (latestOutbound.processingStatus === "failed") {
      return {
        labelKey: "gabinet.appointmentDetail.sms.summaryFailed",
        className: "bg-red-100 text-red-700",
      };
    }

    if (latestOutbound.processingStatus === "pending") {
      return {
        labelKey: "gabinet.appointmentDetail.sms.summaryQueued",
        className: "bg-amber-100 text-amber-800",
      };
    }

    return {
      labelKey: "gabinet.appointmentDetail.sms.summarySent",
      className: "bg-blue-100 text-blue-800",
    };
  }

  if (appointmentStatus === "pending_confirmation") {
    return {
      labelKey: "gabinet.appointmentDetail.sms.summaryAwaitingRequest",
      className: "bg-amber-100 text-amber-800",
    };
  }

  return {
    labelKey: "gabinet.appointmentDetail.sms.summaryNoHistory",
    className: "bg-slate-100 text-slate-700",
  };
}

interface AppointmentDetailDialogProps {
  organizationId: Id<"organizations">;
  appointmentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface AppointmentDoc {
  _id: Id<"gabinetAppointments">;
  patientId: Id<"gabinetPatients">;
  treatmentId?: Id<"gabinetTreatments">;
  employeeId: Id<"users">;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  notes?: string;
  isRecurring?: boolean;
  locationId?: Id<"gabinetLocations">;
  roomId?: Id<"gabinetRooms">;
}

interface PatientDoc {
  _id: Id<"gabinetPatients">;
  firstName: string;
  lastName: string;
}

interface TreatmentDoc {
  _id: Id<"gabinetTreatments">;
  name: string;
  duration: number;
  price: number;
  currency?: string;
}

interface RoomDoc {
  _id: Id<"gabinetRooms">;
  name: string;
}

interface LocationDoc {
  name: string;
  rooms?: RoomDoc[];
}

export function AppointmentDetailDialog({
  organizationId,
  appointmentId,
  open,
  onOpenChange,
}: AppointmentDetailDialogProps) {
  const { t } = useTranslation();
  const updateAppointment = useAction(api.gabinet.appointments.update);
  const updateStatus = useAction(api.gabinet.appointments.updateStatus);
  const cancelAppointment = useAction(api.gabinet.appointments.cancel);
  const getAppointmentById = useAction(api.gabinet.appointments.getById);

  const { data: appointmentRaw } = useQuery({
    queryKey: ["gabinet.appointment.getById", organizationId, appointmentId],
    queryFn: () =>
      getAppointmentById({
        organizationId,
        appointmentId: appointmentId as string,
      }),
    enabled: !!appointmentId,
  });
  const appointment = appointmentRaw as unknown as AppointmentDoc | undefined;

  const listPatientsAction = useAction(api.gabinet.patients.list);
  const { data: patients } = useQuery({
    queryKey: ["gabinet.patients.list", organizationId, "detail"],
    queryFn: () => listPatientsAction({
      organizationId,
      paginationOpts: { numItems: 200, cursor: null },
    }),
    enabled: !!appointment && !!organizationId,
  }) as { data: { page: PatientDoc[] } | undefined };

  const listActiveTreatmentsAction = useAction(api.gabinet.treatments.listActive);
  const { data: treatmentsRaw } = useQuery({
    queryKey: ["gabinet.treatments.listActive", organizationId],
    queryFn: () => listActiveTreatmentsAction({ organizationId }),
    enabled: !!appointment && !!organizationId,
  });
  const treatments = treatmentsRaw as unknown as TreatmentDoc[] | undefined;

  const { data: smsEvents = [] } = useQuery({
    ...convexQuery(api.gabinet.appointmentSms.listByAppointment, {
      organizationId,
      appointmentId: (appointmentId as Id<"gabinetAppointments">) ?? ("" as Id<"gabinetAppointments">),
    }),
    enabled: !!appointment,
  });

  const getLocationAction = useAction(api.gabinet.locations.getLocation);
  const { data: locationDataRaw } = useQuery({
    queryKey: ["gabinet.locations.getLocation", organizationId, appointment?.locationId],
    queryFn: () =>
      getLocationAction({
        organizationId,
        locationId: (appointment?.locationId ?? "") as string,
      }),
    enabled: !!appointment?.locationId,
  });
  const locationData = locationDataRaw as unknown as LocationDoc | null | undefined;

  const [editing, setEditing] = useState(false);
  const [editDate, setEditDate] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editTreatmentId, setEditTreatmentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  if (!appointment) return null;

  const patientName =
    patients?.page?.find((p) => p._id === appointment.patientId);
  const treatmentName = treatments?.find(
    (t) => t._id === appointment.treatmentId
  );
  const roomName = locationData?.rooms?.find((r) => r._id === appointment.roomId)?.name;
  const nextStatuses = VALID_TRANSITIONS[appointment.status] ?? [];
  const latestOutboundSms = smsEvents.find(
    (event) =>
      event.direction === "outbound" &&
      event.eventType === "appointment_confirmation_request",
  );
  const latestInboundSms = smsEvents.find(
    (event) =>
      event.direction === "inbound" &&
      event.eventType === "appointment_confirmation_reply",
  );
  const smsSummary = getSmsSummary(smsEvents, appointment.status);

  const startEdit = () => {
    setEditDate(appointment.date);
    setEditStartTime(appointment.startTime);
    setEditEndTime(appointment.endTime);
    setEditNotes(appointment.notes ?? "");
    setEditTreatmentId(appointment.treatmentId ?? "");
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateAppointment({
        organizationId,
        appointmentId: appointment._id,
        date: editDate !== appointment.date ? editDate : undefined,
        startTime:
          editStartTime !== appointment.startTime ? editStartTime : undefined,
        endTime: editEndTime !== appointment.endTime ? editEndTime : undefined,
        notes: editNotes !== (appointment.notes ?? "") ? editNotes : undefined,
        treatmentId:
          editTreatmentId !== appointment.treatmentId
            ? (editTreatmentId as Id<"gabinetTreatments">)
            : undefined,
      });
      toast.success(t("gabinet.appointments.updated"));
      setEditing(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      await updateStatus({
        organizationId,
        appointmentId: appointment._id,
        status: newStatus as any,
      });
      toast.success(t("gabinet.appointmentDetail.statusChanged"));
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleCancel = async () => {
    try {
      await cancelAppointment({
        organizationId,
        appointmentId: appointment._id,
        reason: cancelReason || undefined,
      });
      toast.success(t("gabinet.appointmentDetail.cancelled"));
      setCancelDialogOpen(false);
      setCancelReason("");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleTreatmentChange = (tid: string) => {
    setEditTreatmentId(tid);
    const tr = treatments?.find((t) => t._id === tid);
    if (tr && editStartTime) {
      const [h, m] = editStartTime.split(":").map(Number);
      const endMinutes = h * 60 + m + tr.duration;
      const eh = Math.floor(endMinutes / 60);
      const em = endMinutes % 60;
      setEditEndTime(
        `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`
      );
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "pending_confirmation":
        return <MessageSquare className="h-3.5 w-3.5" />;
      case "confirmed":
        return <CheckCircle className="h-3.5 w-3.5" />;
      case "in_progress":
        return <PlayCircle className="h-3.5 w-3.5" />;
      case "completed":
        return <CheckCircle className="h-3.5 w-3.5" />;
      case "cancelled":
        return <XCircle className="h-3.5 w-3.5" />;
      case "no_show":
        return <AlertTriangle className="h-3.5 w-3.5" />;
      default:
        return <Clock className="h-3.5 w-3.5" />;
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setEditing(false);
          setCancelDialogOpen(false);
        }
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle>
              {t("gabinet.appointmentDetail.title")}
            </DialogTitle>
            <Badge className={STATUS_COLORS[appointment.status]}>
              {STATUS_KEYS[appointment.status] ? t(STATUS_KEYS[appointment.status]) : appointment.status}
            </Badge>
          </div>
        </DialogHeader>

        {cancelDialogOpen ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("gabinet.appointmentDetail.cancelConfirm")}
            </p>
            <div className="space-y-1.5">
              <Label>{t("gabinet.appointmentDetail.cancelReason")}</Label>
              <RichTextEditor
                value={cancelReason}
                onChange={(v) => setCancelReason(v ?? "")}
                minHeight="80px"
                placeholder={t(
                  "gabinet.appointmentDetail.cancelReasonPlaceholder"
                )}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCancelDialogOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleCancel}
              >
                {t("gabinet.appointmentDetail.confirmCancel")}
              </Button>
            </div>
          </div>
        ) : editing ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("gabinet.appointments.treatment")}</Label>
              <Select
                value={editTreatmentId}
                onValueChange={handleTreatmentChange}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(treatments ?? []).map((tr) => (
                    <SelectItem key={tr._id} value={tr._id}>
                      {tr.name} ({tr.duration} min)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>{t("gabinet.appointments.date")}</Label>
                <Input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("gabinet.appointments.startTime")}</Label>
                <Input
                  type="time"
                  value={editStartTime}
                  onChange={(e) => setEditStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("gabinet.appointments.endTime")}</Label>
                <Input
                  type="time"
                  value={editEndTime}
                  onChange={(e) => setEditEndTime(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t("gabinet.appointments.notes")}</Label>
              <RichTextEditor
                value={editNotes}
                onChange={(v) => setEditNotes(v ?? "")}
                minHeight="80px"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? t("common.saving") : t("common.save")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Details */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground">
                    {t("gabinet.appointments.patient")}
                  </div>
                  <div className="text-sm font-medium">
                    {patientName
                      ? `${patientName.firstName} ${patientName.lastName}`
                      : "..."}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Stethoscope className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground">
                    {t("gabinet.appointments.treatment")}
                  </div>
                  <div className="text-sm font-medium">
                    {treatmentName?.name ?? "..."}
                    {treatmentName && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({treatmentName.duration} min · {treatmentName.price}{" "}
                        {treatmentName.currency ?? "PLN"})
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground">
                    {t("gabinet.appointments.date")}
                  </div>
                  <div className="text-sm font-medium">{appointment.date}</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground">
                    {t("gabinet.appointmentDetail.time")}
                  </div>
                  <div className="text-sm font-medium">
                    {appointment.startTime} – {appointment.endTime}
                  </div>
                </div>
              </div>

              {locationData && (
                <div className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <div className="text-xs text-muted-foreground">
                      {t("gabinet.appointments.location")}
                    </div>
                    <div className="text-sm font-medium">
                      {locationData.name}
                      {roomName && (
                        <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Building2 className="h-3 w-3" />
                          {roomName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-md border bg-muted/30 p-3 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-xs text-muted-foreground">
                        {t("gabinet.appointmentDetail.sms.title")}
                      </div>
                      <div className="text-sm font-medium">
                        {t("gabinet.appointmentDetail.sms.description")}
                      </div>
                    </div>
                  </div>
                  <Badge className={smsSummary.className}>
                    {t(smsSummary.labelKey)}
                  </Badge>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-md bg-background p-2">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                      <Send className="h-3.5 w-3.5" />
                      {t("gabinet.appointmentDetail.sms.lastOutbound")}
                    </div>
                    {latestOutboundSms ? (
                      <div className="space-y-1">
                        <div className="text-sm">{latestOutboundSms.rawBody}</div>
                        <div className="text-xs text-muted-foreground">
                          {t("gabinet.appointmentDetail.sms.processingStatus")}: {t(`gabinet.appointmentDetail.sms.processingStatuses.${latestOutboundSms.processingStatus}`)}
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        {t("gabinet.appointmentDetail.sms.noOutbound")}
                      </div>
                    )}
                  </div>

                  <div className="rounded-md bg-background p-2">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                      <Inbox className="h-3.5 w-3.5" />
                      {t("gabinet.appointmentDetail.sms.lastInbound")}
                    </div>
                    {latestInboundSms ? (
                      <div className="space-y-1">
                        <div className="text-sm">{latestInboundSms.rawBody}</div>
                        <div className="text-xs text-muted-foreground">
                          {t("gabinet.appointmentDetail.sms.parsedIntent")}: {t(`gabinet.appointmentDetail.sms.intents.${latestInboundSms.parsedIntent ?? "unknown"}`)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {t("gabinet.appointmentDetail.sms.processingStatus")}: {t(`gabinet.appointmentDetail.sms.processingStatuses.${latestInboundSms.processingStatus}`)}
                        </div>
                        {latestInboundSms.processingError && (
                          <div className="text-xs text-muted-foreground">
                            {t("gabinet.appointmentDetail.sms.processingReason")}: {latestInboundSms.processingError}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        {t("gabinet.appointmentDetail.sms.noInbound")}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {appointment.notes && (
                <div className="rounded-md bg-muted/50 p-3">
                  <div className="text-xs text-muted-foreground mb-1">
                    {t("gabinet.appointments.notes")}
                  </div>
                  <div className="text-sm">{appointment.notes}</div>
                </div>
              )}

              {appointment.isRecurring && (
                <div className="text-xs text-muted-foreground">
                  {t("gabinet.appointmentDetail.recurringInfo")}
                </div>
              )}
            </div>

            {/* Status transitions */}
            {nextStatuses.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">
                  {t("gabinet.appointmentDetail.changeStatus")}
                </div>
                <div className="flex flex-wrap gap-2">
                  {nextStatuses
                    .filter((s) => s !== "cancelled")
                    .map((status) => (
                      <Button
                        key={status}
                        variant="outline"
                        size="sm"
                        onClick={() => handleStatusChange(status)}
                        className="gap-1.5"
                      >
                        {statusIcon(status)}
                        {STATUS_KEYS[status] ? t(STATUS_KEYS[status]) : status}
                      </Button>
                    ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between border-t pt-3">
              <div className="flex gap-2">
                {appointment.status !== "cancelled" &&
                  appointment.status !== "completed" && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={startEdit}
                        className="gap-1.5"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        {t("common.edit")}
                      </Button>
                      {nextStatuses.includes("cancelled") && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCancelDialogOpen(true)}
                          className="gap-1.5 text-destructive hover:text-destructive"
                        >
                          <X className="h-[18px] w-[18px]" variant="stroke" />
                          {t("gabinet.appointmentDetail.cancelAppointment")}
                        </Button>
                      )}
                    </>
                  )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                {t("common.close")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
