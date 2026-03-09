import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "@/lib/ez-icons";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Id } from "@cvx/_generated/dataModel";

export const Route = createFileRoute("/_app/patient/_layout/appointments")({
  component: PatientAppointments,
});

interface Appointment {
  _id: Id<"gabinetAppointments">;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  treatmentName: string;
  notes?: string;
}

function PatientAppointments() {
  const { t } = useTranslation();
  const tokenHash =
    typeof window !== "undefined"
      ? (localStorage.getItem("patientPortalToken") ?? "")
      : "";

  const { data: appointments } = useQuery(
    convexQuery(api.gabinet.patientPortal.getMyAppointments, { tokenHash }),
  );

  const requestReschedule = useMutation(
    api.gabinet.patientPortal.requestReschedule,
  );

  const today = new Date().toISOString().split("T")[0];

  const { upcoming, past } = useMemo(() => {
    const all = (appointments ?? []) as Appointment[];
    return {
      upcoming: all
        .filter((a) => a.date >= today)
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            a.startTime.localeCompare(b.startTime),
        ),
      past: all
        .filter((a) => a.date < today)
        .sort(
          (a, b) =>
            b.date.localeCompare(a.date) ||
            b.startTime.localeCompare(a.startTime),
        ),
    };
  }, [appointments, today]);

  // Reschedule dialog state
  const [rescheduleAppt, setRescheduleAppt] = useState<Appointment | null>(
    null,
  );
  const [requestedDate, setRequestedDate] = useState("");
  const [requestedTime, setRequestedTime] = useState("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const openReschedule = (appt: Appointment) => {
    setRescheduleAppt(appt);
    setRequestedDate(appt.date);
    setRequestedTime(appt.startTime);
    setReason("");
    setConfirming(false);
  };

  const closeReschedule = () => {
    setRescheduleAppt(null);
    setConfirming(false);
  };

  const handleRescheduleSubmit = async () => {
    if (!rescheduleAppt || !requestedDate || !requestedTime) return;
    setSubmitting(true);
    try {
      await requestReschedule({
        tokenHash,
        appointmentId: rescheduleAppt._id,
        requestedDate,
        requestedTime,
        reason: reason || undefined,
      });
      toast.success(t("patientPortal.appointments.rescheduleSuccess"));
      closeReschedule();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "scheduled":
        return "outline" as const;
      case "confirmed":
        return "default" as const;
      case "completed":
        return "secondary" as const;
      case "cancelled":
        return "destructive" as const;
      default:
        return "secondary" as const;
    }
  };

  const canReschedule = (status: string) =>
    status === "scheduled" || status === "confirmed";

  const renderList = (items: Appointment[], emptyMsg: string, showReschedule: boolean) => {
    if (items.length === 0) {
      return (
        <div className="p-6 text-center text-sm text-muted-foreground">
          {emptyMsg}
        </div>
      );
    }
    return (
      <div className="divide-y">
        {items.map((a) => (
          <div
            key={a._id}
            className="flex items-center justify-between px-4 py-3"
          >
            <div>
              <p className="text-sm font-medium">{a.treatmentName}</p>
              <p className="text-xs text-muted-foreground">
                {a.date} · {a.startTime}–{a.endTime}
              </p>
              {a.notes && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {a.notes}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {showReschedule && canReschedule(a.status) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openReschedule(a)}
                  aria-label={t("patientPortal.appointments.reschedule")}
                >
                  {t("patientPortal.appointments.reschedule")}
                </Button>
              )}
              <Badge variant={statusColor(a.status)}>
                {a.status.replace("_", " ")}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {t("patientPortal.appointments.title")}
        </h1>
        <Button asChild size="sm">
          <Link to="/patient/book">
            <Plus className="mr-1 h-4 w-4" variant="stroke" />
            {t("patientPortal.booking.bookButton")}
          </Link>
        </Button>
      </div>

      <div className="rounded-lg border">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">
            {t("patientPortal.appointments.upcoming")}
          </h3>
        </div>
        {renderList(upcoming, t("patientPortal.appointments.noUpcoming"), true)}
      </div>

      <div className="rounded-lg border">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-semibold">
            {t("patientPortal.appointments.past")}
          </h3>
        </div>
        {renderList(past, t("patientPortal.appointments.noPast"), false)}
      </div>

      {/* Reschedule Dialog */}
      <Dialog open={!!rescheduleAppt} onOpenChange={(o) => !o && closeReschedule()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("patientPortal.appointments.rescheduleTitle")}
            </DialogTitle>
            <DialogDescription>
              {confirming
                ? t("patientPortal.appointments.rescheduleConfirmDescription")
                : t("patientPortal.appointments.rescheduleDescription")}
            </DialogDescription>
          </DialogHeader>

          {!confirming ? (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="reschedule-date">
                  {t("patientPortal.appointments.rescheduleDate")}
                </Label>
                <Input
                  id="reschedule-date"
                  type="date"
                  value={requestedDate}
                  min={today}
                  onChange={(e) => setRequestedDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reschedule-time">
                  {t("patientPortal.appointments.rescheduleTime")}
                </Label>
                <Input
                  id="reschedule-time"
                  type="time"
                  value={requestedTime}
                  onChange={(e) => setRequestedTime(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reschedule-reason">
                  {t("patientPortal.appointments.rescheduleReason")}
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({t("common.optional")})
                  </span>
                </Label>
                <Textarea
                  id="reschedule-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t(
                    "patientPortal.appointments.rescheduleReasonPlaceholder",
                  )}
                  rows={3}
                />
              </div>
            </div>
          ) : (
            <div className="py-4 space-y-2">
              <p className="text-sm">
                <span className="font-medium">
                  {t("patientPortal.appointments.rescheduleDate")}:
                </span>{" "}
                {requestedDate}
              </p>
              <p className="text-sm">
                <span className="font-medium">
                  {t("patientPortal.appointments.rescheduleTime")}:
                </span>{" "}
                {requestedTime}
              </p>
              {reason && (
                <p className="text-sm">
                  <span className="font-medium">
                    {t("patientPortal.appointments.rescheduleReason")}:
                  </span>{" "}
                  {reason}
                </p>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                {t("patientPortal.appointments.reschedulePendingNote")}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeReschedule}>
              {t("common.cancel")}
            </Button>
            {!confirming ? (
              <Button
                onClick={() => setConfirming(true)}
                disabled={!requestedDate || !requestedTime}
              >
                {t("common.continue")}
              </Button>
            ) : (
              <Button onClick={handleRescheduleSubmit} disabled={submitting}>
                {submitting
                  ? t("common.loading")
                  : t("patientPortal.appointments.rescheduleSubmit")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
