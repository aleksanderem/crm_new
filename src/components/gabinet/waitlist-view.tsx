import { useState } from "react";
import { useAction } from "convex/react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { useSupabaseGabinetWaitlist } from "@/hooks/use-supabase-gabinet-waitlist";
import { useSupabaseGabinetPatientsList } from "@/hooks/use-supabase-gabinet-patients";
import { useSupabaseGabinetTreatmentsList } from "@/hooks/use-supabase-gabinet-treatments";
import { useSupabaseGabinetEmployeesList } from "@/hooks/use-supabase-gabinet-employees";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/layout/empty-state";
import { Bell, ClipboardList, Plus, Trash2 } from "@/lib/ez-icons";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { GabinetWaitlistRow } from "@/lib/supabase/database.types";

interface WaitlistViewProps {
  organizationId: string;
}

const STATUS_COLORS: Record<string, string> = {
  waiting: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  notified: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  booked: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  cancelled: "bg-muted text-muted-foreground",
  expired: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        STATUS_COLORS[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {t(`gabinet.waitlist.status.${status}`, status)}
    </span>
  );
}

function formatPreferredDates(dates: string[] | null): string {
  if (!dates || dates.length === 0) return "—";
  return dates.join(", ");
}

function formatPreferredTimes(times: string[] | null): string {
  if (!times || times.length === 0) return "—";
  return times.join(", ");
}

function parseCommaList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

interface AddWaitlistDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  onAdded: () => void;
}

function AddWaitlistDialog({
  open,
  onOpenChange,
  organizationId,
  onAdded,
}: AddWaitlistDialogProps) {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [patientId, setPatientId] = useState("");
  const [treatmentId, setTreatmentId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [preferredDates, setPreferredDates] = useState("");
  const [preferredTimes, setPreferredTimes] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState("0");

  const addToWaitlist = useAction(api.gabinet.waitlist.addToWaitlist);

  const { data: patients } = useSupabaseGabinetPatientsList(organizationId);
  const { data: treatments } = useSupabaseGabinetTreatmentsList(organizationId);
  const { data: employees } = useSupabaseGabinetEmployeesList(organizationId, { activeOnly: true });

  function resetForm() {
    setPatientId("");
    setTreatmentId("");
    setEmployeeId("");
    setPreferredDates("");
    setPreferredTimes("");
    setNotes("");
    setPriority("0");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!patientId) {
      toast.error(t("gabinet.waitlist.errors.patientRequired", "Wybierz pacjenta."));
      return;
    }

    setIsSubmitting(true);
    try {
      await addToWaitlist({
        organizationId: organizationId as Id<"organizations">,
        patientId,
        treatmentId: treatmentId && treatmentId !== "any" ? treatmentId : undefined,
        employeeId: employeeId && employeeId !== "any" ? employeeId : undefined,
        preferredDates: preferredDates ? parseCommaList(preferredDates) : undefined,
        preferredTimes: preferredTimes ? parseCommaList(preferredTimes) : undefined,
        notes: notes || undefined,
        priority: Number(priority) || 0,
      });
      toast.success(t("gabinet.waitlist.addedSuccess", "Dodano do listy rezerwowej."));
      resetForm();
      onAdded();
      onOpenChange(false);
    } catch {
      toast.error(t("gabinet.waitlist.errors.addFailed", "Nie udało się dodać do listy rezerwowej."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("gabinet.waitlist.addDialog.title", "Dodaj do listy rezerwowej")}</DialogTitle>
          <DialogDescription>
            {t("gabinet.waitlist.addDialog.description", "Wpisz pacjenta i preferowane terminy.")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="waitlist-patient">
              {t("gabinet.waitlist.form.patient", "Pacjent")}
              <span className="text-destructive"> *</span>
            </Label>
            <Select value={patientId} onValueChange={setPatientId}>
              <SelectTrigger id="waitlist-patient">
                <SelectValue placeholder={t("gabinet.waitlist.form.patientPlaceholder", "Wybierz pacjenta…")} />
              </SelectTrigger>
              <SelectContent>
                {(patients ?? []).map((p) => (
                  <SelectItem key={p._id} value={p._id}>
                    {p.firstName} {p.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="waitlist-treatment">
              {t("gabinet.waitlist.form.treatment", "Zabieg")}
            </Label>
            <Select value={treatmentId} onValueChange={setTreatmentId}>
              <SelectTrigger id="waitlist-treatment">
                <SelectValue placeholder={t("gabinet.waitlist.form.anyTreatment", "Dowolny")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">{t("gabinet.waitlist.form.anyTreatment", "Dowolny")}</SelectItem>
                {(treatments ?? []).map((t2) => (
                  <SelectItem key={t2._id} value={t2._id}>
                    {t2.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="waitlist-employee">
              {t("gabinet.waitlist.form.employee", "Specjalista")}
            </Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger id="waitlist-employee">
                <SelectValue placeholder={t("gabinet.waitlist.form.anyEmployee", "Dowolny")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">{t("gabinet.waitlist.form.anyEmployee", "Dowolny")}</SelectItem>
                {(employees ?? []).map((emp) => (
                  <SelectItem key={emp._id} value={emp._id}>
                    {emp.firstName ?? ""} {emp.lastName ?? ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="waitlist-dates">
                {t("gabinet.waitlist.form.preferredDates", "Preferowane daty")}
              </Label>
              <Input
                id="waitlist-dates"
                value={preferredDates}
                onChange={(e) => setPreferredDates(e.target.value)}
                placeholder="2026-09-01, 2026-09-05"
              />
              <p className="text-xs text-muted-foreground">
                {t("gabinet.waitlist.form.dateHint", "Oddziel przecinkami (RRRR-MM-DD)")}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="waitlist-times">
                {t("gabinet.waitlist.form.preferredTimes", "Preferowane godziny")}
              </Label>
              <Input
                id="waitlist-times"
                value={preferredTimes}
                onChange={(e) => setPreferredTimes(e.target.value)}
                placeholder="09:00, 14:00"
              />
              <p className="text-xs text-muted-foreground">
                {t("gabinet.waitlist.form.timeHint", "Oddziel przecinkami (GG:MM)")}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="waitlist-priority">
              {t("gabinet.waitlist.form.priority", "Priorytet")}
            </Label>
            <Input
              id="waitlist-priority"
              type="number"
              min="0"
              max="100"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-24"
            />
            <p className="text-xs text-muted-foreground">
              {t("gabinet.waitlist.form.priorityHint", "Niższy numer = wyższy priorytet")}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="waitlist-notes">
              {t("gabinet.waitlist.form.notes", "Notatki")}
            </Label>
            <Textarea
              id="waitlist-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={t("gabinet.waitlist.form.notesPlaceholder", "Dodatkowe informacje…")}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel", "Anuluj")}
            </Button>
            <Button type="submit" disabled={isSubmitting || !patientId}>
              {isSubmitting
                ? t("common.saving", "Zapisywanie…")
                : t("gabinet.waitlist.form.submit", "Dodaj do kolejki")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface WaitlistEntryRowProps {
  entry: GabinetWaitlistRow;
  patientName: string;
  treatmentName: string;
  employeeName: string;
  onNotify: (id: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

function WaitlistEntryRow({
  entry,
  patientName,
  treatmentName,
  employeeName,
  onNotify,
  onRemove,
}: WaitlistEntryRowProps) {
  const { t } = useTranslation();
  const [notifying, setNotifying] = useState(false);
  const [removing, setRemoving] = useState(false);

  const isActionable = entry.status === "waiting";
  const isCancelled = entry.status === "cancelled" || entry.status === "expired";

  async function handleNotify() {
    setNotifying(true);
    try {
      await onNotify(entry.id);
    } finally {
      setNotifying(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      await onRemove(entry.id);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className={cn(
      "flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-start sm:justify-between",
      isCancelled && "opacity-60",
    )}>
      <div className="flex flex-1 flex-col gap-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-sm truncate">{patientName}</span>
          <StatusBadge status={entry.status} />
          {entry.priority > 0 && (
            <span className="text-xs text-muted-foreground">
              {t("gabinet.waitlist.priority", "Priorytet")}: {entry.priority}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
          {treatmentName !== "—" && (
            <span>{t("gabinet.waitlist.treatment", "Zabieg")}: {treatmentName}</span>
          )}
          {employeeName !== "—" && (
            <span>{t("gabinet.waitlist.employee", "Specjalista")}: {employeeName}</span>
          )}
        </div>
        {(entry.preferred_dates?.length || entry.preferred_times?.length) ? (
          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
            {entry.preferred_dates?.length ? (
              <span>
                {t("gabinet.waitlist.preferredDates", "Daty")}: {formatPreferredDates(entry.preferred_dates)}
              </span>
            ) : null}
            {entry.preferred_times?.length ? (
              <span>
                {t("gabinet.waitlist.preferredTimes", "Godziny")}: {formatPreferredTimes(entry.preferred_times)}
              </span>
            ) : null}
          </div>
        ) : null}
        {entry.notes && (
          <p className="text-xs text-muted-foreground italic truncate">{entry.notes}</p>
        )}
        {entry.notified_at && (
          <span className="text-xs text-muted-foreground">
            {t("gabinet.waitlist.notifiedAt", "Powiadomiono")}: {new Date(entry.notified_at).toLocaleDateString()}
          </span>
        )}
      </div>

      {!isCancelled && (
        <div className="flex shrink-0 gap-2 sm:flex-col sm:items-end">
          {isActionable && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              disabled={notifying}
              onClick={handleNotify}
            >
              <Bell className="h-3.5 w-3.5" variant="stroke" />
              {notifying
                ? t("common.saving", "Zapisywanie…")
                : t("gabinet.waitlist.notify", "Powiadom")}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
            disabled={removing}
            onClick={handleRemove}
          >
            <Trash2 className="h-3.5 w-3.5" variant="stroke" />
            {removing
              ? t("common.saving", "Zapisywanie…")
              : t("common.remove", "Usuń")}
          </Button>
        </div>
      )}
    </div>
  );
}

export function WaitlistView({ organizationId }: WaitlistViewProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: entries = [], isLoading } = useSupabaseGabinetWaitlist(
    organizationId,
    { status: statusFilter === "all" ? undefined : statusFilter },
  );
  const { data: patients = [] } = useSupabaseGabinetPatientsList(organizationId);
  const { data: treatments = [] } = useSupabaseGabinetTreatmentsList(organizationId);
  const { data: employees = [] } = useSupabaseGabinetEmployeesList(organizationId, { activeOnly: true });

  const patientMap = Object.fromEntries(patients.map((p) => [p._id, `${p.firstName} ${p.lastName}`]));
  const treatmentMap = Object.fromEntries(treatments.map((t2) => [t2._id, t2.name]));
  const employeeMap = Object.fromEntries(
    employees.map((e) => [e._id, `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim() || e.role])
  );

  const markNotified = useAction(api.gabinet.waitlist.markNotified);
  const removeFromWaitlist = useAction(api.gabinet.waitlist.removeFromWaitlist);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetWaitlist.list(organizationId) });
  }

  async function handleNotify(waitlistId: string) {
    try {
      await markNotified({
        organizationId: organizationId as Id<"organizations">,
        waitlistId,
      });
      toast.success(t("gabinet.waitlist.notifiedSuccess", "Pacjent powiadomiony."));
      invalidate();
    } catch {
      toast.error(t("gabinet.waitlist.errors.notifyFailed", "Nie udało się wysłać powiadomienia."));
    }
  }

  async function handleRemove(waitlistId: string) {
    try {
      await removeFromWaitlist({
        organizationId: organizationId as Id<"organizations">,
        waitlistId,
      });
      toast.success(t("gabinet.waitlist.removedSuccess", "Usunięto z listy rezerwowej."));
      invalidate();
    } catch {
      toast.error(t("gabinet.waitlist.errors.removeFailed", "Nie udało się usunąć z listy."));
    }
  }

  const STATUS_OPTIONS = ["all", "waiting", "notified", "booked", "cancelled", "expired"] as const;

  return (
    <div className="flex flex-1 flex-col overflow-auto p-4 sm:p-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">
              {t("gabinet.waitlist.title", "Lista rezerwowa")}
            </h2>
            {entries.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {entries.length}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-7 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s} className="text-xs">
                    {s === "all"
                      ? t("gabinet.waitlist.filter.all", "Wszystkie")
                      : t(`gabinet.waitlist.status.${s}`, s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setAddDialogOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" variant="stroke" />
              {t("gabinet.waitlist.addToWaitlist", "Dodaj do kolejki")}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={t("gabinet.waitlist.empty.title", "Lista rezerwowa jest pusta.")}
            description={t(
              "gabinet.waitlist.empty.description",
              "Tutaj będą widoczni klienci oczekujący na wcześniejszy lub dogodny termin.",
            )}
            action={
              <Button size="sm" onClick={() => setAddDialogOpen(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" variant="stroke" />
                {t("gabinet.waitlist.addToWaitlist", "Dodaj do kolejki")}
              </Button>
            }
          />
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <WaitlistEntryRow
                key={entry.id}
                entry={entry}
                patientName={patientMap[entry.patient_id] ?? entry.patient_id}
                treatmentName={entry.treatment_id ? (treatmentMap[entry.treatment_id] ?? entry.treatment_id) : "—"}
                employeeName={entry.employee_id ? (employeeMap[entry.employee_id] ?? entry.employee_id) : "—"}
                onNotify={handleNotify}
                onRemove={handleRemove}
              />
            ))}
          </div>
        )}
      </div>

      <AddWaitlistDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        organizationId={organizationId}
        onAdded={invalidate}
      />
    </div>
  );
}
