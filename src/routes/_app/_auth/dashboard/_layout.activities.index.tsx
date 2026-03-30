import { useState, useMemo, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { CrmDataTable, useColumnVisibility, useAllColumns } from "@/components/crm/enhanced-data-table";
import type { CrmColumn } from "@/components/crm/enhanced-data-table";
import { DataListFilterBar } from "@/components/crm/data-list-filter-bar";
import { SidePanel } from "@/components/crm/side-panel";
import { CustomFieldFormSection } from "@/components/custom-fields/custom-field-form-section";
import { useCustomFieldColumns } from "@/hooks/use-custom-field-columns";
import { useCustomFieldForm } from "@/hooks/use-custom-field-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/gabinet/rich-text-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SidebarFilterAction } from "@/components/layout/sidebar-filter-action";
import { useSidebarDispatch } from "@/components/layout/sidebar-context";
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  RotateCcw,
} from "@/lib/ez-icons";
import { getActivityIcon } from "@/lib/activity-icon-registry";
import { ToggleFilterButton } from "@/components/crm/filter-button";
import type { SavedView, FieldDef } from "@/components/crm/types";
import { Doc, Id } from "@cvx/_generated/dataModel";
import { useSavedViews } from "@/hooks/use-saved-views";
import { useTagDefinitions } from "@/hooks/use-tag-definitions";
import { useCategoryDefinitions } from "@/hooks/use-category-definitions";
import { TagsManagerSlideout } from "@/components/categories-tags/tags-manager-slideout";
import { CategoriesManagerSlideout } from "@/components/categories-tags/categories-manager-slideout";
import { TagsPicker } from "@/components/categories-tags/tags-picker";
import { CategoryPicker } from "@/components/categories-tags/category-picker";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/activities/"
)({
  component: ActivitiesPage,
});

type ScheduledActivity = Doc<"scheduledActivities">;
type ActivityRow = ScheduledActivity & { __cfValues: Record<string, unknown> };

function ActivitiesPage() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const { tags } = useTagDefinitions(organizationId);
  const { categories } = useCategoryDefinitions(organizationId, "activity");
  const systemViews: SavedView[] = useMemo(() => [
    { id: "all", name: t('activities.views.all'), isSystem: true, isDefault: true },
    { id: "open", name: t('activities.views.open'), isSystem: true, isDefault: false },
    { id: "due-today", name: t('activities.views.dueToday'), isSystem: true, isDefault: false },
    { id: "due-this-week", name: t('activities.views.dueThisWeek'), isSystem: true, isDefault: false },
    { id: "overdue", name: t('activities.views.overdue'), isSystem: true, isDefault: false },
  ], [t]);

  const filterableFields = useMemo((): FieldDef[] => [
    { id: "title", label: t('activities.title'), type: "text" },
    { id: "activityType", label: t('activities.activityType'), type: "text" },
    { id: "description", label: t('common.description'), type: "text" },
    {
      id: "isCompleted", label: t('activities.completed'), type: "select",
      options: [
        { label: t('common.yes'), value: "true" },
        { label: t('common.no'), value: "false" },
      ],
    },
    { id: "dueDate", label: t('activities.dueDate'), type: "date" },
    { id: "createdAt", label: t('common.created'), type: "date" },
    { id: "tagIds", label: t('common.tags', { defaultValue: "Tagi" }), type: "multiSelect" as const, options: tags.map((tag: any) => ({ label: tag.name, value: tag._id })) },
    { id: "categoryId", label: t('common.category', { defaultValue: "Kategoria" }), type: "select" as const, options: categories.map(cat => ({ label: cat.name, value: cat._id })) },
    {
      id: "sourceType",
      label: t("googleCalendar.calendar.source"),
      type: "select" as const,
      options: [
        { value: "manual", label: t("googleCalendar.calendar.sourceManual") },
        { value: "google", label: t("googleCalendar.calendar.sourceGoogle") },
        { value: "system", label: t("googleCalendar.calendar.sourceSystem") },
      ],
    },
  ], [t, tags, categories]);

  const {
    views, activeViewId, onViewChange, onCreateView, applyFilters,
  } = useSavedViews({ organizationId, entityType: "activity", systemViews });
  const [tagsSlideoutOpen, setTagsSlideoutOpen] = useState(false);
  const [categoriesSlideoutOpen, setCategoriesSlideoutOpen] = useState(false);
  const toolbarRef = useRef<React.ReactNode>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<ScheduledActivity | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  // Sidebar dispatch handlers
  useSidebarDispatch("openFilter", () => {
    // Toggle showCompleted as a simple filter toggle
    setShowCompleted((prev) => !prev);
  });
  useSidebarDispatch("upcomingOnly", () => {
    // Switch to "open" view which shows only incomplete activities
    onViewChange("open");
  });

  // Form state
  const [title, setTitle] = useState("");
  const [activityType, setActivityType] = useState("meeting");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [formTagIds, setFormTagIds] = useState<Id<"tagDefinitions">[]>([]);
  const [formCategoryId, setFormCategoryId] = useState<Id<"categoryDefinitions"> | undefined>(undefined);

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

  const typeFilterOptions: { label: string; value: string }[] = useMemo(() => {
    if (activityTypeDefs) {
      return activityTypeDefs.map((td) => ({ label: td.name, value: td.key }));
    }
    return [
      { label: t('activities.types.meeting'), value: "meeting" },
      { label: t('activities.types.call'), value: "call" },
      { label: t('activities.types.email'), value: "email" },
      { label: t('activities.types.task'), value: "task" },
    ];
  }, [activityTypeDefs, t]);

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
    let filtered = applyFilters(data);
    if (typeFilter) {
      filtered = filtered.filter((a) => a.activityType === typeFilter);
    }
    if (!showCompleted) {
      filtered = filtered.filter((a) => !a.isCompleted);
    }
    if (searchValue.trim()) {
      const q = searchValue.trim().toLowerCase();
      filtered = filtered.filter((a) => a.title.toLowerCase().includes(q));
    }
    return filtered;
  }, [activeViewId, allData, openData, dueTodayData, dueThisWeekData, overdueData, applyFilters, typeFilter, showCompleted, searchValue]);

  const activityIds = useMemo(
    () => activities.map((a) => a._id as string),
    [activities]
  );

  // Table columns: ALL custom fields (no activityTypeKey filter)
  const { columns: cfColumns, mergeCustomFieldValues } =
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
    setFormTagIds([]);
    setFormCategoryId(undefined);
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
    setFormTagIds((activity as any).tagIds ?? []);
    setFormCategoryId((activity as any).categoryId ?? undefined);
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
          tagIds: formTagIds.length > 0 ? formTagIds : undefined,
          categoryId: formCategoryId || undefined,
        });
      } else {
        activityId = await createActivity({
          organizationId,
          title: title.trim(),
          activityType,
          dueDate: new Date(dueDate).getTime(),
          ownerId: currentUser._id as Id<"users">,
          description: description.trim() || undefined,
          tagIds: formTagIds.length > 0 ? formTagIds : undefined,
          categoryId: formCategoryId || undefined,
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
  const baseColumns: CrmColumn<ActivityRow>[] = [
    {
      id: "title",
      label: t('common.title'),
      sortable: true,
      isRowHeader: true,
      render: (item) => <span className="font-medium">{item.title}</span>,
      getSortValue: (item) => item.title,
    },
    {
      id: "activityType",
      label: t('activities.activityType'),
      render: (item) => {
        const typeDef = activityTypeDefs?.find((td) => td.key === item.activityType);
        if (!typeDef) return item.activityType;
        const Icon = getActivityIcon(typeDef.icon);
        return (
          <span className="inline-flex items-center gap-1.5 text-sm">
            {Icon && (
              <span
                className="inline-flex h-5 w-5 items-center justify-center rounded"
                style={typeDef.color ? { color: typeDef.color } : undefined}
              >
                <Icon size={14} />
              </span>
            )}
            {typeDef.name}
          </span>
        );
      },
    },
    {
      id: "dueDate",
      label: t('activities.dueDate'),
      sortable: true,
      render: (item) => {
        const isOverdue = !item.isCompleted && item.dueDate < Date.now();
        return (
          <span className={isOverdue ? "text-red-600 font-medium" : ""}>
            {new Date(item.dueDate).toLocaleDateString()}
          </span>
        );
      },
      getSortValue: (item) => item.dueDate,
    },
    {
      id: "isCompleted",
      label: t('activities.completed'),
      render: (item) => (item.isCompleted ? "\u2713" : "\u2014"),
    },
    {
      id: "sourceType",
      label: t("googleCalendar.calendar.source"),
      render: (item) => {
        const source = item.sourceType ?? "manual";
        const labels: Record<string, string> = {
          manual: t("googleCalendar.calendar.sourceManual"),
          google: t("googleCalendar.calendar.sourceGoogle"),
          system: t("googleCalendar.calendar.sourceSystem"),
        };
        return (
          <Badge variant={source === "google" ? "default" : "secondary"}>
            {labels[source] ?? source}
          </Badge>
        );
      },
    },
  ];

  const mergedColumns: CrmColumn<ActivityRow>[] = useMemo(
    () => [...baseColumns, ...cfColumns],
    [baseColumns, cfColumns]
  );
  const { allColumns: columns, defaultHidden } = useAllColumns(mergedColumns, filterableFields);
  const { hiddenColumnIds, toggleColumn } = useColumnVisibility(defaultHidden);

  const rowActions = (row: ActivityRow) => [
    {
      label: t('common.edit'),
      icon: <Pencil className="h-4 w-4" variant="stroke" />,
      onClick: () => openEditPanel(row),
    },
    {
      label: row.isCompleted ? t('activities.markIncomplete') : t('activities.markComplete'),
      icon: row.isCompleted ? (
        <RotateCcw className="h-4 w-4" variant="stroke" />
      ) : (
        <Check className="h-4 w-4" variant="stroke" />
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
      icon: <Trash2 className="h-4 w-4" variant="stroke" />,
      onClick: () => removeActivity({ organizationId, activityId: row._id }),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('activities.pageTitle', 'Aktywności')}
        description={t('activities.description')}
        actions={
          <Button onClick={openCreatePanel}>
            <Plus className="mr-2 h-4 w-4" variant="stroke" />
            {t('activities.addActivity')}
          </Button>
        }
      />

      <DataListFilterBar
        views={views as any}
        activeViewId={activeViewId}
        onViewChange={onViewChange}
        onCreateView={onCreateView}
        filterableFields={filterableFields}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder={t('activities.searchPlaceholder')}
        onTagsManage={() => setTagsSlideoutOpen(true)}
        onCategoriesManage={() => setCategoriesSlideoutOpen(true)}
        columnDefs={columns.map(c => ({ id: c.id, label: c.label ?? c.id }))}
        hiddenColumnIds={hiddenColumnIds}
        onToggleColumn={toggleColumn}
        renderToolbar={(toolbar) => { toolbarRef.current = toolbar; return null; }}
      />

      <div className="flex items-center gap-2 py-2">
        <SidebarFilterAction
          dispatchId="openFilter"
          options={typeFilterOptions}
          selected={typeFilter ? [typeFilter] : []}
          onChange={(vals) => setTypeFilter(vals[0] || null)}
          label={t('activities.actions.filterByType')}
          singleSelect
        />
        <ToggleFilterButton
          label={t('activities.actions.showCompleted')}
          activeLabel={t('activities.actions.hideCompleted')}
          icon={<Check className="mr-1.5 h-4 w-4" variant="stroke" />}
          active={showCompleted}
          onChange={setShowCompleted}
        />
      </div>

      <CrmDataTable
        columns={columns}
        hiddenColumnIds={hiddenColumnIds}
        data={tableData}
        rowActions={rowActions}
        enableBulkSelect
        isLoading={isLoading}
        toolbar={toolbarRef.current}
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
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('activities.activityTitle')}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('activities.activityType')}</Label>
            <Select value={activityType} onValueChange={setActivityType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {activityTypeDefs?.map((td) => (
                  <SelectItem key={td.key} value={td.key}>
                    {td.name}
                  </SelectItem>
                )) ?? (
                  <>
                    <SelectItem value="meeting">{t('activities.types.meeting')}</SelectItem>
                    <SelectItem value="call">{t('activities.types.call')}</SelectItem>
                    <SelectItem value="email">{t('activities.types.email')}</SelectItem>
                    <SelectItem value="task">{t('activities.types.task')}</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>
              {t('activities.dueDate')} <span className="text-destructive">*</span>
            </Label>
            <Input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('common.owner')}</Label>
            <Input
              value={currentUser?.name ?? currentUser?.email ?? "Current User"}
              disabled
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('common.description')}</Label>
            <RichTextEditor
              value={description}
              onChange={(val) => setDescription(val ?? "")}
              placeholder={t('activities.addNotes')}
              minHeight="80px"
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

          {/* Tags */}
          {tags.length > 0 && (
            <div className="space-y-1.5">
              <Label>{t('common.tags', { defaultValue: "Tagi" })}</Label>
              <TagsPicker tags={tags} selectedIds={formTagIds} onChange={setFormTagIds} />
            </div>
          )}

          {/* Category */}
          {categories.length > 0 && (
            <div className="space-y-1.5">
              <Label>{t('common.category', { defaultValue: "Kategoria" })}</Label>
              <CategoryPicker categories={categories} selectedId={formCategoryId} onChange={setFormCategoryId} />
            </div>
          )}
        </div>
      </SidePanel>

      <TagsManagerSlideout
        isOpen={tagsSlideoutOpen}
        onOpenChange={setTagsSlideoutOpen}
        organizationId={organizationId}
        tags={tags}
      />
      <CategoriesManagerSlideout
        isOpen={categoriesSlideoutOpen}
        onOpenChange={setCategoriesSlideoutOpen}
        organizationId={organizationId}
        entityType="activity"
        categories={categories}
      />
    </div>
  );
}
