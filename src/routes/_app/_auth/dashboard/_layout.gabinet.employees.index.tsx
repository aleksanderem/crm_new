import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { CrmDataTable } from "@/components/crm/enhanced-data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { EditableCell } from "@/components/data-table/editable-cell";
import { EMPLOYEE_ROLES, employeeRoleOptions } from "@/lib/options";
import { Plus, Trash2 } from "@/lib/ez-icons";
import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { QuickActionBar } from "@/components/crm/quick-action-bar";
import { toast } from "sonner";
import { Id, Doc } from "@cvx/_generated/dataModel";
import { ColumnDef } from "@tanstack/react-table";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/employees/"
)({
  component: EmployeesIndex,
});


type Employee = Doc<"gabinetEmployees">;

function EmployeesIndex() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);

  const createEmployee = useMutation(api.gabinet.employees.create);
  const updateEmployee = useMutation(api.gabinet.employees.update);
  const removeEmployee = useMutation(api.gabinet.employees.remove);

  const { data: employees } = useQuery(
    convexQuery(api.gabinet.employees.listAll, { organizationId })
  );

  const { data: members } = useQuery(
    convexQuery(api.organizations.getMembers, { organizationId })
  );

  const { data: treatments } = useQuery(
    convexQuery(api.gabinet.treatments.listActive, { organizationId })
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

  function getDisplayName(emp: { firstName?: string; lastName?: string; userId: string }) {
    if (emp.firstName || emp.lastName) {
      return `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim();
    }
    const user = userMap.get(emp.userId);
    return user?.name || user?.email || t("common.unknown");
  }

  function getInitials(emp: { firstName?: string; lastName?: string; userId: string }) {
    if (emp.firstName || emp.lastName) {
      return `${(emp.firstName ?? "")[0] ?? ""}${(emp.lastName ?? "")[0] ?? ""}`.toUpperCase();
    }
    const user = userMap.get(emp.userId);
    const name = user?.name || user?.email || "?";
    return name.substring(0, 2).toUpperCase();
  }

  const roleOptions = employeeRoleOptions(t);

  const columns: ColumnDef<Employee>[] = [
    {
      accessorKey: "firstName",
      size: 200,
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("gabinet.employees.employee")} />,
      cell: ({ row }) => {
        const displayName = getDisplayName(row.original);
        const initials = getInitials(row.original);
        const user = userMap.get(row.original.userId);
        return (
          <div className="flex items-center gap-2">
            <Avatar className="h-7 w-7">
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div>
              <span className="font-medium">{displayName}</span>
              {user?.email && (
                <p className="text-xs text-muted-foreground">{user.email}</p>
              )}
            </div>
            {!row.original.isActive && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                {t("common.inactive")}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "role",
      size: 150,
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("gabinet.employees.role")} />,
      cell: ({ row }) => (
        <EditableCell
          value={row.original.role ?? ""}
          config={{
            type: "select",
            options: roleOptions,
            placeholder: "—",
          }}
          onChange={async (v) => { await updateEmployee({ organizationId, employeeId: row.original._id, role: v as any }); }}
        />
      ),
      filterFn: (row, id, value) => (value as string[]).includes(row.getValue(id)),
    },
    {
      accessorKey: "specialization",
      size: 150,
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("gabinet.employees.specialization")} />,
      cell: ({ row }) => (
        <EditableCell
          value={row.original.specialization ?? ""}
          config={{ type: "text", placeholder: "—" }}
          onChange={async (v) => { await updateEmployee({ organizationId, employeeId: row.original._id, specialization: v }); }}
        />
      ),
    },
    {
      accessorKey: "licenseNumber",
      size: 150,
      header: t("gabinet.employees.license"),
      cell: ({ row }) => (
        <EditableCell
          value={row.original.licenseNumber ?? ""}
          config={{ type: "text", placeholder: "—" }}
          onChange={async (v) => { await updateEmployee({ organizationId, employeeId: row.original._id, licenseNumber: v }); }}
        />
      ),
    },
    {
      accessorKey: "hireDate",
      size: 130,
      header: t("gabinet.employees.hireDate"),
      cell: ({ row }) => (
        <EditableCell
          value={row.original.hireDate ?? ""}
          config={{ type: "date" }}
          onChange={async (v) => { await updateEmployee({ organizationId, employeeId: row.original._id, hireDate: v }); }}
        />
      ),
    },
    {
      accessorKey: "color",
      size: 80,
      header: t("gabinet.employees.color"),
      cell: ({ row }) => (
        <EditableCell
          value={row.original.color ?? ""}
          config={{ type: "text", placeholder: "—" }}
          onChange={async (v) => { await updateEmployee({ organizationId, employeeId: row.original._id, color: v }); }}
          displayFormatter={(v) => v || "—"}
        />
      ),
    },
    {
      accessorKey: "notes",
      size: 200,
      header: t("gabinet.employees.notes"),
      cell: ({ row }) => (
        <EditableCell
          value={row.original.notes ?? ""}
          config={{ type: "text", placeholder: "—" }}
          onChange={async (v) => { await updateEmployee({ organizationId, employeeId: row.original._id, notes: v }); }}
        />
      ),
    },
    {
      accessorKey: "isActive",
      size: 100,
      header: t("gabinet.employees.active"),
      cell: ({ row }) => (
        <EditableCell
          value={row.original.isActive}
          config={{ type: "boolean" }}
          onChange={async (v) => { await updateEmployee({ organizationId, employeeId: row.original._id, isActive: v }); }}
        />
      ),
    },
    {
      accessorKey: "createdAt",
      size: 130,
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("common.created")} />,
      cell: ({ getValue }) => new Date(getValue() as number).toLocaleDateString(),
    },
    {
      accessorKey: "updatedAt",
      size: 130,
      header: ({ column }) => <DataTableColumnHeader column={column} title={t("common.updated")} />,
      cell: ({ getValue }) => new Date(getValue() as number).toLocaleDateString(),
    },
  ];

  const rowActions = useCallback(
    (row: Employee) => [
      {
        label: t("common.edit"),
        onClick: () => navigate({ to: `/dashboard/gabinet/employees/${row._id}` }),
      },
      {
        label: t("common.delete"),
        icon: <Trash2 className="h-4 w-4" variant="stroke" />,
        onClick: async () => {
          if (window.confirm(t("gabinet.employees.confirmDelete"))) {
            await removeEmployee({ organizationId, employeeId: row._id });
          }
        },
      },
    ],
    [navigate, removeEmployee, organizationId, t]
  );

  const handleBulkAction = useCallback(
    async (action: string, selectedRows: Employee[]) => {
      if (action === "delete") {
        for (const row of selectedRows) {
          await removeEmployee({ organizationId, employeeId: row._id });
        }
      }
    },
    [removeEmployee, organizationId]
  );

  const roleFilterOptions = useMemo(() => {
    const roles = new Set<string>();
    for (const emp of (employees ?? [])) {
      if (emp.role) roles.add(emp.role);
    }
    return Array.from(roles).map((r) => ({ label: t(`gabinet.employees.roles.${r}`), value: r }));
  }, [employees, t]);

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("gabinet.employees.title")}
        description={t("gabinet.employees.description")}
        actions={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" variant="stroke" />
            {t("gabinet.employees.add")}
          </Button>
        }
      />

      <QuickActionBar
        actions={[
          {
            label: t('quickActions.newEmployee'),
            icon: <Plus className="mr-1.5 h-4 w-4" variant="stroke" />,
            onClick: () => setShowCreate(true),
            feature: "gabinet_employees",
            action: "create",
          },
        ]}
      />

      <CrmDataTable
        columns={columns}
        data={employees ?? []}
        stickyFirstColumn
        frozenColumns={2}
        searchKey="firstName"
        searchPlaceholder={t("gabinet.employees.searchPlaceholder")}
        enableBulkSelect
        bulkActions={[
          { label: t("common.delete"), value: "delete", variant: "destructive" },
        ]}
        onBulkAction={handleBulkAction}
        rowActions={rowActions}
        onRowClick={(row) => navigate({ to: `/dashboard/gabinet/employees/${row._id}` })}
        totalCount={(employees ?? []).length}
        filterableColumns={roleFilterOptions.length > 0 ? [
          { id: "role", title: t("gabinet.employees.role"), options: roleFilterOptions },
        ] : []}
      />

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
                {EMPLOYEE_ROLES.map((r) => (
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
