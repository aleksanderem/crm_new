import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { CrmDataTable } from "@/components/crm/enhanced-data-table";
import { SavedViewsTabs } from "@/components/crm/saved-views-tabs";
import { SidePanel } from "@/components/crm/side-panel";
import { CustomFieldFormSection } from "@/components/custom-fields/custom-field-form-section";
import { useCustomFieldColumns } from "@/hooks/use-custom-field-columns";
import { useCustomFieldForm } from "@/hooks/use-custom-field-form";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  RotateCcw,
} from "lucide-react";
import { getActivityIcon } from "@/lib/activity-icon-registry";
import type { ColumnDef } from "@tanstack/react-table";
import type { SavedView, FieldDef } from "@/components/crm/types";
import { Doc, Id } from "@cvx/_generated/dataModel";
import { useSavedViews } from "@/hooks/use-saved-views";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/activities/"
)({
  component: ActivitiesPage,
});

type ScheduledActivity = Doc<"scheduledActivities">;
type ActivityRow = ScheduledActivity & { __cfValues: Record<string, unknown> };

const inputClasses =
  "h-9 w-full rounded-md border bg-transparent px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

function ActivitiesPage() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const systemViews: SavedView[] = useMemo(() => [
    { id: "all", name: t('activities.views.all'), isSystem: true, isDefault: true },
    { id: "open", name: t('activities.views.open'), isSystem: true, isDefault: false },
    { id: "due-today", name: t('activities.views.dueToday'), isSystem: true, isDefault: false },
    { id: "due-this-week", name: t('activities.views.dueThisWeek'), isSystem: true, isDefault: false },
    { id: "overdue", name: t('activities.views.overdue'), isSystem: true, isDefault: false },
  ], [t]);

  const filterableFields = useMemo((): FieldDef[] => [
    { id: "activityType", label: t('activities.activityType'), type: "text" },
    {
      id: "isCompleted", label: t('activities.completed'), type: "select",
      options: [
        { label: t('common.yes'), value: "true" },
        { label: t('common.no'), value: "false" },
      ],
    },
    { id: "dueDate", label: t('activities.dueDate'), type: "date" },
  ], [t]);

  const {
    views, activeViewId, onViewChange, onCreateView, onUpdateView, onDeleteView, applyFilters,
  } = useSavedViews({ organizationId, entityType: "activity", systemViews });
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<ScheduledActivity | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [activityType, setActivityType] = useState("meeting");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");

  // Queries based on active view
  const { data: allData, isLoading: allLoading } = useQuery(
    convexQuery(api.scheduledActivities.list, {
      organizationId,
      paginationOpts: { numItems: 100, cursor: null },
    })
  );

  const { data: openData } = useQuery(
    convexQuery(api.scheduledActivities.list, {
      organizationId,
      paginationOpts: { numItems: 100, cursor: null },
      isCompleted: false,
    })
  );

  const { data: dueTodayData } = useQuery(
    convexQuery(api.scheduledActivities.listDueToday, { organizationId })
  );

  const { data: dueThisWeekData } = useQuery(
    convexQuery(api.scheduledActivities.listDueThisWeek, { organizationId })
  );

  const { data: overdueData } = useQuery(
    convexQuery(api.scheduledActivities.listOverdue, { organizationId })
  );

  const { data: currentUser } = useQuery(
    convexQuery(api.app.getCurrentUser, {})
  );

  const { data: activityTypeDefs } = useQuery(
    convexQuery(api.activityTypes.list, { organizationId })
  );

  // Mutations
  const createActivity = useMutation(api.scheduledActivities.create);
  const updateActivity = useMutation(api.scheduledActivities.update);
  const removeActivity = useMutation(api.scheduledActivities.remove);
  const markComplete = useMutation(api.scheduledActivities.markComplete);
  const markIncomplete = useMutation(api.scheduledActivities.markIncomplete);

  const activities = useMemo(() => {
    let data: ScheduledActivity[];
    switch (activeViewId) {
      case "open":
        data = openData?.page ?? [];
        break;
      case "due-today":
        data = dueTodayData ?? [];
        break;
      case "due-this-week":
        data = dueThisWeekData ?? [];
        break;
      case "overdue":
        data = overdueData ?? [];
        break;
      default:
        data = allData?.page ?? [];
    }
    return applyFilters(data);
  }, [activeViewId, allData, openData, dueTodayData, dueThisWeekData, overdueData, applyFilters]);

  const activityIds = useMemo(
    () => activities.map((a) => a._id as string),
    [activities]
  );

  // Table columns: ALL custom fields (no activityTypeKey filter)
  const { columns: cfColumns, defaultColumnVisibility, mergeCustomFieldValues } =
    useCustomFieldColumns<ScheduledActivity>({ organizationId, entityType: "activity", entityIds: activityIds });

  // Form: type-scoped custom fields
  const { definitions: cfDefs, values: cfValues, onChange: onCfChange,
          resetValues: resetCfValues, saveValues: saveCfValues } =
    useCustomFieldForm({ organizationId, entityType: "activity", activityTypeKey: activityType || undefined });

  const tableData = mergeCustomFieldValues(activities);

  const isLoading = activeViewId === "all" ? allLoading : false;

  const resetForm = () => {
    setTitle("");
    setActivityType("meeting");
    setDueDate("");
    setDescription("");
    resetCfValues();
    setEditingActivity(null);
  };

  const openCreatePanel = () => {
    resetForm();
    setPanelOpen(true);
  };

  const openEditPanel = (activity: ActivityRow) => {
    setEditingActivity(activity);
    setTitle(activity.title);
    setActivityType(activity.activityType);
    setDueDate(new Date(activity.dueDate).toISOString().slice(0, 16));
    setDescription(activity.description ?? "");
    setPanelOpen(true);
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim() || !dueDate || !currentUser) return;
    setIsSubmitting(true);
    try {
      let activityId: string;
      if (editingActivity) {
        activityId = await updateActivity({
          organizationId,
          activityId: editingActivity._id,
          title: title.trim(),
          activityType,
          dueDate: new Date(dueDate).getTime(),
          description: description.trim() || undefined,
        });
      } else {
        activityId = await createActivity({
          organizationId,
          title: title.trim(),
          activityType,
          dueDate: new Date(dueDate).getTime(),
          ownerId: currentUser._id as Id<"users">,
          description: description.trim() || undefined,
        });
      }
      // Save custom field values if any
      await saveCfValues(activityId);
      setPanelOpen(false);
      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Base columns
  const baseColumns: ColumnDef<ActivityRow, unknown>[] = [
    {
      accessorKey: "title",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('common.title')} />
      ),
      cell: ({ getValue }) => (
        <span className="font-medium">{getValue() as string}</span>
      ),
    },
    {
      accessorKey: "activityType",
      header: t('activities.activityType'),
      cell: ({ getValue }) => {
        const typeKey = getValue() as string;
        const typeDef = activityTypeDefs?.find((t) => t.key === typeKey);
        if (!typeDef) return typeKey;
        const Icon = getActivityIcon(typeDef.icon);
        return (
          <Badge variant="secondary" className={typeDef.color ?? ""}>
            {Icon && <Icon className="mr-1 h-3 w-3" />}
            {typeDef.name}
          </Badge>
        );
      },
    },
    {
      accessorKey: "dueDate",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('activities.dueDate')} />
      ),
      cell: ({ row }) => {
        const dueDate = row.original.dueDate;
        const isOverdue = !row.original.isCompleted && dueDate < Date.now();
        return (
          <span className={isOverdue ? "text-red-600 font-medium" : ""}>
            {new Date(dueDate).toLocaleDateString()}
          </span>
        );
      },
    },
    {
      accessorKey: "isCompleted",
      header: t('activities.completed'),
      cell: ({ row }) => (
        <Checkbox
          checked={row.original.isCompleted}
          onCheckedChange={(checked) => {
            if (checked) {
              markComplete({ organizationId, activityId: row.original._id });
            } else {
              markIncomplete({ organizationId, activityId: row.original._id });
            }
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ),
    },
  ];

  const columns = useMemo(
    () => [...baseColumns, ...cfColumns],
    [baseColumns, cfColumns]
  );

  const rowActions = (row: ActivityRow) => [
    {
      label: t('common.edit'),
      icon: <Pencil className="h-3.5 w-3.5" />,
      onClick: () => openEditPanel(row),
    },
    {
      label: row.isCompleted ? t('activities.markIncomplete') : t('activities.markComplete'),
      icon: row.isCompleted ? (
        <RotateCcw className="h-3.5 w-3.5" />
      ) : (
        <Check className="h-3.5 w-3.5" />
      ),
      onClick: () => {
        if (row.isCompleted) {
          markIncomplete({ organizationId, activityId: row._id });
        } else {
          markComplete({ organizationId, activityId: row._id });
        }
      },
    },
    {
      label: t('common.delete'),
      icon: <Trash2 className="h-3.5 w-3.5" />,
      onClick: () => removeActivity({ organizationId, activityId: row._id }),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('activities.title')}
        description={t('activities.description')}
        actions={
          <Button onClick={openCreatePanel}>
            <Plus className="mr-2 h-4 w-4" />
            {t('activities.addActivity')}
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
      />

      <CrmDataTable
        columns={columns}
        data={tableData}
        rowActions={rowActions}
        enableBulkSelect
        searchKey="title"
        searchPlaceholder={t('activities.searchPlaceholder')}
        isLoading={isLoading}
        defaultColumnVisibility={defaultColumnVisibility}
      />

      <SidePanel
        open={panelOpen}
        onOpenChange={(open) => {
          setPanelOpen(open);
          if (!open) resetForm();
        }}
        title={editingActivity ? t('activities.editActivity') : t('activities.newActivity')}
        description={editingActivity ? t('activities.updateDescription') : t('activities.createDescription')}
        onSubmit={handleSubmit}
        submitLabel={editingActivity ? t('common.update') : t('common.create')}
        isSubmitting={isSubmitting}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>
              {t('common.title')} <span className="text-destructive">*</span>
            </Label>
            <input
              className={inputClasses}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('activities.activityTitle')}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('activities.activityType')}</Label>
            <select
              className={inputClasses}
              value={activityType}
              onChange={(e) => setActivityType(e.target.value)}
            >
              {activityTypeDefs?.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name}
                </option>
              )) ?? (
                <>
                  <option value="meeting">{t('activities.types.meeting')}</option>
                  <option value="call">{t('activities.types.call')}</option>
                  <option value="email">{t('activities.types.email')}</option>
                  <option value="task">{t('activities.types.task')}</option>
                </>
              )}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>
              {t('activities.dueDate')} <span className="text-destructive">*</span>
            </Label>
            <input
              type="datetime-local"
              className={inputClasses}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('common.owner')}</Label>
            <input
              className={inputClasses}
              value={currentUser?.name ?? currentUser?.email ?? "Current User"}
              disabled
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('common.description')}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('activities.addNotes')}
              rows={3}
            />
          </div>

          {/* Custom fields for selected activity type */}
          {cfDefs && cfDefs.length > 0 && (
            <CustomFieldFormSection
              definitions={cfDefs}
              values={cfValues}
              onChange={onCfChange}
            />
          )}
        </div>
      </SidePanel>
    </div>
  );
}
