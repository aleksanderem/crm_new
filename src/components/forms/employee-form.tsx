import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { useAction } from "convex/react";
import { toast } from "sonner";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TagsPicker } from "@/components/categories-tags/tags-picker";
import { CategoryPicker } from "@/components/categories-tags/category-picker";
import {
  UserInvitationForm,
  type UserInvitationFormData,
} from "@/components/forms/user-invitation-form";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { Search } from "@/lib/ez-icons";

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
}

interface EmployeeFormProps {
  initialData?: Partial<EmployeeFormData>;
  onSubmit: (data: EmployeeFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  /** If true, user selection is required (create mode). If false, user is pre-selected (edit mode). */
  requireUserSelection?: boolean;
  tagDefinitions?: TagDef[];
  categoryDefinitions?: CategoryDef[];
}

export function EmployeeForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
  requireUserSelection = true,
  tagDefinitions = [],
  categoryDefinitions = [],
}: EmployeeFormProps) {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();

  // Fetch organization members and existing employees
  const { data: members } = useQuery(
    convexQuery(api.organizations.getMembers, { organizationId })
  );
  const listEmployees = useAction(api.gabinet.employees.listAll);
  const { data: employees } = useQuery({
    queryKey: ["gabinet.employees.listAll", organizationId],
    queryFn: () => listEmployees({ organizationId }),
    enabled: !!organizationId,
  });

  const listActiveTreatments = useAction(api.gabinet.treatments.listActive);
  const { data: treatments } = useQuery({
    queryKey: ["gabinet.treatments.listActive", organizationId],
    queryFn: () => listActiveTreatments({ organizationId }),
    enabled: !!organizationId,
  });

  // Users not yet registered as employees (for create mode)
  const availableUsers = useMemo(() => {
    if (!members || !employees) return [];
    const empUserIds = new Set(employees.map((e) => e.userId));
    return members
      .filter((m) => m.user && !empUserIds.has(m.userId))
      .map((m) => ({ _id: m.userId, name: m.user!.name, email: m.user!.email }));
  }, [members, employees]);

  const queryClient = useQueryClient();
  const createInvitation = useAction(api.invitations.create);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [isSendingInvite, setIsSendingInvite] = useState(false);

  const [userId, setUserId] = useState<string>(initialData?.userId ?? "");
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

  const filteredTreatments = useMemo(() => {
    if (!treatments) return [];
    const q = treatmentSearch.trim().toLowerCase();
    if (!q) return treatments;
    return treatments.filter((tr) => tr.name?.toLowerCase().includes(q));
  }, [treatments, treatmentSearch]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (requireUserSelection && !userId) return;

    const isClinicalRole = role !== "receptionist" && role !== "manager";

    onSubmit({
      userId: userId as Id<"users"> | undefined,
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
          <p className="text-xs text-muted-foreground">
            {availableUsers.length === 0 && (
              <>{t("gabinet.employees.allUsersRegistered")}{" "}</>
            )}
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="text-brand-secondary underline hover:no-underline"
            >
              {t("gabinet.employees.inviteTeamMember", { defaultValue: "Zaproś nowego członka zespołu" })}
            </button>
          </p>
        </div>
      )}

      {requireUserSelection && (
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("team.inviteDialog.title")}</DialogTitle>
              <DialogDescription>
                {t("team.inviteDialog.description")}
              </DialogDescription>
            </DialogHeader>
            <UserInvitationForm
              defaultModule="gabinet"
              isSubmitting={isSendingInvite}
              onCancel={() => setInviteOpen(false)}
              onSubmit={async (data: UserInvitationFormData) => {
                setIsSendingInvite(true);
                try {
                  await createInvitation({
                    organizationId,
                    email: data.email,
                    role: data.role as "admin" | "member" | "viewer" | "owner",
                    module: data.module,
                    moduleData: data.moduleData,
                  });
                  toast.success(t("team.invitationSent"));
                  void queryClient.invalidateQueries({
                    queryKey: supabaseKeys.invitations.list(organizationId),
                  });
                  void queryClient.invalidateQueries({
                    queryKey: supabaseKeys.teamMemberships.list(organizationId),
                  });
                  setInviteOpen(false);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : String(e));
                } finally {
                  setIsSendingInvite(false);
                }
              }}
            />
          </DialogContent>
        </Dialog>
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
