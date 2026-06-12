import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { useAction } from "convex/react";
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
import { TagsPicker } from "@/components/categories-tags/tags-picker";
import { CategoryPicker } from "@/components/categories-tags/category-picker";
import { CustomFieldFormSection } from "@/components/custom-fields/custom-field-form-section";
import { useTagDefinitions } from "@/hooks/use-tag-definitions";
import { useCategoryDefinitions } from "@/hooks/use-category-definitions";
import { AlertCircle, Search, Users } from "@/lib/ez-icons";

type OrgRole = "owner" | "admin" | "member";
type InviteModule = "none" | "gabinet";
type GabinetRole =
  | "doctor"
  | "nurse"
  | "therapist"
  | "receptionist"
  | "admin"
  | "other";

const ROLES: { value: OrgRole; labelKey: string }[] = [
  { value: "admin", labelKey: "settings.team.roles.admin" },
  { value: "member", labelKey: "settings.team.roles.member" },
];

const GABINET_ROLES: GabinetRole[] = [
  "doctor",
  "nurse",
  "therapist",
  "receptionist",
  "admin",
  "other",
];

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

export interface UserInvitationFormData {
  email: string;
  role: OrgRole;
  module?: "gabinet";
  moduleData?: GabinetModuleData;
}

export interface GabinetModuleData {
  firstName?: string;
  lastName?: string;
  role: GabinetRole;
  specialization?: string;
  color?: string;
  qualifiedTreatmentIds?: string[];
  tagIds?: string[];
  categoryId?: string;
  customFields?: Array<{ fieldDefinitionId: string; value: unknown }>;
}

interface UserInvitationFormProps {
  onSubmit: (data: UserInvitationFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  defaultModule?: InviteModule;
}

export function UserInvitationForm({
  onSubmit,
  onCancel,
  isSubmitting = false,
  defaultModule = "none",
}: UserInvitationFormProps) {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();

  const { data: members } = useQuery(
    convexQuery(api.organizations.getMembers, { organizationId })
  );
  const { data: pendingInvitations } = useQuery(
    convexQuery(api.invitations.listPending, { organizationId })
  );
  const { data: subscription } = useQuery(
    convexQuery(api.productSubscriptions.getSubscription, { organizationId })
  );

  // Gabinet-specific data sources — only fetched lazily once Gabinet is picked.
  const [module, setModule] = useState<InviteModule>(defaultModule);

  const listActiveTreatments = useAction(api.gabinet.treatments.listActive);
  const { data: treatments } = useQuery({
    queryKey: ["gabinet.treatments.listActive", organizationId],
    queryFn: () => listActiveTreatments({ organizationId }),
    enabled: !!organizationId && module === "gabinet",
  }) as { data: Array<{ _id: string; name: string; duration?: number }> | undefined };

  const { tags: tagDefinitions } = useTagDefinitions(organizationId) as {
    tags: Array<{ _id: Id<"tagDefinitions">; name: string; color: string }>;
  };

  const { categories: categoryDefinitions } = useCategoryDefinitions(
    organizationId,
    "gabinetEmployee" as any,
  ) as {
    categories: Array<{
      _id: Id<"categoryDefinitions">;
      name: string;
      parentId?: Id<"categoryDefinitions">;
      color?: string;
    }>;
  };

  const { data: customFieldDefs } = useQuery(
    convexQuery(
      api.customFields.getDefinitions,
      module === "gabinet"
        ? { organizationId, entityType: "gabinetEmployee" }
        : ("skip" as any),
    ),
  ) as {
    data:
      | Array<{
          _id: string;
          name: string;
          fieldKey: string;
          fieldType: any;
          options?: string[];
          isRequired?: boolean;
          group?: string;
        }>
      | undefined;
  };

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("member");
  const [emailError, setEmailError] = useState<string | null>(null);

  // Gabinet module form state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gabinetRole, setGabinetRole] = useState<GabinetRole>("doctor");
  const [specialization, setSpecialization] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [selectedTreatments, setSelectedTreatments] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<Id<"tagDefinitions">[]>([]);
  const [categoryId, setCategoryId] = useState<Id<"categoryDefinitions"> | undefined>(undefined);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, unknown>>({});
  const [treatmentSearch, setTreatmentSearch] = useState("");

  const memberCount = members?.length ?? 0;
  const pendingCount = pendingInvitations?.length ?? 0;
  const totalUsers = memberCount + pendingCount;
  const seatLimit = subscription?.seatLimit ?? 10;
  const isNearLimit = totalUsers >= seatLimit - 2;
  const isAtLimit = totalUsers >= seatLimit;

  const filteredTreatments = useMemo(() => {
    if (!treatments) return [];
    const q = treatmentSearch.trim().toLowerCase();
    if (!q) return treatments;
    return treatments.filter((tr) => tr.name?.toLowerCase().includes(q));
  }, [treatments, treatmentSearch]);

  const isClinicalRole = gabinetRole !== "receptionist" && gabinetRole !== "admin";

  const validateEmail = (value: string): boolean => {
    if (!value.trim()) {
      setEmailError(t("settings.team.emailRequired"));
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      setEmailError(t("settings.team.emailInvalid"));
      return false;
    }
    setEmailError(null);
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail(email)) return;
    if (isAtLimit) return;

    let moduleData: GabinetModuleData | undefined;
    if (module === "gabinet") {
      const customFields = (customFieldDefs ?? [])
        .map((def) => ({
          fieldDefinitionId: def._id,
          value: customFieldValues[def.fieldKey],
        }))
        .filter((f) => f.value !== undefined && f.value !== "");

      moduleData = {
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        role: gabinetRole,
        specialization: specialization || undefined,
        color: color || undefined,
        qualifiedTreatmentIds: isClinicalRole && selectedTreatments.length > 0
          ? selectedTreatments
          : undefined,
        tagIds: tagIds.length > 0 ? tagIds : undefined,
        categoryId: categoryId || undefined,
        customFields: customFields.length > 0 ? customFields : undefined,
      };
    }

    onSubmit({
      email: email.trim().toLowerCase(),
      role,
      module: module === "gabinet" ? "gabinet" : undefined,
      moduleData,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Usage info */}
      <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
        <Users className="h-5 w-5 text-muted-foreground" />
        <div className="flex-1">
          <p className="text-sm font-medium">{t("settings.team.currentUsage")}</p>
          <p className="text-xs text-muted-foreground">
            {t("settings.team.usageCount", { current: totalUsers, limit: seatLimit })}
            {pendingCount > 0 && (
              <span className="ml-1">
                ({pendingCount} {t("settings.team.pendingInvites")})
              </span>
            )}
          </p>
        </div>
      </div>

      {isNearLimit && !isAtLimit && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
          <AlertCircle className="mt-0.5 h-4 w-4 text-amber-600 dark:text-amber-400" />
          <p className="text-sm text-amber-800 dark:text-amber-200">
            {t("settings.team.nearLimitWarning")}
          </p>
        </div>
      )}

      {isAtLimit && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
          <p className="text-sm text-destructive">{t("settings.team.limitReached")}</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>
            {t("settings.team.email")} <span className="text-destructive">*</span>
          </Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailError) validateEmail(e.target.value);
            }}
            placeholder={t("settings.team.emailPlaceholder")}
            disabled={isAtLimit}
            required
          />
          {emailError && <p className="text-xs text-destructive">{emailError}</p>}
        </div>

        <div className="space-y-1.5">
          <Label>
            {t("settings.team.role")} <span className="text-destructive">*</span>
          </Label>
          <Select
            value={role}
            onValueChange={(v) => setRole(v as OrgRole)}
            disabled={isAtLimit}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {t(r.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t("settings.team.roleHint")}</p>
        </div>

        {/* Module picker — when Gabinet is chosen, pre-fill module fields so a
            gabinet_employees row is auto-provisioned on invite-accept. */}
        <div className="space-y-1.5">
          <Label>{t("settings.team.module")}</Label>
          <Select
            value={module}
            onValueChange={(v) => setModule(v as InviteModule)}
            disabled={isAtLimit}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("settings.team.moduleNone")}</SelectItem>
              <SelectItem value="gabinet">{t("settings.team.moduleGabinet")}</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t("settings.team.moduleHint")}</p>
        </div>
      </div>

      {module === "gabinet" && (
        <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
          <h3 className="text-sm font-medium">
            {t("settings.team.gabinetSectionTitle")}
          </h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("gabinet.employees.firstName")}</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("gabinet.employees.lastName")}</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>
                {t("gabinet.employees.role")} <span className="text-destructive">*</span>
              </Label>
              <Select value={gabinetRole} onValueChange={(v) => setGabinetRole(v as GabinetRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GABINET_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {t(`gabinet.employees.roles.${r}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t("gabinet.employees.specialization")}</Label>
              <Input value={specialization} onChange={(e) => setSpecialization(e.target.value)} />
            </div>

            <div className="space-y-2 sm:col-span-2">
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
          </div>

          {isClinicalRole && (
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
              <div className="max-h-48 overflow-y-auto rounded-md border p-2 space-y-1">
                {filteredTreatments.map((tr) => (
                  <label key={tr._id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={selectedTreatments.includes(tr._id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedTreatments([...selectedTreatments, tr._id]);
                        } else {
                          setSelectedTreatments(selectedTreatments.filter((id) => id !== tr._id));
                        }
                      }}
                    />
                    <span className="flex-1">{tr.name}</span>
                    {tr.duration != null && (
                      <span className="text-xs text-muted-foreground">{tr.duration} min</span>
                    )}
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
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {tagDefinitions && tagDefinitions.length > 0 && (
              <div className="space-y-1.5">
                <Label>{t("common.tags", { defaultValue: "Tagi" })}</Label>
                <TagsPicker tags={tagDefinitions} selectedIds={tagIds} onChange={setTagIds} />
              </div>
            )}

            {organizationId && (
              <div className="space-y-1.5">
                <Label>{t("common.category", { defaultValue: "Kategoria" })}</Label>
                <CategoryPicker
                  categories={categoryDefinitions ?? []}
                  selectedId={categoryId}
                  onChange={setCategoryId}
                  organizationId={organizationId}
                  entityType="gabinetEmployee"
                />
              </div>
            )}
          </div>

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
        </div>
      )}

      <div className="rounded-lg border bg-muted/30 p-3">
        <p className="text-sm text-muted-foreground">{t("settings.team.invitationInfo")}</p>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={!email.trim() || isAtLimit || isSubmitting}>
          {isSubmitting ? t("common.saving") : t("settings.team.sendInvite")}
        </Button>
      </div>
    </form>
  );
}
