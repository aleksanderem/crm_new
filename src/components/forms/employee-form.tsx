import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { useOrganization } from "@/components/org-context";
import { useSupabaseCustomFieldDefinitions } from "@/hooks/use-supabase-custom-fields";
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
import { TagsPicker } from "@/components/categories-tags/tags-picker";
import { CategoryPicker } from "@/components/categories-tags/category-picker";
import { CustomFieldFormSection } from "@/components/custom-fields/custom-field-form-section";
import { Eye, Search } from "@/lib/ez-icons";

const ROLES = ["doctor", "cosmetologist", "nurse", "therapist", "receptionist", "manager", "admin", "other"] as const;
type EmployeeRole = (typeof ROLES)[number];

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
  showInCalendar?: boolean;
  qualifiedTreatmentIds: Id<"gabinetTreatments">[];
  tagIds?: Id<"tagDefinitions">[];
  categoryId?: Id<"categoryDefinitions">;
  customFields?: Array<{ fieldDefinitionId: string; value: unknown }>;
  grantSystemAccess?: boolean;
  accessMode?: "invite" | "password";
  accessEmail?: string;
  accessRole?: "admin" | "member" | "viewer";
  password?: string;
  locationId?: string;
  locationRole?: EmployeeRole;
}

interface EmployeeFormProps {
  initialData?: Partial<EmployeeFormData>;
  onSubmit: (data: EmployeeFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  tagDefinitions?: TagDef[];
  categoryDefinitions?: CategoryDef[];
}

export function EmployeeForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
  tagDefinitions = [],
  categoryDefinitions = [],
}: EmployeeFormProps) {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();

  const listActiveTreatments = useAction(api.gabinet.treatments.listActive);
  const { data: treatments } = useQuery({
    queryKey: ["gabinet.treatments.listActive", organizationId],
    queryFn: () => listActiveTreatments({ organizationId }),
    enabled: !!organizationId,
  });

  const listLocationsAction = useAction(api.gabinet.locations.listLocations);
  const { data: locations } = useQuery({
    queryKey: ["gabinet.locations.listLocations", organizationId],
    queryFn: () => listLocationsAction({ organizationId }),
    enabled: !!organizationId,
  }) as { data: Array<{ _id: string; name: string; isActive: boolean }> | undefined };

  const { data: customFieldDefs } = useSupabaseCustomFieldDefinitions(
    organizationId,
    "gabinetEmployee",
  );

  const [firstName, setFirstName] = useState(initialData?.firstName ?? "");
  const [lastName, setLastName] = useState(initialData?.lastName ?? "");
  const [role, setRole] = useState<EmployeeRole>(initialData?.role ?? "doctor");
  const [specialization, setSpecialization] = useState(initialData?.specialization ?? "");
  const [licenseNumber, setLicenseNumber] = useState(initialData?.licenseNumber ?? "");
  const [color, setColor] = useState(initialData?.color ?? "#3b82f6");
  const [showInCalendar, setShowInCalendar] = useState<boolean>(
    initialData?.showInCalendar ?? true,
  );
  const [selectedTreatments, setSelectedTreatments] = useState<string[]>(
    initialData?.qualifiedTreatmentIds?.map((id) => id as string) ?? []
  );
  const [tagIds, setTagIds] = useState<Id<"tagDefinitions">[]>(initialData?.tagIds ?? []);
  const [categoryId, setCategoryId] = useState<Id<"categoryDefinitions"> | undefined>(initialData?.categoryId);
  const [treatmentSearch, setTreatmentSearch] = useState("");
  const [accessEmail, setAccessEmail] = useState("");
  const [accessRole, setAccessRole] = useState<"admin" | "member" | "viewer">("member");
  const [accessMode, setAccessMode] = useState<"invite" | "password">("invite");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [locationId, setLocationId] = useState<string | undefined>(undefined);
  const [locationRole, setLocationRole] = useState<EmployeeRole | undefined>(undefined);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, unknown>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const filteredTreatments = useMemo(() => {
    if (!treatments) return [];
    const q = treatmentSearch.trim().toLowerCase();
    if (!q) return treatments;
    return treatments.filter((tr) => tr.name?.toLowerCase().includes(q));
  }, [treatments, treatmentSearch]);

  const passwordError = (() => {
    if (accessMode !== "password") return null;
    if (!password) return null;
    if (password.length < 8) return t("gabinet.employees.passwordTooShort", { defaultValue: "Hasło musi mieć co najmniej 8 znaków." });
    if (!/[A-Z]/.test(password)) return t("gabinet.employees.passwordNoUppercase", { defaultValue: "Hasło musi zawierać co najmniej 1 wielką literę." });
    if (!/[0-9]/.test(password)) return t("gabinet.employees.passwordNoDigit", { defaultValue: "Hasło musi zawierać co najmniej 1 cyfrę." });
    return null;
  })();

  const confirmPasswordError = (() => {
    if (accessMode !== "password") return null;
    if (!confirmPassword) return null;
    if (password !== confirmPassword) return t("gabinet.employees.passwordMismatch", { defaultValue: "Hasła nie są identyczne." });
    return null;
  })();

  const isPasswordValid =
    accessMode !== "password" ||
    (password.length >= 8 &&
      /[A-Z]/.test(password) &&
      /[0-9]/.test(password) &&
      password === confirmPassword);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const isClinicalRole = role !== "receptionist" && role !== "manager";

    const customFields = (customFieldDefs ?? [])
      .map((def) => ({
        fieldDefinitionId: def._id,
        value: customFieldValues[def.fieldKey],
      }))
      .filter((f) => f.value !== undefined && f.value !== "");

    onSubmit({
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      role,
      specialization: specialization || undefined,
      licenseNumber: licenseNumber || undefined,
      color: color || undefined,
      showInCalendar,
      qualifiedTreatmentIds: isClinicalRole
        ? (selectedTreatments as Id<"gabinetTreatments">[])
        : [],
      tagIds: tagIds.length > 0 ? tagIds : undefined,
      categoryId: categoryId || undefined,
      customFields: customFields.length > 0 ? customFields : undefined,
      grantSystemAccess: true,
      accessMode,
      accessEmail: accessEmail.trim() || undefined,
      accessRole: accessRole,
      password: accessMode === "password" ? password : undefined,
      locationId: locationId,
      locationRole: locationRole,
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

      {/* Show in calendar */}
      <div className="space-y-1.5">
        <label className="flex items-start gap-3 cursor-pointer">
          <Checkbox
            className="mt-0.5 h-5 w-5"
            checked={showInCalendar}
            onCheckedChange={(checked) => setShowInCalendar(checked === true)}
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium leading-none">
              {t("gabinet.employees.showInCalendar")}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("gabinet.employees.showInCalendarHint")}
            </span>
          </span>
        </label>
      </div>

      {/* Qualified treatments — hidden for non-clinical roles */}
      {role !== "receptionist" && role !== "manager" && (
        <div className="space-y-2">
          <Label>{t("gabinet.employees.qualifiedTreatments")}</Label>
          {treatments && treatments.length > 0 && (
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                variant="stroke"
              />
              <Input
                type="search"
                value={treatmentSearch}
                onChange={(e) => setTreatmentSearch(e.target.value)}
                placeholder={t("gabinet.treatments.searchPlaceholder")}
                className="pl-8"
              />
            </div>
          )}
          <div className="max-h-64 overflow-y-auto rounded-md border p-2">
            {filteredTreatments.length > 0 && (
              <label className="-mx-2 -mt-2 mb-1 flex min-h-11 select-none items-center gap-3 rounded-t border-b bg-muted/60 px-3 py-2.5 text-sm font-medium cursor-pointer active:bg-muted">
                <Checkbox
                  className="h-5 w-5"
                  checked={
                    filteredTreatments.every((tr) => selectedTreatments.includes(tr._id))
                      ? true
                      : filteredTreatments.some((tr) => selectedTreatments.includes(tr._id))
                        ? "indeterminate"
                        : false
                  }
                  onCheckedChange={(checked) => {
                    const visibleIds = filteredTreatments.map((tr) => tr._id as string);
                    if (checked === true) {
                      setSelectedTreatments(
                        Array.from(new Set([...selectedTreatments, ...visibleIds])),
                      );
                    } else {
                      const visibleSet = new Set(visibleIds);
                      setSelectedTreatments(
                        selectedTreatments.filter((id) => !visibleSet.has(id)),
                      );
                    }
                  }}
                />
                {t("common.selectAll")}
              </label>
            )}
            {filteredTreatments.map((tr) => (
              <label
                key={tr._id}
                className="-mx-2 flex min-h-11 select-none items-center gap-3 rounded-md px-3 py-2.5 text-sm cursor-pointer transition-colors hover:bg-accent/40 active:bg-accent"
              >
                <Checkbox
                  className="h-5 w-5"
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
            {treatments && treatments.length > 0 && filteredTreatments.length === 0 && (
              <p className="text-xs text-muted-foreground py-2">
                {t("detail.relationships.noResults")}
              </p>
            )}
          </div>
          {selectedTreatments.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("gabinet.employees.selectedTreatments", { count: selectedTreatments.length })}
            </p>
          )}
        </div>
      )}

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
            entityType="gabinetEmployee"
          />
        </div>
      )}

      {customFieldDefs && customFieldDefs.length > 0 && (
        <div className="space-y-2 pt-2 border-t">
          <CustomFieldFormSection
            definitions={customFieldDefs as any}
            values={customFieldValues}
            onChange={(fieldKey, value) =>
              setCustomFieldValues((prev) => ({ ...prev, [fieldKey]: value }))
            }
          />
        </div>
      )}

      {/* System access */}
      <div className="space-y-2 rounded-md border p-4">
        <p className="text-sm font-medium">
          {t("gabinet.employees.systemAccess", { defaultValue: "Dostęp do systemu" })}
        </p>

        <div className="space-y-3">
            {/* Access mode toggle */}
            <div className="space-y-1.5">
              <Label>{t("gabinet.employees.accessMethod", { defaultValue: "Sposób aktywacji konta" })}</Label>
              <div className="flex gap-2">
                <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-accent/40 has-[:checked]:border-primary has-[:checked]:bg-accent/60">
                  <input
                    type="radio"
                    name="accessMode"
                    value="invite"
                    checked={accessMode === "invite"}
                    onChange={() => setAccessMode("invite")}
                    className="accent-primary"
                  />
                  {t("gabinet.employees.accessModeInvite", { defaultValue: "Wyślij zaproszenie e-mailem" })}
                </label>
                <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-accent/40 has-[:checked]:border-primary has-[:checked]:bg-accent/60">
                  <input
                    type="radio"
                    name="accessMode"
                    value="password"
                    checked={accessMode === "password"}
                    onChange={() => setAccessMode("password")}
                    className="accent-primary"
                  />
                  {t("gabinet.employees.accessModePassword", { defaultValue: "Ustaw hasło ręcznie" })}
                </label>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>
                {t("gabinet.employees.accessEmail", { defaultValue: "Adres e-mail" })} <span className="text-destructive">*</span>
              </Label>
              <Input
                type="email"
                value={accessEmail}
                onChange={(e) => setAccessEmail(e.target.value)}
                placeholder={t("gabinet.employees.accessEmailPlaceholder", { defaultValue: "np. jan.kowalski@firma.pl" })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                {t("gabinet.employees.accessRole", { defaultValue: "Rola dostępu" })} <span className="text-destructive">*</span>
              </Label>
              <Select value={accessRole} onValueChange={(v) => setAccessRole(v as "admin" | "member" | "viewer")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">
                    {t("gabinet.employees.accessRoles.admin", { defaultValue: "Administrator" })}
                  </SelectItem>
                  <SelectItem value="member">
                    {t("gabinet.employees.accessRoles.member", { defaultValue: "Pracownik" })}
                  </SelectItem>
                  <SelectItem value="viewer">
                    {t("gabinet.employees.accessRoles.viewer", { defaultValue: "Tylko podgląd" })}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Password fields — only shown in manual password mode */}
            {accessMode === "password" && (
              <div className="space-y-3 pt-1">
                <div className="space-y-1.5">
                  <Label>
                    {t("gabinet.employees.password", { defaultValue: "Hasło" })} <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      className="pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? t("common.hidePassword", { defaultValue: "Ukryj hasło" }) : t("common.showPassword", { defaultValue: "Pokaż hasło" })}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Eye className="h-4 w-4" variant="stroke" />
                      {showPassword && (
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          <span className="block h-px w-4 rotate-45 bg-current" />
                        </span>
                      )}
                    </button>
                  </div>
                  {passwordError && (
                    <p className="text-xs text-destructive">{passwordError}</p>
                  )}
                  {!passwordError && (
                    <p className="text-xs text-muted-foreground">
                      {t("gabinet.employees.passwordHint", { defaultValue: "Min. 8 znaków, 1 wielka litera, 1 cyfra." })}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>
                    {t("gabinet.employees.confirmPassword", { defaultValue: "Powtórz hasło" })} <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      className="pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      aria-label={showConfirmPassword ? t("common.hidePassword", { defaultValue: "Ukryj hasło" }) : t("common.showPassword", { defaultValue: "Pokaż hasło" })}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Eye className="h-4 w-4" variant="stroke" />
                      {showConfirmPassword && (
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          <span className="block h-px w-4 rotate-45 bg-current" />
                        </span>
                      )}
                    </button>
                  </div>
                  {confirmPasswordError && (
                    <p className="text-xs text-destructive">{confirmPasswordError}</p>
                  )}
                </div>
              </div>
            )}

            {locations && locations.filter((l) => l.isActive).length > 0 && (
              <div className="space-y-1.5">
                <Label>{t("settings.team.gabinetLocation")}</Label>
                <Select
                  value={locationId ?? "none"}
                  onValueChange={(v) => {
                    setLocationId(v === "none" ? undefined : v);
                    if (v === "none") setLocationRole(undefined);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("settings.team.gabinetLocationPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("settings.team.gabinetLocationNone")}</SelectItem>
                    {locations.filter((l) => l.isActive).map((loc) => (
                      <SelectItem key={loc._id} value={loc._id}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {locationId && (
              <div className="space-y-1.5">
                <Label>{t("settings.team.gabinetLocationRole")}</Label>
                <Select
                  value={locationRole ?? "none"}
                  onValueChange={(v) => setLocationRole(v === "none" ? undefined : v as EmployeeRole)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("settings.team.gabinetLocationRolePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("settings.team.gabinetLocationRoleNone")}</SelectItem>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {t(`gabinet.employees.roles.${r}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button
          type="submit"
          disabled={
            isSubmitting ||
            !accessEmail.trim() ||
            !isPasswordValid
          }
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
