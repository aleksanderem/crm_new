import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Plus } from "@/lib/ez-icons";
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { QuickActionBar } from "@/components/crm/quick-action-bar";
import { toast } from "sonner";
import { Id } from "@cvx/_generated/dataModel";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/employees/"
)({
  component: EmployeesIndex,
});

const ROLES = ["doctor", "nurse", "therapist", "receptionist", "admin", "other"] as const;

function EmployeesIndex() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);

  const createEmployee = useMutation(api["gabinet/employees"].create);

  const { data: employees } = useQuery(
    convexQuery(api["gabinet/employees"].listAll, { organizationId })
  );

  const { data: members } = useQuery(
    convexQuery(api.organizations.getMembers, { organizationId })
  );

  const { data: treatments } = useQuery(
    convexQuery(api["gabinet/treatments"].listActive, { organizationId })
  );

  // Users not yet registered as employees
  const availableUsers = useMemo(() => {
    if (!members || !employees) return [];
    const empUserIds = new Set(employees.map((e) => e.userId));
    return members
      .filter((m) => m.user && !empUserIds.has(m.userId))
      .map((m) => m.user!);
  }, [members, employees]);

  const userMap = useMemo(() => {
    const map = new Map<string, { name?: string | null; email?: string | null }>();
    members?.forEach((m) => {
      if (m.user) map.set(m.userId, m.user);
    });
    return map;
  }, [members]);

  const treatmentMap = useMemo(() => {
    const map = new Map<string, string>();
    treatments?.forEach((t) => map.set(t._id, t.name));
    return map;
  }, [treatments]);

  function getDisplayName(emp: { firstName?: string; lastName?: string; userId: string }) {
    if (emp.firstName || emp.lastName) {
      return `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim();
    }
    const user = userMap.get(emp.userId);
    return user?.name || user?.email || t("common.unknown");
  }

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <PageHeader
        title={t("gabinet.employees.title")}
        description={t("gabinet.employees.description")}
        actions={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("gabinet.employees.add")}
          </Button>
        }
      />

      <QuickActionBar
        actions={[
          {
            label: t('quickActions.newEmployee'),
            icon: <Plus className="mr-1.5 h-3.5 w-3.5" />,
            onClick: () => setShowCreate(true),
            feature: "gabinet_employees",
            action: "create",
          },
        ]}
      />

      {!employees?.length && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          {t("gabinet.employees.empty")}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {employees?.map((emp) => {
          const user = userMap.get(emp.userId);
          const displayName = getDisplayName(emp);
          return (
            <Card
              key={emp._id}
              className={`cursor-pointer transition-colors hover:bg-muted/30 ${!emp.isActive ? "opacity-50" : ""}`}
              onClick={() => navigate({ to: `/dashboard/gabinet/employees/${emp._id}` })}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold">{displayName}</p>
                    {user?.email && (
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {emp.color && (
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: emp.color }}
                      />
                    )}
                    <Badge variant={emp.isActive ? "default" : "secondary"}>
                      {t(`gabinet.employees.roles.${emp.role}`)}
                    </Badge>
                  </div>
                </div>

                {emp.specialization && (
                  <p className="text-xs text-muted-foreground">
                    {emp.specialization}
                  </p>
                )}

                {emp.qualifiedTreatmentIds.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {emp.qualifiedTreatmentIds.slice(0, 3).map((tid) => (
                      <Badge key={tid} variant="outline" className="text-xs">
                        {treatmentMap.get(tid) || "..."}
                      </Badge>
                    ))}
                    {emp.qualifiedTreatmentIds.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{emp.qualifiedTreatmentIds.length - 3}
                      </Badge>
                    )}
                  </div>
                )}

                {emp.licenseNumber && (
                  <p className="text-xs text-muted-foreground">
                    {t("gabinet.employees.license")}: {emp.licenseNumber}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Create dialog */}
      <CreateEmployeeSheet
        open={showCreate}
        onClose={() => setShowCreate(false)}
        availableUsers={availableUsers}
        treatments={treatments ?? []}
        organizationId={organizationId}
        onCreate={createEmployee}
        t={t}
      />
    </div>
  );
}

function CreateEmployeeSheet({
  open,
  onClose,
  availableUsers,
  treatments,
  organizationId,
  onCreate,
  t,
}: {
  open: boolean;
  onClose: () => void;
  availableUsers: Array<{ _id: Id<"users">; name?: string | null; email?: string | null }>;
  treatments: Array<{ _id: Id<"gabinetTreatments">; name: string }>;
  organizationId: Id<"organizations">;
  onCreate: any;
  t: any;
}) {
  const [userId, setUserId] = useState<string>("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<string>("doctor");
  const [specialization, setSpecialization] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [selectedTreatments, setSelectedTreatments] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      await onCreate({
        organizationId,
        userId: userId as Id<"users">,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        role: role as any,
        specialization: specialization || undefined,
        licenseNumber: licenseNumber || undefined,
        color: color || undefined,
        qualifiedTreatmentIds: selectedTreatments as Id<"gabinetTreatments">[],
      });
      toast.success(t("common.created"));
      onClose();
      setUserId("");
      setFirstName("");
      setLastName("");
      setRole("doctor");
      setSpecialization("");
      setLicenseNumber("");
      setSelectedTreatments([]);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("gabinet.employees.add")}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-1.5">
            <Label>{t("gabinet.employees.selectUser")}</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder={t("gabinet.employees.selectUser")} /></SelectTrigger>
              <SelectContent>
                {availableUsers.map((u) => (
                  <SelectItem key={u._id} value={u._id}>
                    {u.name || u.email}
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
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`gabinet.employees.roles.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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

          <div className="space-y-1.5">
            <Label>{t("gabinet.employees.color")}</Label>
            <input
              type="color"
              className="h-9 w-16 cursor-pointer rounded border bg-transparent"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("gabinet.employees.qualifiedTreatments")}</Label>
            <div className="max-h-48 overflow-y-auto rounded-md border p-2 space-y-1">
              {treatments.map((tr) => (
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
                  {tr.name}
                </label>
              ))}
              {treatments.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">{t("gabinet.employees.noTreatments")}</p>
              )}
            </div>
          </div>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={handleCreate} disabled={!userId || saving}>
            {saving ? t("common.saving") : t("common.create")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
