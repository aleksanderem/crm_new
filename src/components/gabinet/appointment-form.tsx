import { useState, useMemo, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import { useOrganization } from "@/components/org-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/gabinet/rich-text-editor";
import { TagsPicker } from "@/components/categories-tags/tags-picker";
import { CategoryPicker } from "@/components/categories-tags/category-picker";
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
  CommandSeparator,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  CalendarIcon,
  ChevronsUpDown,
  MapPin,
  Building2,
  UserPlus,
} from "@/lib/ez-icons";
import { AlertTriangle, CalendarSearch } from "lucide-react";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { SidePanel } from "@/components/crm/side-panel";
import { PatientForm } from "@/components/forms/patient-form";
import { useSupabaseGabinetLeavesList } from "@/hooks/use-supabase-gabinet-leaves";

function getEmployeeName(emp: {
  firstName?: string;
  lastName?: string;
  role: string;
  specialization?: string;
}) {
  if (emp.firstName || emp.lastName) {
    return `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim();
  }
  return emp.specialization ?? emp.role;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

interface TagDef {
  _id: Id<"tagDefinitions">;
  name: string;
  color: string;
}

interface CategoryDef {
  _id: Id<"categoryDefinitions">;
  name: string;
  parentId?: Id<"categoryDefinitions">;
  color?: string;
}

interface AppointmentFormData {
  patientId: Id<"gabinetPatients">;
  treatmentId: Id<"gabinetTreatments">;
  employeeId: Id<"users">;
  date: string;
  startTime: string;
  endTime: string;
  notes?: string;
  sendReminder?: boolean;
  locationId?: Id<"gabinetLocations">;
  roomId?: Id<"gabinetRooms">;
  tagIds?: Id<"tagDefinitions">[];
  categoryId?: Id<"categoryDefinitions">;
}

interface AppointmentFormProps {
  onSubmit: (data: AppointmentFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  tagDefinitions?: TagDef[];
  categoryDefinitions?: CategoryDef[];
}

export function AppointmentForm({
  onSubmit,
  onCancel,
  isSubmitting = false,
  tagDefinitions = [],
  categoryDefinitions = [],
}: AppointmentFormProps) {
  const { t, i18n } = useTranslation();
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();

  // Data queries
  const listActiveTreatments = useAction(api.gabinet.treatments.listActive);
  const { data: treatments } = useQuery({
    queryKey: ["gabinet.treatments.listActive", organizationId],
    queryFn: () => listActiveTreatments({ organizationId: organizationId! }),
    enabled: !!organizationId,
  }) as { data: any[] | undefined };

  const listEmployees = useAction(api.gabinet.employees.listAll);
  const { data: employees } = useQuery({
    queryKey: ["gabinet.employees.listAll", organizationId, true],
    queryFn: () => listEmployees({ organizationId: organizationId!, activeOnly: true }),
    enabled: !!organizationId,
  }) as { data: any[] | undefined };

  const listPatients = useAction(api.gabinet.patients.list);
  const { data: patientsPage } = useQuery({
    queryKey: ["gabinet.patients.list", organizationId, "form"],
    queryFn: () => listPatients({
      organizationId: organizationId!,
      paginationOpts: { numItems: 200, cursor: null },
    }),
    enabled: !!organizationId,
  }) as { data: { page: any[]; isDone: boolean; continueCursor: string } | undefined };
  const { data: orgSettings } = useQuery(
    convexQuery(api.orgSettings.get, {
      organizationId: organizationId!,
    }),
  );

  const patients = patientsPage?.page ?? [];
  const reminderEnabled = orgSettings?.reminderEnabled ?? false;
  const reminderHours = orgSettings?.reminderHoursBefore ?? 24;

  // CRM contact search — debounced backend search
  const [patientSearch, setPatientSearch] = useState("");

  // Client-side patient filtering
  const filteredPatients = useMemo(() => {
    if (!patientSearch.trim()) return patients;
    const q = patientSearch.toLowerCase();
    return patients.filter((p) => {
      const full =
        `${p.firstName} ${p.lastName} ${p.phone ?? ""}`.toLowerCase();
      return full.includes(q);
    });
  }, [patients, patientSearch]);
  const debouncedSearch = useDebounce(patientSearch, 300);

  const isDebouncing =
    patientSearch.length >= 2 && patientSearch !== debouncedSearch;
  const searchUnlinkedContactsAction = useAction(api.gabinet.patients.searchUnlinkedContacts);
  const { data: unlinkedContacts, isLoading: contactsLoading } = useQuery({
    queryKey: ["gabinet.patients.searchUnlinkedContacts", organizationId, debouncedSearch],
    queryFn: () => searchUnlinkedContactsAction({
      organizationId: organizationId!,
      search: debouncedSearch,
    }),
    enabled: !!organizationId && debouncedSearch.length >= 2,
  }) as { data: any[] | undefined; isLoading: boolean };
  const isCrmSearching = contactsLoading || isDebouncing;

  const createPatient = useAction(api.gabinet.patients.create);
  const findNextSlotAction = useAction(api.gabinet.scheduling.findNextAvailableSlot);

  // Locations query
  const listLocationsAction = useAction(api.gabinet.locations.listLocations);
  const { data: locations } = useQuery({
    queryKey: ["gabinet.locations.listLocations", organizationId],
    queryFn: () => listLocationsAction({ organizationId: organizationId! }),
    enabled: !!organizationId,
  });

  // Form state
  const [patientId, setPatientId] = useState("");
  const [patientLabel, setPatientLabel] = useState("");
  const [treatmentId, setTreatmentId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [selectedSlot, setSelectedSlot] = useState<{
    start: string;
    end: string;
  } | null>(null);
  const [notes, setNotes] = useState("");
  const [sendReminder, setSendReminder] = useState(reminderEnabled);
  const [isCreatingPatient, setIsCreatingPatient] = useState(false);
  const [searchingSlot, setSearchingSlot] = useState(false);
  const [locationId, setLocationId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [tagIds, setTagIds] = useState<Id<"tagDefinitions">[]>([]);
  const [categoryId, setCategoryId] = useState<Id<"categoryDefinitions"> | undefined>();
  const [addPatientOpen, setAddPatientOpen] = useState(false);

  // Rooms query — enabled only when a location is selected
  const getLocationAction = useAction(api.gabinet.locations.getLocation);
  const { data: locationWithRooms } = useQuery({
    queryKey: ["gabinet.locations.getLocation", organizationId, locationId],
    queryFn: () =>
      getLocationAction({
        organizationId: organizationId!,
        locationId: locationId as string,
      }),
    enabled: !!organizationId && !!locationId,
  });
  const activeRooms = locationWithRooms?.rooms?.filter((r) => r.isActive) ?? [];

  // Equipment at selected location — for advisory warnings
  const listEquipmentAction = useAction(api.gabinet.equipment.listEquipment);
  const { data: equipmentAtLocation } = useQuery({
    queryKey: ["gabinet.equipment.listEquipment", organizationId, locationId],
    queryFn: () => listEquipmentAction({
      organizationId: organizationId!,
      locationId: locationId,
    }),
    enabled: !!organizationId && !!locationId,
  });

  const activeLocations = locations?.filter((l) => l.isActive) ?? [];

  // Popover open states
  const [patientOpen, setPatientOpen] = useState(false);
  const [treatmentOpen, setTreatmentOpen] = useState(false);

  // Derived data
  const selectedTreatment = treatments?.find((tr) => tr._id === treatmentId);
  const selectedPatient = patients.find((p) => p._id === patientId);
  const dateStr = date ? format(date, "yyyy-MM-dd") : "";

  // Equipment warning — advisory only, which required equipment is missing at the selected location
  const missingEquipmentIds = useMemo(() => {
    if (!locationId || !selectedTreatment?.requiredEquipmentIds?.length) return [];
    const atLocationIds = new Set(equipmentAtLocation?.map((e) => e._id) ?? []);
    return (selectedTreatment.requiredEquipmentIds as Id<"gabinetEquipment">[]).filter(
      (id) => !atLocationIds.has(id),
    );
  }, [locationId, selectedTreatment, equipmentAtLocation]);

  // Approved leaves for selected employee — used to surface a warning when
  // the chosen date overlaps with an approved leave. The available-slots
  // backend already excludes leave time, but the user otherwise sees an
  // empty/short slot list with no explanation. Issue #652.
  const { data: employeeLeaves } = useSupabaseGabinetLeavesList(
    organizationId ?? "",
    { userId: employeeId || undefined, status: "approved", enabled: !!organizationId && !!employeeId },
  );

  const employeeLeaveOnSelectedDate = useMemo(() => {
    if (!dateStr || !employeeLeaves || employeeLeaves.length === 0) return null;
    return employeeLeaves.find(
      (l) => l.startDate <= dateStr && l.endDate >= dateStr,
    ) ?? null;
  }, [employeeLeaves, dateStr]);

  // Filter employees by treatment qualification
  const qualifiedEmployees = useMemo(() => {
    if (!employees || !treatmentId) return employees ?? [];
    return employees.filter(
      (emp) =>
        emp.qualifiedTreatmentIds.length === 0 ||
        emp.qualifiedTreatmentIds.includes(
          treatmentId as Id<"gabinetTreatments">,
        ),
    );
  }, [employees, treatmentId]);

  // Sync reminder default when org settings load
  useEffect(() => {
    if (orgSettings?.reminderEnabled !== undefined) {
      setSendReminder(orgSettings.reminderEnabled);
    }
  }, [orgSettings?.reminderEnabled]);

  // Auto-select employee when only one qualified
  useEffect(() => {
    if (qualifiedEmployees.length === 1 && !employeeId) {
      setEmployeeId(qualifiedEmployees[0].userId);
    }
  }, [qualifiedEmployees, employeeId]);

  // Available slots — backend is now an action reading from Supabase
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
        organizationId: organizationId!,
        userId: employeeId as string,
        date: dateStr,
        duration: selectedTreatment?.duration ?? 30,
      }),
    enabled: !!employeeId && !!dateStr && !!selectedTreatment && !!organizationId,
  });

  const locale = i18n.resolvedLanguage === "pl" ? pl : undefined;

  const handleFindSlot = async () => {
    if (!employeeId || !selectedTreatment || !organizationId) return;
    setSearchingSlot(true);
    try {
      const fromDate = date
        ? format(date, "yyyy-MM-dd")
        : new Date().toISOString().split("T")[0];
      const result = await findNextSlotAction({
        organizationId,
        employeeId: employeeId as string,
        durationMinutes: selectedTreatment.duration,
        fromDate,
      });
      if (result) {
        setDate(new Date(result.date + "T00:00:00"));
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
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !patientId || !treatmentId || !employeeId || !selectedSlot)
      return;
    onSubmit({
      patientId: patientId as Id<"gabinetPatients">,
      treatmentId: treatmentId as Id<"gabinetTreatments">,
      employeeId: employeeId as Id<"users">,
      date: dateStr,
      startTime: selectedSlot.start,
      endTime: selectedSlot.end,
      notes: notes || undefined,
      sendReminder: sendReminder || undefined,
      locationId: locationId ? (locationId as Id<"gabinetLocations">) : undefined,
      roomId: roomId ? (roomId as Id<"gabinetRooms">) : undefined,
      tagIds: tagIds.length > 0 ? tagIds : undefined,
      categoryId: categoryId || undefined,
    });
  };

  const handlePatientSelect = useCallback((id: string) => {
    setPatientId(id);
    setPatientOpen(false);
    setPatientSearch("");
  }, []);

  const handleContactSelect = useCallback(
    async (contact: {
      _id: Id<"contacts">;
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
    }) => {
      setPatientOpen(false);
      setPatientSearch("");
      setIsCreatingPatient(true);
      setPatientLabel(`${contact.firstName} ${contact.lastName}`);
      try {
        const newPatientId = await createPatient({
          organizationId: organizationId!,
          contactId: contact._id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          phone: contact.phone || undefined,
        });
        setPatientId(newPatientId as string);
      } finally {
        setIsCreatingPatient(false);
        setPatientLabel("");
      }
    },
    [createPatient, organizationId],
  );

  const handleCreatePatient = useCallback(
    async (formData: {
      firstName: string;
      lastName: string;
      email: string;
      phone?: string;
      pesel?: string;
      dateOfBirth?: string;
      gender?: "male" | "female" | "other";
      address?: { street?: string; city?: string; postalCode?: string };
      medicalNotes?: string;
      allergies?: string;
      bloodType?: string;
      emergencyContactName?: string;
      emergencyContactPhone?: string;
      referralSource?: string;
    }) => {
      if (!organizationId) return;
      setIsCreatingPatient(true);
      setPatientLabel(`${formData.firstName} ${formData.lastName}`.trim());
      try {
        const newId = await createPatient({
          organizationId,
          ...formData,
        });
        setPatientId(String(newId));
        await queryClient.invalidateQueries({
          queryKey: ["gabinet.patients.list", organizationId],
        });
        setAddPatientOpen(false);
        toast.success(
          t("gabinet.patients.created", { defaultValue: "Klient utworzony" }),
        );
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(msg);
        setPatientLabel("");
      } finally {
        setIsCreatingPatient(false);
      }
    },
    [createPatient, organizationId, queryClient, t],
  );

  // Clear the pending label once the newly-created patient appears in the cache
  useEffect(() => {
    if (patientLabel && patientId && patients.some((p) => p._id === patientId)) {
      setPatientLabel("");
    }
  }, [patientLabel, patientId, patients]);

  // Reset downstream selections when upstream changes
  const handleTreatmentSelect = (id: string) => {
    setTreatmentId(id);
    setTreatmentOpen(false);
    setEmployeeId("");
    setSelectedSlot(null);
  };

  const handleEmployeeSelect = (id: string) => {
    setEmployeeId(id);
    setSelectedSlot(null);
  };

  const handleDateSelect = (d: Date | undefined) => {
    setDate(d);
    setSelectedSlot(null);
  };

  const handleLocationSelect = (id: string) => {
    setLocationId(id);
    setRoomId("");
  };

  // Display name for the selected patient (handles newly-created patients not yet in query cache)
  const patientDisplayName = selectedPatient
    ? `${selectedPatient.firstName} ${selectedPatient.lastName}`
    : patientLabel || null;

  return (
    <>
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Patient — searchable combobox with CRM contact search */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="appt-patient">
            {t("gabinet.appointments.patient")}{" "}
            <span className="text-destructive">*</span>
          </Label>
          <button
            type="button"
            onClick={() => setAddPatientOpen(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring rounded"
            data-testid="appointment-form-add-patient-button"
          >
            <UserPlus className="size-3.5" />
            {t("gabinet.patients.addPatient")}
          </button>
        </div>
        <Popover
          open={patientOpen}
          onOpenChange={(open) => {
            setPatientOpen(open);
            if (!open) setPatientSearch("");
          }}
        >
          <PopoverTrigger asChild>
            <Button
              id="appt-patient"
              variant="outline"
              role="combobox"
              aria-expanded={patientOpen}
              className="w-full justify-between h-11 font-normal"
              disabled={isCreatingPatient}
            >
              {isCreatingPatient ? (
                <span className="text-muted-foreground flex items-center gap-2">
                  <span className="border-primary size-3.5 animate-spin rounded-full border-2 border-t-transparent" />
                  {t("gabinet.appointments.creatingPatient")}
                </span>
              ) : patientDisplayName ? (
                patientDisplayName
              ) : (
                t("gabinet.appointments.selectPatient")
              )}
              <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="p-0"
            style={{ width: "var(--radix-popover-trigger-width)" }}
            align="start"
          >
            <Command shouldFilter={false}>
              <CommandInput
                placeholder={t("gabinet.appointments.searchPatient")}
                value={patientSearch}
                onValueChange={setPatientSearch}
              />
              <CommandList>
                {filteredPatients.length === 0 &&
                  !isCrmSearching &&
                  (!unlinkedContacts || unlinkedContacts.length === 0) && (
                    <CommandEmpty>
                      {patientSearch.length >= 2
                        ? t("common.noResults")
                        : t("gabinet.appointments.typeToSearch")}
                    </CommandEmpty>
                  )}
                {filteredPatients.length > 0 && (
                  <CommandGroup
                    heading={t("gabinet.appointments.existingPatients")}
                  >
                    {filteredPatients.map((p) => (
                      <CommandItem
                        key={p._id}
                        value={p._id}
                        onSelect={() => handlePatientSelect(p._id)}
                        className={cn(
                          "px-3",
                          patientId === p._id && "bg-accent font-medium text-accent-foreground"
                        )}
                      >
                        <span>
                          {p.firstName} {p.lastName}
                        </span>
                        {p.phone && (
                          <span className="text-muted-foreground ml-auto text-xs">
                            {p.phone}
                          </span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {isCrmSearching && patientSearch.length >= 2 && (
                  <div className="text-muted-foreground flex items-center justify-center gap-2 py-4 text-sm">
                    <span className="border-primary size-3.5 animate-spin rounded-full border-2 border-t-transparent" />
                    {t("gabinet.appointments.searchingContacts")}
                  </div>
                )}
                {!isCrmSearching &&
                  unlinkedContacts &&
                  unlinkedContacts.length > 0 && (
                    <>
                      <CommandSeparator />
                      <CommandGroup
                        heading={t("gabinet.appointments.fromCrmContacts")}
                      >
                        {unlinkedContacts.map((c) => (
                          <CommandItem
                            key={c._id}
                            value={c._id}
                            onSelect={() => handleContactSelect(c)}
                            className="px-3"
                          >
                            <span>
                              {c.firstName} {c.lastName}
                            </span>
                            <Badge
                              variant="outline"
                              className="ml-2 text-[10px] font-normal"
                            >
                              CRM
                            </Badge>
                            {(c.phone || c.email) && (
                              <span className="text-muted-foreground ml-auto text-xs">
                                {c.phone || c.email}
                              </span>
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </>
                  )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Treatment — searchable combobox */}
      <div className="space-y-1.5">
        <Label htmlFor="appt-treatment">
          {t("gabinet.appointments.treatment")}{" "}
          <span className="text-destructive">*</span>
        </Label>
        <Popover open={treatmentOpen} onOpenChange={setTreatmentOpen}>
          <PopoverTrigger asChild>
            <Button
              id="appt-treatment"
              variant="outline"
              role="combobox"
              aria-expanded={treatmentOpen}
              className="w-full justify-between h-11 font-normal"
            >
              {selectedTreatment ? (
                <span className="flex items-center gap-2 truncate">
                  {selectedTreatment.name}
                  <Badge variant="secondary" className="text-xs font-normal">
                    {selectedTreatment.duration} min
                  </Badge>
                </span>
              ) : (
                t("gabinet.appointments.selectTreatment")
              )}
              <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="p-0"
            style={{ width: "var(--radix-popover-trigger-width)" }}
            align="start"
          >
            <Command>
              <CommandInput
                placeholder={t("gabinet.appointments.searchTreatment")}
              />
              <CommandList>
                <CommandEmpty>{t("common.noResults")}</CommandEmpty>
                <CommandGroup>
                  {treatments?.map((tr) => (
                    <CommandItem
                      key={tr._id}
                      value={tr.name}
                      onSelect={() => handleTreatmentSelect(tr._id)}
                      className={cn(
                        "px-3",
                        treatmentId === tr._id && "bg-accent font-medium text-accent-foreground"
                      )}
                    >
                      <span className="flex-1">{tr.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {tr.duration} min · {tr.price} zł
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Employee — regular select, filtered by qualification */}
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
          {t("gabinet.appointments.employee")}{" "}
          <span className="text-destructive">*</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {qualifiedEmployees.map((emp) => (
            <button
              key={emp.userId}
              type="button"
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                employeeId === emp.userId
                  ? "border-primary bg-primary/10 text-primary"
                  : "hover:bg-accent",
              )}
              onClick={() => handleEmployeeSelect(emp.userId)}
            >
              <div
                className="size-2.5 rounded-full"
                style={{ backgroundColor: emp.color ?? "#6366f1" }}
              />
              {getEmployeeName(emp)}
            </button>
          ))}
          {treatmentId && qualifiedEmployees.length === 0 && (
            <p className="text-muted-foreground text-sm">
              {t("gabinet.appointments.noQualifiedEmployees")}
            </p>
          )}
        </div>
      </fieldset>

      {/* Find nearest available slot */}
      {employeeId && selectedTreatment && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          disabled={searchingSlot}
          onClick={handleFindSlot}
        >
          {searchingSlot ? (
            <span className="border-primary mr-2 size-3.5 animate-spin rounded-full border-2 border-t-transparent" />
          ) : (
            <CalendarSearch className="mr-2 size-4" />
          )}
          {t("gabinet.appointments.findNearestSlot")}
        </Button>
      )}

      {/* Date — calendar picker, shown only when employee selected */}
      {employeeId && (
        <div className="space-y-1.5">
          <Label htmlFor="appt-date">
            {t("gabinet.appointments.date")}{" "}
            <span className="text-destructive">*</span>
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                id="appt-date"
                variant="outline"
                className="w-full justify-start font-normal"
              >
                <CalendarIcon className="mr-2 size-4" />
                {date
                  ? format(date, "EEEE, d MMMM yyyy", { locale })
                  : t("gabinet.appointments.pickDate")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={handleDateSelect}
                disabled={{ before: new Date() }}
                locale={locale}
              />
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Leave warning — employee is on approved leave overlapping selected date */}
      {employeeId && date && employeeLeaveOnSelectedDate && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {employeeLeaveOnSelectedDate.startTime && employeeLeaveOnSelectedDate.endTime
              ? t("gabinet.appointments.warnings.leavePartial", {
                  start: employeeLeaveOnSelectedDate.startTime,
                  end: employeeLeaveOnSelectedDate.endTime,
                  defaultValue:
                    "Pracownik jest na urlopie w tym dniu w godzinach {{start}}–{{end}}.",
                })
              : t("gabinet.appointments.warnings.leave", {
                  defaultValue: "Pracownik jest na urlopie w tym terminie",
                })}
          </span>
        </div>
      )}

      {/* Available time slots */}
      {employeeId && date && (
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            {t("gabinet.appointments.availableSlots")}
          </legend>
          {slotsLoading ? (
            <div className="text-muted-foreground flex items-center gap-2 py-4 text-sm">
              <div className="border-primary size-4 animate-spin rounded-full border-2 border-t-transparent" />
              {t("gabinet.appointments.loadingSlots")}
            </div>
          ) : availableSlots && availableSlots.length > 0 ? (
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
              {availableSlots.map((slot) => (
                <button
                  key={slot.start}
                  type="button"
                  className={cn(
                    "rounded-md border px-2 py-1.5 text-center text-sm transition-colors",
                    selectedSlot?.start === slot.start
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:border-primary/50 hover:bg-primary/5",
                  )}
                  onClick={() => setSelectedSlot(slot)}
                >
                  {slot.start}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground py-3 text-center text-sm">
              {t("gabinet.appointments.noSlots")}
            </p>
          )}
          {selectedSlot && (
            <p className="text-muted-foreground text-sm">
              {t("gabinet.appointments.selectedTime")}: {selectedSlot.start} –{" "}
              {selectedSlot.end}
            </p>
          )}
        </fieldset>
      )}

      {/* Location and Room */}
      {activeLocations.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="appt-location" className="flex items-center gap-1.5">
              <MapPin className="size-3.5 text-muted-foreground" />
              {t("gabinet.appointments.location")}
            </Label>
            <Select value={locationId} onValueChange={handleLocationSelect}>
              <SelectTrigger id="appt-location" className="h-9">
                <SelectValue placeholder={t("gabinet.appointments.location")} />
              </SelectTrigger>
              <SelectContent>
                {activeLocations.map((loc) => (
                  <SelectItem key={loc._id} value={loc._id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="appt-room" className="flex items-center gap-1.5">
              <Building2 className="size-3.5 text-muted-foreground" />
              {t("gabinet.appointments.room")}
            </Label>
            <Select
              value={roomId}
              onValueChange={setRoomId}
              disabled={!locationId || activeRooms.length === 0}
            >
              <SelectTrigger id="appt-room" className="h-9">
                <SelectValue placeholder={t("gabinet.appointments.room")} />
              </SelectTrigger>
              <SelectContent>
                {activeRooms.map((room) => (
                  <SelectItem key={room._id} value={room._id}>
                    {room.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Equipment warnings — advisory only */}
      {missingEquipmentIds.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
          <AlertTriangle className="size-4 shrink-0" />
          {t("gabinet.appointments.equipmentWarning")}
        </div>
      )}

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="appt-notes">{t("gabinet.appointments.notes")}</Label>
        <RichTextEditor
          value={notes}
          onChange={(v) => setNotes(v ?? "")}
          minHeight="80px"
          placeholder={t("gabinet.appointments.notesPlaceholder")}
        />
      </div>

      {/* Reminder toggle */}
      <div className="flex items-start gap-2">
        <Checkbox
          id="sendReminder"
          checked={sendReminder}
          onCheckedChange={(checked) => setSendReminder(checked === true)}
        />
        <div className="grid gap-0.5 leading-none">
          <label
            htmlFor="sendReminder"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            {t("gabinet.appointments.sendReminder")}
          </label>
          {sendReminder && (
            <p className="text-muted-foreground text-xs">
              {t("gabinet.appointments.reminderInfo", { hours: reminderHours })}
            </p>
          )}
        </div>
      </div>

      {/* Tags */}
      {tagDefinitions && tagDefinitions.length > 0 && (
        <div className="space-y-1.5">
          <Label>{t('common.tags', { defaultValue: "Tagi" })}</Label>
          <TagsPicker tags={tagDefinitions} selectedIds={tagIds} onChange={setTagIds} />
        </div>
      )}

      {/* Category */}
      {organizationId && (
        <div className="space-y-1.5">
          <Label>{t('common.category', { defaultValue: "Kategoria" })}</Label>
          <CategoryPicker
            categories={categoryDefinitions ?? []}
            selectedId={categoryId}
            onChange={setCategoryId}
            organizationId={organizationId}
            entityType="gabinetAppointment"
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button
          type="submit"
          disabled={
            !patientId ||
            !treatmentId ||
            !employeeId ||
            !date ||
            !selectedSlot ||
            isSubmitting
          }
        >
          {isSubmitting ? t("common.saving") : t("gabinet.appointments.create")}
        </Button>
      </div>
    </form>

    <SidePanel
      open={addPatientOpen}
      onOpenChange={setAddPatientOpen}
      title={t("gabinet.patients.createPatient")}
      description={t("gabinet.patients.createDescription")}
    >
      <PatientForm
        onSubmit={handleCreatePatient}
        onCancel={() => setAddPatientOpen(false)}
        isSubmitting={isCreatingPatient}
      />
    </SidePanel>
    </>
  );
}
