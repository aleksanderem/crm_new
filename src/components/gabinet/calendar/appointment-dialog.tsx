import { useState, useMemo } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Clock } from "@/lib/ez-icons";
import { Id } from "@cvx/_generated/dataModel";
import { toast } from "sonner";

interface AppointmentDialogProps {
  organizationId: Id<"organizations">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: string;
  defaultTime?: string;
}

export function AppointmentDialog({
  organizationId,
  open,
  onOpenChange,
  defaultDate,
  defaultTime,
}: AppointmentDialogProps) {
  const { t } = useTranslation();
  const createAppointment = useMutation(api["gabinet/appointments"].create);

  const { data: patients } = useQuery(
    convexQuery(api["gabinet/patients"].list, {
      organizationId,
      paginationOpts: { numItems: 100, cursor: null },
    })
  );

  const { data: treatments } = useQuery(
    convexQuery(api["gabinet/treatments"].listActive, { organizationId })
  );

  const { data: employees } = useQuery(
    convexQuery(api["gabinet/employees"].listAll, { organizationId, activeOnly: true })
  );

  const { data: members } = useQuery(
    convexQuery(api.organizations.getMembers, { organizationId })
  );

  const [patientId, setPatientId] = useState("");
  const [treatmentId, setTreatmentId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(defaultDate ?? new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState(defaultTime ?? "09:00");
  const [endTime, setEndTime] = useState("09:30");
  const [notes, setNotes] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState("weekly");
  const [recurringCount, setRecurringCount] = useState(4);
  const [submitting, setSubmitting] = useState(false);

  // Resolve user names for employees
  const userMap = useMemo(() => {
    const map = new Map<string, { name?: string | null; email?: string | null }>();
    members?.forEach((m) => {
      if (m.user) map.set(m.userId, m.user);
    });
    return map;
  }, [members]);

  function getEmployeeDisplayName(emp: { firstName?: string; lastName?: string; userId: string; specialization?: string; role: string }) {
    if (emp.firstName || emp.lastName) {
      return `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim();
    }
    const user = userMap.get(emp.userId);
    return user?.name || user?.email || emp.specialization || emp.role;
  }

  // Query available slots when employee + date + treatment are selected
  const selectedTreatment = treatments?.find((t) => t._id === treatmentId);
  const { data: availableSlots } = useQuery({
    ...convexQuery(api["gabinet/appointments"].getAvailableSlotsQuery, {
      organizationId,
      userId: employeeId as Id<"users">,
      date,
      duration: selectedTreatment?.duration ?? 30,
    }),
    enabled: !!employeeId && !!date && !!selectedTreatment,
  });

  // Auto-set end time based on treatment duration
  const handleTreatmentChange = (tid: string) => {
    setTreatmentId(tid);
    const treatment = treatments?.find((t) => t._id === tid);
    if (treatment && startTime) {
      const [h, m] = startTime.split(":").map(Number);
      const endMinutes = h * 60 + m + treatment.duration;
      const eh = Math.floor(endMinutes / 60);
      const em = endMinutes % 60;
      setEndTime(`${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`);
    }
  };

  const handleSubmit = async () => {
    if (!patientId || !treatmentId || !date || !startTime || !endTime) return;
    setSubmitting(true);
    try {
      await createAppointment({
        organizationId,
        patientId: patientId as Id<"gabinetPatients">,
        treatmentId: treatmentId as Id<"gabinetTreatments">,
        employeeId: employeeId ? employeeId as Id<"users"> : undefined,
        date,
        startTime,
        endTime,
        notes: notes || undefined,
        isRecurring,
        recurringRule: isRecurring ? { frequency, count: recurringCount } : undefined,
      });
      toast.success(t("gabinet.appointments.created"));
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("gabinet.appointments.createAppointment")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("gabinet.appointments.patient")}</Label>
            <Select value={patientId} onValueChange={setPatientId}>
              <SelectTrigger className="h-9"><SelectValue placeholder={t("gabinet.appointments.selectPatient")} /></SelectTrigger>
              <SelectContent>
                {(patients?.page ?? []).map((p) => (
                  <SelectItem key={p._id} value={p._id}>{p.firstName} {p.lastName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("gabinet.appointments.treatment")}</Label>
            <Select value={treatmentId} onValueChange={handleTreatmentChange}>
              <SelectTrigger className="h-9"><SelectValue placeholder={t("gabinet.appointments.selectTreatment")} /></SelectTrigger>
              <SelectContent>
                {(treatments ?? []).map((tr) => (
                  <SelectItem key={tr._id} value={tr._id}>
                    {tr.name} ({tr.duration} min)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("gabinet.appointments.employee")}</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger className="h-9"><SelectValue placeholder={t("gabinet.appointments.selectEmployee")} /></SelectTrigger>
              <SelectContent>
                {(employees ?? []).map((emp) => (
                  <SelectItem key={emp._id} value={emp.userId}>
                    {getEmployeeDisplayName(emp)}
                    {emp.specialization && (emp.firstName || emp.lastName) ? ` — ${emp.specialization}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>{t("gabinet.appointments.date")}</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("gabinet.appointments.startTime")}</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("gabinet.appointments.endTime")}</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>

          {/* Available slots */}
          {employeeId && date && selectedTreatment && availableSlots && (
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {t("gabinet.appointments.availableSlots")}
              </Label>
              {availableSlots.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {availableSlots.slice(0, 20).map((slot) => (
                    <Badge
                      key={slot.start}
                      variant={startTime === slot.start ? "default" : "outline"}
                      className="cursor-pointer text-xs"
                      onClick={() => {
                        setStartTime(slot.start);
                        setEndTime(slot.end);
                      }}
                    >
                      {slot.start}
                    </Badge>
                  ))}
                  {availableSlots.length > 20 && (
                    <span className="text-xs text-muted-foreground self-center">
                      +{availableSlots.length - 20}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-xs text-destructive">
                  {t("gabinet.appointments.noAvailableSlots")}
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{t("gabinet.appointments.notes")}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="recurring"
              checked={isRecurring}
              onCheckedChange={(checked) => setIsRecurring(checked as boolean)}
            />
            <Label htmlFor="recurring">{t("gabinet.appointments.recurring")}</Label>
          </div>

          {isRecurring && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("gabinet.appointments.frequency")}</Label>
                <Select value={frequency} onValueChange={setFrequency}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">{t("gabinet.appointments.frequencies.daily")}</SelectItem>
                    <SelectItem value="weekly">{t("gabinet.appointments.frequencies.weekly")}</SelectItem>
                    <SelectItem value="biweekly">{t("gabinet.appointments.frequencies.biweekly")}</SelectItem>
                    <SelectItem value="monthly">{t("gabinet.appointments.frequencies.monthly")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("gabinet.appointments.count")}</Label>
                <Input
                  type="number"
                  value={recurringCount}
                  onChange={(e) => setRecurringCount(parseInt(e.target.value) || 1)}
                  min={1}
                  max={52}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleSubmit} disabled={submitting || !patientId || !treatmentId}>
              {submitting ? t("common.saving") : t("gabinet.appointments.createAppointment")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
