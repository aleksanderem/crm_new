import type { MappedGabinetEmployee } from "@/lib/supabase/mappers/gabinet/employees";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DollarSign } from "@/lib/ez-icons";
import type { TFunction } from "i18next";
import { SectionHeader, ReadOnlyField } from "./section-header";
import type { EmployeeFormData } from "./types";

export function CompensationSection({
  employee,
  formData,
  setFormData,
  editing,
  saving,
  i18nLanguage,
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
  i18nLanguage: string;
  onStartEdit: (s: string) => void;
  onCancelEdit: () => void;
  onSaveSection: (s: string) => Promise<void>;
  t: TFunction;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <SectionHeader
          title={t("gabinet.employees.detailedData.compensation")}
          sectionKey="compensation"
          icon={<DollarSign className="h-4 w-4" />}
          editing={editing}
          saving={saving}
          onStartEdit={onStartEdit}
          onCancelEdit={onCancelEdit}
          onSaveSection={onSaveSection}
          t={t}
        />
        {editing === "compensation" ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("gabinet.employees.detailedData.baseSalary")}</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.01}
                  value={formData.baseSalary}
                  onChange={(e) => setFormData({ ...formData, baseSalary: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("gabinet.employees.detailedData.commissionPercent")}</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step={0.1}
                  value={formData.commissionPercent}
                  onChange={(e) => setFormData({ ...formData, commissionPercent: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("gabinet.employees.detailedData.bankAccount")}</Label>
              <Input
                value={formData.bankAccount}
                onChange={(e) => setFormData({ ...formData, bankAccount: e.target.value })}
                placeholder="PL00 0000 0000 0000 0000 0000 0000"
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-8 gap-y-1">
            <ReadOnlyField
              label={t("gabinet.employees.detailedData.baseSalary")}
              value={
                employee.baseSalary != null
                  ? `${employee.baseSalary.toLocaleString(i18nLanguage)} PLN`
                  : undefined
              }
            />
            <ReadOnlyField
              label={t("gabinet.employees.detailedData.commissionPercent")}
              value={employee.commissionPercent != null ? `${employee.commissionPercent}%` : undefined}
            />
            <ReadOnlyField
              label={t("gabinet.employees.detailedData.bankAccount")}
              value={employee.bankAccount}
            />
            {!employee.baseSalary && !employee.commissionPercent && !employee.bankAccount && (
              <p className="text-sm text-muted-foreground col-span-2">
                {t("gabinet.employees.detailedData.noCompensationYet")}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
