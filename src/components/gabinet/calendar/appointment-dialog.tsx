import {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import {
  formatActionError,
  formatAppointmentError,
} from "@/lib/format-action-error";
import { UntitledAlert } from "@/components/ui/untitled-alert";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import {
  Dialog,
  DialogClose,
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
import { TimePicker5Min } from "@/components/gabinet/calendar/time-picker-5min";
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
  X,
} from "@/lib/ez-icons";
import { CalendarSearch } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { SidePanel } from "@/components/crm/side-panel";
import { PatientForm } from "@/components/forms/patient-form";
import { PackageUsageSelector } from "@/components/gabinet/package-usage-selector";
import {
  ConflictWarning,
  EquipmentWarning,
  LeaveWarning,
  StockShortageWarning,
} from "@/components/gabinet/appointment-shared/warnings";
import {
  useEmployeeLeaveOnDate,
  useMissingEquipment,
  useAppointmentShortage,
} from "@/components/gabinet/appointment-shared/use-appointment-warnings";
import { SlotPicker } from "@/components/gabinet/appointment-shared/slot-picker";
import { TreatmentPicker } from "@/components/gabinet/appointment-shared/treatment-picker";
import { useTagDefinitions } from "@/hooks/use-tag-definitions";
import { useCategoryDefinitions } from "@/hooks/use-category-definitions";
import { useSupabaseGabinetAppointmentsByDateRange } from "@/hooks/use-supabase-gabinet-appointments";
import { useSupabaseOrgSettings } from "@/hooks/use-supabase-organizations";
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
   *  calendar view so clicking inside a column carries the column owner.
   *  Holds a userId (gabinetAppointments.employeeId is a users._id). */
  defaultUserId?: string;
  /** Optional handler to switch from creating a patient appointment to
   *  creating a non-patient calendar event (meeting / training that blocks
   *  time without booking a wizyta). When provided, a "Utwórz zdarzenie"
   *  link is rendered at the top of the dialog. Issue #1598. */
  onSwitchToEvent?: () => void;
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
  defaultUserId,
  onSwitchToEvent,
}: AppointmentDialogProps) {
  const { t, i18n } = useTranslation();
  const dateFnsLocale = i18n.resolvedLanguage === "pl" ? pl : undefined;
  const createAppointment = useAction(api.gabinet.appointments.create);
  const createPatient = useAction(api.gabinet.patients.create);
  const findNextSlotAction = useAction(api.gabinet.scheduling.findNextAvailableSlot);
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

  const listVariantsAction = useAction(api.gabinet.treatments.listVariants);

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

  const { data: orgSettings } = useSupabaseOrgSettings(String(organizationId));

  // Patient tag/category defs for the inline create-patient drawer
  // (kept in sync with the patients list create-form props).
  const { tags: orgTags } = useTagDefinitions(organizationId);
  const { categories: patientCategories } = useCategoryDefinitions(
    organizationId,
    "gabinetPatient",
  );

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  // Multi-treatment state (#3356): array of {treatmentId, variantId} pairs.
  // Single-treatment mode (legacy): one entry in the array.
  const [selectedTreatments, setSelectedTreatments] = useState<
    Array<{ treatmentId: string; variantId: string }>
  >([]);
  const [employeeId, setEmployeeId] = useState(defaultUserId ?? "");
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
  const [packageUsageId, setPackageUsageId] = useState<string | null>(null);
  // When a package is applied to a multi-treatment appointment, which treatment
  // the package covers (user-selected from a dropdown per #3356 clarification).
  const [packageTreatmentId, setPackageTreatmentId] = useState<string | null>(null);

  // Combobox open states
  const [addTreatmentOpen, setAddTreatmentOpen] = useState(false);
  const [patientOpen, setPatientOpen] = useState(false);
  const [patientSearch, setPatientSearch] = useState("");
  const [addTreatmentSearch, setAddTreatmentSearch] = useState("");

  // Convenience aliases — primary (first) treatment for backward-compat logic
  const treatmentId = selectedTreatments[0]?.treatmentId ?? "";
  const variantId = selectedTreatments[0]?.variantId ?? "";

  // Add-patient sub-panel state
  const [addPatientOpen, setAddPatientOpen] = useState(false);
  const [creatingPatient, setCreatingPatient] = useState(false);
  const [pendingPatientLabel, setPendingPatientLabel] = useState<string | null>(
    null,
  );

  // Walk-in (record past appointment) toggle. Off by default so past slots
  // are filtered out of the slot list — the user must opt in deliberately
  // before they can pick a time in the past. Issue #1406.
  const [recordWalkIn, setRecordWalkIn] = useState(false);

  // Drag-to-reposition state — users want to peek at the calendar underneath
  // without closing the dialog (issue #977). Offset resets when the dialog
  // closes so the next open starts centered. The live offset lives in a ref
  // and is written straight to the `translate` CSS property via rAF; using
  // React state would re-render the whole form on every pointermove and make
  // the drag stutter (issue #1424). We must write to `translate`, not
  // `transform`: Tailwind v4 compiles `translate-x-[-50%] translate-y-[-50%]`
  // (the dialog's centering classes) to the modern `translate:` CSS property,
  // which is a separate property from `transform:` and composes additively
  // with it. Writing to `style.transform` left the class translate intact, so
  // the dialog jumped by its own width/height instead of following the cursor
  // (issue #1428).
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const dialogContentRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Clamp the drag offset so the dialog header (drag handle + close button)
  // can never be dragged fully off-screen. Without this, a small drag can
  // park the dialog where the user can no longer grab or close it
  // (issue #1426). Constants are in viewport pixels.
  const DRAG_HEADER_VISIBLE = 60; // keep top header reachable vertically
  const DRAG_CORNER_VISIBLE = 80; // keep close-button corner reachable horizontally
  const clampDragOffset = useCallback((x: number, y: number) => {
    const el = dialogContentRef.current;
    if (!el || typeof window === "undefined") return { x, y };
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let minY = h / 2 - vh / 2;
    let maxY = vh / 2 + h / 2 - DRAG_HEADER_VISIBLE;
    if (minY > maxY) minY = maxY = h / 2 - vh / 2;
    let minX = DRAG_CORNER_VISIBLE - vw / 2 - w / 2;
    let maxX = vw / 2 + w / 2 - DRAG_CORNER_VISIBLE;
    if (minX > maxX) minX = maxX = 0;
    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y)),
    };
  }, []);

  const applyDragTransform = useCallback(() => {
    const el = dialogContentRef.current;
    if (!el) return;
    const { x, y } = dragOffsetRef.current;
    // Write to the CSS `translate:` property so the inline value overrides
    // the class-defined `translate: -50% -50%` centering. See ref comment.
    el.style.translate =
      x === 0 && y === 0
        ? ""
        : `calc(-50% + ${x}px) calc(-50% + ${y}px)`;
  }, []);

  // Reapply on every render so an unrelated re-render mid-drag doesn't snap
  // the dialog back to its class-defined centered translate.
  useLayoutEffect(() => {
    applyDragTransform();
  });

  useEffect(() => {
    if (!open) {
      dragOffsetRef.current = { x: 0, y: 0 };
      setIsDragging(false);
    }
  }, [open]);

  const handleDragStart = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      // Skip touch input: on mobile the dialog is full-width so dragging it
      // around is not useful, and capturing touch pointerdown here would
      // block native vertical scrolling of the now-scrollable DialogContent
      // (issue #1462).
      if (e.pointerType === "touch") return;
      // Drag-from-anywhere (issue #1459): users found the small top bar too
      // hard to hit, so the whole dialog now initiates a drag. Bail out when
      // the pointerdown landed on (or inside) an interactive control so
      // clicks on buttons, inputs, popover triggers, etc. still work.
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          'button, a, input, textarea, select, [role="button"], [role="combobox"], [role="menuitem"], [role="option"], [role="switch"], [role="checkbox"], [role="radio"], [role="tab"], [contenteditable="true"], [data-radix-popper-content-wrapper]',
        )
      ) {
        return;
      }
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startOffset = { ...dragOffsetRef.current };
      setIsDragging(true);

      let rafId: number | null = null;
      const flush = () => {
        rafId = null;
        applyDragTransform();
      };

      const handleMove = (ev: PointerEvent) => {
        dragOffsetRef.current = clampDragOffset(
          startOffset.x + (ev.clientX - startX),
          startOffset.y + (ev.clientY - startY),
        );
        if (rafId === null) rafId = requestAnimationFrame(flush);
      };

      const handleUp = () => {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        applyDragTransform();
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        setIsDragging(false);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [applyDragTransform, clampDragOffset],
  );

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

  // Filter employees by treatment qualification (primary treatment).
  // For multi-treatment appointments the filter still uses the primary treatment
  // so the employee list isn't over-restricted; the UI shows a warning when the
  // selected employee is unqualified for any secondary treatment.
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

  const dateStr = selectedDate
    ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`
    : "";

  // "Now" in the clinic's timezone — used to exclude past slots when the
  // selected date is today. orgSettings.timezone carries the clinic's zone;
  // fall back to the browser's local timezone when not configured (#1402/#1406).
  const clinicTz = orgSettings?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();
  const _nowInClinic = new Intl.DateTimeFormat("sv-SE", {
    timeZone: clinicTz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const [nowDate, nowTimeFull] = _nowInClinic.split(" ");
  const nowTime = nowTimeFull.slice(0, 5);

  // Variants query — load variants for the selected treatment
  const { data: variants } = useQuery({
    queryKey: ["gabinet.treatments.listVariants", organizationId, treatmentId],
    queryFn: () => listVariantsAction({ organizationId, treatmentId }),
    enabled: !!organizationId && !!treatmentId,
  }) as { data: any[] | undefined };

  const selectedVariant = useMemo(
    () => variants?.find((v) => v._id === variantId),
    [variants, variantId],
  );

  // Effective duration: sum across all selected treatments.
  // For a single treatment with a variant, the variant resolvedDuration takes precedence.
  const effectiveDuration = useMemo(() => {
    if (selectedTreatments.length === 0) return 30;
    if (selectedTreatments.length === 1) {
      return selectedVariant?.resolvedDuration ?? selectedTreatment?.duration ?? 30;
    }
    return selectedTreatments.reduce((sum, t) => {
      const tr = treatments?.find((tr) => tr._id === t.treatmentId);
      return sum + (tr?.duration ?? 30);
    }, 0);
  }, [selectedTreatments, selectedVariant, selectedTreatment, treatments]);

  // Available slots — action reading from Supabase
  const getAvailableSlots = useAction(api.gabinet.appointments.getAvailableSlotsQuery);
  const {
    data: slotsResult,
    isLoading: slotsLoading,
    isError: slotsErrored,
    error: slotsError,
  } = useQuery({
    queryKey: [
      "gabinet.availableSlots",
      organizationId,
      employeeId,
      dateStr,
      effectiveDuration,
      // Bucket by the hour so the query is cached but still refreshes as the
      // clock advances past past-slot boundaries. Walk-in mode disables the
      // filter so it must also key the cache.
      recordWalkIn ? "walkin" : nowDate,
      recordWalkIn ? "walkin" : nowTime.slice(0, 2),
    ],
    queryFn: () =>
      getAvailableSlots({
        organizationId,
        userId: employeeId as string,
        date: dateStr,
        duration: effectiveDuration,
        nowDate: recordWalkIn ? undefined : nowDate,
        nowTime: recordWalkIn ? undefined : nowTime,
      }),
    enabled: !!employeeId && !!dateStr && !!selectedTreatment,
    retry: false,
  });
  const availableSlots = slotsResult?.slots;
  const noSlotsReason = slotsResult?.reason;

  useEffect(() => {
    if (slotsErrored && slotsError) {
      console.error("[appointment-dialog] slots load failed", slotsError);
    }
  }, [slotsErrored, slotsError]);

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

  const activeLocations = locations?.filter((l) => l.isActive) ?? [];

  const employeeLeaveOnSelectedDate = useEmployeeLeaveOnDate({
    organizationId,
    employeeId,
    dateStr,
  });

  const { blocking: equipmentBlocking } = useMissingEquipment({
    organizationId,
    locationId,
    treatment: selectedTreatment,
  });

  const { shortageItems, hasShortage } = useAppointmentShortage({
    organizationId,
    treatmentId,
    locationId: locationId || undefined,
  });

  // -------------------------------------------------------------------------
  // Auto-select employee when only one qualified
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (qualifiedEmployees.length === 1 && !employeeId) {
      setEmployeeId(qualifiedEmployees[0].userId);
    }
  }, [qualifiedEmployees, employeeId]);

  // Clear employee when the primary treatment changes and the current employee
  // is no longer qualified. This covers removing the first treatment (which
  // makes the second become primary) — handleTreatmentAdd already covers
  // selecting the very first treatment.
  useEffect(() => {
    if (!employeeId || !treatmentId || !employees) return;
    const isQualified = qualifiedEmployees.some((e) => e.userId === employeeId);
    if (!isQualified) {
      setEmployeeId("");
      setSelectedSlot(null);
    }
  }, [qualifiedEmployees, employeeId, treatmentId, employees]);

  // -------------------------------------------------------------------------
  // Reset downstream state when upstream selection changes
  // -------------------------------------------------------------------------

  // Add a treatment to the selected list (called from the "add treatment" picker).
  const handleTreatmentAdd = useCallback(
    (tid: string) => {
      setSelectedTreatments((prev) => {
        // Prevent duplicates
        if (prev.some((t) => t.treatmentId === tid)) return prev;
        return [...prev, { treatmentId: tid, variantId: "" }];
      });
      setAddTreatmentOpen(false);
      setAddTreatmentSearch("");
      setPackageUsageId(null);
      setPackageTreatmentId(null);
      // Reset employee if first treatment and no longer qualified
      if (selectedTreatments.length === 0 && employeeId && employees) {
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
    [selectedTreatments.length, employeeId, employees],
  );

  const handleTreatmentRemove = useCallback((tid: string) => {
    setSelectedTreatments((prev) => prev.filter((t) => t.treatmentId !== tid));
    setPackageUsageId(null);
    setPackageTreatmentId(null);
  }, []);

  const handleVariantChange = useCallback((treatmentId: string, vid: string) => {
    setSelectedTreatments((prev) =>
      prev.map((t) => (t.treatmentId === treatmentId ? { ...t, variantId: vid } : t)),
    );
  }, []);

  const handleEmployeeSelect = useCallback((eid: string) => {
    setEmployeeId((prev) => {
      // Clear the slot only when switching FROM an existing employee — slots
      // are employee-specific so a previous pick may not be available for the
      // new one. When the dialog was opened with a slot pre-filled from a
      // calendar click (issue #1364), the initial employee pick must NOT
      // wipe that slot, otherwise the clicked time disappears.
      if (prev && prev !== eid) {
        setSelectedSlot(null);
      }
      return eid;
    });
  }, []);

  const handleDateSelect = useCallback((date: Date | undefined) => {
    setSelectedDate((prev) => {
      const prevStr = prev
        ? `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-${String(prev.getDate()).padStart(2, "0")}`
        : "";
      const nextStr = date
        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
        : "";
      // Same rationale as handleEmployeeSelect — preserve a calendar-click
      // pre-fill when the user re-picks the same date in the mini-calendar.
      if (prevStr !== nextStr) {
        setSelectedSlot(null);
      }
      return date;
    });
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
        durationMinutes: effectiveDuration,
        fromDate:
          dateStr || (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`; })(),
        nowDate: recordWalkIn ? undefined : nowDate,
        nowTime: recordWalkIn ? undefined : nowTime,
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
  }, [
    employeeId,
    selectedTreatment,
    effectiveDuration,
    organizationId,
    dateStr,
    findNextSlotAction,
    nowDate,
    nowTime,
    recordWalkIn,
    t,
  ]);

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
        console.error("[appointment-dialog] create patient failed", e);
        toast.error(
          formatActionError(e, t, {
            key: "gabinet.patients.errors.createFailed",
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
        effectiveDuration,
      )
    : "";

  // Existing appointments for the chosen employee + day, used to detect when
  // the user picks a slot that overlaps with another booking. The dialog
  // surfaces a warning and lets the user save anyway (`allowConflict` flag on
  // submit) — issue #1526.
  const { data: employeeDayAppointments } =
    useSupabaseGabinetAppointmentsByDateRange(
      String(organizationId),
      dateStr,
      dateStr,
      {
        employeeId: employeeId || undefined,
        enabled: !!organizationId && !!employeeId && !!dateStr,
      },
    );

  const conflictingAppointment = useMemo(() => {
    if (!selectedSlot?.start || !endTime || !employeeDayAppointments) return null;
    const reqStart = selectedSlot.start;
    const reqEnd = endTime;
    return (
      employeeDayAppointments.find((appt) => {
        if (appt.status === "cancelled" || appt.status === "no_show") return false;
        return appt.startTime < reqEnd && appt.endTime > reqStart;
      }) ?? null
    );
  }, [selectedSlot, endTime, employeeDayAppointments]);

  const hasBookingConflict = !!conflictingAppointment;

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
    selectedTreatments.length > 0 &&
    !!employeeId &&
    !!dateStr &&
    !!selectedSlot &&
    !equipmentBlocking &&
    !submitting;

  const performCreate = useCallback(async () => {
    if (!canSubmit || !selectedSlot) return;
    setSubmitting(true);
    try {
      const treatmentDuration = effectiveDuration;
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
        // Multi-treatment path: pass full array. Backend normalizes single-item
        // arrays to the legacy scalar path for backward compat.
        treatments: selectedTreatments.map((t) => ({
          treatmentId: t.treatmentId,
          variantId: t.variantId || undefined,
        })),
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
        packageUsageId: packageUsageId ?? undefined,
        packageTreatmentId: packageTreatmentId ?? undefined,
        allowPast: recordWalkIn || undefined,
        allowConflict: hasBookingConflict || undefined,
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
    selectedTreatments,
    employeeId,
    dateStr,
    endTime,
    notes,
    isRecurring,
    frequency,
    recurringCount,
    recurringOccurrences,
    effectiveDuration,
    locationId,
    roomId,
    packageUsageId,
    packageTreatmentId,
    recordWalkIn,
    hasBookingConflict,
    onOpenChange,
    queryClient,
    t,
  ]);

  const handleSubmit = useCallback(() => {
    if (!canSubmit || !selectedSlot) return;
    void performCreate();
  }, [canSubmit, selectedSlot, performCreate]);

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
      if (defaultUserId) {
        setEmployeeId(defaultUserId);
      }
    } else {
      setSelectedTreatments([]);
      setEmployeeId(defaultUserId ?? "");
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
      setAddTreatmentSearch("");
      setLocationId("");
      setRoomId("");
      setPackageUsageId(null);
      setPackageTreatmentId(null);
      setAddPatientOpen(false);
      setPendingPatientLabel(null);
      setRecordWalkIn(false);
    }
  }, [open, defaultDate, defaultTime, defaultEndTime, defaultUserId]);

  // -------------------------------------------------------------------------
  // Determine which panels are active
  // -------------------------------------------------------------------------

  const calendarEnabled = selectedTreatments.length > 0 && !!employeeId;
  const slotsEnabled = calendarEnabled && !!selectedDate;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={dialogContentRef}
        onPointerDown={handleDragStart}
        className={cn(
          // On mobile the 3 panels stack vertically and easily exceed 90vh
          // (patient/treatment/employee selectors + calendar + slot list).
          // Without `overflow-y-auto` here the bottom panel — including the
          // hour/slot picker — gets clipped with no way to scroll to it
          // (issue #1462). Desktop keeps `overflow-hidden` so each panel
          // owns its own scroll container at md:h-[600px].
          "max-w-5xl p-0 gap-0 overflow-y-auto md:overflow-hidden max-h-[90vh] md:max-h-[640px]",
          isDragging && "cursor-grabbing select-none",
        )}
        overlayClassName="bg-black/40"
        // The default top-right X is invisible on iOS Safari because the
        // drag bar's `backdrop-blur-sm` creates a stacking context that
        // hides the close button behind it (#1830). We render an explicit
        // close button inside the drag bar instead.
        hideClose
      >
        <DialogTitle className="sr-only">
          {t("gabinet.appointments.createAppointment")}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t("gabinet.appointments.createAppointment")}
        </DialogDescription>

        {/* Drag affordance — compact iOS-style grab indicator. Replaces the
            previous uppercase "PRZECIĄGNIJ, ABY PRZESUNĄĆ" bar (issue #1738)
            which dominated the dialog header. The pointer handler lives on
            DialogContent so a click anywhere on the dialog body initiates a
            drag (#1459); this bar still triggers it via event bubbling and
            keeps the discoverability cue added in #1281.

            The close (X) button is rendered here instead of relying on
            DialogContent's default top-right X: the drag bar's
            `backdrop-blur-sm` creates a stacking context that hid the
            default close on iOS Safari, leaving mobile users with no
            visible way to dismiss the dialog (#1830). */}
        <div
          className={cn(
            "relative flex items-center justify-center border-b border-border/60 bg-background/90 py-2 select-none touch-none transition-colors backdrop-blur-sm hover:bg-muted/40",
            isDragging ? "cursor-grabbing" : "cursor-grab",
          )}
          title={t("gabinet.appointments.dragToMove", "Przeciągnij, aby przesunąć")}
          aria-label={t("gabinet.appointments.dragToMove", "Przeciągnij, aby przesunąć")}
        >
          <div className="h-1 w-9 rounded-full bg-foreground/25" />
          <DialogClose
            aria-label={t("common.close")}
            className={cn(
              "absolute right-1 top-1/2 -translate-y-1/2 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors",
              "hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
              isDragging && "pointer-events-none",
            )}
          >
            <X className="size-4" />
          </DialogClose>
        </div>

        {/* "Utwórz zdarzenie zamiast wizyty" — lets the user pivot from the
            appointment form to the EventDialog when the calendar slot is for
            a non-patient block (meeting / training). The toolbar already
            exposes both options, but users who jumped straight into the
            appointment dialog by tapping a slot had no way to switch without
            cancelling first (issue #1598). Carries over the date/time/employee
            defaults via the parent handler. */}
        {onSwitchToEvent && (
          <div className="flex items-center justify-center border-b bg-background px-4 py-2 text-xs">
            <button
              type="button"
              onClick={onSwitchToEvent}
              className="font-medium text-primary hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring rounded"
              data-testid="appointment-switch-to-event-button"
            >
              {t(
                "gabinet.appointments.createEventInstead",
                "Utwórz zdarzenie (zebranie, szkolenie)",
              )}
            </button>
          </div>
        )}

        {/* 3-panel layout: stacks vertically on mobile */}
        <div className="relative flex flex-col md:flex-row md:h-[600px]">
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
                    // `modal` stacks the popover's own `react-remove-scroll`
                    // lock on top of the parent Dialog's lock so touchpad /
                    // wheel scrolling works on the portaled patient list
                    // (issue #1861, same root cause as #1850).
                    modal
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
                      style={{
                        width: "var(--radix-popover-trigger-width)",
                        maxHeight:
                          "var(--radix-popover-content-available-height)",
                      }}
                    >
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder={t(
                            "gabinet.appointments.searchPatient",
                          )}
                          value={patientSearch}
                          onValueChange={setPatientSearch}
                          onClose={() => setPatientOpen(false)}
                          closeLabel={t("common.close")}
                        />
                        <CommandList className="flex-1 min-h-0">
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
                                  setPackageUsageId(null);
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

                {/* Multi-treatment selector (#3356) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {t("gabinet.appointments.treatments", "Zabiegi")}
                    </Label>
                  </div>

                  {/* Selected treatments list */}
                  {selectedTreatments.length > 0 && (
                    <div className="space-y-1.5">
                      {selectedTreatments.map((sel, idx) => {
                        const tr = treatments?.find((t) => t._id === sel.treatmentId);
                        const isFirst = idx === 0;
                        return (
                          <div
                            key={sel.treatmentId}
                            className="rounded-lg border bg-muted/30 p-3 space-y-2"
                          >
                            <div className="flex items-start gap-2">
                              <div className="rounded-md bg-primary/10 p-1.5 shrink-0">
                                <Stethoscope className="size-4 text-primary" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-sm leading-tight truncate">
                                  {tr?.name ?? sel.treatmentId}
                                </p>
                                {tr && (
                                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                    <Badge variant="secondary" className="text-xs gap-1">
                                      <Clock className="size-3" />
                                      {tr.duration} min
                                    </Badge>
                                    {tr.price != null && (
                                      <Badge variant="secondary" className="text-xs">
                                        {formatPrice(tr.price)}
                                      </Badge>
                                    )}
                                  </div>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleTreatmentRemove(sel.treatmentId)}
                                className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                                aria-label={t("gabinet.appointments.removeTreatment", "Usuń zabieg")}
                              >
                                <X className="size-4" />
                              </button>
                            </div>
                            {/* Variant picker — only for first/single treatment when variants exist */}
                            {isFirst && selectedTreatments.length === 1 && variants && variants.length > 0 && (
                              <Select
                                value={sel.variantId}
                                onValueChange={(v) =>
                                  handleVariantChange(sel.treatmentId, v === "__none__" ? "" : v)
                                }
                              >
                                <SelectTrigger className="h-8 text-xs" data-testid="appointment-variant-trigger">
                                  <SelectValue
                                    placeholder={t("gabinet.appointments.selectVariant", "Wybierz wariant")}
                                  />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">
                                    {t("gabinet.appointments.noVariant", "Bez wariantu")}
                                  </SelectItem>
                                  {variants.map((v: any) => (
                                    <SelectItem key={v._id} value={v._id}>
                                      <div className="flex flex-col">
                                        <span>{v.name}</span>
                                        <span className="text-xs text-muted-foreground">
                                          {v.resolvedDuration} min
                                          {v.resolvedPrice != null ? ` · ${formatPrice(v.resolvedPrice)}` : ""}
                                        </span>
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        );
                      })}

                      {/* Totals row when multiple treatments */}
                      {selectedTreatments.length > 1 && (
                        <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                          <Clock className="size-3" />
                          <span>
                            {t("gabinet.appointments.totalDuration", "Łącznie")}: {effectiveDuration} min
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Add treatment button — opens the picker */}
                  <TreatmentPicker
                    treatments={(treatments ?? []).filter(
                      (tr) => !selectedTreatments.some((s) => s.treatmentId === tr._id),
                    )}
                    value=""
                    onSelect={handleTreatmentAdd}
                    open={addTreatmentOpen}
                    onOpenChange={setAddTreatmentOpen}
                    search={addTreatmentSearch}
                    onSearchChange={setAddTreatmentSearch}
                    formatPrice={(price) => formatPrice(price)}
                    placeholder={
                      selectedTreatments.length === 0
                        ? t("gabinet.appointments.selectTreatment")
                        : t("gabinet.appointments.addTreatment", "Dodaj zabieg")
                    }
                    searchPlaceholder={t("gabinet.appointments.searchTreatment")}
                    emptyText={t("common.noResults")}
                    closeLabel={t("common.close")}
                    triggerClassName="h-11"
                    triggerTestId="appointment-treatment-trigger"
                  />
                </div>

                {/* Eligible patient packages — render one selector per selected
                    treatment so packages are discovered regardless of which
                    treatment was added first (issue #3586). Each selector
                    auto-sets packageTreatmentId, removing the manual dropdown
                    that previously asked the user to re-select the covered
                    treatment. Issue #1378. */}
                {patientId && selectedTreatments.length > 0 &&
                  selectedTreatments.map((sel) => (
                    <PackageUsageSelector
                      key={sel.treatmentId}
                      patientId={patientId}
                      treatmentId={sel.treatmentId}
                      variantId={sel.variantId || undefined}
                      organizationId={organizationId}
                      selectedUsageId={packageTreatmentId === sel.treatmentId ? packageUsageId : null}
                      onSelect={(id) => {
                        setPackageUsageId(id);
                        setPackageTreatmentId(id ? sel.treatmentId : null);
                      }}
                    />
                  ))
                }

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

                    {/* Equipment error — blocks submission (issue #1504) */}
                    {equipmentBlocking && <EquipmentWarning size="compact" />}
                  </>
                )}

                {/* Walk-in toggle — explicit opt-in to expose past time slots
                    so the user can record an appointment they already saw.
                    Default-off keeps past slots filtered server-side. #1406. */}
                <Label
                  htmlFor="record-walk-in"
                  className="-mx-1 flex min-h-11 select-none items-start gap-3 rounded-md px-1 py-1.5 text-sm leading-tight mb-0 cursor-pointer transition-colors hover:bg-accent/40 active:bg-accent"
                >
                  <Checkbox
                    id="record-walk-in"
                    checked={recordWalkIn}
                    onCheckedChange={(c) => setRecordWalkIn(c as boolean)}
                    className="mt-0.5"
                  />
                  {t("gabinet.appointments.recordWalkIn")}
                </Label>

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
                  <Label
                    htmlFor="recurring-appt"
                    className="-mx-1 flex min-h-11 select-none items-center gap-3 rounded-md px-1 py-1.5 text-sm mb-0 cursor-pointer transition-colors hover:bg-accent/40 active:bg-accent"
                  >
                    <Checkbox
                      id="recurring-appt"
                      checked={isRecurring}
                      onCheckedChange={(c) =>
                        setIsRecurring(c as boolean)
                      }
                    />
                    {t("gabinet.appointments.recurring")}
                  </Label>
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
                                    <TimePicker5Min
                                      value={occ.startTime}
                                      disabled={occ.index === 0}
                                      onChange={(v) =>
                                        setRecurringOverrides((prev) => ({
                                          ...prev,
                                          [occ.index]: {
                                            ...prev[occ.index],
                                            startTime: v,
                                          },
                                        }))
                                      }
                                      className="h-7 w-[88px] px-2 text-xs"
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
                  disabled={(date) => {
                    if (!calendarEnabled) return true;
                    if (recordWalkIn) return false;
                    const d = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                    return d < nowDate;
                  }}
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
                  <LeaveWarning
                    leave={employeeLeaveOnSelectedDate}
                    size="compact"
                    className="mx-3 mb-2"
                  />
                )}

                {hasBookingConflict && (
                  <ConflictWarning
                    size="compact"
                    className="mx-3 mb-2"
                  />
                )}

                <Separator />

                {/* Slots list.
                    On mobile (#1463) the right panel has no defined height
                    — `md:h-[600px]` lives on the 3-panel wrapper and only
                    applies on md+. With `min-h-0` on mobile the flex item
                    collapses to 0px, hiding the slot buttons and leaving
                    the user with no way to pick a time (and therefore no
                    Confirmation area / "Potwierdź rezerwację" button below).
                    Gating both `min-h-0` and the inner `overflow-y-auto` on
                    `md:` lets the slot list expand to its content on mobile
                    (the outer DialogContent already handles overall scroll,
                    per #1462) while keeping desktop's in-panel scroll
                    behavior intact. */}
                <ScrollShadow className="flex-1 md:min-h-0 md:overflow-y-auto">
                  <div className="p-3 space-y-1.5">
                    {slotsLoading ? (
                      // Skeleton loading
                      Array.from({ length: 8 }).map((_, i) => (
                        <Skeleton
                          key={i}
                          className="h-9 w-full rounded-md"
                        />
                      ))
                    ) : slotsErrored && !slotsResult ? (
                      // Surface backend errors instead of collapsing them into
                      // the generic "no slots" empty state — otherwise a
                      // crashed action looks identical to an unconfigured
                      // schedule and the user has no way to tell them apart.
                      // Issue #1429.
                      <div
                        role="alert"
                        className="py-8 text-center px-3"
                      >
                        <p className="text-sm font-medium text-destructive">
                          {t(
                            "gabinet.appointments.calendarDialog.slotsLoadError",
                          )}
                        </p>
                      </div>
                    ) : availableSlots && availableSlots.length > 0 ? (
                      <SlotPicker
                        slots={availableSlots}
                        selectedStart={selectedSlot?.start ?? null}
                        onSelect={handleSlotSelect}
                        layout="list"
                        autoScrollSelected
                      />
                    ) : (
                      <div className="py-8 text-center">
                        <p className="text-sm text-muted-foreground">
                          {t(
                            noSlotsReason
                              ? `gabinet.appointments.calendarDialog.noSlotsReason.${noSlotsReason}`
                              : "gabinet.appointments.calendarDialog.noSlotsForDay",
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
                              {selectedVariant && (
                                <span className="text-muted-foreground font-normal"> · {selectedVariant.name}</span>
                              )}
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

                      {hasShortage && (
                        <StockShortageWarning
                          items={shortageItems}
                          size="compact"
                        />
                      )}

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
        tagDefinitions={orgTags}
        categoryDefinitions={patientCategories}
      />
    </SidePanel>
    </>
  );
}

