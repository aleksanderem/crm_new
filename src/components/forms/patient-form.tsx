import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
}

interface PatientFormProps {
  initialData?: Partial<PatientFormData>;
  onSubmit: (data: PatientFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function PatientForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
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
  const [referralSource, setReferralSource] = useState(initialData?.referralSource ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const address = street || city || postalCode
      ? { street: street || undefined, city: city || undefined, postalCode: postalCode || undefined }
      : undefined;

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
      referralSource: referralSource || undefined,
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
          <Label>{t("common.phone")}</Label>
          <Input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
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
              <SelectItem value="male">{t("gabinet.patients.genderOptions.male")}</SelectItem>
              <SelectItem value="female">{t("gabinet.patients.genderOptions.female")}</SelectItem>
              <SelectItem value="other">{t("gabinet.patients.genderOptions.other")}</SelectItem>
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
            <Input
              type="tel"
              value={emergencyContactPhone}
              onChange={(e) => setEmergencyContactPhone(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 border-t pt-4">
        <div className="space-y-1.5">
          <Label>{t("gabinet.patients.referralSource")}</Label>
          <Input
            value={referralSource}
            onChange={(e) => setReferralSource(e.target.value)}
          />
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
          <Textarea
            value={medicalNotes}
            onChange={(e) => setMedicalNotes(e.target.value)}
            rows={3}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={!firstName.trim() || !lastName.trim() || !email.trim() || isSubmitting}>
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
