import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { CrmDataTable } from "@/components/crm/enhanced-data-table";
import { SavedViewsTabs } from "@/components/crm/saved-views-tabs";
import { MiniChartsRow } from "@/components/crm/mini-charts";
import { SidePanel } from "@/components/crm/side-panel";
import { PatientForm } from "@/components/forms/patient-form";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { Plus, Heart, Trash2, Download } from "@/lib/ez-icons";
import { useCsvExport } from "@/components/csv/csv-export-button";
import { EditableCell } from "@/components/data-table/editable-cell";
import { genderOptions } from "@/lib/options";
import { useSidebarDispatch } from "@/components/layout/sidebar-context";
import { ColumnDef } from "@tanstack/react-table";
import { Doc } from "@cvx/_generated/dataModel";
import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/layout/empty-state";
import type { SavedView, TimeRange, FieldDef } from "@/components/crm/types";
import type { MiniChartData } from "@/components/crm/mini-charts";
import { useSavedViews } from "@/hooks/use-saved-views";
import { QuickActionBar } from "@/components/crm/quick-action-bar";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/patients/",
)({
  component: PatientsIndex,
});

type Patient = Doc<"gabinetPatients">;

const DEFAULT_HIDDEN: Record<string, boolean> = {
  pesel: false,
  dateOfBirth: false,
  gender: false,
  allergies: false,
  bloodType: false,
  medicalNotes: false,
  updatedAt: false,
};

function PatientsIndex() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const createPatient = useMutation(api.gabinet.patients.create);
  const updatePatient = useMutation(api.gabinet.patients.update);
  const removePatient = useMutation(api.gabinet.patients.remove);

  const [panelOpen, setPanelOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [leftTimeRange, setLeftTimeRange] = useState<TimeRange>("last30days");
  const [rightTimeRange, setRightTimeRange] = useState<TimeRange>("all");
  const [savedViewsDialogOpen, setSavedViewsDialogOpen] = useState(false);

  const { handleExport } = useCsvExport(organizationId, "patients", "pacjenci");

  // Sidebar dispatch handlers
  useSidebarDispatch("exportCsv", () => handleExport());
  useSidebarDispatch("importCsv", () => {
    // Could open import dialog - for now show toast
    // Import not implemented for patients yet
  });
  useSidebarDispatch("openSearch", () => {
    // Focus on the search input if present
    const searchInput = document.querySelector<HTMLInputElement>(
      'input[type="search"], input[placeholder*="Szukaj"], input[placeholder*="Search"]',
    );
    searchInput?.focus();
  });
  useSidebarDispatch("openFilter", () => {
    // Toggle active/inactive filter
    const activeView = views.find((v) => v.id === "active");
    if (activeView) onViewChange("active");
  });
  useSidebarDispatch("savedViews", () => setSavedViewsDialogOpen(true));

  const systemViews = useMemo(
    (): SavedView[] => [
      {
        id: "all",
        name: t("gabinet.patients.views.all"),
        isSystem: true,
        isDefault: true,
      },
      {
        id: "active",
        name: t("gabinet.patients.views.active"),
        isSystem: true,
        isDefault: false,
      },
      {
        id: "inactive",
        name: t("gabinet.patients.views.inactive"),
        isSystem: true,
        isDefault: false,
      },
    ],
    [t],
  );

  const filterableFields = useMemo(
    (): FieldDef[] => [
      {
        id: "referralSource",
        label: t("gabinet.patients.referralSource"),
        type: "text",
      },
      { id: "email", label: t("common.email"), type: "text" },
      { id: "createdAt", label: t("common.created"), type: "date" },
    ],
    [t],
  );

  const { data, isLoading } = useQuery(
    convexQuery(api.gabinet.patients.list, {
      organizationId,
      paginationOpts: { numItems: 100, cursor: null },
    }),
  );

  const patients = data?.page ?? [];

  const {
    views,
    activeViewId,
    onViewChange,
    onCreateView,
    onUpdateView,
    onDeleteView,
    columnVisibility,
    sorting,
    setColumnVisibility,
    setSorting,
    applyFilters,
  } = useSavedViews({
    organizationId,
    entityType: "gabinetPatient",
    systemViews,
    defaultColumnVisibility: DEFAULT_HIDDEN,
  });

  const filteredPatients = useMemo(() => {
    let data: Patient[];
    switch (activeViewId) {
      case "active":
        data = patients.filter((p) => p.isActive);
        break;
      case "inactive":
        data = patients.filter((p) => !p.isActive);
        break;
      default:
        data = patients;
    }
    return applyFilters(data);
  }, [patients, activeViewId, applyFilters]);

  const patientsByDay = useMemo<MiniChartData[]>(() => {
    const dayMap = new Map<string, number>();
    for (const p of patients) {
      const day = new Date(p.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
    }
    return Array.from(dayMap.entries())
      .map(([label, value]) => ({ label, value }))
      .slice(-14);
  }, [patients]);

  const patientsBySource = useMemo<MiniChartData[]>(() => {
    const srcMap = new Map<string, number>();
    for (const p of patients) {
      const src = p.referralSource ?? "Unknown";
      srcMap.set(src, (srcMap.get(src) ?? 0) + 1);
    }
    return Array.from(srcMap.entries()).map(([label, value]) => ({
      label,
      value,
    }));
  }, [patients]);

  const columns: ColumnDef<Patient>[] = [
    {
      accessorKey: "firstName",
      size: 200,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("gabinet.patients.contact")}
        />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-xs">
              {row.original.firstName[0]}
              {row.original.lastName[0]}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium">
            {row.original.firstName} {row.original.lastName}
          </span>
          {!row.original.isActive && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              {t("common.inactive")}
            </Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: "email",
      size: 200,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("common.email")} />
      ),
      cell: ({ row }) => (
        <EditableCell
          value={row.original.email ?? ""}
          config={{ type: "text", placeholder: "email@example.com" }}
          onChange={async (v) => {
            await updatePatient({
              organizationId,
              patientId: row.original._id,
              email: v,
            });
          }}
        />
      ),
    },
    {
      accessorKey: "phone",
      size: 150,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("common.phone")} />
      ),
      cell: ({ row }) => (
        <EditableCell
          value={row.original.phone ?? ""}
          config={{ type: "text", placeholder: "+48..." }}
          onChange={async (v) => {
            await updatePatient({
              organizationId,
              patientId: row.original._id,
              phone: v,
            });
          }}
        />
      ),
    },
    {
      accessorKey: "pesel",
      size: 150,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("gabinet.patients.pesel")}
        />
      ),
      cell: ({ row }) => (
        <EditableCell
          value={row.original.pesel ?? ""}
          config={{ type: "text", placeholder: "PESEL" }}
          onChange={async (v) => {
            await updatePatient({
              organizationId,
              patientId: row.original._id,
              pesel: v,
            });
          }}
        />
      ),
    },
    {
      accessorKey: "dateOfBirth",
      size: 130,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("gabinet.patients.dateOfBirth")}
        />
      ),
      cell: ({ row }) => (
        <EditableCell
          value={row.original.dateOfBirth ?? ""}
          config={{ type: "date" }}
          onChange={async (v) => {
            await updatePatient({
              organizationId,
              patientId: row.original._id,
              dateOfBirth: v,
            });
          }}
        />
      ),
    },
    {
      accessorKey: "gender",
      size: 150,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("gabinet.patients.gender")}
        />
      ),
      cell: ({ row }) => (
        <EditableCell
          value={row.original.gender ?? ""}
          config={{
            type: "select",
            options: genderOptions(t),
            placeholder: "—",
          }}
          onChange={async (v) => {
            await updatePatient({
              organizationId,
              patientId: row.original._id,
              gender: v as any,
            });
          }}
        />
      ),
    },
    {
      accessorKey: "referralSource",
      size: 150,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("gabinet.patients.referralSource")}
        />
      ),
      cell: ({ row }) => (
        <EditableCell
          value={row.original.referralSource ?? ""}
          config={{ type: "text", placeholder: "—" }}
          onChange={async (v) => {
            await updatePatient({
              organizationId,
              patientId: row.original._id,
              referralSource: v,
            });
          }}
        />
      ),
      filterFn: (row, id, value) =>
        (value as string[]).includes(row.getValue(id)),
    },
    {
      accessorKey: "allergies",
      size: 200,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("gabinet.patients.allergies")}
        />
      ),
      cell: ({ row }) => (
        <EditableCell
          value={row.original.allergies ?? ""}
          config={{ type: "text", placeholder: "—" }}
          onChange={async (v) => {
            await updatePatient({
              organizationId,
              patientId: row.original._id,
              allergies: v,
            });
          }}
        />
      ),
    },
    {
      accessorKey: "bloodType",
      size: 150,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("gabinet.patients.bloodType")}
        />
      ),
      cell: ({ row }) => (
        <EditableCell
          value={row.original.bloodType ?? ""}
          config={{ type: "text", placeholder: "—" }}
          onChange={async (v) => {
            await updatePatient({
              organizationId,
              patientId: row.original._id,
              bloodType: v,
            });
          }}
        />
      ),
    },
    {
      accessorKey: "medicalNotes",
      size: 200,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("gabinet.patients.medicalNotes")}
        />
      ),
      cell: ({ row }) => (
        <EditableCell
          value={row.original.medicalNotes ?? ""}
          config={{ type: "text", placeholder: "—" }}
          onChange={async (v) => {
            await updatePatient({
              organizationId,
              patientId: row.original._id,
              medicalNotes: v,
            });
          }}
        />
      ),
    },
    {
      accessorKey: "createdAt",
      size: 130,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("common.created")} />
      ),
      cell: ({ getValue }) =>
        new Date(getValue() as number).toLocaleDateString(),
    },
    {
      accessorKey: "updatedAt",
      size: 130,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("common.updated")} />
      ),
      cell: ({ getValue }) =>
        new Date(getValue() as number).toLocaleDateString(),
    },
  ];

  const handleCreate = useCallback(
    async (formData: {
      firstName: string;
      lastName: string;
      email: string;
      phone?: string;
      pesel?: string;
      dateOfBirth?: string;
      gender?: "male" | "female" | "other";
      address?: { street?: string; city?: string; postalCode?: string };
      medicalNotes?: string;
      allergies?: string;
      bloodType?: string;
      emergencyContactName?: string;
      emergencyContactPhone?: string;
      referralSource?: string;
    }) => {
      setIsCreating(true);
      try {
        await createPatient({
          organizationId,
          ...formData,
        });
        setPanelOpen(false);
      } finally {
        setIsCreating(false);
      }
    },
    [createPatient, organizationId],
  );

  const handleBulkAction = useCallback(
    async (action: string, selectedRows: Patient[]) => {
      if (action === "delete") {
        for (const row of selectedRows) {
          await removePatient({ organizationId, patientId: row._id });
        }
      }
    },
    [removePatient, organizationId],
  );

  const rowActions = useCallback(
    (row: Patient) => [
      {
        label: t("common.edit"),
        onClick: () =>
          navigate({ to: `/dashboard/gabinet/patients/${row._id}` }),
      },
      {
        label: t("common.delete"),
        icon: <Trash2 className="h-4 w-4" variant="stroke" />,
        onClick: async () => {
          if (window.confirm(t("gabinet.patients.confirmDelete"))) {
            await removePatient({ organizationId, patientId: row._id });
          }
        },
      },
    ],
    [navigate, removePatient, organizationId, t],
  );

  const sourceOptions = useMemo(() => {
    const sources = new Set<string>();
    for (const p of patients) {
      if (p.referralSource) sources.add(p.referralSource);
    }
    return Array.from(sources).map((s) => ({ label: s, value: s }));
  }, [patients]);

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("gabinet.patients.title")}
        description={t("gabinet.patients.description")}
        actions={
          <Button onClick={() => setPanelOpen(true)}>
            <Plus className="mr-2 h-4 w-4" variant="stroke" />
            {t("gabinet.patients.addPatient")}
          </Button>
        }
      />

      <SavedViewsTabs
        views={views}
        activeViewId={activeViewId}
        onViewChange={onViewChange}
        onCreateView={onCreateView}
        onUpdateView={onUpdateView}
        onDeleteView={onDeleteView}
        filterableFields={filterableFields}
        createDialogOpen={savedViewsDialogOpen}
        onCreateDialogOpenChange={setSavedViewsDialogOpen}
      />

      <MiniChartsRow
        leftChart={{
          title: t("gabinet.patients.byDay"),
          data: patientsByDay,
          chartType: "line",
          timeRange: leftTimeRange,
          onTimeRangeChange: setLeftTimeRange,
        }}
        rightChart={{
          title: t("gabinet.patients.bySource"),
          data: patientsBySource,
          chartType: "bar",
          timeRange: rightTimeRange,
          onTimeRangeChange: setRightTimeRange,
        }}
      />

      <QuickActionBar
        actions={[
          {
            label: t("quickActions.newPatient"),
            icon: <Plus className="mr-1.5 h-4 w-4" variant="stroke" />,
            onClick: () => setPanelOpen(true),
            feature: "gabinet_patients",
            action: "create",
          },
        ]}
      />

      {!isLoading && filteredPatients.length === 0 ? (
        <EmptyState
          icon={Heart}
          title={t("gabinet.patients.emptyTitle")}
          description={t("gabinet.patients.emptyDescription")}
          action={
            <Button onClick={() => setPanelOpen(true)}>
              <Plus className="mr-2 h-4 w-4" variant="stroke" />
              {t("gabinet.patients.addPatient")}
            </Button>
          }
        />
      ) : (
        <CrmDataTable
          columns={columns}
          data={filteredPatients}
          stickyFirstColumn
          frozenColumns={2}
          searchKey="firstName"
          searchPlaceholder={t("gabinet.patients.searchPlaceholder")}
          isLoading={isLoading}
          enableBulkSelect
          bulkActions={[
            {
              label: t("common.delete"),
              value: "delete",
              variant: "destructive",
            },
          ]}
          onBulkAction={handleBulkAction}
          rowActions={rowActions}
          onRowClick={(row) =>
            navigate({ to: `/dashboard/gabinet/patients/${row._id}` })
          }
          totalCount={filteredPatients.length}
          filterableColumns={
            sourceOptions.length > 0
              ? [
                  {
                    id: "referralSource",
                    title: t("gabinet.patients.referralSource"),
                    options: sourceOptions,
                  },
                ]
              : []
          }
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={setColumnVisibility}
          sorting={sorting}
          onSortingChange={setSorting}
          toolbarDropdownActions={[
            {
              label: t("csv.export"),
              icon: <Download className="h-4 w-4" variant="stroke" />,
              onClick: handleExport,
            },
          ]}
        />
      )}

      <SidePanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        title={t("gabinet.patients.createPatient")}
        description={t("gabinet.patients.createDescription")}
      >
        <PatientForm
          onSubmit={handleCreate}
          onCancel={() => setPanelOpen(false)}
          isSubmitting={isCreating}
        />
      </SidePanel>
    </div>
  );
}
