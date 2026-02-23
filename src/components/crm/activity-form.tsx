import { useState, useRef, useEffect, useMemo, KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Phone,
  Clock,
  Mail,
  CheckCircle2,
  X,
  ChevronDown,
  Search,
  type EzIconType as LucideIcon,
} from "@/lib/ez-icons";
import { cn } from "@/lib/utils";
import { getActivityIcon } from "@/lib/activity-icon-registry";
import { CustomFieldFormSection } from "@/components/custom-fields/custom-field-form-section";
import type { CustomFieldType } from "@cvx/schema";

export type ActivityType = "call" | "meeting" | "email" | "task";

export interface GuestSearchResult {
  id: string;
  label: string;
  email?: string;
}

interface CustomFieldDef {
  _id: string;
  name: string;
  fieldKey: string;
  fieldType: CustomFieldType;
  options?: string[];
  isRequired?: boolean;
  group?: string;
  activityTypeKey?: string;
}

interface ActivityFormProps {
  linkedEntityType: string;
  linkedEntityLabel: string;
  onSubmit: (data: {
    title: string;
    activityType: string;
    dueDate: number;
    endDate?: number;
    description?: string;
    note?: string;
    guests?: string[];
    isCompleted?: boolean;
    customFieldValues?: Record<string, unknown>;
  }) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
  contactSearchResults?: GuestSearchResult[];
  onSearchContacts?: (query: string) => void;
  activityTypes?: Array<{ key: string; name: string; icon: string; color?: string }>;
  customFieldDefs?: CustomFieldDef[];
}

export function ActivityForm({
  linkedEntityType,
  linkedEntityLabel,
  onSubmit,
  onCancel,
  isSubmitting = false,
  contactSearchResults = [],
  onSearchContacts,
  activityTypes: activityTypesProp,
  customFieldDefs = [],
}: ActivityFormProps) {
  const { t } = useTranslation();

  const defaultActivityTypes = useMemo(() => [
    { value: "call", icon: Phone, label: t('activityForm.defaultTypes.call') },
    { value: "meeting", icon: Clock, label: t('activityForm.defaultTypes.meeting') },
    { value: "email", icon: Mail, label: t('activityForm.defaultTypes.email') },
    { value: "task", icon: CheckCircle2, label: t('activityForm.defaultTypes.task') },
  ], [t]);

  const resolvedTypes = activityTypesProp
    ? activityTypesProp.map((at) => ({
        value: at.key,
        icon: getActivityIcon(at.icon) ?? Phone,
        label: at.name,
      }))
    : defaultActivityTypes;

  const [title, setTitle] = useState("");
  const [activityType, setActivityType] = useState<string>(resolvedTypes[0]?.value ?? "call");
  const [cfValues, setCfValues] = useState<Record<string, unknown>>({});
  const [startDate, setStartDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [startTime, setStartTime] = useState("07:00");
  const [endTime, setEndTime] = useState("");
  const [endDate, setEndDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [reminderValue, setReminderValue] = useState("30");
  const [reminderUnit, setReminderUnit] = useState("minuty");
  const [showDescription, setShowDescription] = useState(false);
  const [showGuests, setShowGuests] = useState(false);
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [markCompleted, setMarkCompleted] = useState(false);

  // Guest tag input state
  const [guests, setGuests] = useState<string[]>([]);
  const [guestQuery, setGuestQuery] = useState("");
  const [showGuestDropdown, setShowGuestDropdown] = useState(false);
  const guestContainerRef = useRef<HTMLDivElement>(null);
  const guestInputRef = useRef<HTMLInputElement>(null);

  const inputClasses =
    "h-9 w-full rounded-md border bg-transparent px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50";

  // Close guest dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        guestContainerRef.current &&
        !guestContainerRef.current.contains(e.target as Node)
      ) {
        setShowGuestDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleGuestInputChange(value: string) {
    setGuestQuery(value);
    onSearchContacts?.(value);
    if (value.length > 0) setShowGuestDropdown(true);
  }

  function addGuest(value: string) {
    const trimmed = value.trim();
    if (trimmed && !guests.includes(trimmed)) {
      setGuests([...guests, trimmed]);
    }
    setGuestQuery("");
    setShowGuestDropdown(false);
    guestInputRef.current?.focus();
  }

  function removeGuest(value: string) {
    setGuests(guests.filter((g) => g !== value));
  }

  function handleGuestKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && guestQuery.trim()) {
      e.preventDefault();
      addGuest(guestQuery);
    }
    if (e.key === "Backspace" && !guestQuery && guests.length > 0) {
      removeGuest(guests[guests.length - 1]);
    }
  }

  // Filter search results to exclude already-added guests
  const filteredResults = contactSearchResults.filter(
    (c) => !guests.includes(c.email ?? c.label)
  );

  // Custom fields for the currently selected activity type
  const activeCustomFields = useMemo(
    () => customFieldDefs.filter(
      (d) => d.activityTypeKey === activityType || d.activityTypeKey === undefined
    ),
    [customFieldDefs, activityType]
  );

  const handleSubmit = async () => {
    if (!title.trim() || !startDate) return;

    const dueDateMs = new Date(
      `${startDate}T${startTime || "00:00"}`
    ).getTime();
    let endDateMs: number | undefined;
    if (endTime) {
      endDateMs = new Date(`${endDate}T${endTime}`).getTime();
    }

    // Collect only custom field values that belong to the active type
    const activeCfKeys = new Set(activeCustomFields.map((d) => d.fieldKey));
    const filteredCfValues: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(cfValues)) {
      if (activeCfKeys.has(k) && v !== undefined && v !== null && v !== "") {
        filteredCfValues[k] = v;
      }
    }

    await onSubmit({
      title: title.trim(),
      activityType,
      dueDate: dueDateMs,
      endDate: endDateMs,
      description: description.trim() || undefined,
      note: note.trim() || undefined,
      guests: guests.length > 0 ? guests : undefined,
      isCompleted: markCompleted,
      customFieldValues: Object.keys(filteredCfValues).length > 0 ? filteredCfValues : undefined,
    });
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col max-h-[70vh]">
      <div className="space-y-5 overflow-y-auto flex-1 min-h-0">
        {/* Title */}
        <div className="space-y-1.5">
          <Label>
            <span className="text-destructive">*</span> {t('activityForm.title')}
          </Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('activityForm.titlePlaceholder')}
            autoFocus
          />
        </div>

        {/* Activity type icons with tooltips */}
        <div className="flex gap-1">
          {resolvedTypes.map(({ value, icon: Icon, label }) => (
            <Tooltip key={value}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg border transition-colors",
                    activityType === value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-muted bg-muted/50 text-muted-foreground hover:border-primary/40 hover:text-primary"
                  )}
                  onClick={() => setActivityType(value)}
                >
                  <Icon className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{label}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        {/* Custom fields for selected activity type */}
        {activeCustomFields.length > 0 && (
          <CustomFieldFormSection
            definitions={activeCustomFields}
            values={cfValues}
            onChange={(fieldKey, value) =>
              setCfValues((prev) => ({ ...prev, [fieldKey]: value }))
            }
          />
        )}

        {/* Date/time range */}
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            type="date"
            className="w-auto"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <div className="relative flex items-center">
            <Input
              type="time"
              className="w-auto pr-8"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
            {startTime && (
              <button
                type="button"
                className="absolute right-2 text-muted-foreground hover:text-foreground"
                onClick={() => setStartTime("")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <span className="text-muted-foreground">-</span>
          <Input
            type="time"
            className="w-auto"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            placeholder="HH:mm"
          />
          <Input
            type="date"
            className="w-auto"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        {/* Reminder */}
        <div className="space-y-1.5">
          <Label>{t('activityForm.reminder')}</Label>
          <div className="flex items-center gap-2">
            <div className="relative flex items-center">
              <button
                type="button"
                className="absolute left-2 text-muted-foreground hover:text-foreground"
                onClick={() => setReminderValue("")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <Input
                type="number"
                className="w-24 pl-7"
                value={reminderValue}
                onChange={(e) => setReminderValue(e.target.value)}
                min={0}
              />
            </div>
            <Select value={reminderUnit} onValueChange={setReminderUnit}>
              <SelectTrigger className="w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minuty">{t('activityForm.minutes')}</SelectItem>
                <SelectItem value="godziny">{t('activityForm.hours')}</SelectItem>
                <SelectItem value="dni">{t('activityForm.days')}</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              {t('activityForm.beforeDue')}
            </span>
          </div>
        </div>

        {/* Owner */}
        <div className="space-y-1.5">
          <Label>
            <span className="text-destructive">*</span> {t('activityForm.owner')}
          </Label>
          <div
            className={cn(
              inputClasses,
              "flex items-center justify-between text-muted-foreground cursor-default"
            )}
          >
            <span>{t('activityForm.currentUser')}</span>
            <ChevronDown className="h-3.5 w-3.5" />
          </div>
        </div>

        {/* Guests — tag input with contact search */}
        <div className="space-y-1">
          {!showGuests && (
            <button
              type="button"
              className="text-sm text-primary hover:underline"
              onClick={() => setShowGuests(true)}
            >
              {t('activityForm.addGuests')}
            </button>
          )}
          {showGuests && (
            <div className="space-y-1.5" ref={guestContainerRef}>
              <Label>{t('activityForm.guests')}</Label>
              {/* Tags row */}
              {guests.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {guests.map((guest) => (
                    <Badge
                      key={guest}
                      variant="secondary"
                      className="gap-1 pr-1"
                    >
                      {guest}
                      <button
                        type="button"
                        className="ml-0.5 rounded-sm hover:bg-muted-foreground/20"
                        onClick={() => removeGuest(guest)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              {/* Search input */}
              <div className="relative">
                <div className="flex items-center w-full rounded-md border bg-transparent">
                  <Search className="ml-3 h-4 w-4 shrink-0 text-muted-foreground" />
                  <input
                    ref={guestInputRef}
                    type="text"
                    className="h-9 w-full bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
                    placeholder={t('activityForm.searchGuestsPlaceholder')}
                    value={guestQuery}
                    onChange={(e) => handleGuestInputChange(e.target.value)}
                    onKeyDown={handleGuestKeyDown}
                    onFocus={() => {
                      if (guestQuery.length > 0) setShowGuestDropdown(true);
                    }}
                  />
                </div>
                {/* Dropdown */}
                {showGuestDropdown && guestQuery.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
                    {filteredResults.length > 0 ? (
                      <ul className="max-h-[200px] overflow-y-auto p-1">
                        {filteredResults.map((result) => (
                          <li key={result.id}>
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                              onClick={() =>
                                addGuest(result.email ?? result.label)
                              }
                            >
                              <div className="flex flex-col items-start">
                                <span>{result.label}</span>
                                {result.email && (
                                  <span className="text-xs text-muted-foreground">
                                    {result.email}
                                  </span>
                                )}
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="py-3 px-3 text-sm text-muted-foreground">
                        {t('activityForm.noResultsAddGuest')} &quot;{guestQuery}
                        &quot;
                      </div>
                    )}
                    {/* Always show "add as typed" option when input looks like email */}
                    {guestQuery.includes("@") &&
                      !guests.includes(guestQuery.trim()) && (
                        <button
                          type="button"
                          className="flex w-full items-center px-3 py-2 text-sm text-primary hover:bg-accent border-t"
                          onClick={() => addGuest(guestQuery)}
                        >
                          {t('activityForm.addGuestEmail')} &quot;{guestQuery.trim()}&quot;
                        </button>
                      )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Description */}
        <div className="space-y-1">
          {!showDescription && (
            <button
              type="button"
              className="text-sm text-primary hover:underline"
              onClick={() => setShowDescription(true)}
            >
              {t('activityForm.addDescription')}
            </button>
          )}
          {showDescription && (
            <div className="space-y-1.5">
              <Label>{t('activityForm.description')}</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('activityForm.descriptionPlaceholder')}
                rows={3}
              />
            </div>
          )}
        </div>

        {/* Note */}
        <div className="space-y-1.5">
          <Label>{t('activityForm.note')}</Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('activityForm.notePlaceholder')}
            rows={4}
          />
          <p className="text-xs text-muted-foreground">
            {t('activityForm.noteHint')}
          </p>
        </div>

      </div>

        {/* Footer — pinned below scroll area */}
        <div className="flex items-center justify-between border-t pt-4 shrink-0">
          <span className="text-sm text-primary">
            {t('activityForm.linkedRecord')}
          </span>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {t('activityForm.markCompleted')}
              </span>
              <Switch
                checked={markCompleted}
                onCheckedChange={setMarkCompleted}
              />
            </div>
            <Button variant="outline" onClick={onCancel}>
              {t('activityForm.cancel')}
            </Button>
            <Button
              className="bg-primary"
              onClick={handleSubmit}
              disabled={!title.trim() || !startDate || isSubmitting}
            >
              {isSubmitting ? t('activityForm.saving') : t('activityForm.submit')}
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
