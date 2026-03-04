import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { useOrganization } from "@/components/org-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROLES = ["doctor", "nurse", "therapist", "receptionist", "admin", "other"] as const;
type EmployeeRole = (typeof ROLES)[number];

const COLOR_OPTIONS = [
  { value: "#3b82f6", label: "Blue" },
  { value: "#22c55e", label: "Green" },
  { value: "#ef4444", label: "Red" },
  { value: "#f59e0b", label: "Yellow" },
  { value: "#8b5cf6", label: "Purple" },
  { value: "#ec4899", label: "Pink" },
  { value: "#f97316", label: "Orange" },
  { value: "#6b7280", label: "Gray" },
];

export interface EmployeeFormData {
  userId?: Id<"users">;
  firstName?: string;
  lastName?: string;
  role: EmployeeRole;
  specialization?: string;
  licenseNumber?: string;
  color?: string;
  qualifiedTreatmentIds: Id<"gabinetTreatments">[];
}

interface EmployeeFormProps {
  initialData?: Partial<EmployeeFormData>;
  onSubmit: (data: EmployeeFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  /** If true, user selection is required (create mode). If false, user is pre-selected (edit mode). */
  requireUserSelection?: boolean;
}

export function EmployeeForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
  requireUserSelection = true,
}: EmployeeFormProps) {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();

  // Fetch organization members and existing employees
  const { data: members } = useQuery(
    convexQuery(api.organizations.getMembers, { organizationId })
  );
  const { data: employees } = useQuery(
    convexQuery(api.gabinet.employees.listAll, { organizationId })
  );
  const { data: treatments } = useQuery(
    convexQuery(api.gabinet.treatments.listActive, { organizationId })
  );

  // Users not yet registered as employees (for create mode)
  const availableUsers = useMemo(() => {
    if (!members || !employees) return [];
    const empUserIds = new Set(employees.map((e) => e.userId));
    return members
      .filter((m) => m.user && !empUserIds.has(m.userId))
      .map((m) => ({ _id: m.userId, name: m.user!.name, email: m.user!.email }));
  }, [members, employees]);

  const [userId, setUserId] = useState<string>(initialData?.userId ?? "");
  const [firstName, setFirstName] = useState(initialData?.firstName ?? "");
  const [lastName, setLastName] = useState(initialData?.lastName ?? "");
  const [role, setRole] = useState<EmployeeRole>(initialData?.role ?? "doctor");
  const [specialization, setSpecialization] = useState(initialData?.specialization ?? "");
  const [licenseNumber, setLicenseNumber] = useState(initialData?.licenseNumber ?? "");
  const [color, setColor] = useState(initialData?.color ?? "#3b82f6");
  const [selectedTreatments, setSelectedTreatments] = useState<string[]>(
    initialData?.qualifiedTreatmentIds?.map((id) => id as string) ?? []
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (requireUserSelection && !userId) return;

    onSubmit({
      userId: userId as Id<"users"> | undefined,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      role,
      specialization: specialization || undefined,
      licenseNumber: licenseNumber || undefined,
      color: color || undefined,
      qualifiedTreatmentIds: selectedTreatments as Id<"gabinetTreatments">[],
    });
  };

  const toggleTreatment = (treatmentId: string) => {
    setSelectedTreatments((prev) =>
      prev.includes(treatmentId)
        ? prev.filter((id) => id !== treatmentId)
        : [...prev, treatmentId]
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* User selection (only for create mode) */}
      {requireUserSelection && (
        <div className="space-y-1.5">
          <Label>
            {t("gabinet.employees.selectUser")} <span className="text-destructive">*</span>
          </Label>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger>
              <SelectValue placeholder={t("gabinet.employees.selectUserPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {availableUsers.map((u) => (
                <SelectItem key={u._id} value={u._id}>
                  {u.name || u.email}
                </SelectItem>
              ))}
              {availableUsers.length === 0 && (
                <SelectItem value="_none" disabled>
                  {t("gabinet.employees.noAvailableUsers")}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          {availableUsers.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {t("gabinet.employees.allUsersRegistered")}
            </p>
          )}
        </div>
      )}

      {/* Name fields */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{t("gabinet.employees.firstName")}</Label>
          <Input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder={t("gabinet.employees.firstNamePlaceholder")}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t("gabinet.employees.lastName")}</Label>
          <Input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder={t("gabinet.employees.lastNamePlaceholder")}
          />
        </div>
      </div>

      {/* Role */}
      <div className="space-y-1.5">
        <Label>
          {t("gabinet.employees.role")} <span className="text-destructive">*</span>
        </Label>
        <Select value={role} onValueChange={(v) => setRole(v as EmployeeRole)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {t(`gabinet.employees.roles.${r}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Specialization */}
      <div className="space-y-1.5">
        <Label>{t("gabinet.employees.specialization")}</Label>
        <Input
          value={specialization}
          onChange={(e) => setSpecialization(e.target.value)}
          placeholder={t("gabinet.employees.specializationPlaceholder")}
        />
      </div>

      {/* License number */}
      <div className="space-y-1.5">
        <Label>{t("gabinet.employees.license")}</Label>
        <Input
          value={licenseNumber}
          onChange={(e) => setLicenseNumber(e.target.value)}
          placeholder={t("gabinet.employees.licensePlaceholder")}
        />
      </div>

      {/* Color picker */}
      <div className="space-y-2">
        <Label>{t("gabinet.employees.color")}</Label>
        <div className="flex gap-2">
          {COLOR_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`h-7 w-7 rounded-full border-2 transition-all ${
                color === opt.value
                  ? "border-foreground scale-110"
                  : "border-transparent hover:border-muted-foreground/40"
              }`}
              style={{ backgroundColor: opt.value }}
              onClick={() => setColor(color === opt.value ? "" : opt.value)}
              title={opt.label}
            />
          ))}
        </div>
      </div>

      {/* Qualified treatments */}
      <div className="space-y-2">
        <Label>{t("gabinet.employees.qualifiedTreatments")}</Label>
        <div className="max-h-48 overflow-y-auto rounded-md border p-2 space-y-1">
          {treatments?.map((tr) => (
            <label
              key={tr._id}
              className="flex items-center gap-2 text-sm cursor-pointer"
            >
              <Checkbox
                checked={selectedTreatments.includes(tr._id)}
                onCheckedChange={() => toggleTreatment(tr._id)}
              />
              <span className="flex-1">{tr.name}</span>
              <span className="text-xs text-muted-foreground">
                {tr.duration} min
              </span>
            </label>
          ))}
          {(!treatments || treatments.length === 0) && (
            <p className="text-xs text-muted-foreground py-2">
              {t("gabinet.employees.noTreatments")}
            </p>
          )}
        </div>
        {selectedTreatments.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("gabinet.employees.selectedTreatments", { count: selectedTreatments.length })}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button
          type="submit"
          disabled={(requireUserSelection && !userId) || isSubmitting}
        >
          {isSubmitting
            ? t("common.saving")
            : initialData
              ? t("common.save")
              : t("gabinet.employees.create")}
        </Button>
      </div>
    </form>
  );
}
