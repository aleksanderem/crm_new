import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
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
import { Textarea } from "@/components/ui/textarea";
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
} from "@/lib/ez-icons";

const STATUS_KEYS: Record<string, string> = {
  scheduled: "gabinet.appointments.statuses.scheduled",
  confirmed: "gabinet.appointments.statuses.confirmed",
  in_progress: "gabinet.appointments.statuses.in_progress",
  completed: "gabinet.appointments.statuses.completed",
  cancelled: "gabinet.appointments.statuses.cancelled",
  no_show: "gabinet.appointments.statuses.no_show",
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800",
  confirmed: "bg-green-100 text-green-800",
  in_progress: "bg-yellow-100 text-yellow-800",
  completed: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-600",
  no_show: "bg-orange-100 text-orange-600",
};

const VALID_TRANSITIONS: Record<string, string[]> = {
  scheduled: ["confirmed", "cancelled", "no_show"],
  confirmed: ["in_progress", "cancelled", "no_show"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: [],
};

interface AppointmentDetailDialogProps {
  organizationId: Id<"organizations">;
  appointmentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AppointmentDetailDialog({
  organizationId,
  appointmentId,
  open,
  onOpenChange,
}: AppointmentDetailDialogProps) {
  const { t } = useTranslation();
  const updateAppointment = useMutation(api["gabinet/appointments"].update);
  const updateStatus = useMutation(api["gabinet/appointments"].updateStatus);
  const cancelAppointment = useMutation(api["gabinet/appointments"].cancel);

  const { data: appointment } = useQuery({
    ...convexQuery(api["gabinet/appointments"].getById, {
      organizationId,
      appointmentId: appointmentId as Id<"gabinetAppointments">,
    }),
    enabled: !!appointmentId,
  });

  const { data: patients } = useQuery({
    ...convexQuery(api["gabinet/patients"].list, {
      organizationId,
      paginationOpts: { numItems: 200, cursor: null },
    }),
    enabled: !!appointment,
  });

  const { data: treatments } = useQuery({
    ...convexQuery(api["gabinet/treatments"].listActive, { organizationId }),
    enabled: !!appointment,
  });

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
  const nextStatuses = VALID_TRANSITIONS[appointment.status] ?? [];

  const startEdit = () => {
    setEditDate(appointment.date);
    setEditStartTime(appointment.startTime);
    setEditEndTime(appointment.endTime);
    setEditNotes(appointment.notes ?? "");
    setEditTreatmentId(appointment.treatmentId);
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
      <DialogContent className="max-w-lg">
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
              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={2}
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
              <Textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={2}
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
                          <X className="h-3.5 w-3.5" />
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
