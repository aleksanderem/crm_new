import { useState, useMemo, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "~/convex/_generated/api";
import type { Id } from "~/convex/_generated/dataModel";
import { useOrganization } from "@/components/org-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, CheckIcon, ChevronsUpDown } from "@/lib/ez-icons";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

function getEmployeeName(emp: { firstName?: string; lastName?: string; role: string; specialization?: string }) {
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

interface AppointmentFormData {
  patientId: Id<"gabinetPatients">;
  treatmentId: Id<"gabinetTreatments">;
  employeeId: Id<"users">;
  date: string;
  startTime: string;
  endTime: string;
  notes?: string;
}

interface AppointmentFormProps {
  onSubmit: (data: AppointmentFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function AppointmentForm({
  onSubmit,
  onCancel,
  isSubmitting = false,
}: AppointmentFormProps) {
  const { t, i18n } = useTranslation();
  const { organizationId } = useOrganization();

  // Data queries
  const { data: treatments } = useQuery(
    convexQuery(api.gabinet.treatments.listActive, {
      organizationId: organizationId!,
    })
  );
  const { data: employees } = useQuery(
    convexQuery(api.gabinet.employees.listAll, {
      organizationId: organizationId!,
      activeOnly: true,
    })
  );
  const { data: patientsPage } = useQuery(
    convexQuery(api.gabinet.patients.list, {
      organizationId: organizationId!,
      paginationOpts: { numItems: 200, cursor: null },
    })
  );

  const patients = patientsPage?.page ?? [];

  // CRM contact search — debounced backend search
  const [patientSearch, setPatientSearch] = useState("");

  // Client-side patient filtering
  const filteredPatients = useMemo(() => {
    if (!patientSearch.trim()) return patients;
    const q = patientSearch.toLowerCase();
    return patients.filter((p) => {
      const full = `${p.firstName} ${p.lastName} ${p.phone ?? ""}`.toLowerCase();
      return full.includes(q);
    });
  }, [patients, patientSearch]);
  const debouncedSearch = useDebounce(patientSearch, 300);

  const isDebouncing = patientSearch.length >= 2 && patientSearch !== debouncedSearch;
  const { data: unlinkedContacts, isLoading: contactsLoading } = useQuery({
    ...convexQuery(api.gabinet.patients.searchUnlinkedContacts, {
      organizationId: organizationId!,
      search: debouncedSearch,
    }),
    enabled: debouncedSearch.length >= 2,
  });
  const isCrmSearching = contactsLoading || isDebouncing;

  const createPatientFromContact = useMutation(api.gabinet.patients.create);

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
  const [isCreatingPatient, setIsCreatingPatient] = useState(false);

  // Popover open states
  const [patientOpen, setPatientOpen] = useState(false);
  const [treatmentOpen, setTreatmentOpen] = useState(false);

  // Derived data
  const selectedTreatment = treatments?.find((tr) => tr._id === treatmentId);
  const selectedPatient = patients.find((p) => p._id === patientId);
  const dateStr = date ? format(date, "yyyy-MM-dd") : "";

  // Filter employees by treatment qualification
  const qualifiedEmployees = useMemo(() => {
    if (!employees || !treatmentId) return employees ?? [];
    return employees.filter(
      (emp) =>
        emp.qualifiedTreatmentIds.length === 0 ||
        emp.qualifiedTreatmentIds.includes(treatmentId as Id<"gabinetTreatments">)
    );
  }, [employees, treatmentId]);

  // Auto-select employee when only one qualified
  useEffect(() => {
    if (qualifiedEmployees.length === 1 && !employeeId) {
      setEmployeeId(qualifiedEmployees[0].userId);
    }
  }, [qualifiedEmployees, employeeId]);

  // Available slots query — runs only when employee + date + treatment are selected
  const { data: availableSlots, isLoading: slotsLoading } = useQuery({
    ...convexQuery(api.gabinet.appointments.getAvailableSlotsQuery, {
      organizationId: organizationId!,
      userId: employeeId as Id<"users">,
      date: dateStr,
      duration: selectedTreatment?.duration ?? 30,
    }),
    enabled: !!employeeId && !!dateStr && !!selectedTreatment,
  });

  const locale = i18n.resolvedLanguage === "pl" ? pl : undefined;

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
    });
  };

  const handlePatientSelect = useCallback((id: string) => {
    setPatientId(id);
    setPatientOpen(false);
    setPatientSearch("");
  }, []);

  const handleContactSelect = useCallback(async (contact: {
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
      const newPatientId = await createPatientFromContact({
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
  }, [createPatientFromContact, organizationId]);

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

  // Display name for the selected patient (handles newly-created patients not yet in query cache)
  const patientDisplayName = selectedPatient
    ? `${selectedPatient.firstName} ${selectedPatient.lastName}`
    : patientLabel || null;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Patient — searchable combobox with CRM contact search */}
      <div className="space-y-1.5">
        <Label>
          {t("gabinet.appointments.patient")}{" "}
          <span className="text-destructive">*</span>
        </Label>
        <Popover open={patientOpen} onOpenChange={(open) => {
            setPatientOpen(open);
            if (!open) setPatientSearch("");
          }}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={patientOpen}
              className="w-full justify-between font-normal"
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
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder={t("gabinet.appointments.searchPatient")}
                value={patientSearch}
                onValueChange={setPatientSearch}
              />
              <CommandList>
                {filteredPatients.length === 0 && !isCrmSearching && (!unlinkedContacts || unlinkedContacts.length === 0) && (
                  <CommandEmpty>
                    {patientSearch.length >= 2
                      ? t("common.noResults")
                      : t("gabinet.appointments.typeToSearch")}
                  </CommandEmpty>
                )}
                {filteredPatients.length > 0 && (
                  <CommandGroup heading={t("gabinet.appointments.existingPatients")}>
                    {filteredPatients.map((p) => (
                      <CommandItem
                        key={p._id}
                        value={p._id}
                        onSelect={() => handlePatientSelect(p._id)}
                      >
                        <CheckIcon
                          className={cn(
                            "mr-2 size-4",
                            patientId === p._id ? "opacity-100" : "opacity-0"
                          )}
                        />
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
                {!isCrmSearching && unlinkedContacts && unlinkedContacts.length > 0 && (
                  <>
                    <CommandSeparator />
                    <CommandGroup heading={t("gabinet.appointments.fromCrmContacts")}>
                      {unlinkedContacts.map((c) => (
                        <CommandItem
                          key={c._id}
                          value={c._id}
                          onSelect={() => handleContactSelect(c)}
                        >
                          <CheckIcon className="mr-2 size-4 opacity-0" />
                          <span>
                            {c.firstName} {c.lastName}
                          </span>
                          <Badge variant="outline" className="ml-2 text-[10px] font-normal">
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
        <Label>
          {t("gabinet.appointments.treatment")}{" "}
          <span className="text-destructive">*</span>
        </Label>
        <Popover open={treatmentOpen} onOpenChange={setTreatmentOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={treatmentOpen}
              className="w-full justify-between font-normal"
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
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command>
              <CommandInput placeholder={t("gabinet.appointments.searchTreatment")} />
              <CommandList>
                <CommandEmpty>{t("common.noResults")}</CommandEmpty>
                <CommandGroup>
                  {treatments?.map((tr) => (
                    <CommandItem
                      key={tr._id}
                      value={tr.name}
                      onSelect={() => handleTreatmentSelect(tr._id)}
                    >
                      <CheckIcon
                        className={cn(
                          "mr-2 size-4",
                          treatmentId === tr._id ? "opacity-100" : "opacity-0"
                        )}
                      />
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
      <div className="space-y-1.5">
        <Label>
          {t("gabinet.appointments.employee")}{" "}
          <span className="text-destructive">*</span>
        </Label>
        <div className="flex flex-wrap gap-2">
          {qualifiedEmployees.map((emp) => (
            <button
              key={emp.userId}
              type="button"
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                employeeId === emp.userId
                  ? "border-primary bg-primary/10 text-primary"
                  : "hover:bg-accent"
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
      </div>

      {/* Date — calendar picker, shown only when employee selected */}
      {employeeId && (
        <div className="space-y-1.5">
          <Label>
            {t("gabinet.appointments.date")}{" "}
            <span className="text-destructive">*</span>
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
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

      {/* Available time slots */}
      {employeeId && date && (
        <div className="space-y-1.5">
          <Label>{t("gabinet.appointments.availableSlots")}</Label>
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
                      : "hover:border-primary/50 hover:bg-primary/5"
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
              {t("gabinet.appointments.selectedTime")}: {selectedSlot.start} – {selectedSlot.end}
            </p>
          )}
        </div>
      )}

      {/* Notes */}
      <div className="space-y-1.5">
        <Label>{t("gabinet.appointments.notes")}</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder={t("gabinet.appointments.notesPlaceholder")}
        />
      </div>

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
          {isSubmitting
            ? t("common.saving")
            : t("gabinet.appointments.create")}
        </Button>
      </div>
    </form>
  );
}
