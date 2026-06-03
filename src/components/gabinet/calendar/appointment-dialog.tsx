import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction, useConvex } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  extractActionErrorMessage,
  formatAppointmentError,
} from "@/lib/format-action-error";
import { UntitledAlert } from "@/components/ui/untitled-alert";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/gabinet/rich-text-editor";
import { PlateText } from "@/components/plate-text";
import { ScrollShadow } from "@/components/ui/scroll-shadow";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import {
  Clock,
  ChevronsUpDown,
  Stethoscope,
  StickyNote,
  User,
  UserPlus,
  MapPin,
  Building2,
} from "@/lib/ez-icons";
import { AlertTriangle, CalendarSearch, GripHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { SidePanel } from "@/components/crm/side-panel";
import { PatientForm } from "@/components/forms/patient-form";
import { useSupabaseGabinetLeavesList } from "@/hooks/use-supabase-gabinet-leaves";
import { formatPhoneNumber } from "@/lib/phone";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AppointmentDialogProps {
  organizationId: Id<"organizations">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: string;
  defaultTime?: string;
  defaultEndTime?: string;
  /** Pre-select an employee when opening — used by the day-by-employee
   *  calendar view so clicking inside a column carries the column owner. */
  defaultEmployeeId?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format price as Polish locale string (e.g. "350,00 zl") */
function formatPrice(price: number | undefined | null): string {
  if (price == null) return "";
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(price);
}

/** Compute end time string from start + duration in minutes */
function computeEndTime(start: string, durationMinutes: number): string {
  const [h, m] = start.split(":").map(Number);
  const total = h * 60 + m + durationMinutes;
  const eh = Math.floor(total / 60);
  const em = total % 60;
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}

/**
 * Mirror of backend `generateRecurringDates` (convex/gabinet/appointments.ts).
 * Keep in sync — both compute the list of recurrence dates following the base.
 * For "custom" frequency there is no cycle: every occurrence defaults to the
 * base date so the user has a starting row to edit. Issue #817.
 */
function generateRecurringDates(
  startDate: string,
  frequency: string,
  count: number,
): string[] {
  if (frequency === "custom") {
    return Array.from({ length: Math.max(0, count - 1) }, () => startDate);
  }
  const dates: string[] = [];
  const d = new Date(startDate + "T00:00:00");
  for (let i = 1; i < count; i++) {
    switch (frequency) {
      case "daily":
        d.setDate(d.getDate() + 1);
        break;
      case "weekly":
        d.setDate(d.getDate() + 7);
        break;
      case "biweekly":
        d.setDate(d.getDate() + 14);
        break;
      case "monthly":
        d.setMonth(d.getMonth() + 1);
        break;
      default:
        return dates;
    }
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    dates.push(`${yyyy}-${mm}-${dd}`);
  }
  return dates;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AppointmentDialog({
  organizationId,
  open,
  onOpenChange,
  defaultDate,
  defaultTime,
  defaultEndTime,
  defaultEmployeeId,
}: AppointmentDialogProps) {
  const { t, i18n } = useTranslation();
  const dateFnsLocale = i18n.resolvedLanguage === "pl" ? pl : undefined;
  const createAppointment = useAction(api.gabinet.appointments.create);
  const createPatient = useAction(api.gabinet.patients.create);
  const findNextSlotAction = useAction(api.gabinet.scheduling.findNextAvailableSlot);
  const convex = useConvex();
  const queryClient = useQueryClient();

  // -------------------------------------------------------------------------
  // Data queries
  // -------------------------------------------------------------------------

  const listPatientsAction = useAction(api.gabinet.patients.list);
  const { data: patientsPage } = useQuery({
    queryKey: ["gabinet.patients.list", organizationId, "dialog"],
    queryFn: () => listPatientsAction({
      organizationId,
      paginationOpts: { numItems: 200, cursor: null },
    }),
    enabled: !!organizationId,
  }) as { data: { page: any[] } | undefined };
  const patients = patientsPage;

  const listActiveTreatmentsAction = useAction(api.gabinet.treatments.listActive);
  const { data: treatments } = useQuery({
    queryKey: ["gabinet.treatments.listActive", organizationId],
    queryFn: () => listActiveTreatmentsAction({ organizationId }),
    enabled: !!organizationId,
  }) as { data: any[] | undefined };

  const listEmployeesAction = useAction(api.gabinet.employees.listAll);
  const { data: employees } = useQuery({
    queryKey: ["gabinet.employees.listAll", organizationId, true],
    queryFn: () => listEmployeesAction({ organizationId, activeOnly: true }),
    enabled: !!organizationId,
  }) as { data: any[] | undefined };

  const { data: members } = useQuery(
    convexQuery(api.organizations.getMembers, { organizationId }),
  );

  const listLocationsAction = useAction(api.gabinet.locations.listLocations);
  const { data: locations } = useQuery({
    queryKey: ["gabinet.locations.listLocations", organizationId],
    queryFn: () => listLocationsAction({ organizationId }),
    enabled: !!organizationId,
  });

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  const [treatmentId, setTreatmentId] = useState("");
  const [employeeId, setEmployeeId] = useState(defaultEmployeeId ?? "");
  const [patientId, setPatientId] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    defaultDate ? new Date(defaultDate + "T00:00:00") : undefined,
  );
  const [selectedSlot, setSelectedSlot] = useState<{
    start: string;
    end: string;
  } | null>(
    defaultTime ? { start: defaultTime, end: defaultEndTime ?? "" } : null,
  );
  const [notes, setNotes] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState("weekly");
  const [recurringCount, setRecurringCount] = useState(4);
  // Per-occurrence date/start-time overrides, keyed by occurrence index (1+
  // since index 0 is the base appointment tied to calendar selection). Letting
  // the user customize the DATE — not only the time — supports series that
  // don't follow a fixed cycle (issue #790). Index-based keying keeps
  // overrides stable when the cycle frequency/count changes.
  const [recurringOverrides, setRecurringOverrides] = useState<
    Record<number, { date?: string; startTime?: string }>
  >({});
  const [submitting, setSubmitting] = useState(false);
  const [searchingSlot, setSearchingSlot] = useState(false);
  const [locationId, setLocationId] = useState("");
  const [roomId, setRoomId] = useState("");

  // Combobox open states
  const [treatmentOpen, setTreatmentOpen] = useState(false);
  const [patientOpen, setPatientOpen] = useState(false);
  const [patientSearch, setPatientSearch] = useState("");
  const [treatmentSearch, setTreatmentSearch] = useState("");

  // Add-patient sub-panel state
  const [addPatientOpen, setAddPatientOpen] = useState(false);
  const [creatingPatient, setCreatingPatient] = useState(false);
  const [pendingPatientLabel, setPendingPatientLabel] = useState<string | null>(
    null,
  );

  // Past-slot confirmation popup
  const [pastConfirmOpen, setPastConfirmOpen] = useState(false);

  // Drag-to-reposition state — users want to peek at the calendar underneath
  // without closing the dialog (issue #977). Offset resets when the dialog
  // closes so the next open starts centered.
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  useEffect(() => {
    if (!open) {
      setDragOffset({ x: 0, y: 0 });
      setIsDragging(false);
    }
  }, [open]);

  const handleDragStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startOffset = dragOffset;
      setIsDragging(true);

      const handleMove = (ev: PointerEvent) => {
        setDragOffset({
          x: startOffset.x + (ev.clientX - startX),
          y: startOffset.y + (ev.clientY - startY),
        });
      };

      const handleUp = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        setIsDragging(false);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [dragOffset],
  );

  // Auto-scroll the currently-selected slot button into view so the user
  // doesn't have to scroll through the full day's slot list to find a time
  // pre-filled from a calendar click or "Find nearest slot". Issue #786.
  const selectedSlotButtonRef = useCallback((node: HTMLButtonElement | null) => {
    if (node) {
      node.scrollIntoView({ block: "nearest" });
    }
  }, []);

  // -------------------------------------------------------------------------
  // Derived data
  // -------------------------------------------------------------------------

  const userMap = useMemo(() => {
    const map = new Map<
      string,
      { name?: string | null; email?: string | null }
    >();
    members?.forEach((m) => {
      if (m.user) map.set(m.userId, m.user);
    });
    return map;
  }, [members]);

  const getEmployeeDisplayName = useCallback(
    (emp: {
      firstName?: string;
      lastName?: string;
      userId: string;
      specialization?: string;
      role: string;
    }) => {
      if (emp.firstName || emp.lastName) {
        return `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim();
      }
      const user = userMap.get(emp.userId);
      return user?.name || user?.email || emp.specialization || emp.role;
    },
    [userMap],
  );

  const selectedTreatment = useMemo(
    () => treatments?.find((tr) => tr._id === treatmentId),
    [treatments, treatmentId],
  );

  const selectedPatient = useMemo(
    () => (patients?.page ?? []).find((p) => p._id === patientId),
    [patients, patientId],
  );

  const selectedEmployee = useMemo(() => {
    if (!employeeId || !employees) return undefined;
    return employees.find((e) => e.userId === employeeId);
  }, [employees, employeeId]);

  // Filter employees by treatment qualification
  const qualifiedEmployees = useMemo(() => {
    if (!employees) return [];
    if (!treatmentId) return employees;
    return employees.filter(
      (emp) =>
        emp.qualifiedTreatmentIds.length === 0 ||
        emp.qualifiedTreatmentIds.includes(
          treatmentId as Id<"gabinetTreatments">,
        ),
    );
  }, [employees, treatmentId]);

  // Filter patients by search
  const filteredPatients = useMemo(() => {
    const all = patients?.page ?? [];
    if (!patientSearch.trim()) return all;
    const q = patientSearch.toLowerCase();
    return all.filter((p) => {
      const first = (p.firstName ?? "").toLowerCase();
      const last = (p.lastName ?? "").toLowerCase();
      const fullName = `${first} ${last}`;
      const reverseName = `${last} ${first}`;
      return (
        fullName.includes(q) ||
        reverseName.includes(q) ||
        (p.email ?? "").toLowerCase().includes(q) ||
        (p.phone ?? "").toLowerCase().includes(q)
      );
    });
  }, [patients, patientSearch]);

  // Filter treatments by search
  const filteredTreatments = useMemo(() => {
    const all = treatments ?? [];
    if (!treatmentSearch.trim()) return all;
    const q = treatmentSearch.toLowerCase();
    return all.filter((tr) => (tr.name ?? "").toLowerCase().includes(q));
  }, [treatments, treatmentSearch]);

  const dateStr = selectedDate
    ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`
    : "";

  // Available slots — action reading from Supabase
  const getAvailableSlots = useAction(api.gabinet.appointments.getAvailableSlotsQuery);
  const { data: availableSlots, isLoading: slotsLoading } = useQuery({
    queryKey: [
      "gabinet.availableSlots",
      organizationId,
      employeeId,
      dateStr,
      selectedTreatment?.duration ?? 30,
    ],
    queryFn: () =>
      getAvailableSlots({
        organizationId,
        userId: employeeId as string,
        date: dateStr,
        duration: selectedTreatment?.duration ?? 30,
      }),
    enabled: !!employeeId && !!dateStr && !!selectedTreatment,
  });

  // Rooms query — enabled only when a location is selected
  const getLocationAction = useAction(api.gabinet.locations.getLocation);
  const { data: locationWithRooms } = useQuery({
    queryKey: ["gabinet.locations.getLocation", organizationId, locationId],
    queryFn: () =>
      getLocationAction({
        organizationId,
        locationId: locationId as string,
      }),
    enabled: !!locationId,
  });
  const activeRooms = locationWithRooms?.rooms?.filter((r) => r.isActive) ?? [];

  // Equipment at selected location — for advisory warnings
  const listEquipmentAction = useAction(api.gabinet.equipment.listEquipment);
  const { data: equipmentAtLocation } = useQuery({
    queryKey: ["gabinet.equipment.listEquipment", organizationId, locationId],
    queryFn: () => listEquipmentAction({
      organizationId,
      locationId,
    }),
    enabled: !!organizationId && !!locationId,
  });

  const activeLocations = locations?.filter((l) => l.isActive) ?? [];

  // Approved leaves for the selected employee — flag overlaps with the chosen
  // date so the user sees an explicit warning. The available-slots backend
  // already filters leave time but does not tell the user why. Issue #652.
  const { data: employeeLeaves } = useSupabaseGabinetLeavesList(
    organizationId,
    { userId: employeeId || undefined, status: "approved", enabled: !!employeeId },
  );

  const employeeLeaveOnSelectedDate = useMemo(() => {
    if (!dateStr || !employeeLeaves || employeeLeaves.length === 0) return null;
    return (
      employeeLeaves.find(
        (l) => l.startDate <= dateStr && l.endDate >= dateStr,
      ) ?? null
    );
  }, [employeeLeaves, dateStr]);

  // Equipment warning — advisory only
  const missingEquipmentIds = useMemo(() => {
    if (!locationId || !selectedTreatment?.requiredEquipmentIds?.length) return [];
    const atLocationIds = new Set(equipmentAtLocation?.map((e: { _id: string }) => e._id) ?? []);
    return selectedTreatment.requiredEquipmentIds.filter((id: string) => !atLocationIds.has(id));
  }, [locationId, selectedTreatment, equipmentAtLocation]);

  // -------------------------------------------------------------------------
  // Auto-select employee when only one qualified
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (qualifiedEmployees.length === 1 && !employeeId) {
      setEmployeeId(qualifiedEmployees[0].userId);
    }
  }, [qualifiedEmployees, employeeId]);

  // -------------------------------------------------------------------------
  // Reset downstream state when upstream selection changes
  // -------------------------------------------------------------------------

  const handleTreatmentSelect = useCallback(
    (tid: string) => {
      setTreatmentId(tid);
      setTreatmentOpen(false);
      setTreatmentSearch("");
      // Reset employee if no longer qualified
      if (employeeId && employees) {
        const emp = employees.find((e) => e.userId === employeeId);
        if (
          emp &&
          emp.qualifiedTreatmentIds.length > 0 &&
          !emp.qualifiedTreatmentIds.includes(tid as Id<"gabinetTreatments">)
        ) {
          setEmployeeId("");
          setSelectedSlot(null);
        }
      }
    },
    [employeeId, employees],
  );

  const handleEmployeeSelect = useCallback((eid: string) => {
    setEmployeeId(eid);
    setSelectedSlot(null);
  }, []);

  const handleDateSelect = useCallback((date: Date | undefined) => {
    setSelectedDate(date);
    setSelectedSlot(null);
  }, []);

  const handleLocationSelect = useCallback((id: string) => {
    setLocationId(id);
    setRoomId("");
  }, []);

  const handleSlotSelect = useCallback(
    (slot: { start: string; end: string }) => {
      setSelectedSlot(slot);
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Find nearest slot
  // -------------------------------------------------------------------------

  const handleFindSlot = useCallback(async () => {
    if (!employeeId || !selectedTreatment) return;
    setSearchingSlot(true);
    try {
      const result = await findNextSlotAction({
        organizationId,
        employeeId: employeeId as string,
        durationMinutes: selectedTreatment.duration,
        fromDate:
          dateStr || (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`; })(),
      });
      if (result) {
        const d = new Date(result.date + "T00:00:00");
        setSelectedDate(d);
        setSelectedSlot({ start: result.startTime, end: result.endTime });
        toast.success(
          t("gabinet.appointments.findSlotSuccess", {
            date: result.date,
            time: result.startTime,
          }),
        );
      } else {
        toast.error(t("gabinet.appointments.findSlotEmpty"));
      }
    } catch {
      toast.error(t("gabinet.appointments.findSlotError"));
    } finally {
      setSearchingSlot(false);
    }
  }, [employeeId, selectedTreatment, organizationId, dateStr, convex, t]);

  // -------------------------------------------------------------------------
  // Create new patient inline
  // -------------------------------------------------------------------------

  const handleCreatePatient = useCallback(
    async (formData: {
      firstName: string;
      lastName: string;
      email: string;
      phone?: string;
      pesel?: string | null;
      dateOfBirth?: string | null;
      gender?: "male" | "female" | "other";
      address?: { street?: string; city?: string; postalCode?: string } | null;
      medicalNotes?: string | null;
      allergies?: string | null;
      bloodType?: string | null;
      emergencyContactName?: string | null;
      emergencyContactPhone?: string | null;
      referralSource?: string | null;
    }) => {
      setCreatingPatient(true);
      try {
        const newId = await createPatient({
          organizationId,
          ...formData,
        });
        setPendingPatientLabel(
          `${formData.firstName} ${formData.lastName}`.trim(),
        );
        setPatientId(String(newId));
        await queryClient.invalidateQueries({
          queryKey: ["gabinet.patients.list", organizationId],
        });
        setAddPatientOpen(false);
        toast.success(t("gabinet.patients.created", { defaultValue: "Klient utworzony" }));
      } catch (e) {
        const inner = extractActionErrorMessage(e);
        toast.error(
          inner ||
            t("gabinet.patients.errors.createFailed", {
              defaultValue: "Nie udało się utworzyć klienta.",
            }),
        );
      } finally {
        setCreatingPatient(false);
      }
    },
    [createPatient, organizationId, queryClient, t],
  );

  // Clear pending label once the new patient appears in the query cache
  useEffect(() => {
    if (
      pendingPatientLabel &&
      patientId &&
      (patients?.page ?? []).some((p) => p._id === patientId)
    ) {
      setPendingPatientLabel(null);
    }
  }, [pendingPatientLabel, patientId, patients]);

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------

  const endTime = selectedSlot
    ? selectedSlot.end ||
      computeEndTime(
        selectedSlot.start,
        selectedTreatment?.duration ?? 30,
      )
    : "";

  const isPastSlot = useMemo(() => {
    if (!dateStr || !selectedSlot?.start) return false;
    const slotStart = new Date(`${dateStr}T${selectedSlot.start}:00`);
    return slotStart.getTime() < Date.now();
  }, [dateStr, selectedSlot]);

  // Recurring occurrences (date + effective start time). The first entry is
  // the base appointment (tied to calendar selection, read-only). The rest
  // are generated from the cycle, with optional per-index date/time overrides
  // — overrides let the user move occurrences to dates that don't follow the
  // cycle (issue #790).
  const recurringOccurrences = useMemo(() => {
    if (!isRecurring || !dateStr || !selectedSlot?.start) return [];
    const baseStart = selectedSlot.start;
    const cycleDates = generateRecurringDates(dateStr, frequency, recurringCount);
    return [
      { date: dateStr, startTime: baseStart, index: 0 },
      ...cycleDates.map((cycleDate, i) => {
        const index = i + 1;
        const override = recurringOverrides[index];
        return {
          date: override?.date ?? cycleDate,
          startTime: override?.startTime ?? baseStart,
          index,
        };
      }),
    ];
  }, [isRecurring, dateStr, selectedSlot, frequency, recurringCount, recurringOverrides]);

  const canSubmit =
    !!patientId &&
    !!treatmentId &&
    !!employeeId &&
    !!dateStr &&
    !!selectedSlot &&
    !submitting;

  const performCreate = useCallback(async () => {
    if (!canSubmit || !selectedSlot) return;
    setSubmitting(true);
    try {
      const treatmentDuration = selectedTreatment?.duration ?? 30;
      // Build per-occurrence overrides for the recurrences (excluding the base
      // appointment at index 0). Only send if at least one entry has a custom
      // date or start time so the backend keeps using the simple rule path
      // otherwise.
      const cycleDates = isRecurring
        ? generateRecurringDates(dateStr, frequency, recurringCount)
        : [];
      const recurringOverridesPayload =
        isRecurring && recurringOccurrences.length > 1
          ? recurringOccurrences.slice(1).map((occ) => ({
              date: occ.date,
              startTime: occ.startTime,
              endTime: computeEndTime(occ.startTime, treatmentDuration),
            }))
          : undefined;
      // For "custom" frequency every occurrence is by definition user-chosen,
      // so always send overrides — otherwise the backend's rule-based
      // generator returns nothing for the unknown "custom" cycle. Issue #817.
      const hasCustomizations =
        frequency === "custom" ||
        recurringOverridesPayload?.some(
          (o, i) =>
            o.startTime !== selectedSlot.start || o.date !== cycleDates[i],
        );
      await createAppointment({
        organizationId,
        patientId: patientId as Id<"gabinetPatients">,
        treatmentId: treatmentId as Id<"gabinetTreatments">,
        employeeId: employeeId as Id<"users">,
        date: dateStr,
        startTime: selectedSlot.start,
        endTime,
        notes: notes || undefined,
        isRecurring,
        recurringRule: isRecurring
          ? { frequency, count: recurringCount }
          : undefined,
        recurringOverrides: hasCustomizations ? recurringOverridesPayload : undefined,
        locationId: locationId ? (locationId as Id<"gabinetLocations">) : undefined,
        roomId: roomId ? (roomId as Id<"gabinetRooms">) : undefined,
      });
      // Refresh the calendar immediately — Convex actions don't invalidate
      // the Supabase React Query cache automatically.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: supabaseKeys.gabinetAppointments.all }),
        queryClient.invalidateQueries({ queryKey: supabaseKeys.scheduledActivities.all }),
      ]);
      toast.success(t("gabinet.appointments.created"));
      onOpenChange(false);
    } catch (e) {
      toast.error(
        formatAppointmentError(e, t, {
          key: "gabinet.appointments.createFailed",
          defaultValue: "Nie udało się utworzyć wizyty.",
        }),
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    canSubmit,
    selectedSlot,
    createAppointment,
    organizationId,
    patientId,
    treatmentId,
    employeeId,
    dateStr,
    endTime,
    notes,
    isRecurring,
    frequency,
    recurringCount,
    recurringOccurrences,
    selectedTreatment,
    locationId,
    roomId,
    onOpenChange,
    queryClient,
    t,
  ]);

  const handleSubmit = useCallback(() => {
    if (!canSubmit || !selectedSlot) return;
    if (isPastSlot) {
      setPastConfirmOpen(true);
      return;
    }
    void performCreate();
  }, [canSubmit, selectedSlot, isPastSlot, performCreate]);

  // Sync date/time from props when dialog opens, reset everything when it closes.
  // Without the open-branch, clicking a calendar slot would not pre-fill the
  // dialog because useState initializers only run on first mount (issue #670).
  useEffect(() => {
    if (open) {
      setSelectedDate(
        defaultDate ? new Date(defaultDate + "T00:00:00") : undefined,
      );
      setSelectedSlot(
        defaultTime ? { start: defaultTime, end: defaultEndTime ?? "" } : null,
      );
      // Seed employee from prop when opening so the day-by-employee view's
      // column selection survives even though the auto-select effect below
      // would otherwise overwrite it once treatments load.
      if (defaultEmployeeId) {
        setEmployeeId(defaultEmployeeId);
      }
    } else {
      setTreatmentId("");
      setEmployeeId(defaultEmployeeId ?? "");
      setPatientId("");
      setSelectedDate(
        defaultDate ? new Date(defaultDate + "T00:00:00") : undefined,
      );
      setSelectedSlot(
        defaultTime ? { start: defaultTime, end: defaultEndTime ?? "" } : null,
      );
      setNotes("");
      setIsRecurring(false);
      setFrequency("weekly");
      setRecurringCount(4);
      setRecurringOverrides({});
      setPatientSearch("");
      setTreatmentSearch("");
      setLocationId("");
      setRoomId("");
      setAddPatientOpen(false);
      setPendingPatientLabel(null);
      setPastConfirmOpen(false);
    }
  }, [open, defaultDate, defaultTime, defaultEndTime, defaultEmployeeId]);

  // -------------------------------------------------------------------------
  // Determine which panels are active
  // -------------------------------------------------------------------------

  const calendarEnabled = !!treatmentId && !!employeeId;
  const slotsEnabled = calendarEnabled && !!selectedDate;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl p-0 gap-0 overflow-hidden max-h-[90vh] md:max-h-[640px]"
        overlayClassName="bg-black/40"
        style={
          dragOffset.x !== 0 || dragOffset.y !== 0
            ? {
                transform: `translate(calc(-50% + ${dragOffset.x}px), calc(-50% + ${dragOffset.y}px))`,
              }
            : undefined
        }
      >
        <DialogTitle className="sr-only">
          {t("gabinet.appointments.createAppointment")}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t("gabinet.appointments.createAppointment")}
        </DialogDescription>

        {/* Drag handle bar — lets the user move the dialog aside to peek at the
            calendar underneath (issue #977, made discoverable in #1281). */}
        <div
          onPointerDown={handleDragStart}
          className={cn(
            "flex items-center justify-center gap-2 border-b bg-muted px-4 py-2 text-xs font-medium uppercase tracking-wide text-foreground/80 hover:bg-muted/80 select-none touch-none transition-colors",
            isDragging ? "cursor-grabbing" : "cursor-grab",
          )}
          title={t("gabinet.appointments.dragToMove", "Przeciągnij, aby przesunąć")}
          aria-label={t("gabinet.appointments.dragToMove", "Przeciągnij, aby przesunąć")}
        >
          <GripHorizontal className="size-4" />
          <span>{t("gabinet.appointments.dragToMove", "Przeciągnij, aby przesunąć")}</span>
        </div>

        {/* 3-panel layout: stacks vertically on mobile */}
        <div className="relative flex flex-col md:flex-row md:h-[600px]">
          {/* Past-slot warning overlay (positioned near bottom so it doesn't cover the calendar grid) */}
          {isPastSlot && selectedSlot && (
            <div
              role="alert"
              className="pointer-events-none absolute left-1/2 bottom-4 z-20 w-[min(90%,22rem)] -translate-x-1/2"
            >
              <div className="pointer-events-auto space-y-1 rounded-md border border-red-600 bg-red-600 px-3 py-2.5 text-xs text-white shadow-lg dark:border-red-700 dark:bg-red-700">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="size-4 shrink-0" />
                  {t("gabinet.appointments.warnings.title")}
                </div>
                <ul className="ml-5 list-disc space-y-0.5">
                  <li>{t("gabinet.appointments.warnings.past")}</li>
                </ul>
              </div>
            </div>
          )}
          {/* ============================================================= */}
          {/* LEFT PANEL — Patient, Treatment, Employee info                */}
          {/* ============================================================= */}
          <div className="w-full md:w-[280px] border-b md:border-b-0 md:border-r flex flex-col">
            <ScrollShadow className="flex-1 overflow-y-auto">
              <div className="p-5 pb-8 space-y-5">
                {/* Patient selector */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {t("gabinet.appointments.patient")}
                    </Label>
                    <button
                      type="button"
                      onClick={() => setAddPatientOpen(true)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring rounded"
                      data-testid="appointment-add-patient-button"
                    >
                      <UserPlus className="size-3.5" />
                      {t("gabinet.patients.addPatient")}
                    </button>
                  </div>
                  <Popover
                    open={patientOpen}
                    onOpenChange={(o) => {
                      setPatientOpen(o);
                      if (!o) setPatientSearch("");
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={patientOpen}
                        className="w-full justify-between h-11 font-normal"
                        data-testid="appointment-patient-trigger"
                      >
                        <span className="truncate">
                          {selectedPatient
                            ? `${selectedPatient.firstName} ${selectedPatient.lastName}`
                            : pendingPatientLabel
                              ? pendingPatientLabel
                              : t(
                                  "gabinet.appointments.selectPatient",
                                )}
                        </span>
                        <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="p-0"
                      align="start"
                      style={{ width: "var(--radix-popover-trigger-width)" }}
                    >
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder={t(
                            "gabinet.appointments.searchPatient",
                          )}
                          value={patientSearch}
                          onValueChange={setPatientSearch}
                        />
                        <CommandList>
                          <CommandEmpty>
                            {t("common.noResults")}
                          </CommandEmpty>
                          <CommandGroup>
                            {filteredPatients.map((p) => (
                              <CommandItem
                                key={p._id}
                                value={p._id}
                                onSelect={() => {
                                  setPatientId(p._id);
                                  setPatientOpen(false);
                                  setPatientSearch("");
                                }}
                                className={cn(
                                  "px-3",
                                  patientId === p._id &&
                                    "bg-accent font-medium text-accent-foreground",
                                )}
                              >
                                <div className="flex flex-col">
                                  <span className="text-sm">
                                    {p.firstName}{" "}
                                    {p.lastName}
                                  </span>
                                  {p.phone && (
                                    <span className="text-xs text-muted-foreground">
                                      {formatPhoneNumber(p.phone)}
                                    </span>
                                  )}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <Separator />

                {/* Treatment selector */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {t("gabinet.appointments.treatment")}
                  </Label>
                  <Popover
                    open={treatmentOpen}
                    onOpenChange={(o) => {
                      setTreatmentOpen(o);
                      if (!o) setTreatmentSearch("");
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={treatmentOpen}
                        className="w-full justify-between h-11 font-normal"
                        data-testid="appointment-treatment-trigger"
                      >
                        <span className="truncate">
                          {selectedTreatment
                            ? selectedTreatment.name
                            : t("gabinet.appointments.selectTreatment")}
                        </span>
                        <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="p-0"
                      align="start"
                      style={{ width: "var(--radix-popover-trigger-width)" }}
                    >
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder={t(
                            "gabinet.appointments.searchTreatment",
                          )}
                          value={treatmentSearch}
                          onValueChange={setTreatmentSearch}
                        />
                        <CommandList>
                          <CommandEmpty>
                            {t("common.noResults")}
                          </CommandEmpty>
                          <CommandGroup>
                            {filteredTreatments.map((tr) => (
                              <CommandItem
                                key={tr._id}
                                value={tr._id}
                                onSelect={() =>
                                  handleTreatmentSelect(tr._id)
                                }
                                className={cn(
                                  "px-3",
                                  treatmentId === tr._id &&
                                    "bg-accent font-medium text-accent-foreground",
                                )}
                              >
                                <div className="flex flex-col">
                                  <span className="text-sm">
                                    {tr.name}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {tr.duration} min
                                    {tr.price != null &&
                                      ` \u00b7 ${formatPrice(tr.price)}`}
                                  </span>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Treatment info card */}
                {selectedTreatment && (
                  <div className="rounded-lg border bg-muted/30 p-3.5 space-y-2.5">
                    <div className="flex items-start gap-3">
                      <div className="rounded-md bg-primary/10 p-2 shrink-0">
                        <Stethoscope className="size-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm leading-tight">
                          {selectedTreatment.name}
                        </p>
                        {selectedTreatment.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-3">
                            <PlateText value={selectedTreatment.description} />
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-xs gap-1">
                        <Clock className="size-3" />
                        {selectedTreatment.duration} min
                      </Badge>
                      {selectedTreatment.price != null && (
                        <Badge variant="secondary" className="text-xs">
                          {formatPrice(selectedTreatment.price)}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                <Separator />

                {/* Employee selector */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {t("gabinet.appointments.employee")}
                  </Label>
                  <Select
                    value={employeeId}
                    onValueChange={handleEmployeeSelect}
                  >
                    <SelectTrigger
                      data-testid="appointment-employee-trigger"
                    >
                      <SelectValue
                        placeholder={t(
                          "gabinet.appointments.selectEmployee",
                        )}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {qualifiedEmployees.length === 0 && treatmentId && (
                        <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                          {t(
                            "gabinet.appointments.noQualifiedEmployees",
                          )}
                        </div>
                      )}
                      {qualifiedEmployees.map((emp) => (
                        <SelectItem
                          key={emp._id}
                          value={emp.userId}
                        >
                          <div className="flex items-center gap-2">
                            <User className="size-3.5 text-muted-foreground shrink-0" />
                            <span>
                              {getEmployeeDisplayName(emp)}
                            </span>
                            {emp.specialization &&
                              (emp.firstName ||
                                emp.lastName) && (
                                <span className="text-xs text-muted-foreground">
                                  {emp.specialization}
                                </span>
                              )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Location and Room */}
                {activeLocations.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                          <MapPin className="size-3" />
                          {t("gabinet.appointments.location")}
                        </Label>
                        <Select value={locationId} onValueChange={handleLocationSelect}>
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder={t("gabinet.appointments.location")} />
                          </SelectTrigger>
                          <SelectContent>
                            {activeLocations.map((loc: { _id: string; name: string }) => (
                              <SelectItem key={loc._id} value={loc._id}>
                                {loc.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {locationId && activeRooms.length > 0 && (
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                            <Building2 className="size-3" />
                            {t("gabinet.appointments.room")}
                          </Label>
                          <Select value={roomId} onValueChange={setRoomId}>
                            <SelectTrigger className="h-9">
                              <SelectValue placeholder={t("gabinet.appointments.room")} />
                            </SelectTrigger>
                            <SelectContent>
                              {activeRooms.map((room: { _id: string; name: string }) => (
                                <SelectItem key={room._id} value={room._id}>
                                  {room.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>

                    {/* Equipment warnings — advisory only */}
                    {missingEquipmentIds.length > 0 && (
                      <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                        <AlertTriangle className="size-3.5 shrink-0" />
                        {t("gabinet.appointments.equipmentWarning")}
                      </div>
                    )}
                  </>
                )}

                {/* Find nearest slot */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={
                    !employeeId ||
                    !selectedTreatment ||
                    searchingSlot
                  }
                  onClick={handleFindSlot}
                >
                  {searchingSlot ? (
                    <span className="border-primary mr-2 size-3.5 animate-spin rounded-full border-2 border-t-transparent" />
                  ) : (
                    <CalendarSearch className="mr-2 size-4" />
                  )}
                  {t("gabinet.appointments.findNearestSlot")}
                </Button>

                <Separator />

                {/* Notes (collapsible) */}
                <Accordion type="single" collapsible>
                  <AccordionItem value="notes" className="border-none">
                    <AccordionTrigger className="py-0 text-xs text-muted-foreground hover:text-foreground hover:no-underline gap-1.5">
                      <span className="flex items-center gap-1.5">
                        <StickyNote className="size-3" />
                        {t("gabinet.appointments.notes")}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pb-0 pt-1.5">
                      <RichTextEditor
                        value={notes}
                        onChange={(v) => setNotes(v ?? "")}
                        minHeight="80px"
                        placeholder={t(
                          "gabinet.appointments.notesPlaceholder",
                        )}
                      />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                {/* Recurring */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="recurring-appt"
                      checked={isRecurring}
                      onCheckedChange={(c) =>
                        setIsRecurring(c as boolean)
                      }
                    />
                    <Label
                      htmlFor="recurring-appt"
                      className="text-sm mb-0"
                    >
                      {t("gabinet.appointments.recurring")}
                    </Label>
                  </div>
                  {isRecurring && (
                    <div className="grid gap-2">
                      <Select
                        value={frequency}
                        onValueChange={setFrequency}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">
                            {t(
                              "gabinet.appointments.frequencies.daily",
                            )}
                          </SelectItem>
                          <SelectItem value="weekly">
                            {t(
                              "gabinet.appointments.frequencies.weekly",
                            )}
                          </SelectItem>
                          <SelectItem value="biweekly">
                            {t(
                              "gabinet.appointments.frequencies.biweekly",
                            )}
                          </SelectItem>
                          <SelectItem value="monthly">
                            {t(
                              "gabinet.appointments.frequencies.monthly",
                            )}
                          </SelectItem>
                          <SelectItem value="custom">
                            {t(
                              "gabinet.appointments.frequencies.custom",
                            )}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <Select
                        value={String(recurringCount)}
                        onValueChange={(v) =>
                          setRecurringCount(parseInt(v) || 1)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24].map(
                            (n) => (
                              <SelectItem
                                key={n}
                                value={String(n)}
                              >
                                {n}x
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>

                      <div className="rounded-md border bg-muted/20 p-2">
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                          {t("gabinet.appointments.recurringPreview")}
                        </p>
                        {recurringOccurrences.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            {t(
                              "gabinet.appointments.recurringPreviewSelectSlot",
                            )}
                          </p>
                        ) : (
                          <>
                            <p className="text-[10px] text-muted-foreground mb-1.5">
                              {t(
                                "gabinet.appointments.recurringPreviewHint",
                              )}
                            </p>
                            <ScrollShadow className="max-h-44 overflow-y-auto">
                              <ul className="space-y-1">
                                {recurringOccurrences.map((occ) => (
                                  <li
                                    key={occ.index}
                                    className="flex items-center justify-between gap-1.5"
                                  >
                                    {occ.index === 0 ? (
                                      <span className="text-xs capitalize tabular-nums flex-1">
                                        {format(
                                          new Date(occ.date + "T00:00:00"),
                                          "EEE d MMM yyyy",
                                          { locale: dateFnsLocale },
                                        )}
                                      </span>
                                    ) : (
                                      <input
                                        type="date"
                                        value={occ.date}
                                        onChange={(e) => {
                                          const next = e.target.value;
                                          if (!next) return;
                                          setRecurringOverrides((prev) => ({
                                            ...prev,
                                            [occ.index]: {
                                              ...prev[occ.index],
                                              date: next,
                                            },
                                          }));
                                        }}
                                        className="h-7 flex-1 min-w-0 rounded-md border border-input bg-background px-2 text-xs tabular-nums focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                                        aria-label={t(
                                          "gabinet.appointments.date",
                                        )}
                                      />
                                    )}
                                    <input
                                      type="time"
                                      value={occ.startTime}
                                      disabled={occ.index === 0}
                                      onChange={(e) =>
                                        setRecurringOverrides((prev) => ({
                                          ...prev,
                                          [occ.index]: {
                                            ...prev[occ.index],
                                            startTime: e.target.value,
                                          },
                                        }))
                                      }
                                      className="h-7 w-[88px] rounded-md border border-input bg-background px-2 text-xs tabular-nums focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70"
                                      aria-label={t(
                                        "gabinet.appointments.calendarDialog.time",
                                      )}
                                    />
                                  </li>
                                ))}
                              </ul>
                            </ScrollShadow>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </ScrollShadow>
          </div>

          {/* ============================================================= */}
          {/* CENTER PANEL — Calendar                                       */}
          {/* ============================================================= */}
          <div className="flex-1 border-b md:border-b-0 md:border-r flex flex-col">
            <div className="p-4 w-full flex flex-col">
              <div className={cn("w-full", !calendarEnabled && "opacity-50 pointer-events-none")}>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={handleDateSelect}
                  locale={dateFnsLocale}
                  disabled={(_date) => !calendarEnabled}
                  className="w-full rounded-md"
                  classNames={{
                    root: "w-full",
                    month_grid: "w-full border-collapse",
                    weekdays: "flex",
                    weekday:
                      "text-muted-foreground flex-1 select-none rounded-md text-[0.8rem] font-normal",
                    week: "flex w-full mt-2",
                    day: "flex-1 text-center text-sm p-0 relative",
                  }}
                  showOutsideDays
                />
              </div>
            </div>
          </div>

          {/* ============================================================= */}
          {/* RIGHT PANEL — Time slots + Confirmation                       */}
          {/* ============================================================= */}
          <div className="w-full md:w-[280px] flex flex-col">
            {!slotsEnabled ? (
              <div className="flex flex-col items-center justify-center flex-1 px-5 py-8 gap-3">
                {selectedSlot?.start && (
                  <div className="w-full rounded-md border bg-muted/30 px-3 py-2.5 text-center">
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                      {t("gabinet.appointments.calendarDialog.time")}
                    </p>
                    <p className="text-base font-semibold tabular-nums">
                      {selectedSlot.start}
                      {selectedSlot.end ? ` – ${selectedSlot.end}` : ""}
                    </p>
                    {selectedDate && (
                      <p className="text-xs text-muted-foreground capitalize mt-0.5">
                        {format(selectedDate, "EEEE, d MMMM", {
                          locale: dateFnsLocale,
                        })}
                      </p>
                    )}
                  </div>
                )}
                <UntitledAlert>
                  {t(
                    calendarEnabled
                      ? "gabinet.appointments.calendarDialog.selectDateForSlots"
                      : "gabinet.appointments.calendarDialog.selectTreatmentAndEmployee",
                  )}
                </UntitledAlert>
              </div>
            ) : (
              <>
                {/* Date header */}
                <div className="px-5 pt-4 pb-3">
                  <p className="font-semibold text-sm capitalize">
                    {selectedDate &&
                      format(selectedDate, "EEEE, d MMMM", {
                        locale: dateFnsLocale,
                      })}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("gabinet.appointments.availableSlots")}
                  </p>
                </div>

                {employeeLeaveOnSelectedDate && (
                  <div
                    role="alert"
                    className="mx-3 mb-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
                  >
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      {employeeLeaveOnSelectedDate.startTime &&
                      employeeLeaveOnSelectedDate.endTime
                        ? t("gabinet.appointments.warnings.leavePartial", {
                            start: employeeLeaveOnSelectedDate.startTime,
                            end: employeeLeaveOnSelectedDate.endTime,
                            defaultValue:
                              "Pracownik jest na urlopie w tym dniu w godzinach {{start}}–{{end}}.",
                          })
                        : t("gabinet.appointments.warnings.leave", {
                            defaultValue:
                              "Pracownik jest na urlopie w tym terminie",
                          })}
                    </span>
                  </div>
                )}

                <Separator />

                {/* Slots list */}
                <ScrollShadow className="flex-1 min-h-0 overflow-y-auto">
                  <div className="p-3 space-y-1.5">
                    {slotsLoading ? (
                      // Skeleton loading
                      Array.from({ length: 8 }).map((_, i) => (
                        <Skeleton
                          key={i}
                          className="h-9 w-full rounded-md"
                        />
                      ))
                    ) : availableSlots && availableSlots.length > 0 ? (
                      availableSlots.map((slot) => (
                        <button
                          key={slot.start}
                          ref={
                            selectedSlot?.start === slot.start
                              ? selectedSlotButtonRef
                              : undefined
                          }
                          type="button"
                          onClick={() => handleSlotSelect(slot)}
                          className={cn(
                            "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
                            "hover:bg-accent hover:text-accent-foreground",
                            "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                            selectedSlot?.start === slot.start
                              ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                              : "bg-muted/40",
                          )}
                        >
                          <span className="font-medium tabular-nums">
                            {slot.start}
                          </span>
                          <span
                            className={cn(
                              "text-xs",
                              selectedSlot?.start === slot.start
                                ? "text-primary-foreground/70"
                                : "text-muted-foreground",
                            )}
                          >
                            {slot.end}
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="py-8 text-center">
                        <p className="text-sm text-muted-foreground">
                          {t(
                            "gabinet.appointments.calendarDialog.noSlotsForDay",
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                </ScrollShadow>

                {/* Confirmation area */}
                {selectedSlot && (
                  <>
                    <Separator />
                    <div className="p-4 space-y-3 bg-muted/20">
                      {/* Summary */}
                      <div className="space-y-1.5 text-xs">
                        {selectedTreatment && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              {t("gabinet.appointments.treatment")}
                            </span>
                            <span className="font-medium truncate ml-2 text-right">
                              {selectedTreatment.name}
                            </span>
                          </div>
                        )}
                        {(selectedPatient || pendingPatientLabel) && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              {t("gabinet.appointments.patient")}
                            </span>
                            <span className="font-medium truncate ml-2 text-right">
                              {selectedPatient
                                ? `${selectedPatient.firstName} ${selectedPatient.lastName}`
                                : pendingPatientLabel}
                            </span>
                          </div>
                        )}
                        {selectedEmployee && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              {t("gabinet.appointments.employee")}
                            </span>
                            <span className="font-medium truncate ml-2 text-right">
                              {getEmployeeDisplayName(
                                selectedEmployee,
                              )}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {t("gabinet.appointments.date")}
                          </span>
                          <span className="font-medium">
                            {dateStr}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            {t(
                              "gabinet.appointments.calendarDialog.time",
                            )}
                          </span>
                          <span className="font-medium tabular-nums">
                            {selectedSlot.start} &ndash; {endTime}
                          </span>
                        </div>
                      </div>

                      <Button
                        className="w-full"
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        data-testid="appointment-submit-button"
                      >
                        {submitting
                          ? t("common.saving")
                          : t(
                              "gabinet.appointments.calendarDialog.confirmBooking",
                            )}
                      </Button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <SidePanel
      open={addPatientOpen}
      onOpenChange={setAddPatientOpen}
      title={t("gabinet.patients.createPatient")}
      description={t("gabinet.patients.createDescription")}
    >
      <PatientForm
        onSubmit={handleCreatePatient}
        onCancel={() => setAddPatientOpen(false)}
        isSubmitting={creatingPatient}
        organizationId={organizationId}
      />
    </SidePanel>

    <Dialog open={pastConfirmOpen} onOpenChange={setPastConfirmOpen}>
      <DialogContent
        className="max-w-xs p-0 gap-0 overflow-hidden border-0 rounded-lg shadow-2xl [&>button]:hidden"
        data-testid="appointment-past-confirm"
      >
        <DialogTitle className="sr-only">
          {t("gabinet.appointments.warnings.title")}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t("gabinet.appointments.warnings.pastConfirm.message")}
        </DialogDescription>
        <div className="flex items-center justify-between bg-slate-800 px-4 py-2.5 text-white">
          <span className="text-sm font-semibold">
            {t("gabinet.appointments.warnings.title")}
          </span>
          <button
            type="button"
            onClick={() => setPastConfirmOpen(false)}
            className="rounded p-0.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            aria-label={t("common.close")}
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="bg-white px-5 py-5 dark:bg-zinc-900">
          <p className="text-center text-sm text-slate-800 dark:text-zinc-100">
            {t("gabinet.appointments.warnings.pastConfirm.message")}
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => setPastConfirmOpen(false)}
              className="min-w-16 rounded-md bg-rose-400 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-rose-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60"
              data-testid="appointment-past-confirm-no"
            >
              {t("common.no").toUpperCase()}
            </button>
            <button
              type="button"
              onClick={() => {
                setPastConfirmOpen(false);
                void performCreate();
              }}
              className="min-w-16 rounded-md bg-emerald-400 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
              data-testid="appointment-past-confirm-yes"
            >
              {t("common.yes").toUpperCase()}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

