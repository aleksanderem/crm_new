import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { isPhoneNumberValid } from "@/lib/phone";
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
  tagIds?: Id<"tagDefinitions">[];
  categoryId?: Id<"categoryDefinitions">;
}

interface PatientFormProps {
  initialData?: Partial<PatientFormData>;
  onSubmit: (data: PatientFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  tagDefinitions?: TagDef[];
  categoryDefinitions?: CategoryDef[];
  organizationId?: Id<"organizations">;
}

const ADD_NEW_REFERRAL_SOURCE = "__add_new__";

export function PatientForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
  tagDefinitions = [],
  categoryDefinitions = [],
  organizationId,
}: PatientFormProps) {
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

  const listCustomReferralSources = useAction(api.gabinet.patients.listCustomReferralSources);

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
      tagIds: tagIds.length > 0 ? tagIds : undefined,
      categoryId: categoryId || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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
        {initialData && (
          <div className="space-y-1.5">
            <Label>{t("gabinet.patients.bloodType")}</Label>
            <Input
              value={bloodType}
              onChange={(e) => setBloodType(e.target.value)}
            />
          </div>
        )}
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
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t("gabinet.patients.medicalNotes")}</Label>
          <RichTextEditor
            value={medicalNotes}
            onChange={(v) => setMedicalNotes(v ?? "")}
            minHeight="80px"
          />
        </div>
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
            : initialData
              ? t("common.save")
              : t("gabinet.patients.createPatient")}
        </Button>
      </div>
    </form>
  );
}
