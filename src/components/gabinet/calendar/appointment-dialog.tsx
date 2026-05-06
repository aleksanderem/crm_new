import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMutation, useAction, useConvex } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
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
  MapPin,
  Building2,
} from "@/lib/ez-icons";
import { AlertTriangle, CalendarSearch } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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
}: AppointmentDialogProps) {
  const { t, i18n } = useTranslation();
  const dateFnsLocale = i18n.resolvedLanguage === "pl" ? pl : undefined;
  const createAppointment = useAction(api.gabinet.appointments.create);
  const findNextSlotAction = useAction(api.gabinet.scheduling.findNextAvailableSlot);
  const convex = useConvex();

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
  }) as { data: any[] | undefined };

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  const [treatmentId, setTreatmentId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
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
  const [submitting, setSubmitting] = useState(false);
  const [searchingSlot, setSearchingSlot] = useState(false);
  const [locationId, setLocationId] = useState("");
  const [roomId, setRoomId] = useState("");

  // Combobox open states
  const [treatmentOpen, setTreatmentOpen] = useState(false);
  const [patientOpen, setPatientOpen] = useState(false);
  const [patientSearch, setPatientSearch] = useState("");
  const [treatmentSearch, setTreatmentSearch] = useState("");

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
    return all.filter(
      (p) =>
        (p.firstName ?? "").toLowerCase().includes(q) ||
        (p.lastName ?? "").toLowerCase().includes(q) ||
        (p.email ?? "").toLowerCase().includes(q) ||
        (p.phone ?? "").toLowerCase().includes(q),
    );
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
  const activeRooms = locationWithRooms?.rooms?.filter((r: { isActive: boolean }) => r.isActive) ?? [];

  // Equipment at selected location — for advisory warnings
  const listEquipmentAction = useAction(api.gabinet.equipment.listEquipment);
  const { data: equipmentAtLocation } = useQuery({
    queryKey: ["gabinet.equipment.listEquipment", organizationId, locationId],
    queryFn: () => listEquipmentAction({
      organizationId,
      locationId,
    }),
    enabled: !!organizationId && !!locationId,
  }) as { data: any[] | undefined };

  const activeLocations = locations?.filter((l: { isActive: boolean }) => l.isActive) ?? [];

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
  // Submit
  // -------------------------------------------------------------------------

  const endTime = selectedSlot
    ? selectedSlot.end ||
      computeEndTime(
        selectedSlot.start,
        selectedTreatment?.duration ?? 30,
      )
    : "";

  const canSubmit =
    !!patientId &&
    !!treatmentId &&
    !!employeeId &&
    !!dateStr &&
    !!selectedSlot &&
    !submitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !selectedSlot) return;
    setSubmitting(true);
    try {
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
        locationId: locationId ? (locationId as Id<"gabinetLocations">) : undefined,
        roomId: roomId ? (roomId as Id<"gabinetRooms">) : undefined,
      });
      toast.success(t("gabinet.appointments.created"));
      onOpenChange(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
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
    onOpenChange,
    t,
  ]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setTreatmentId("");
      setEmployeeId("");
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
      setPatientSearch("");
      setTreatmentSearch("");
      setLocationId("");
      setRoomId("");
    }
  }, [open, defaultDate, defaultTime, defaultEndTime]);

  // -------------------------------------------------------------------------
  // Determine which panels are active
  // -------------------------------------------------------------------------

  const calendarEnabled = !!treatmentId && !!employeeId;
  const slotsEnabled = calendarEnabled && !!selectedDate;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 gap-0 overflow-hidden max-h-[90vh] md:max-h-[640px]">
        <DialogTitle className="sr-only">
          {t("gabinet.appointments.createAppointment")}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t("gabinet.appointments.createAppointment")}
        </DialogDescription>

        {/* 3-panel layout: stacks vertically on mobile */}
        <div className="flex flex-col md:flex-row md:h-[600px]">
          {/* ============================================================= */}
          {/* LEFT PANEL — Treatment, Employee, Patient info                */}
          {/* ============================================================= */}
          <div className="w-full md:w-[280px] border-b md:border-b-0 md:border-r flex flex-col">
            <ScrollShadow className="flex-1 overflow-y-auto">
              <div className="p-5 pb-8 space-y-5">
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
                            {selectedTreatment.description}
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

                <Separator />

                {/* Patient selector */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {t("gabinet.appointments.patient")}
                  </Label>
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
                                      {p.phone}
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
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    return date < today;
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
              <div className="flex flex-col items-center justify-center flex-1 px-5 py-8">
                <UntitledAlert>{t("gabinet.appointments.calendarDialog.selectDateForSlots")}</UntitledAlert>
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
                        {selectedPatient && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              {t("gabinet.appointments.patient")}
                            </span>
                            <span className="font-medium truncate ml-2 text-right">
                              {selectedPatient.firstName}{" "}
                              {selectedPatient.lastName}
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
  );
}

