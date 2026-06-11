import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSupabaseGabinetEmployeesList } from "@/hooks/use-supabase-gabinet-employees";
import { useCategoryDefinitions } from "@/hooks/use-category-definitions";
import { CategoryPicker } from "@/components/categories-tags/category-picker";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { formatActionError } from "@/lib/format-action-error";

interface EventDialogProps {
  organizationId: Id<"organizations">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: string;
  defaultTime?: string;
  defaultEndTime?: string;
  defaultEmployeeId?: string;
  onManageEventTypes?: () => void;
}

const ALL_EMPLOYEES = "__all__";

function computeEndTime(start: string, minutes: number): string {
  const [h, m] = start.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const eh = Math.floor(total / 60) % 24;
  const em = total % 60;
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function EventDialog({
  organizationId,
  open,
  onOpenChange,
  defaultDate,
  defaultTime,
  defaultEndTime,
  defaultEmployeeId,
  onManageEventTypes,
}: EventDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const createActivity = useAction(api.scheduledActivities.create);

  const { data: currentUser } = useQuery(
    convexQuery(api.app.getCurrentUser, {}),
  );

  const { data: employees } = useSupabaseGabinetEmployeesList(
    String(organizationId),
    { activeOnly: true },
  );

  const { categories: eventTypes } = useCategoryDefinitions(
    organizationId,
    "gabinetEvent",
  );

  const [title, setTitle] = useState("");
  const [date, setDate] = useState<string>(defaultDate ?? todayStr());
  const [startTime, setStartTime] = useState<string>(defaultTime ?? "09:00");
  const [endTime, setEndTime] = useState<string>(defaultEndTime ?? "10:00");
  const [employeeId, setEmployeeId] = useState<string>(
    defaultEmployeeId ?? ALL_EMPLOYEES,
  );
  const [categoryId, setCategoryId] = useState<
    Id<"categoryDefinitions"> | undefined
  >(undefined);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Re-seed form when dialog re-opens with new defaults
  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDate(defaultDate ?? todayStr());
    setStartTime(defaultTime ?? "09:00");
    setEndTime(
      defaultEndTime ?? computeEndTime(defaultTime ?? "09:00", 60),
    );
    setEmployeeId(defaultEmployeeId ?? ALL_EMPLOYEES);
    setCategoryId(undefined);
    setNotes("");
  }, [open, defaultDate, defaultTime, defaultEndTime, defaultEmployeeId]);

  // Keep endTime ≥ startTime as user edits start
  const handleStartTimeChange = useCallback(
    (next: string) => {
      setStartTime(next);
      if (endTime <= next) {
        setEndTime(computeEndTime(next, 60));
      }
    },
    [endTime],
  );

  const employeeOptions = useMemo(() => {
    return (employees ?? []).map((e) => ({
      userId: e.userId,
      name:
        [e.firstName, e.lastName].filter(Boolean).join(" ").trim() ||
        t("gabinet.calendar.unnamedEmployee", "Bez nazwy"),
    }));
  }, [employees, t]);

  const canSubmit =
    title.trim().length > 0 &&
    !!date &&
    !!startTime &&
    !!endTime &&
    startTime < endTime &&
    !!currentUser &&
    !submitting;

  const invalidateActivities = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: supabaseKeys.scheduledActivities.list(String(organizationId)),
    });
  }, [queryClient, organizationId]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !currentUser) return;
    setSubmitting(true);
    try {
      const dueDateMs = new Date(`${date}T${startTime}:00`).getTime();
      const endDateMs = new Date(`${date}T${endTime}:00`).getTime();
      const resourceId =
        employeeId === ALL_EMPLOYEES ? undefined : employeeId;

      await createActivity({
        organizationId,
        title: title.trim(),
        activityType: "gabinet:event",
        dueDate: dueDateMs,
        endDate: endDateMs,
        ownerId: String(currentUser._id),
        description: notes.trim() ? notes.trim() : undefined,
        categoryId: categoryId ? String(categoryId) : undefined,
        resourceId,
        sourceType: "manual",
        moduleRef: {
          moduleId: "gabinet",
          entityType: "gabinetEvent",
          // The activity row IS the event — there's no separate entity record.
          // Use a placeholder so the moduleRef shape stays consistent with
          // gabinetAppointment rows (which point at a gabinet_appointments row).
          entityId: "self",
        },
      });

      invalidateActivities();
      toast.success(
        t("gabinet.events.created", {
          defaultValue: "Dodano zdarzenie",
        }),
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(
        formatActionError(err, t, {
          key: "gabinet.events.errors.createFailed",
          defaultValue: "Nie udało się dodać zdarzenia.",
        }),
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    canSubmit,
    currentUser,
    date,
    startTime,
    endTime,
    employeeId,
    createActivity,
    organizationId,
    title,
    notes,
    categoryId,
    invalidateActivities,
    t,
    onOpenChange,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("gabinet.events.create", { defaultValue: "Nowe zdarzenie" })}
          </DialogTitle>
          <DialogDescription>
            {t("gabinet.events.createDescription", {
              defaultValue:
                "Zablokuj czas w kalendarzu na zebranie, szkolenie lub inne wewnętrzne zdarzenie.",
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="event-title">
              {t("gabinet.events.title", { defaultValue: "Tytuł" })}
            </Label>
            <Input
              id="event-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("gabinet.events.titlePlaceholder", {
                defaultValue: "np. Szkolenie zespołu",
              })}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="event-date">
              {t("gabinet.appointments.date", { defaultValue: "Data" })}
            </Label>
            <Input
              id="event-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="event-start">
                {t("gabinet.appointments.startTime", {
                  defaultValue: "Godzina rozpoczęcia",
                })}
              </Label>
              <Input
                id="event-start"
                type="time"
                value={startTime}
                onChange={(e) => handleStartTimeChange(e.target.value)}
                step={300}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event-end">
                {t("gabinet.appointments.endTime", {
                  defaultValue: "Godzina zakończenia",
                })}
              </Label>
              <Input
                id="event-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                step={300}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="event-employee">
              {t("gabinet.events.scope", {
                defaultValue: "Kogo dotyczy",
              })}
            </Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger id="event-employee">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_EMPLOYEES}>
                  {t("gabinet.events.scopeAll", {
                    defaultValue: "Cały gabinet (wszyscy pracownicy)",
                  })}
                </SelectItem>
                {employeeOptions.map((emp) => (
                  <SelectItem key={emp.userId} value={emp.userId}>
                    {emp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>
                {t("gabinet.events.eventType", {
                  defaultValue: "Typ zdarzenia",
                })}
              </Label>
              {onManageEventTypes && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={onManageEventTypes}
                >
                  {t("gabinet.events.manageTypes", {
                    defaultValue: "Zarządzaj typami",
                  })}
                </button>
              )}
            </div>
            <CategoryPicker
              categories={eventTypes as any}
              selectedId={categoryId}
              onChange={(id) => setCategoryId(id ?? undefined)}
              placeholder={t("gabinet.events.selectType", {
                defaultValue: "Wybierz typ zdarzenia (opcjonalnie)",
              })}
              organizationId={organizationId}
              entityType="gabinetEvent"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="event-notes">
              {t("gabinet.appointments.notes", { defaultValue: "Notatki" })}
            </Label>
            <Textarea
              id="event-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("gabinet.events.notesPlaceholder", {
                defaultValue: "Dodatkowe informacje...",
              })}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t("common.cancel", { defaultValue: "Anuluj" })}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting
              ? t("common.saving", { defaultValue: "Zapisywanie..." })
              : t("common.add", { defaultValue: "Dodaj" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
