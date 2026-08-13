import type { MappedGabinetEmployee } from "@/lib/supabase/mappers/gabinet/employees";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Star, FileText, X, Plus } from "@/lib/ez-icons";
import type { TFunction } from "i18next";
import { SectionHeader, ReadOnlyField } from "./section-header";
import type { EmployeeFormData } from "./types";

type Certification = { name: string; dateObtained?: string; expiryDate?: string };

export function QualificationsSection({
  employee,
  formData,
  setFormData,
  editing,
  saving,
  certifications,
  setCertifications,
  newCertName,
  setNewCertName,
  newCertDate,
  setNewCertDate,
  newCertExpiry,
  setNewCertExpiry,
  canEdit,
  onStartEdit,
  onCancelEdit,
  onSaveSection,
  t,
}: {
  employee: MappedGabinetEmployee;
  formData: EmployeeFormData;
  setFormData: (data: EmployeeFormData) => void;
  editing: string | null;
  saving: boolean;
  certifications: Certification[];
  setCertifications: (certs: Certification[]) => void;
  newCertName: string;
  setNewCertName: (v: string) => void;
  newCertDate: string;
  setNewCertDate: (v: string) => void;
  newCertExpiry: string;
  setNewCertExpiry: (v: string) => void;
  canEdit?: boolean;
  onStartEdit: (s: string) => void;
  onCancelEdit: () => void;
  onSaveSection: (s: string) => Promise<void>;
  t: TFunction;
}) {
  const handleAddCertification = () => {
    if (!newCertName.trim()) return;
    setCertifications([
      ...certifications,
      {
        name: newCertName.trim(),
        dateObtained: newCertDate || undefined,
        expiryDate: newCertExpiry || undefined,
      },
    ]);
    setNewCertName("");
    setNewCertDate("");
    setNewCertExpiry("");
  };

  const handleRemoveCertification = (index: number) => {
    setCertifications(certifications.filter((_, i) => i !== index));
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <SectionHeader
          title={t("gabinet.employees.detailedData.qualifications")}
          sectionKey="qualifications"
          icon={<Star className="h-4 w-4" />}
          editing={editing}
          saving={saving}
          canEdit={canEdit}
          onStartEdit={onStartEdit}
          onCancelEdit={onCancelEdit}
          onSaveSection={onSaveSection}
          t={t}
        />
        {editing === "qualifications" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("gabinet.employees.specialization")}</Label>
                <Input
                  value={formData.specialization}
                  onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("gabinet.employees.license")}</Label>
                <Input
                  value={formData.licenseNumber}
                  onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("gabinet.employees.detailedData.skills")}</Label>
                <Input
                  value={formData.skills}
                  onChange={(e) => setFormData({ ...formData, skills: e.target.value })}
                  placeholder={t("gabinet.employees.detailedData.skillsPlaceholder")}
                />
                <p className="text-xs text-muted-foreground">
                  {t("gabinet.employees.detailedData.skillsHint")}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>{t("gabinet.employees.detailedData.yearsOfExperience")}</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={formData.yearsOfExperience}
                  onChange={(e) => setFormData({ ...formData, yearsOfExperience: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("gabinet.employees.detailedData.certifications")}</Label>
              {certifications.map((cert, idx) => (
                <div key={idx} className="flex items-center gap-2 rounded-md border p-2">
                  <span className="flex-1 text-sm">{cert.name}</span>
                  {cert.dateObtained && (
                    <span className="text-xs text-muted-foreground">{cert.dateObtained}</span>
                  )}
                  {cert.expiryDate && (
                    <span className="text-xs text-muted-foreground">→ {cert.expiryDate}</span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-destructive"
                    onClick={() => handleRemoveCertification(idx)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Input
                    placeholder={t("gabinet.employees.detailedData.certNamePlaceholder")}
                    value={newCertName}
                    onChange={(e) => setNewCertName(e.target.value)}
                    className="h-8"
                  />
                </div>
                <Input
                  type="date"
                  value={newCertDate}
                  onChange={(e) => setNewCertDate(e.target.value)}
                  className="h-8 w-36"
                />
                <Input
                  type="date"
                  value={newCertExpiry}
                  onChange={(e) => setNewCertExpiry(e.target.value)}
                  className="h-8 w-36"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={handleAddCertification}
                  disabled={!newCertName.trim()}
                >
                  <Plus className="h-3 w-3" variant="stroke" />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <ReadOnlyField
              label={t("gabinet.employees.specialization")}
              value={employee.specialization}
            />
            <ReadOnlyField
              label={t("gabinet.employees.license")}
              value={employee.licenseNumber}
            />
            {employee.skills && employee.skills.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  {t("gabinet.employees.detailedData.skills")}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {employee.skills.map((skill, idx) => (
                    <Badge key={idx} variant="secondary">{skill}</Badge>
                  ))}
                </div>
              </div>
            )}
            <ReadOnlyField
              label={t("gabinet.employees.detailedData.yearsOfExperience")}
              value={employee.yearsOfExperience != null ? String(employee.yearsOfExperience) : undefined}
            />
            {employee.certifications && employee.certifications.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  {t("gabinet.employees.detailedData.certifications")}
                </p>
                <div className="space-y-1">
                  {employee.certifications.map((cert, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">{cert.name}</span>
                      {cert.dateObtained && (
                        <span className="text-xs text-muted-foreground">{cert.dateObtained}</span>
                      )}
                      {cert.expiryDate && (
                        <span className="text-xs text-muted-foreground">→ {cert.expiryDate}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!employee.specialization &&
              !employee.licenseNumber &&
              (!employee.skills || employee.skills.length === 0) &&
              !employee.yearsOfExperience &&
              (!employee.certifications || employee.certifications.length === 0) && (
                <p className="text-sm text-muted-foreground">
                  {t("gabinet.employees.detailedData.noQualificationsYet")}
                </p>
              )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
