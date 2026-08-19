import type { MappedGabinetEmployee } from "@/lib/supabase/mappers/gabinet/employees";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RichTextEditor } from "@/components/gabinet/rich-text-editor";
import { plateJsonToText } from "@/components/plate-text";
import { Briefcase } from "@/lib/ez-icons";
import type { TFunction } from "i18next";
import { EMPLOYEE_ROLES } from "@/lib/options";
import { EMPLOYMENT_TYPES } from "./types";
import { SectionHeader, ReadOnlyField } from "./section-header";
import type { EmployeeFormData } from "./types";

export function EmploymentSection({
  employee,
  formData,
  setFormData,
  editing,
  saving,
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
  canEdit?: boolean;
  onStartEdit: (s: string) => void;
  onCancelEdit: () => void;
  onSaveSection: (s: string) => Promise<void>;
  t: TFunction;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <SectionHeader
          title={t("gabinet.employees.detailedData.employment")}
          sectionKey="employment"
          icon={<Briefcase className="h-4 w-4" variant="stroke" />}
          editing={editing}
          saving={saving}
          canEdit={canEdit}
          onStartEdit={onStartEdit}
          onCancelEdit={onCancelEdit}
          onSaveSection={onSaveSection}
          t={t}
        />
        {editing === "employment" ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("gabinet.employees.detailedData.employmentType")}</Label>
                <Select
                  value={formData.employmentType}
                  onValueChange={(v) => setFormData({ ...formData, employmentType: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("gabinet.employees.detailedData.selectEmploymentType")} />
                  </SelectTrigger>
                  <SelectContent>
                    {EMPLOYMENT_TYPES.map((et) => (
                      <SelectItem key={et} value={et}>
                        {t(`gabinet.employees.detailedData.employmentTypes.${et}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("gabinet.employees.detailedData.position")}</Label>
                <Input
                  value={formData.position}
                  onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                  placeholder={t("gabinet.employees.detailedData.positionPlaceholder")}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("gabinet.employees.hireDate")}</Label>
                <Input
                  type="date"
                  value={formData.hireDate}
                  onChange={(e) => setFormData({ ...formData, hireDate: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("gabinet.employees.detailedData.endDate")}</Label>
                <Input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("gabinet.employees.detailedData.department")}</Label>
                <Input
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("gabinet.employees.role")}</Label>
                <Select
                  value={formData.role}
                  onValueChange={(v) => setFormData({ ...formData, role: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EMPLOYEE_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {t(`gabinet.employees.roles.${r}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("gabinet.employees.detailedData.notesComments")}</Label>
              <RichTextEditor
                value={formData.notes}
                onChange={(val) => setFormData({ ...formData, notes: val ?? "" })}
                minHeight="80px"
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-8 gap-y-1">
            <ReadOnlyField
              label={t("gabinet.employees.detailedData.employmentType")}
              value={
                employee.employmentType
                  ? t(`gabinet.employees.detailedData.employmentTypes.${employee.employmentType}`)
                  : undefined
              }
            />
            <ReadOnlyField label={t("gabinet.employees.detailedData.position")} value={employee.position} />
            <ReadOnlyField label={t("gabinet.employees.hireDate")} value={employee.hireDate} />
            <ReadOnlyField label={t("gabinet.employees.detailedData.endDate")} value={employee.endDate} />
            <ReadOnlyField label={t("gabinet.employees.detailedData.department")} value={employee.department} />
            <ReadOnlyField
              label={t("gabinet.employees.role")}
              value={t(`gabinet.employees.roles.${employee.role}`)}
            />
            <ReadOnlyField
              label={t("common.status")}
              value={employee.isActive ? t("gabinet.employees.active") : t("common.inactive")}
            />
            {employee.notes && (
              <ReadOnlyField
                label={t("gabinet.employees.detailedData.notesComments")}
                value={plateJsonToText(employee.notes)}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
