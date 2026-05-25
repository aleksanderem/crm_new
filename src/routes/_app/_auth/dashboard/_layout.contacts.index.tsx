import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useSupabaseContactsList } from "@/hooks/use-supabase-contacts";
import { useSupabaseContactIdsLinkedToCompany } from "@/hooks/use-supabase-relationships";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { CrmDataTable, type CrmColumn, useColumnVisibility, useAllColumns } from "@/components/crm/enhanced-data-table";
import { DataListFilterBar } from "@/components/crm/data-list-filter-bar";
import { MiniChartsRow } from "@/components/crm/mini-charts";
import { SidePanel } from "@/components/crm/side-panel";
import { ContactForm } from "@/components/forms/contact-form";
import { Button } from "@/components/ui/button";
import { AvatarLabelGroup } from "@untitled/base/avatar/avatar-label-group";
import { Plus, Trash2, Upload, Download, X } from "@/lib/ez-icons";
import { useCsvExport } from "@/components/csv/csv-export-button";
import { CsvImportDialog } from "@/components/csv/csv-import-dialog";
import type { MappedContact } from "@/lib/supabase/mappers/contacts";
import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { SavedView, TimeRange, FieldDef } from "@/components/crm/types";
import type { MiniChartData } from "@/components/crm/mini-charts";
import { useSavedViews } from "@/hooks/use-saved-views";
import { useSidebarDispatch } from "@/components/layout/sidebar-context";
import { useCustomFieldColumns } from "@/hooks/use-custom-field-columns";
import { useTagDefinitions } from "@/hooks/use-tag-definitions";
import { useCategoryDefinitions } from "@/hooks/use-category-definitions";
import { TagsManagerSlideout } from "@/components/categories-tags/tags-manager-slideout";
import { CategoriesManagerSlideout } from "@/components/categories-tags/categories-manager-slideout";
import { formatPhoneNumber } from "@/lib/phone";

type ContactNudgeFilter = "unlinked-company";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/contacts/"
)({
  component: ContactsIndex,
  validateSearch: (search: Record<string, unknown>): { nudge?: ContactNudgeFilter } => {
    const nudge =
      search.nudge === "unlinked-company"
        ? (search.nudge as ContactNudgeFilter)
        : undefined;
    return { nudge };
  },
});

type Contact = MappedContact;

function ContactsIndex() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const { nudge: nudgeFilter } = useSearch({ from: Route.id });
  const createContact = useAction(api.contacts.create);
  const removeContact = useAction(api.contacts.remove);
  const setCustomFieldValues = useAction(api.customFields.setValues);

  const [panelOpen, setPanelOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [savedViewsDialogOpen, setSavedViewsDialogOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [activeFilters, setActiveFilters] = useState<import("@/components/crm/types").FilterCondition[]>([]);
  const [leftTimeRange, setLeftTimeRange] = useState<TimeRange>("last30days");
  const [rightTimeRange, setRightTimeRange] = useState<TimeRange>("all");
  const { handleExport } = useCsvExport(organizationId, "contacts");
  const { tags } = useTagDefinitions(organizationId);
  const { categories } = useCategoryDefinitions(organizationId, "contact");
  const [tagsSlideoutOpen, setTagsSlideoutOpen] = useState(false);
  const [categoriesSlideoutOpen, setCategoriesSlideoutOpen] = useState(false);

  // Sidebar action dispatches
  useSidebarDispatch("importCsv", () => setImportOpen(true));
  useSidebarDispatch("exportCsv", () => handleExport());
  useSidebarDispatch("savedViews", () => setSavedViewsDialogOpen(true));
  useSidebarDispatch("manageTags", () => setTagsSlideoutOpen(true));
  useSidebarDispatch("manageCategories", () => setCategoriesSlideoutOpen(true));

  const systemViews = useMemo((): SavedView[] => [
    { id: "all", name: t('contacts.views.all'), isSystem: true, isDefault: true },
    { id: "my", name: t('contacts.views.my'), isSystem: true, isDefault: false },
    { id: "recent", name: t('contacts.views.recent'), isSystem: true, isDefault: false },
  ], [t]);

  const filterableFields = useMemo((): FieldDef[] => [
    { id: "firstName", label: t('contacts.firstName'), type: "text" },
    { id: "lastName", label: t('contacts.lastName'), type: "text" },
    { id: "email", label: t('common.email'), type: "text" },
    { id: "phone", label: t('common.phone'), type: "text" },
    { id: "title", label: t('contacts.title'), type: "text" },
    { id: "source", label: t('common.source'), type: "text" },
    { id: "createdAt", label: t('common.created'), type: "date" },
    { id: "tagIds", label: t('common.tags', { defaultValue: "Tagi" }), type: "multiSelect" as const, options: tags.map(tag => ({ label: tag.name, value: tag._id })) },
    { id: "categoryId", label: t('common.category', { defaultValue: "Kategoria" }), type: "select" as const, options: categories.map(cat => ({ label: cat.name, value: cat._id })) },
  ], [t, tags, categories]);

  const { data: contacts = [], isLoading } = useSupabaseContactsList(organizationId);
  const { data: contactIdsLinkedToCompany } = useSupabaseContactIdsLinkedToCompany(
    organizationId,
    { enabled: nudgeFilter === "unlinked-company" },
  );

  const contactIds = useMemo(() => contacts.map((c) => c._id), [contacts]);

  const { definitions: cfDefs, columns: cfColumns, mergeCustomFieldValues } =
    useCustomFieldColumns<Contact>({ organizationId, entityType: "contact", entityIds: contactIds });

  const {
    views,
    activeViewId,
    onViewChange,
    onCreateView,
    onDeleteView,
    applyFilters,
  } = useSavedViews({
    organizationId,
    entityType: "contact",
    systemViews: systemViews,
    defaultColumnVisibility: {},
  });

  const filteredContacts = useMemo(() => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    let data: Contact[];
    switch (activeViewId) {
      case "my":
        data = contacts;
        break;
      case "recent":
        data = contacts.filter((c) => c.createdAt >= sevenDaysAgo);
        break;
      default:
        data = contacts;
    }
    if (nudgeFilter === "unlinked-company" && contactIdsLinkedToCompany) {
      data = data.filter((c) => !contactIdsLinkedToCompany.has(c._id));
    }
    return applyFilters(data);
  }, [contacts, activeViewId, applyFilters, nudgeFilter, contactIdsLinkedToCompany]);

  const searchedContacts = useMemo(() => {
    let result = filteredContacts;

    // Apply active filters from FilterDropdown
    if (activeFilters.length > 0) {
      result = result.filter((c) => {
        return activeFilters.every((f) => {
          const raw = (c as Record<string, any>)[f.field];
          const val = typeof raw === "string" ? raw.toLowerCase() : raw;
          const target = typeof f.value === "string" ? f.value.toLowerCase() : f.value;

          switch (f.operator) {
            case "contains":
              return typeof val === "string" && val.includes(target);
            case "notContains":
              return typeof val === "string" && !val.includes(target);
            case "equals":
              return val === target || String(val) === String(target);
            case "notEquals":
              return val !== target && String(val) !== String(target);
            case "isEmpty":
              return !raw || raw === "";
            case "isNotEmpty":
              return !!raw && raw !== "";
            case "greaterThan":
              return Number(val) > Number(target);
            case "lessThan":
              return Number(val) < Number(target);
            case "before":
              return raw < new Date(f.value).getTime();
            case "after":
              return raw > new Date(f.value).getTime();
            default:
              return true;
          }
        });
      });
    }

    // Apply text search
    if (searchValue.trim()) {
      const q = searchValue.toLowerCase();
      result = result.filter((c) => {
        const full = `${c.firstName} ${c.lastName ?? ""} ${c.email ?? ""} ${c.phone ?? ""}`.toLowerCase();
        return full.includes(q);
      });
    }

    return result;
  }, [filteredContacts, searchValue, activeFilters]);

  const tableData = mergeCustomFieldValues(searchedContacts);

  const contactsByDay = useMemo<MiniChartData[]>(() => {
    const dayMap = new Map<string, number>();
    for (const c of contacts) {
      const day = new Date(c.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
    }
    return Array.from(dayMap.entries())
      .map(([label, value]) => ({ label, value }))
      .slice(-14);
  }, [contacts]);

  const contactsBySource = useMemo<MiniChartData[]>(() => {
    const srcMap = new Map<string, number>();
    for (const c of contacts) {
      const src = (c as Contact & { source?: string }).source ?? "Unknown";
      srcMap.set(src, (srcMap.get(src) ?? 0) + 1);
    }
    return Array.from(srcMap.entries()).map(([label, value]) => ({
      label,
      value,
    }));
  }, [contacts]);

  // --- CrmColumn definitions ---

  type ContactRow = Contact & { __cfValues: Record<string, unknown> };

  const columns = useMemo((): CrmColumn<ContactRow>[] => [
    {
      id: "firstName",
      label: t('contacts.contact'),
      sortable: true,
      isRowHeader: true,
      render: (item) => (
        <Link
          to="/dashboard/contacts/$contactId"
          params={{ contactId: item._id }}
          className="hover:opacity-80"
        >
          <AvatarLabelGroup
            size="sm"
            src={["/images/avatars/blue.jpg", "/images/avatars/purple.jpg", "/images/avatars/red.jpg"][item._id.charCodeAt(item._id.length - 1) % 3]}
            initials={`${item.firstName[0]}${item.lastName?.[0] ?? ""}`}
            title={`${item.firstName} ${item.lastName ?? ""}`}
            subtitle={item.email ?? "—"}
          />
        </Link>
      ),
      getSortValue: (item) => `${item.firstName} ${item.lastName ?? ""}`,
    },
    {
      id: "email",
      label: t('common.email'),
      sortable: true,
      render: (item) => item.email ?? "—",
      getSortValue: (item) => item.email ?? "",
    },
    {
      id: "phone",
      label: t('common.phone'),
      render: (item) => item.phone ? formatPhoneNumber(item.phone) : "—",
    },
    {
      id: "title",
      label: t('contacts.title'),
      render: (item) => (item as any).title ?? "—",
    },
    {
      id: "createdAt",
      label: t('common.created'),
      sortable: true,
      render: (item) => new Date(item.createdAt).toLocaleDateString(),
      getSortValue: (item) => item.createdAt,
    },
  ], [t]);

  const mergedColumns = useMemo(() => [...columns, ...cfColumns], [columns, cfColumns]);
  const { allColumns, defaultHidden } = useAllColumns(mergedColumns, filterableFields);
  const { hiddenColumnIds, toggleColumn, setHiddenColumns } = useColumnVisibility(defaultHidden, "contacts");

  const handleCreate = useCallback(
    async (
      formData: {
        firstName: string;
        lastName?: string;
        email?: string;
        phone?: string;
        title?: string;
        source?: string;
        tags?: string[];
        notes?: string;
      },
      customFieldRecord: Record<string, unknown>
    ) => {
      setIsCreating(true);
      try {
        const contactId = await createContact({
          organizationId,
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          phone: formData.phone,
          title: formData.title,
          notes: formData.notes,
          tags: formData.tags,
        });
        if (cfDefs && Object.keys(customFieldRecord).length > 0) {
          const fields = cfDefs
            .filter((d) => customFieldRecord[d.fieldKey] !== undefined && customFieldRecord[d.fieldKey] !== "")
            .map((d) => ({ fieldDefinitionId: d._id as any, value: customFieldRecord[d.fieldKey] }));
          if (fields.length > 0) {
            await setCustomFieldValues({
              organizationId,
              entityType: "contact" as any,
              entityId: contactId as string,
              fields,
            });
          }
        }
        setPanelOpen(false);
      } finally {
        setIsCreating(false);
      }
    },
    [createContact, organizationId, cfDefs, setCustomFieldValues]
  );

  const handleBulkAction = useCallback(
    async (action: string, selectedRows: ContactRow[]) => {
      if (action === "delete") {
        for (const row of selectedRows) {
          await removeContact({ organizationId, contactId: row._id });
        }
      }
    },
    [removeContact, organizationId]
  );

  const rowActions = useCallback(
    (row: ContactRow) => [
      {
        label: t('common.edit'),
        onClick: () => navigate({ to: `/dashboard/contacts/${row._id}` }),
      },
      {
        label: t('common.delete'),
        icon: <Trash2 className="h-4 w-4" variant="stroke" />,
        onClick: async () => {
          if (window.confirm(t('contacts.confirmDelete'))) {
            await removeContact({ organizationId, contactId: row._id });
          }
        },
      },
    ],
    [navigate, removeContact, organizationId, t]
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('contacts.title')}
        description={t('contacts.description')}
        actions={
          <Button onClick={() => setPanelOpen(true)}>
            <Plus className="mr-2 h-4 w-4" variant="stroke" />
            {t('contacts.addContact')}
          </Button>
        }
      />

      {nudgeFilter === "unlinked-company" && (
        <div className="flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <span>
            {t("contacts.nudgeFilter.unlinkedCompany", {
              defaultValue: "Pokazywane są kontakty bez przypisanej firmy.",
            })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() =>
              navigate({
                to: "/dashboard/contacts",
                search: { nudge: undefined },
              })
            }
          >
            <X className="h-3.5 w-3.5" variant="stroke" />
            {t("common.clearFilters")}
          </Button>
        </div>
      )}

      <DataListFilterBar
        views={views}
        activeViewId={activeViewId ?? undefined}
        onViewChange={onViewChange}
        onCreateView={onCreateView}
        onDeleteView={async (id) => { onDeleteView(id); }}
        filterableFields={filterableFields}
        createDialogOpen={savedViewsDialogOpen}
        onCreateDialogOpenChange={setSavedViewsDialogOpen}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder={t('contacts.searchPlaceholder')}
        onFiltersChange={setActiveFilters}
        onTagsManage={() => setTagsSlideoutOpen(true)}
        onCategoriesManage={() => setCategoriesSlideoutOpen(true)}
        dropdownActions={[
          { label: t("csv.export"), icon: <Download className="h-4 w-4" variant="stroke" />, onClick: handleExport },
          { label: t("csv.import"), icon: <Upload className="h-4 w-4" variant="stroke" />, onClick: () => setImportOpen(true) },
        ]}
        columnDefs={allColumns.map(c => ({ id: c.id, label: c.label ?? c.id }))}
        hiddenColumnIds={hiddenColumnIds}
        onToggleColumn={toggleColumn}
        onSetHiddenColumns={setHiddenColumns}
      />

      <MiniChartsRow
        leftChart={{
          title: t('contacts.byDay'),
          data: contactsByDay,
          chartType: "line",
          timeRange: leftTimeRange,
          onTimeRangeChange: setLeftTimeRange,
        }}
        rightChart={{
          title: t('contacts.bySource'),
          data: contactsBySource,
          chartType: "bar",
          timeRange: rightTimeRange,
          onTimeRangeChange: setRightTimeRange,
        }}
      />

      <CrmDataTable
        columns={allColumns}
        data={tableData}
        isLoading={isLoading}
        hiddenColumnIds={hiddenColumnIds}
        enableBulkSelect
        bulkActions={[
          { label: t('common.delete'), value: "delete", variant: "destructive" },
        ]}
        onBulkAction={handleBulkAction}
        rowActions={rowActions}
        onRowAction={(id) => navigate({ to: '/dashboard/contacts/$contactId', params: { contactId: id } })}
        emptyTitle={t('contacts.emptyTitle')}
        emptyDescription={t('contacts.emptyDescription')}
      />

      <CsvImportDialog
        organizationId={organizationId}
        entityType="contacts"
        open={importOpen}
        onOpenChange={setImportOpen}
      />

      <SidePanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        title={t('contacts.createContact')}
        description={t('contacts.createDescription')}
      >
        <ContactForm
          onSubmit={handleCreate}
          onCancel={() => setPanelOpen(false)}
          isSubmitting={isCreating}
          showSourceAndTags
          customFieldDefinitions={cfDefs}
          tagDefinitions={tags}
          categoryDefinitions={categories}
          organizationId={organizationId}
        />
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
        entityType="contact"
        categories={categories}
      />
    </div>
  );
}
