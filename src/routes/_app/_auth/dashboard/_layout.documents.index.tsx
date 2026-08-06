import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useSupabaseFormDocumentsList } from "@/hooks/use-supabase-form-documents";
import { useSupabaseOrganizationMembers } from "@/hooks/use-supabase-organizations";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import type { FormDocumentStatus } from "@/components/documents/document-status-badge";
import { DocumentViewer } from "@/components/documents/document-viewer";
import { TemplateFallbackViewer } from "@/components/documents/template-fallback-viewer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { SidePanel } from "@/components/crm/side-panel";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { FileText, Eye, Trash2, X } from "@/lib/ez-icons";
import { AvatarLabelGroup } from "@untitled/base/avatar/avatar-label-group";
import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { Id } from "@cvx/_generated/dataModel";
import type { MappedFormDocument } from "@/lib/supabase/mappers/form-documents";
import { useTagDefinitions } from "@/hooks/use-tag-definitions";
import { useCategoryDefinitions } from "@/hooks/use-category-definitions";
import { TagsManagerSlideout } from "@/components/categories-tags/tags-manager-slideout";
import { CategoriesManagerSlideout } from "@/components/categories-tags/categories-manager-slideout";
import {
  useColumnVisibility,
  useAllColumns,
  type CrmColumn,
} from "@/components/crm/enhanced-data-table";
import { DocumentsGroupedView } from "@/components/documents/documents-grouped-view";
import { DataListFilterBar } from "@/components/crm/data-list-filter-bar";
import type { SavedView, FieldDef, FilterCondition } from "@/components/crm/types";
import { useSavedViews, applyFilterConditions } from "@/hooks/use-saved-views";
import { useSidebarDispatch } from "@/components/layout/sidebar-context";

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

type DocumentsNudgeFilter = "pending-approval";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/documents/",
)({
  component: DocumentsPage,
  validateSearch: (
    search: Record<string, unknown>,
  ): { nudge?: DocumentsNudgeFilter } => {
    const nudge =
      search.nudge === "pending-approval"
        ? (search.nudge as DocumentsNudgeFilter)
        : undefined;
    return { nudge };
  },
});

// ---------------------------------------------------------------------------
// Category label map (form template categories)
// ---------------------------------------------------------------------------

const FORM_CATEGORY_LABELS: Record<string, { pl: string; en: string }> = {
  consent: { pl: "Zgoda", en: "Consent" },
  medical_record: { pl: "Karta medyczna", en: "Medical Record" },
  prescription: { pl: "Recepta", en: "Prescription" },
  referral: { pl: "Skierowanie", en: "Referral" },
  contract: { pl: "Umowa", en: "Contract" },
  invoice: { pl: "Faktura", en: "Invoice" },
  protocol: { pl: "Protokol", en: "Protocol" },
  intake: { pl: "Ankieta", en: "Intake" },
  custom: { pl: "Inne", en: "Custom" },
};

const ENTITY_TYPE_LABELS: Record<string, { pl: string; en: string }> = {
  patient: { pl: "Pacjent", en: "Patient" },
  appointment: { pl: "Wizyta", en: "Appointment" },
  employee: { pl: "Pracownik", en: "Employee" },
  treatment: { pl: "Zabieg", en: "Treatment" },
  contact: { pl: "Kontakt", en: "Contact" },
  company: { pl: "Firma", en: "Company" },
  lead: { pl: "Lead", en: "Lead" },
};

const STATUS_OPTIONS: FormDocumentStatus[] = [
  "draft",
  "pending_signature",
  "signed",
  "completed",
  "expired",
  "voided",
];

type FormDocument = MappedFormDocument;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function DocumentsPage() {
  const { t, i18n } = useTranslation();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const { nudge: nudgeFilter } = useSearch({ from: Route.id });
  const lang = i18n.language === "en" ? "en" : "pl";

  // --- Tags & Categories ---
  const { tags } = useTagDefinitions(organizationId);
  const { categories } = useCategoryDefinitions(organizationId, "document");
  const [tagsSlideoutOpen, setTagsSlideoutOpen] = useState(false);
  const [categoriesSlideoutOpen, setCategoriesSlideoutOpen] = useState(false);

  // --- Saved views (status-based system views) ---
  const systemViews: SavedView[] = useMemo(
    () => [
      { id: "all", name: t("documents.views.all", "Wszystkie"), isSystem: true, isDefault: true },
      { id: "draft", name: t("documents.views.draft", "Szkice"), isSystem: true, isDefault: false },
      { id: "pending_signature", name: t("documents.views.pending", "Do podpisu"), isSystem: true, isDefault: false },
      { id: "signed", name: t("documents.views.signed", "Podpisane"), isSystem: true, isDefault: false },
      { id: "completed", name: t("documents.views.completed", "Zakończone"), isSystem: true, isDefault: false },
    ],
    [t],
  );

  const {
    views,
    activeViewId,
    onViewChange,
    onCreateView,
    onDeleteView,
    applyFilters,
  } = useSavedViews({ organizationId, entityType: "document", systemViews });

  // --- Filter / search state ---
  const [searchValue, setSearchValue] = useState("");
  const [activeFilters, setActiveFilters] = useState<FilterCondition[]>([]);
  const [savedViewsDialogOpen, setSavedViewsDialogOpen] = useState(false);
  const [filterSlideoutOpen, setFilterSlideoutOpen] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false);

  // --- Data ---
  const { data: documents, isLoading: docsLoading } = useSupabaseFormDocumentsList(
    organizationId,
    { limit: 200 },
  );

  const listTemplatesAction = useAction(api.documents.templates.list);
  const { data: templates } = useQuery({
    queryKey: ["documents.templates.list", organizationId],
    queryFn: () => listTemplatesAction({ organizationId }),
    enabled: !!organizationId,
  });

  const { data: members } = useSupabaseOrganizationMembers(organizationId);

  const removeDocument = useAction(api.documents.documents.remove);

  // --- Sidebar dispatches ---
  useSidebarDispatch("savedViews", () => setSavedViewsDialogOpen(true));
  useSidebarDispatch("openFilter", () => setFilterSlideoutOpen(true));
  useSidebarDispatch("manageTags", () => setTagsSlideoutOpen(true));
  useSidebarDispatch("manageCategories", () => setCategoriesSlideoutOpen(true));

  // Build template lookup
  type TemplateDoc = NonNullable<typeof templates>[number];
  const templateMap = useMemo(() => {
    if (!templates) return new Map<Id<"formTemplates">, TemplateDoc>();
    return new Map(templates.map((tpl) => [tpl._id, tpl]));
  }, [templates]);

  // Build user lookup from org members
  const userMap = useMemo(() => {
    if (!members)
      return new Map<string, { name?: string | null; email?: string | null }>();
    const map = new Map<string, { name?: string | null; email?: string | null }>();
    for (const m of members) {
      if (m.user) map.set(m.user._id as string, m.user);
    }
    return map;
  }, [members]);

  // Extract unique categories from loaded templates (built-in template categories)
  const availableTemplateCategories = useMemo(() => {
    if (!templates) return [] as string[];
    const cats = new Set(templates.map((tpl) => tpl.category));
    return Array.from(cats).sort();
  }, [templates]);

  // --- Helpers ---
  const getCategoryKey = useCallback(
    (templateId: string) => {
      const tpl = templateMap.get(templateId as Id<"formTemplates">);
      return tpl?.category ?? null;
    },
    [templateMap],
  );

  const getCategoryLabel = useCallback(
    (templateId: string) => {
      const cat = getCategoryKey(templateId);
      if (!cat) return "\u2014";
      const labels = FORM_CATEGORY_LABELS[cat];
      return labels ? labels[lang] : cat;
    },
    [getCategoryKey, lang],
  );

  const getEntityTypeLabel = useCallback(
    (entityType: string) => {
      const labels = ENTITY_TYPE_LABELS[entityType];
      return labels ? labels[lang] : entityType;
    },
    [lang],
  );

  const getUserName = useCallback(
    (userId: string) => {
      const u = userMap.get(userId);
      if (!u) return "\u2014";
      return u.name ?? u.email ?? "\u2014";
    },
    [userMap],
  );

  const AVATAR_IMAGES = [
    "/images/avatars/blue.jpg",
    "/images/avatars/purple.jpg",
    "/images/avatars/red.jpg",
  ];

  const renderUserAvatar = useCallback(
    (userId: string) => {
      const u = userMap.get(userId);
      if (!u) return <span className="text-sm text-muted-foreground">—</span>;
      const name = u.name ?? u.email ?? "—";
      const parts = (u.name ?? "").trim().split(/\s+/).filter(Boolean);
      const initials =
        parts.length >= 2
          ? `${parts[0][0]}${parts[1][0]}`
          : (name[0] ?? "?").toUpperCase();
      const src = AVATAR_IMAGES[userId.charCodeAt(userId.length - 1) % AVATAR_IMAGES.length];
      return (
        <AvatarLabelGroup
          size="sm"
          src={src}
          initials={initials.toUpperCase()}
          title={name}
          subtitle={u.email ?? ""}
        />
      );
    },
    [userMap],
  );

  const formatDate = useCallback(
    (timestamp: number) => {
      return new Date(timestamp).toLocaleDateString(
        lang === "en" ? "en-US" : "pl-PL",
        { year: "numeric", month: "short", day: "numeric" },
      );
    },
    [lang],
  );

  // --- Filter fields for DataListFilterBar ---
  const filterableFields = useMemo((): FieldDef[] => [
    { id: "title", label: t("documents.colTitle", "Tytuł"), type: "text" },
    {
      id: "status",
      label: t("documents.colStatus", "Status"),
      type: "select",
      options: STATUS_OPTIONS.map((s) => ({ label: s, value: s })),
    },
    {
      id: "entityType",
      label: t("documents.colEntityType", "Typ"),
      type: "select",
      options: Object.entries(ENTITY_TYPE_LABELS).map(([key, labels]) => ({
        label: labels[lang],
        value: key,
      })),
    },
    {
      id: "category",
      label: t("documents.colCategory", "Kategoria"),
      type: "select",
      options: availableTemplateCategories.map((c) => {
        const labels = FORM_CATEGORY_LABELS[c];
        return { label: labels ? labels[lang] : c, value: c };
      }),
    },
    { id: "createdAt", label: t("common.created", "Data utworzenia"), type: "date" },
  ], [t, lang, availableTemplateCategories]);

  // --- Filtered data ---
  const filteredDocuments = useMemo(() => {
    if (!documents) return [];

    let data = documents.map(
      (doc) => ({ ...doc, category: getCategoryKey(doc.templateId) }),
    );

    // nudge=pending-approval: documents awaiting signature/approval
    if (nudgeFilter === "pending-approval") {
      data = data.filter((d) => d.status === "pending_signature");
    } else if (activeViewId && activeViewId !== "all") {
      // System view filter (status-based)
      if (STATUS_OPTIONS.includes(activeViewId as FormDocumentStatus)) {
        data = data.filter((d) => d.status === activeViewId);
      }
    }

    data = applyFilters(data) as typeof data;
    data = applyFilterConditions(data, activeFilters) as typeof data;

    if (searchValue.trim()) {
      const q = searchValue.trim().toLowerCase();
      data = data.filter((doc) => doc.title.toLowerCase().includes(q));
    }

    return data;
  }, [documents, activeViewId, applyFilters, activeFilters, searchValue, getCategoryKey, nudgeFilter]);

  // --- Selected document for viewer ---
  const selectedDoc = useMemo(() => {
    if (!selectedDocId || !documents) return null;
    return documents.find((d) => d._id === selectedDocId) ?? null;
  }, [selectedDocId, documents]);

  const selectedTemplate = useMemo(() => {
    if (!selectedDoc) return null;
    return templateMap.get(selectedDoc.templateId as Id<"formTemplates">) ?? null;
  }, [selectedDoc, templateMap]);

  // --- Columns ---
  const columns: CrmColumn<FormDocument>[] = useMemo(
    () => [
      {
        id: "title",
        label: t("documents.colTitle", "Tytuł"),
        sortable: true,
        isRowHeader: true,
        render: (item) => (
          <button
            type="button"
            className="font-medium text-left hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedDocId(item._id);
            }}
          >
            {item.title}
          </button>
        ),
        getSortValue: (item) => item.title,
      },
      {
        id: "category",
        label: t("documents.colCategory", "Kategoria"),
        sortable: true,
        render: (item) => (
          <Badge variant="secondary" className="text-xs">
            {getCategoryLabel(item.templateId)}
          </Badge>
        ),
        getSortValue: (item) => getCategoryLabel(item.templateId),
      },
      {
        id: "entityType",
        label: t("documents.colEntityType", "Typ"),
        sortable: true,
        render: (item) => (
          <span className="text-sm text-muted-foreground">
            {getEntityTypeLabel(item.entityType)}
          </span>
        ),
        getSortValue: (item) => item.entityType,
      },
      {
        id: "status",
        label: t("documents.colStatus", "Status"),
        sortable: true,
        render: (item) => (
          <DocumentStatusBadge status={item.status as FormDocumentStatus} />
        ),
        getSortValue: (item) => item.status,
      },
      {
        id: "createdAt",
        label: t("documents.colCreatedAt", "Data utworzenia"),
        sortable: true,
        render: (item) => (
          <span className="text-sm text-muted-foreground">
            {formatDate(item.createdAt)}
          </span>
        ),
        getSortValue: (item) => item.createdAt,
      },
      {
        id: "createdBy",
        label: t("documents.colCreatedBy", "Utworzony przez"),
        sortable: true,
        render: (item) => renderUserAvatar(item.createdBy),
        getSortValue: (item) => getUserName(item.createdBy),
      },
    ],
    [t, getCategoryLabel, getEntityTypeLabel, formatDate, getUserName],
  );

  const { allColumns, defaultHidden } = useAllColumns(columns, filterableFields);
  const { hiddenColumnIds, toggleColumn, setHiddenColumns: _setHiddenColumns } = useColumnVisibility(
    defaultHidden,
    "documents",
  );

  const handleBulkAction = useCallback(
    async (action: string, selectedRows: FormDocument[]) => {
      if (action === "delete") {
        if (
          !window.confirm(
            t(
              "documents.confirmBulkDelete",
              "Usunąć zaznaczone dokumenty ({{count}})? Tej operacji nie można cofnąć.",
              { count: selectedRows.length },
            ),
          )
        ) {
          return;
        }
        for (const row of selectedRows) {
          await removeDocument({ organizationId, documentId: row._id });
        }
      }
    },
    [removeDocument, organizationId, t],
  );

  const rowActions = (row: FormDocument) => [
    {
      label: t("common.view", "Podgląd"),
      icon: <Eye className="h-4 w-4" variant="stroke" />,
      onClick: () => setSelectedDocId(row._id),
    },
    {
      label: t("common.delete", "Usuń"),
      icon: <Trash2 className="h-4 w-4" variant="stroke" />,
      onClick: () =>
        removeDocument({ organizationId, documentId: row._id }),
    },
  ];

  // --- Render ---
  return (
    <div className="space-y-4">
      <PageHeader
        title={t("documents.title", "Dokumenty")}
        description={t(
          "documents.description",
          "Dokumenty formularzy kontaktów, firm i leadów",
        )}
        actions={
          <Button
            onClick={() =>
              navigate({ to: "/dashboard/settings/form-templates" })
            }
            variant="outline"
          >
            <FileText className="mr-2 h-4 w-4" />
            {t("documents.manageTemplates", "Szablony")}
          </Button>
        }
      />

      {nudgeFilter === "pending-approval" && (
        <div className="flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <span>
            {t("documents.nudgeFilter.pendingApproval", {
              defaultValue:
                "Pokazywane są dokumenty oczekujące na podpis / zatwierdzenie.",
            })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() =>
              navigate({
                to: "/dashboard/documents",
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
        activeViewId={activeViewId}
        onViewChange={onViewChange}
        onCreateView={onCreateView}
        onDeleteView={onDeleteView}
        filterableFields={filterableFields}
        createDialogOpen={savedViewsDialogOpen}
        onCreateDialogOpenChange={setSavedViewsDialogOpen}
        filterSlideoutOpen={filterSlideoutOpen}
        onFilterSlideoutOpenChange={setFilterSlideoutOpen}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder={t("documents.searchPlaceholder", "Szukaj po tytule...")}
        onTagsManage={() => setTagsSlideoutOpen(true)}
        onCategoriesManage={() => setCategoriesSlideoutOpen(true)}
        onColumnSettingsOpen={() => setColumnSettingsOpen(true)}
        onFiltersChange={setActiveFilters}
      />

      <DocumentsGroupedView
        columns={allColumns}
        hiddenColumnIds={hiddenColumnIds}
        documents={filteredDocuments}
        getFolderPath={(doc) =>
          templateMap.get(doc.templateId as Id<"formTemplates">)?.folderPath ?? undefined
        }
        rowActions={rowActions}
        isLoading={docsLoading}
        enableBulkSelect
        bulkActions={[
          { label: t("common.delete", "Usuń"), value: "delete", variant: "destructive" },
        ]}
        onBulkAction={handleBulkAction}
      />

      <SidePanel
        open={columnSettingsOpen}
        onOpenChange={setColumnSettingsOpen}
        title={t("common.columnSettings", "Ustawienia kolumn")}
      >
        <div className="space-y-1 py-2">
          {allColumns
            .filter((col) => !["actions"].includes(col.id))
            .map((col) => {
              const isVisible = !hiddenColumnIds.has(col.id);
              return (
                <button
                  key={col.id}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                  onClick={() => toggleColumn(col.id)}
                >
                  <Checkbox
                    checked={isVisible}
                    className="pointer-events-none"
                    aria-hidden
                  />
                  <span className="text-sm font-medium">{col.label ?? col.id}</span>
                </button>
              );
            })}
        </div>
      </SidePanel>

      {/* Document viewer sheet */}
      <Sheet
        open={!!selectedDocId}
        onOpenChange={(open) => {
          if (!open) setSelectedDocId(null);
        }}
      >
        <SheetContent className="sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selectedDoc?.title ?? "\u2014"}</SheetTitle>
            <SheetDescription>
              {selectedDoc && (
                <span className="flex items-center gap-2">
                  <DocumentStatusBadge
                    status={selectedDoc.status as FormDocumentStatus}
                  />
                  <span className="text-xs">
                    {formatDate(selectedDoc.createdAt)}
                  </span>
                </span>
              )}
            </SheetDescription>
          </SheetHeader>

          {selectedDoc && selectedTemplate &&
            (() => {
              try {
                const parsed = JSON.parse(selectedDoc.responseData) as { html?: string };
                if (parsed.html) {
                  return (
                    <div className="mt-6">
                      <DocumentViewer
                        title={selectedDoc.title}
                        html={parsed.html}
                        signatureData={selectedDoc.signatureData}
                        signedAt={selectedDoc.signedAt}
                      />
                    </div>
                  );
                }
              } catch {
                // Not JSON with html — fall through
              }

              if (selectedTemplate.contentJson) {
                try {
                  const scopeFlat: Record<string, string> = {};
                  const parsed = JSON.parse(selectedDoc.responseData) as Record<string, unknown>;
                  for (const [k, v] of Object.entries(parsed)) {
                    if (v != null) scopeFlat[k] = String(v);
                  }
                  return (
                    <div className="mt-6">
                      <TemplateFallbackViewer
                        title={selectedDoc.title}
                        contentJson={selectedTemplate.contentJson}
                        scopeData={scopeFlat}
                        signatureData={selectedDoc.signatureData}
                        signedAt={selectedDoc.signedAt}
                      />
                    </div>
                  );
                } catch {
                  // contentJson invalid — fall through
                }
              }

              return (
                <div className="mt-6 flex items-center justify-center py-12 text-sm text-muted-foreground">
                  {t(
                    "documents.templateNotFound",
                    "Szablon dokumentu nie jest dostępny.",
                  )}
                </div>
              );
            })()}

          {selectedDoc && !selectedTemplate && (
            <div className="mt-6 flex items-center justify-center py-12 text-sm text-muted-foreground">
              {t(
                "documents.templateNotFound",
                "Szablon dokumentu nie jest dostępny.",
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

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
        entityType="document"
        categories={categories}
      />
    </div>
  );
}
