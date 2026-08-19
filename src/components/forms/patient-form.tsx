import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAction } from "convex/react";
import { useSupabaseGabinetPatient } from "@/hooks/use-supabase-gabinet-patients";
import { api } from "@cvx/_generated/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { isPhoneNumberValid } from "@/lib/phone";
import { Search, X } from "@/lib/ez-icons";
import { RichTextEditor } from "@/components/gabinet/rich-text-editor";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TagsPicker } from "@/components/categories-tags/tags-picker";
import { CategoryPicker } from "@/components/categories-tags/category-picker";
import { GENDERS, PATIENT_REFERRAL_SOURCES, patientReferralSourceOptions } from "@/lib/options";
import { parseBirthDateToIso } from "@/lib/format-date";
import type { Id } from "@cvx/_generated/dataModel";

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

interface PatientFormData {
  contactId?: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  pesel?: string | null;
  dateOfBirth?: string | null;
  gender?: "male" | "female" | "other";
  address?: {
    street?: string;
    city?: string;
    postalCode?: string;
  } | null;
  medicalNotes?: string | null;
  allergies?: string | null;
  bloodType?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  referralSource?: string | null;
  referredByPatientId?: string | null;
  preferredLocationId?: string | null;
  smsConsent?: boolean | null;
  tagIds?: Id<"tagDefinitions">[];
  categoryId?: Id<"categoryDefinitions">;
}

interface LocationOption {
  id: string;
  name: string;
}

interface PatientFormProps {
  mode?: "create" | "edit";
  initialData?: Partial<PatientFormData>;
  onSubmit: (data: PatientFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  tagDefinitions?: TagDef[];
  categoryDefinitions?: CategoryDef[];
  organizationId?: Id<"organizations">;
  locations?: LocationOption[];
}

const ADD_NEW_REFERRAL_SOURCE = "__add_new__";

export function PatientForm({
  mode,
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
  tagDefinitions = [],
  categoryDefinitions = [],
  organizationId,
  locations = [],
}: PatientFormProps) {
  const isEditMode = mode === "edit" || (!mode && !!initialData);
  const { t } = useTranslation();
  const [firstName, setFirstName] = useState(initialData?.firstName ?? "");
  const [lastName, setLastName] = useState(initialData?.lastName ?? "");
  const [email, setEmail] = useState(initialData?.email ?? "");
  const [phone, setPhone] = useState(initialData?.phone ?? "");
  const [pesel, setPesel] = useState(initialData?.pesel ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(
    parseBirthDateToIso(initialData?.dateOfBirth),
  );
  const [gender, setGender] = useState<string>(initialData?.gender ?? "");
  const [street, setStreet] = useState(initialData?.address?.street ?? "");
  const [city, setCity] = useState(initialData?.address?.city ?? "");
  const [postalCode, setPostalCode] = useState(initialData?.address?.postalCode ?? "");
  const [medicalNotes, setMedicalNotes] = useState(initialData?.medicalNotes ?? "");
  const [allergies, setAllergies] = useState(initialData?.allergies ?? "");
  const [bloodType, setBloodType] = useState(initialData?.bloodType ?? "");
  const [emergencyContactName, setEmergencyContactName] = useState(initialData?.emergencyContactName ?? "");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(initialData?.emergencyContactPhone ?? "");
  const initialReferral = initialData?.referralSource ?? "";
  const initialReferralIsPredefined = (PATIENT_REFERRAL_SOURCES as readonly string[]).includes(initialReferral);
  const [customReferralSources, setCustomReferralSources] = useState<string[]>(
    initialReferral && !initialReferralIsPredefined ? [initialReferral] : [],
  );
  const [referralSourceKey, setReferralSourceKey] = useState<string>(initialReferral);
  const [isAddingReferralSource, setIsAddingReferralSource] = useState(false);
  const [newReferralSource, setNewReferralSource] = useState("");
  const referralOptions = patientReferralSourceOptions(t).filter((opt) => opt.value !== "other");
  const [tagIds, setTagIds] = useState<Id<"tagDefinitions">[]>(initialData?.tagIds ?? []);
  const [categoryId, setCategoryId] = useState<Id<"categoryDefinitions"> | undefined>(initialData?.categoryId);
  const [preferredLocationId, setPreferredLocationId] = useState<string>(initialData?.preferredLocationId ?? "");
  const [smsConsent, setSmsConsent] = useState<boolean>(initialData?.smsConsent ?? false);

  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [selectedContactLabel, setSelectedContactLabel] = useState<string | null>(null);
  const [contactQuery, setContactQuery] = useState("");
  const [contactResults, setContactResults] = useState<Array<{ _id: string; firstName: string; lastName: string; email: string; phone: string }>>([]);
  const [isSearchingContacts, setIsSearchingContacts] = useState(false);
  const [contactDropdownOpen, setContactDropdownOpen] = useState(false);
  const contactSearchRef = useRef<HTMLDivElement>(null);

  const [referredByPatientId, setReferredByPatientId] = useState<string | null>(initialData?.referredByPatientId ?? null);
  const [referredByPatientLabel, setReferredByPatientLabel] = useState<string | null>(null);
  const [referralPatientQuery, setReferralPatientQuery] = useState("");
  const [referralPatientResults, setReferralPatientResults] = useState<Array<{ _id: string; firstName: string; lastName: string; email: string }>>([]);
  const [isSearchingReferralPatient, setIsSearchingReferralPatient] = useState(false);
  const [referralPatientDropdownOpen, setReferralPatientDropdownOpen] = useState(false);
  const referralPatientSearchRef = useRef<HTMLDivElement>(null);

  const searchUnlinkedContacts = useAction(api.gabinet.patients.searchUnlinkedContacts);
  const listCustomReferralSources = useAction(api.gabinet.patients.listCustomReferralSources);
  const searchPatientsAction = useAction(api.gabinet.patients.searchPatients);

  const orgIdString = organizationId ? String(organizationId) : "";
  const { data: referredByPatientData } = useSupabaseGabinetPatient(
    orgIdString,
    referredByPatientId ?? undefined,
  );

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    listCustomReferralSources({ organizationId })
      .then((sources) => {
        if (cancelled) return;
        setCustomReferralSources((prev) => {
          const merged = new Set<string>(sources);
          for (const s of prev) merged.add(s);
          return Array.from(merged).sort((a, b) => a.localeCompare(b));
        });
      })
      .catch(() => {
        /* non-fatal: fall back to predefined options only */
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, listCustomReferralSources]);

  useEffect(() => {
    if (!organizationId || isEditMode || !contactQuery.trim()) {
      setContactResults([]);
      setContactDropdownOpen(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setIsSearchingContacts(true);
      searchUnlinkedContacts({ organizationId, search: contactQuery })
        .then((results) => {
          if (cancelled) return;
          setContactResults(results);
          setContactDropdownOpen(results.length > 0);
        })
        .catch(() => {
          if (!cancelled) setContactResults([]);
        })
        .finally(() => {
          if (!cancelled) setIsSearchingContacts(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [organizationId, isEditMode, contactQuery, searchUnlinkedContacts]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (contactSearchRef.current && !contactSearchRef.current.contains(e.target as Node)) {
        setContactDropdownOpen(false);
      }
      if (referralPatientSearchRef.current && !referralPatientSearchRef.current.contains(e.target as Node)) {
        setReferralPatientDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (referredByPatientData) {
      setReferredByPatientLabel(
        `${referredByPatientData.firstName} ${referredByPatientData.lastName}${referredByPatientData.email ? ` (${referredByPatientData.email})` : ""}`,
      );
    }
  }, [referredByPatientData]);

  useEffect(() => {
    if (!organizationId || !referralPatientQuery.trim()) {
      setReferralPatientResults([]);
      setReferralPatientDropdownOpen(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setIsSearchingReferralPatient(true);
      searchPatientsAction({ organizationId: String(organizationId), search: referralPatientQuery })
        .then((results) => {
          if (cancelled) return;
          setReferralPatientResults(results);
          setReferralPatientDropdownOpen(results.length > 0);
        })
        .catch(() => {
          if (!cancelled) setReferralPatientResults([]);
        })
        .finally(() => {
          if (!cancelled) setIsSearchingReferralPatient(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [organizationId, referralPatientQuery, searchPatientsAction]);

  const handleSelectContact = (contact: { _id: string; firstName: string; lastName: string; email: string; phone: string }) => {
    setSelectedContactId(contact._id);
    setSelectedContactLabel(`${contact.firstName} ${contact.lastName}${contact.email ? ` (${contact.email})` : ""}`);
    setContactQuery("");
    setContactDropdownOpen(false);
    setFirstName(contact.firstName);
    setLastName(contact.lastName);
    setEmail(contact.email);
    if (contact.phone) setPhone(contact.phone);
  };

  const handleClearContact = () => {
    setSelectedContactId(null);
    setSelectedContactLabel(null);
    setContactQuery("");
    setContactResults([]);
    setContactDropdownOpen(false);
  };

  const handleSelectReferralPatient = (patient: { _id: string; firstName: string; lastName: string; email: string }) => {
    setReferredByPatientId(patient._id);
    setReferredByPatientLabel(`${patient.firstName} ${patient.lastName}${patient.email ? ` (${patient.email})` : ""}`);
    setReferralPatientQuery("");
    setReferralPatientDropdownOpen(false);
  };

  const handleClearReferralPatient = () => {
    setReferredByPatientId(null);
    setReferredByPatientLabel(null);
    setReferralPatientQuery("");
    setReferralPatientResults([]);
    setReferralPatientDropdownOpen(false);
  };

  const handleReferralSourceChange = (value: string) => {
    if (value === ADD_NEW_REFERRAL_SOURCE) {
      setIsAddingReferralSource(true);
      setNewReferralSource("");
      return;
    }
    setReferralSourceKey(value);
  };

  const handleConfirmNewReferralSource = () => {
    const trimmed = newReferralSource.trim();
    if (!trimmed) return;
    setCustomReferralSources((prev) =>
      prev.some((s) => s.toLowerCase() === trimmed.toLowerCase())
        ? prev
        : [...prev, trimmed].sort((a, b) => a.localeCompare(b)),
    );
    setReferralSourceKey(trimmed);
    setIsAddingReferralSource(false);
    setNewReferralSource("");
  };

  const handleCancelNewReferralSource = () => {
    setIsAddingReferralSource(false);
    setNewReferralSource("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const address = street || city || postalCode
      ? { street: street || undefined, city: city || undefined, postalCode: postalCode || undefined }
      : null;

    const referralSource = referralSourceKey || null;

    onSubmit({
      contactId: selectedContactId || null,
      firstName,
      lastName,
      email,
      phone: phone || undefined,
      pesel: pesel || null,
      dateOfBirth: dateOfBirth || null,
      gender: (gender as "male" | "female" | "other") || undefined,
      address,
      medicalNotes: medicalNotes || null,
      allergies: allergies || null,
      bloodType: bloodType || null,
      emergencyContactName: emergencyContactName || null,
      emergencyContactPhone: emergencyContactPhone || null,
      referralSource,
      referredByPatientId: referredByPatientId || null,
      preferredLocationId: preferredLocationId || null,
      smsConsent,
      tagIds: tagIds.length > 0 ? tagIds : undefined,
      categoryId: categoryId || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {!isEditMode && (
        <div className="space-y-1.5" ref={contactSearchRef}>
          <Label>{t("gabinet.patients.linkedContact")}</Label>
          {selectedContactId ? (
            <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm">
              <span className="flex-1 truncate">{selectedContactLabel}</span>
              <button
                type="button"
                onClick={handleClearContact}
                className="shrink-0 text-muted-foreground hover:text-foreground"
                aria-label={t("common.clear", { defaultValue: "Wyczyść" })}
              >
                <X className="h-4 w-4" variant="stroke" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" variant="stroke" />
              <Input
                value={contactQuery}
                onChange={(e) => setContactQuery(e.target.value)}
                placeholder={t("gabinet.patients.contactSearchPlaceholder", { defaultValue: "Szukaj kontaktu CRM..." })}
                className="pl-8"
              />
              {isSearchingContacts && (
                <span className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-foreground" />
              )}
              {contactDropdownOpen && contactResults.length > 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
                  <ul className="max-h-48 overflow-y-auto py-1 text-sm">
                    {contactResults.map((contact) => (
                      <li key={contact._id}>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground"
                          onClick={() => handleSelectContact(contact)}
                        >
                          <span className="font-medium">{contact.firstName} {contact.lastName}</span>
                          {contact.email && <span className="ml-2 text-muted-foreground">{contact.email}</span>}
                          {contact.phone && <span className="ml-2 text-muted-foreground">{contact.phone}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {t("gabinet.patients.contactSearchHint", { defaultValue: "Opcjonalnie: powiąż nowego klienta z istniejącym kontaktem CRM." })}
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>
            {t("gabinet.patients.firstName")} <span className="text-destructive">*</span>
          </Label>
          <Input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>
            {t("gabinet.patients.lastName")} <span className="text-destructive">*</span>
          </Label>
          <Input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>
            {t("common.email")} <span className="text-destructive">*</span>
          </Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>
            {t("common.phone")} <span className="text-destructive">*</span>
          </Label>
          <PhoneInput
            value={phone}
            onChange={setPhone}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("gabinet.patients.pesel")}</Label>
          <Input
            value={pesel}
            onChange={(e) => setPesel(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("gabinet.patients.dateOfBirth")}</Label>
          <Input
            type="date"
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("gabinet.patients.gender")}</Label>
          <Select value={gender} onValueChange={setGender}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GENDERS.map((g) => (
                <SelectItem key={g} value={g}>{t(`gabinet.patients.genderOptions.${g}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t("gabinet.patients.bloodType")}</Label>
          <Input
            value={bloodType}
            onChange={(e) => setBloodType(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t("gabinet.patients.allergies")}</Label>
          <Input
            value={allergies}
            onChange={(e) => setAllergies(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-4 border-t pt-4">
        <h4 className="text-sm font-medium">{t("gabinet.patients.address")}</h4>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("gabinet.patients.street")}</Label>
            <Input
              value={street}
              onChange={(e) => setStreet(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("gabinet.patients.city")}</Label>
            <Input
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("gabinet.patients.postalCode")}</Label>
            <Input
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="space-y-4 border-t pt-4">
        <h4 className="text-sm font-medium">{t("gabinet.patients.emergencyContact")}</h4>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("gabinet.patients.emergencyContactName")}</Label>
            <Input
              value={emergencyContactName}
              onChange={(e) => setEmergencyContactName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("gabinet.patients.emergencyContactPhone")}</Label>
            <PhoneInput
              value={emergencyContactPhone}
              onChange={setEmergencyContactPhone}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 border-t pt-4">
        <div className="space-y-1.5">
          <Label>{t("gabinet.patients.referralSource")}</Label>
          <Select value={referralSourceKey} onValueChange={handleReferralSourceChange}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {referralOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
              {customReferralSources.length > 0 && (
                <SelectGroup>
                  <SelectSeparator />
                  <SelectLabel>{t("gabinet.patients.referralSourceCustomGroup")}</SelectLabel>
                  {customReferralSources.map((src) => (
                    <SelectItem key={src} value={src}>{src}</SelectItem>
                  ))}
                </SelectGroup>
              )}
              <SelectSeparator />
              <SelectItem value={ADD_NEW_REFERRAL_SOURCE}>
                {t("gabinet.patients.referralSourceAddNew")}
              </SelectItem>
            </SelectContent>
          </Select>
          {isAddingReferralSource && (
            <div className="mt-2 flex items-center gap-2">
              <Input
                autoFocus
                value={newReferralSource}
                onChange={(e) => setNewReferralSource(e.target.value)}
                placeholder={t("gabinet.patients.referralSourceOtherPlaceholder")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleConfirmNewReferralSource();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    handleCancelNewReferralSource();
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                onClick={handleConfirmNewReferralSource}
                disabled={!newReferralSource.trim()}
              >
                {t("common.add")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleCancelNewReferralSource}
              >
                {t("common.cancel")}
              </Button>
            </div>
          )}
        </div>
        <div className="space-y-1.5" ref={referralPatientSearchRef}>
          <Label>{t("gabinet.patients.referredByPatient", { defaultValue: "Polecony przez pacjenta" })}</Label>
          {referredByPatientId && referredByPatientLabel ? (
            <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm">
              <span className="flex-1 truncate">{referredByPatientLabel}</span>
              <button
                type="button"
                onClick={handleClearReferralPatient}
                className="shrink-0 text-muted-foreground hover:text-foreground"
                aria-label={t("common.clear", { defaultValue: "Wyczyść" })}
              >
                <X className="h-4 w-4" variant="stroke" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" variant="stroke" />
              <Input
                value={referralPatientQuery}
                onChange={(e) => setReferralPatientQuery(e.target.value)}
                placeholder={t("gabinet.patients.referredByPatientPlaceholder", { defaultValue: "Szukaj pacjenta..." })}
                className="pl-8"
              />
              {isSearchingReferralPatient && (
                <span className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-foreground" />
              )}
              {referralPatientDropdownOpen && referralPatientResults.length > 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
                  <ul className="max-h-48 overflow-y-auto py-1 text-sm">
                    {referralPatientResults.map((patient) => (
                      <li key={patient._id}>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground"
                          onClick={() => handleSelectReferralPatient(patient)}
                        >
                          <span className="font-medium">{patient.firstName} {patient.lastName}</span>
                          {patient.email && <span className="ml-2 text-muted-foreground">{patient.email}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
        {locations.length > 0 && (
          <div className="space-y-1.5">
            <Label>{t("gabinet.patients.preferredLocation")}</Label>
            <Select value={preferredLocationId} onValueChange={setPreferredLocationId}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t("gabinet.patients.medicalNotes")}</Label>
          <RichTextEditor
            value={medicalNotes}
            onChange={(v) => setMedicalNotes(v ?? "")}
            minHeight="80px"
          />
        </div>
      </div>

      <div className="border-t pt-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <Checkbox
            className="mt-0.5 h-5 w-5"
            checked={smsConsent}
            onCheckedChange={(checked) => setSmsConsent(checked === true)}
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium leading-none">
              {t("gabinet.patients.smsConsent")}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("gabinet.patients.smsConsentHint")}
            </span>
          </span>
        </label>
      </div>

      {tagDefinitions.length > 0 && (
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t('common.tags', { defaultValue: "Tagi" })}</Label>
          <TagsPicker tags={tagDefinitions} selectedIds={tagIds} onChange={setTagIds} />
        </div>
      )}
      {organizationId && (
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t('common.category', { defaultValue: "Kategoria" })}</Label>
          <CategoryPicker
            categories={categoryDefinitions}
            selectedId={categoryId}
            onChange={setCategoryId}
            organizationId={organizationId}
            entityType="gabinetPatient"
          />
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button
          type="submit"
          disabled={
            !firstName.trim() ||
            !lastName.trim() ||
            !email.trim() ||
            !isPhoneNumberValid(phone, { required: true }) ||
            !isPhoneNumberValid(emergencyContactPhone, { required: false }) ||
            isSubmitting
          }
        >
          {isSubmitting
            ? t("common.saving")
            : isEditMode
              ? t("common.save")
              : t("gabinet.patients.createPatient")}
        </Button>
      </div>
    </form>
  );
}
