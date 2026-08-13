import { useState, useMemo, useEffect } from "react";
import type { FunctionArgs } from "convex/server";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import type { GabinetEmployeeRole } from "@cvx/schema";
import type { MappedGabinetEmployee } from "@/lib/supabase/mappers/gabinet/employees";
import { parseBirthDateToIso } from "@/lib/format-date";
import type { TFunction } from "i18next";
import { toast } from "sonner";
import { formatActionError } from "@/lib/format-action-error";
import { PersonalInfoSection } from "./sections/personal-info-section";
import { EmploymentSection } from "./sections/employment-section";
import { QualificationsSection } from "./sections/qualifications-section";
import { AssignedTreatmentsSection } from "./sections/assigned-treatments-section";
import { CompensationSection } from "./sections/compensation-section";
import type { EmployeeFormData, EmploymentType } from "./sections/types";

export type { EmployeeFormData };
export { EMPLOYMENT_TYPES } from "./sections/types";
export type { EmploymentType } from "./sections/types";

export function DetailedDataTab({
  employee,
  userEmail,
  treatments,
  treatmentMap,
  organizationId,
  role,
  onChangePassword,
  onUpdate,
  onSetTreatments,
  t,
  i18nLanguage,
  limitedView,
  qualificationsOnlyView,
}: {
  employee: MappedGabinetEmployee;
  userEmail?: string | null;
  treatments: Array<{ _id: string; name: string }> | undefined;
  treatmentMap: Map<string, string>;
  organizationId: Id<"organizations">;
  role?: string | null;
  onChangePassword?: () => void;
  onUpdate: (args: FunctionArgs<typeof api.gabinet.employees.update>) => Promise<void>;
  onSetTreatments: (args: FunctionArgs<typeof api.gabinet.employees.setQualifiedTreatments>) => Promise<void>;
  t: TFunction;
  i18nLanguage: string;
  limitedView?: boolean;
  qualificationsOnlyView?: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const buildFormData = (): EmployeeFormData => ({
    firstName: employee.firstName ?? "",
    lastName: employee.lastName ?? "",
    phone: employee.phone ?? "",
    email: employee.email ?? "",
    dateOfBirth: parseBirthDateToIso(employee.dateOfBirth),
    pesel: employee.pesel ?? "",
    addressStreet: employee.address?.street ?? "",
    addressCity: employee.address?.city ?? "",
    addressPostalCode: employee.address?.postalCode ?? "",
    employmentType: employee.employmentType ?? "",
    hireDate: employee.hireDate ?? "",
    endDate: employee.endDate ?? "",
    position: employee.position ?? "",
    department: employee.department ?? "",
    role: employee.role,
    notes: employee.notes ?? "",
    specialization: employee.specialization ?? "",
    licenseNumber: employee.licenseNumber ?? "",
    skills: (employee.skills ?? []).join(", "),
    yearsOfExperience: employee.yearsOfExperience?.toString() ?? "",
    baseSalary: employee.baseSalary?.toString() ?? "",
    commissionPercent: employee.commissionPercent?.toString() ?? "",
    bankAccount: employee.bankAccount ?? "",
    bio: employee.bio ?? "",
  });

  const [formData, setFormData] = useState<EmployeeFormData>(buildFormData);

  const [certifications, setCertifications] = useState(employee.certifications ?? []);
  const [newCertName, setNewCertName] = useState("");
  const [newCertDate, setNewCertDate] = useState("");
  const [newCertExpiry, setNewCertExpiry] = useState("");

  const [treatmentSearchLocal, setTreatmentSearchLocal] = useState("");
  const [pendingTreatmentIds, setPendingTreatmentIds] = useState<string[]>([]);

  const filteredTreatments = useMemo(() => {
    if (!treatments) return [];
    if (!treatmentSearchLocal) return treatments;
    const q = treatmentSearchLocal.toLowerCase();
    return treatments.filter((tr) => tr.name.toLowerCase().includes(q));
  }, [treatments, treatmentSearchLocal]);

  useEffect(() => {
    setFormData(buildFormData());
    setCertifications(employee.certifications ?? []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee]);

  const startEdit = (section: string) => {
    if (section === "treatments") {
      setPendingTreatmentIds([...employee.qualifiedTreatmentIds]);
      setTreatmentSearchLocal("");
    }
    setEditing(section);
  };

  const cancelEdit = () => {
    setEditing(null);
    setFormData(buildFormData());
    setCertifications(employee.certifications ?? []);
    setPendingTreatmentIds([]);
    setTreatmentSearchLocal("");
  };

  const saveSection = async (section: string) => {
    setSaving(true);
    try {
      const updatePayload: FunctionArgs<typeof api.gabinet.employees.update> = {
        organizationId,
        employeeId: employee._id,
      };

      if (section === "personal") {
        updatePayload.firstName = formData.firstName || undefined;
        updatePayload.lastName = formData.lastName || undefined;
        updatePayload.phone = formData.phone || null;
        updatePayload.email = formData.email || null;
        updatePayload.dateOfBirth = formData.dateOfBirth || null;
        updatePayload.pesel = formData.pesel || null;
        updatePayload.address =
          formData.addressStreet || formData.addressCity || formData.addressPostalCode
            ? {
                street: formData.addressStreet || undefined,
                city: formData.addressCity || undefined,
                postalCode: formData.addressPostalCode || undefined,
              }
            : null;
        updatePayload.bio = formData.bio || null;
      } else if (section === "employment") {
        updatePayload.employmentType = (formData.employmentType || null) as EmploymentType | null;
        updatePayload.hireDate = formData.hireDate || null;
        updatePayload.endDate = formData.endDate || null;
        updatePayload.position = formData.position || null;
        updatePayload.department = formData.department || null;
        updatePayload.role = formData.role as GabinetEmployeeRole;
        updatePayload.notes = formData.notes || null;
      } else if (section === "qualifications") {
        updatePayload.specialization = formData.specialization || null;
        updatePayload.licenseNumber = formData.licenseNumber || null;
        const skillsList = formData.skills
          ? formData.skills.split(",").map((s: string) => s.trim()).filter(Boolean)
          : [];
        updatePayload.skills = skillsList.length > 0 ? skillsList : null;
        updatePayload.yearsOfExperience = formData.yearsOfExperience
          ? Number(formData.yearsOfExperience)
          : null;
        updatePayload.certifications = certifications.length > 0 ? certifications : null;
      } else if (section === "compensation") {
        updatePayload.baseSalary = formData.baseSalary ? Number(formData.baseSalary) : null;
        updatePayload.commissionPercent = formData.commissionPercent
          ? Number(formData.commissionPercent)
          : null;
        updatePayload.bankAccount = formData.bankAccount || null;
      } else if (section === "treatments") {
        await onSetTreatments({
          organizationId,
          employeeId: employee._id,
          treatmentIds: pendingTreatmentIds,
        });
        toast.success(t("common.saved"));
        setEditing(null);
        return;
      }

      await onUpdate(updatePayload);
      toast.success(t("common.saved"));
      setEditing(null);
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.employees.errors.saveFailed",
          defaultValue: "Nie udało się zapisać zmian pracownika.",
        }),
      );
    } finally {
      setSaving(false);
    }
  };

  const sharedSectionProps = {
    editing,
    saving,
    formData,
    setFormData,
    onStartEdit: startEdit,
    onCancelEdit: cancelEdit,
    onSaveSection: saveSection,
    t,
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {!qualificationsOnlyView && (
        <>
          <PersonalInfoSection
            {...sharedSectionProps}
            employee={employee}
            organizationId={organizationId}
            role={role}
            userEmail={userEmail}
            onChangePassword={onChangePassword}
            onUpdate={onUpdate}
          />
          <EmploymentSection
            {...sharedSectionProps}
            employee={employee}
          />
        </>
      )}

      {(!limitedView || qualificationsOnlyView) && (
        <>
          {employee.performsServices && (
            <>
              <QualificationsSection
                {...sharedSectionProps}
                employee={employee}
                certifications={certifications}
                setCertifications={setCertifications}
                newCertName={newCertName}
                setNewCertName={setNewCertName}
                newCertDate={newCertDate}
                setNewCertDate={setNewCertDate}
                newCertExpiry={newCertExpiry}
                setNewCertExpiry={setNewCertExpiry}
              />
              <AssignedTreatmentsSection
                employee={employee}
                treatmentMap={treatmentMap}
                editing={editing}
                saving={saving}
                treatmentSearchLocal={treatmentSearchLocal}
                setTreatmentSearchLocal={setTreatmentSearchLocal}
                filteredTreatments={filteredTreatments}
                pendingTreatmentIds={pendingTreatmentIds}
                setPendingTreatmentIds={setPendingTreatmentIds}
                onStartEdit={startEdit}
                onCancelEdit={cancelEdit}
                onSaveSection={saveSection}
                t={t}
              />
            </>
          )}

          {!qualificationsOnlyView && (
            <CompensationSection
              {...sharedSectionProps}
              employee={employee}
              i18nLanguage={i18nLanguage}
            />
          )}
        </>
      )}
    </div>
  );
}
