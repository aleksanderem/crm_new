import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { RichTextEditor } from "@/components/gabinet/rich-text-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TagsPicker } from "@/components/categories-tags/tags-picker";
import { CategoryPicker } from "@/components/categories-tags/category-picker";
import { GENDERS, PATIENT_REFERRAL_SOURCES, patientReferralSourceOptions } from "@/lib/options";
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
  pesel?: string;
  dateOfBirth?: string;
  gender?: "male" | "female" | "other";
  address?: {
    street?: string;
    city?: string;
    postalCode?: string;
  };
  medicalNotes?: string;
  allergies?: string;
  bloodType?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  referralSource?: string;
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
  const [dateOfBirth, setDateOfBirth] = useState(initialData?.dateOfBirth ?? "");
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
  const initialReferralIsKnown = (PATIENT_REFERRAL_SOURCES as readonly string[]).includes(initialReferral);
  const [referralSourceKey, setReferralSourceKey] = useState<string>(
    initialReferral ? (initialReferralIsKnown ? initialReferral : "other") : "",
  );
  const [referralSourceCustom, setReferralSourceCustom] = useState<string>(
    initialReferral && !initialReferralIsKnown ? initialReferral : "",
  );
  const referralOptions = patientReferralSourceOptions(t);
  const [tagIds, setTagIds] = useState<Id<"tagDefinitions">[]>(initialData?.tagIds ?? []);
  const [categoryId, setCategoryId] = useState<Id<"categoryDefinitions"> | undefined>(initialData?.categoryId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const address = street || city || postalCode
      ? { street: street || undefined, city: city || undefined, postalCode: postalCode || undefined }
      : undefined;

    const referralSource =
      referralSourceKey === "other"
        ? referralSourceCustom.trim() || undefined
        : referralSourceKey || undefined;

    onSubmit({
      firstName,
      lastName,
      email,
      phone: phone || undefined,
      pesel: pesel || undefined,
      dateOfBirth: dateOfBirth || undefined,
      gender: (gender as "male" | "female" | "other") || undefined,
      address,
      medicalNotes: medicalNotes || undefined,
      allergies: allergies || undefined,
      bloodType: bloodType || undefined,
      emergencyContactName: emergencyContactName || undefined,
      emergencyContactPhone: emergencyContactPhone || undefined,
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
        <div className="space-y-1.5">
          <Label>{t("gabinet.patients.bloodType")}</Label>
          <Input
            value={bloodType}
            onChange={(e) => setBloodType(e.target.value)}
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
          <Select value={referralSourceKey} onValueChange={setReferralSourceKey}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {referralOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {referralSourceKey === "other" && (
            <Input
              value={referralSourceCustom}
              onChange={(e) => setReferralSourceCustom(e.target.value)}
              placeholder={t("gabinet.patients.referralSourceOtherPlaceholder")}
              className="mt-2"
            />
          )}
        </div>
        <div className="space-y-1.5">
          <Label>{t("gabinet.patients.allergies")}</Label>
          <Input
            value={allergies}
            onChange={(e) => setAllergies(e.target.value)}
          />
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
        <Button type="submit" disabled={!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim() || isSubmitting}>
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
