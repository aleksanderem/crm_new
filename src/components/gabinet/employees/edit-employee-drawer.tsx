import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { FunctionArgs } from "convex/server";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import type { GabinetEmployeeRole } from "@cvx/schema";
import type { MappedGabinetEmployee } from "@/lib/supabase/mappers/gabinet/employees";
import { SidePanel } from "@/components/crm/side-panel";
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
import { RichTextEditor } from "@/components/gabinet/rich-text-editor";
import { Separator } from "@/components/ui/separator";
import type { TFunction } from "i18next";
import { toast } from "sonner";
import { formatActionError } from "@/lib/format-action-error";
import { useSupabase } from "@/components/supabase-provider";
import { useSupabaseGabinetLocationsList } from "@/hooks/use-supabase-gabinet-locations";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { EMPLOYEE_ROLES } from "@/lib/options";

export { EMPLOYEE_ROLES as ROLES };

export function EditEmployeeDrawer({
  open,
  onOpenChange,
  employee,
  organizationId,
  members,
  allEmployees,
  onUpdate,
  isSubmitting,
  setIsSubmitting,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: MappedGabinetEmployee;
  organizationId: Id<"organizations">;
  members: Array<{ userId: string; user: { name?: string | null; email?: string | null } | null }>;
  allEmployees: MappedGabinetEmployee[];
  onUpdate: (args: FunctionArgs<typeof api.gabinet.employees.update>) => Promise<void>;
  isSubmitting: boolean;
  setIsSubmitting: (v: boolean) => void;
  t: TFunction;
}) {
  const { client, isReady } = useSupabase();
  const { data: locations } = useSupabaseGabinetLocationsList(String(organizationId));

  const { data: currentPrimaryLocation } = useQuery({
    queryKey: supabaseKeys.gabinetEmployeeLocations.detail(String(organizationId), employee._id),
    queryFn: async () => {
      if (!client) return null;
      const { data } = await client
        .from("gabinet_employee_locations")
        .select("location_id, role")
        .eq("organization_id", String(organizationId))
        .eq("employee_id", employee._id)
        .eq("is_primary", true)
        .maybeSingle();
      if (!data) return null;
      return { locationId: data.location_id ?? null, locationRole: (data.role as string | null) ?? null };
    },
    enabled: isReady && !!client,
  });

  const [userId, setUserId] = useState<string | undefined>(employee.userId);
  const [firstName, setFirstName] = useState(employee.firstName ?? "");
  const [lastName, setLastName] = useState(employee.lastName ?? "");
  const [role, setRole] = useState<GabinetEmployeeRole>(employee.role as GabinetEmployeeRole);
  const [specialization, setSpecialization] = useState(employee.specialization ?? "");
  const [licenseNumber, setLicenseNumber] = useState(employee.licenseNumber ?? "");
  const [hireDate, setHireDate] = useState(employee.hireDate ?? "");
  const [color, setColor] = useState(employee.color ?? "#3b82f6");
  const [showInCalendar, setShowInCalendar] = useState<boolean>(
    employee.showInCalendar ?? true,
  );
  const [performsServices, setPerformsServices] = useState<boolean>(
    employee.performsServices ?? true,
  );
  const [notes, setNotes] = useState(employee.notes ?? "");
  const [locationId, setLocationId] = useState<string | null>(null);
  const [locationRole, setLocationRole] = useState<GabinetEmployeeRole | null>(null);

  // Re-sync form state when drawer opens
  useEffect(() => {
    if (open) {
      setUserId(employee.userId);
      setFirstName(employee.firstName ?? "");
      setLastName(employee.lastName ?? "");
      setRole(employee.role as GabinetEmployeeRole);
      setSpecialization(employee.specialization ?? "");
      setLicenseNumber(employee.licenseNumber ?? "");
      setHireDate(employee.hireDate ?? "");
      setColor(employee.color ?? "#3b82f6");
      setShowInCalendar(employee.showInCalendar ?? true);
      setPerformsServices(employee.performsServices ?? true);
      setNotes(employee.notes ?? "");
    }
  }, [open, employee]);

  // Sync location + locationRole separately when query resolves
  useEffect(() => {
    if (open && currentPrimaryLocation !== undefined) {
      setLocationId(currentPrimaryLocation?.locationId ?? null);
      setLocationRole((currentPrimaryLocation?.locationRole as GabinetEmployeeRole | null) ?? null);
    }
  }, [open, currentPrimaryLocation]);

  // Org members eligible for linking: current user + any user not linked to another employee
  const availableUsers = useMemo(() => {
    const takenUserIds = new Set(
      allEmployees
        .filter((e) => e._id !== employee._id)
        .map((e) => e.userId),
    );
    return members
      .filter((m) => m.user && (m.userId === employee.userId || !takenUserIds.has(m.userId)))
      .map((m) => ({
        userId: m.userId,
        label: m.user!.name || m.user!.email || m.userId,
      }));
  }, [members, allEmployees, employee._id, employee.userId]);

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      await onUpdate({
        organizationId,
        employeeId: employee._id,
        userId: userId !== employee.userId ? userId : undefined,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        role,
        specialization: performsServices ? specialization || null : undefined,
        licenseNumber: performsServices ? licenseNumber || null : undefined,
        hireDate: hireDate || null,
        color: showInCalendar ? color || null : null,
        showInCalendar,
        performsServices,
        notes: notes || null,
        locationId: showInCalendar ? locationId ?? null : null,
        locationRole: showInCalendar ? locationRole ?? null : null,
      });
      toast.success(t("common.saved"));
      onOpenChange(false);
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "gabinet.employees.errors.saveFailed",
          defaultValue: "Nie udało się zapisać zmian pracownika.",
        }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      title={t("gabinet.employees.editEmployee")}
      onSubmit={handleSave}
      submitLabel={t("common.save")}
      isSubmitting={isSubmitting}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>{t("gabinet.employees.selectUser")}</Label>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger>
              <SelectValue placeholder={t("gabinet.employees.selectUserPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {availableUsers.map((u) => (
                <SelectItem key={u.userId} value={u.userId}>
                  {u.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t("gabinet.employees.firstName")}</Label>
            <Input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("gabinet.employees.lastName")}</Label>
            <Input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>{t("gabinet.employees.role")}</Label>
          <Select value={role} onValueChange={(v) => setRole(v as GabinetEmployeeRole)}>
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

        <div className="space-y-1.5">
          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              className="mt-0.5 h-5 w-5"
              checked={performsServices}
              onCheckedChange={(checked) => setPerformsServices(checked === true)}
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium leading-none">
                {t("gabinet.employees.performsServices", { defaultValue: "Czy pracownik wykonuje usługi lub zabiegi?" })}
              </span>
            </span>
          </label>
        </div>

        {performsServices && (
          <>
            <div className="space-y-1.5">
              <Label>{t("gabinet.employees.specialization")}</Label>
              <Input
                value={specialization}
                onChange={(e) => setSpecialization(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("gabinet.employees.license")}</Label>
              <Input
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
              />
            </div>
          </>
        )}

        <div className="space-y-1.5">
          <Label>{t("gabinet.employees.hireDate")}</Label>
          <Input
            type="date"
            value={hireDate}
            onChange={(e) => setHireDate(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Separator />
          <p className="text-sm font-medium text-muted-foreground pt-1">
            {t("gabinet.employees.calendarSettings", { defaultValue: "Ustawienia kalendarza" })}
          </p>
        </div>

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

        {showInCalendar && (
          <>
            <div className="space-y-1.5">
              <Label>{t("gabinet.employees.color")}</Label>
              <input
                type="color"
                className="h-9 w-16 cursor-pointer rounded border bg-transparent"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </div>
            {locations && locations.length > 0 && (
              <div className="space-y-1.5">
                <Label>{t("gabinet.employees.location", { defaultValue: "Lokalizacja" })}</Label>
                <Select
                  value={locationId ?? ""}
                  onValueChange={(v) => {
                    setLocationId(v || null);
                    if (!v) setLocationRole(null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("gabinet.employees.locationPlaceholder", { defaultValue: "Wybierz lokalizację" })} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t("gabinet.employees.noLocation", { defaultValue: "Brak lokalizacji" })}</SelectItem>
                    {locations.map((loc) => (
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
                  value={locationRole ?? ""}
                  onValueChange={(v) => setLocationRole(v ? (v as GabinetEmployeeRole) : null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("settings.team.gabinetLocationRolePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t("settings.team.gabinetLocationRoleNone")}</SelectItem>
                    {EMPLOYEE_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {t(`gabinet.employees.roles.${r}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </>
        )}

        <div className="space-y-1.5">
          <Label>{t("gabinet.employees.notes")}</Label>
          <RichTextEditor
            value={notes}
            onChange={(val) => setNotes(val ?? "")}
          />
        </div>
      </div>
    </SidePanel>
  );
}
