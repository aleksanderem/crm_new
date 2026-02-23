import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/patient/_layout/profile")({
  component: PatientProfile,
});

function PatientProfile() {
  const { t } = useTranslation();
  const sessionId = typeof window !== "undefined" ? localStorage.getItem("patientPortalSessionId") ?? "" : "";
  const token = typeof window !== "undefined" ? localStorage.getItem("patientPortalToken") ?? "" : "";

  const updateProfile = useMutation(api["gabinet/patientPortal"].updateMyProfile);

  const { data: profile } = useQuery(
    convexQuery(api["gabinet/patientPortal"].getMyProfile, { sessionId, token })
  );

  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setPhone(profile.phone ?? "");
      setStreet(profile.address?.street ?? "");
      setCity(profile.address?.city ?? "");
      setPostalCode(profile.address?.postalCode ?? "");
      setEmergencyContactName(profile.emergencyContactName ?? "");
      setEmergencyContactPhone(profile.emergencyContactPhone ?? "");
    }
  }, [profile]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({
        sessionId,
        token,
        phone: phone || undefined,
        address: (street || city || postalCode) ? { street, city, postalCode } : undefined,
        emergencyContactName: emergencyContactName || undefined,
        emergencyContactPhone: emergencyContactPhone || undefined,
      });
      toast.success(t("common.saved"));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!profile) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t("patientPortal.profile.title")}</h1>

      <div className="rounded-lg border p-4 space-y-1">
        <p className="text-sm"><span className="text-muted-foreground">{t("patientPortal.profile.name")}:</span> {profile.firstName} {profile.lastName}</p>
        <p className="text-sm"><span className="text-muted-foreground">{t("common.email")}:</span> {profile.email}</p>
        {profile.dateOfBirth && (
          <p className="text-sm"><span className="text-muted-foreground">{t("gabinet.patients.dateOfBirth")}:</span> {profile.dateOfBirth}</p>
        )}
      </div>

      <div className="rounded-lg border p-6 space-y-4">
        <h3 className="text-sm font-semibold">{t("patientPortal.profile.editableFields")}</h3>

        <div className="space-y-1.5">
          <Label>{t("common.phone")}</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label>{t("gabinet.patients.address")}</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            <Input value={street} onChange={(e) => setStreet(e.target.value)} placeholder={t("gabinet.patients.street")} />
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder={t("gabinet.patients.city")} />
            <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder={t("gabinet.patients.postalCode")} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t("gabinet.patients.emergencyContact")}</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} placeholder={t("gabinet.patients.emergencyContactName")} />
            <Input value={emergencyContactPhone} onChange={(e) => setEmergencyContactPhone(e.target.value)} placeholder={t("gabinet.patients.emergencyContactPhone")} />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
