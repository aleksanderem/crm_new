import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useSupabaseOrganizationMembers } from "@/hooks/use-supabase-organizations";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import { DocumentViewer } from "@/components/documents/document-viewer";
import { renderDocument } from "@/components/documents/document-renderer";
import { CrmDataTable, type CrmColumn, useColumnVisibility, useAllColumns } from "@/components/crm/enhanced-data-table";
import { DataListFilterBar } from "@/components/crm/data-list-filter-bar";
import { MiniChartsRow, type MiniChartData } from "@/components/crm/mini-charts";
import { SidePanel } from "@/components/crm/side-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FileText, Send, Download, MoreHorizontal, Trash2, Calendar, User, Tag, FileSignature } from "@/lib/ez-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { FieldDef, FilterCondition, SavedView } from "@/components/crm/types";
import { useTagDefinitions } from "@/hooks/use-tag-definitions";
import { useCategoryDefinitions } from "@/hooks/use-category-definitions";
import { TagsManagerSlideout } from "@/components/categories-tags/tags-manager-slideout";
import { CategoriesManagerSlideout } from "@/components/categories-tags/categories-manager-slideout";
import { useSupabaseFormDocumentsList } from "@/hooks/use-supabase-form-documents";
import { useSavedViews } from "@/hooks/use-saved-views";
import { useSidebarDispatch } from "@/components/layout/sidebar-context";

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/documents/",
)({
  component: GabinetDocumentsPage,
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
  protocol: { pl: "Protokół", en: "Protocol" },
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function GabinetDocumentsPage() {
  const { t, i18n } = useTranslation();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const lang = i18n.language === "en" ? "en" : "pl";

  const { tags } = useTagDefinitions(organizationId);
  const { categories } = useCategoryDefinitions(organizationId, "gabinetDocument");
  const [tagsSlideoutOpen, setTagsSlideoutOpen] = useState(false);
  const [categoriesSlideoutOpen, setCategoriesSlideoutOpen] = useState(false);
  const [filterSlideoutOpen, setFilterSlideoutOpen] = useState(false);

  useSidebarDispatch("openFilter", () => setFilterSlideoutOpen(true));

  // --- State ---
  const [searchValue, setSearchValue] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [docToDelete, setDocToDelete] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<FilterCondition[]>([]);
  const [savedViewsDialogOpen, setSavedViewsDialogOpen] = useState(false);

  // --- System views ---
  const systemViews = useMemo((): SavedView[] => [
    { id: "all", name: t("gabinet.formDocuments.views.all", "Wszystkie"), isSystem: true, isDefault: true },
    { id: "draft", name: t("gabinet.formDocuments.views.draft", "Wersje robocze"), isSystem: true },
    { id: "pending_signature", name: t("gabinet.formDocuments.views.pendingSignature", "Oczekujące podpisu"), isSystem: true },
    { id: "signed", name: t("gabinet.formDocuments.views.signed", "Podpisane"), isSystem: true },
  ], [t]);

  // --- Saved views ---
  const {
    views,
    activeViewId,
    onViewChange,
    onCreateView,
    onDeleteView,
    selectedId,
    setSelectedId,
    applyFilters,
  } = useSavedViews({
    organizationId,
    entityType: "gabinetDocument",
    systemViews: systemViews,
    defaultColumnVisibility: {},
  });

  // --- Mutations ---
  const resendSigningEmail = useAction(api.documents.documents.resendSigningEmail);
  const removeDocument = useAction(api.documents.documents.remove);

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

  // Build template lookup
  type TemplateDoc = NonNullable<typeof templates>[number];
  const templateMap = useMemo(() => {
    if (!templates) return new Map<string, TemplateDoc>();
    return new Map(templates.map((tpl) => [tpl._id as string, tpl]));
  }, [templates]);

  // Build user lookup from org members
  const userMap = useMemo(() => {
    if (!members)
      return new Map<string, { name?: string; email?: string }>();
    const map = new Map<string, { name?: string; email?: string }>();
    for (const m of members) {
      if (m.user) map.set(m.user._id as string, m.user);
    }
    return map;
  }, [members]);

  // Extract unique categories from loaded templates
  const availableCategories = useMemo(() => {
    if (!templates) return [] as string[];
    const cats = new Set(templates.map((tpl) => tpl.category));
    return Array.from(cats).sort();
  }, [templates]);

  // --- Mini charts data ---
  const documentsByDay = useMemo<MiniChartData[]>(() => {
    if (!documents) return [];
    const dayMap = new Map<string, number>();
    for (const doc of documents) {
      const day = new Date(doc.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
    }
    return Array.from(dayMap.entries())
      .map(([label, value]) => ({ label, value }))
      .slice(-14); // Last 14 days
  }, [documents]);

  const documentsByStatus = useMemo<MiniChartData[]>(() => {
    if (!documents) return [];
    const statusMap = new Map<string, number>();
    for (const doc of documents) {
      const statusLabel = t(`gabinet.formDocuments.status.${doc.status}`, doc.status);
      statusMap.set(statusLabel, (statusMap.get(statusLabel) ?? 0) + 1);
    }
    return Array.from(statusMap.entries()).map(([label, value]) => ({
      label,
      value,
    }));
  }, [documents, t]);

  // --- Filter definitions ---
  const filterableFields = useMemo((): FieldDef[] => [
    { id: "title", label: t("common.title", "Tytuł"), type: "text" },
    { id: "status", label: t("common.status", "Status"), type: "select", options: [
      { label: t("gabinet.formDocuments.status.draft", "Wersja robocza"), value: "draft" },
      { label: t("gabinet.formDocuments.status.pending_signature", "Oczekuje podpis"), value: "pending_signature" },
      { label: t("gabinet.formDocuments.status.signed", "Podpisany"), value: "signed" },
      { label: t("gabinet.formDocuments.status.completed", "Zakończony"), value: "completed" },
      { label: t("gabinet.formDocuments.status.expired", "Wygasły"), value: "expired" },
      { label: t("gabinet.formDocuments.status.voided", "Unieważniony"), value: "voided" },
    ]},
    { id: "entityType", label: t("common.type", "Typ"), type: "select", options: [
      { label: t("gabinet.formDocuments.entityType.patient", "Pacjent"), value: "patient" },
      { label: t("gabinet.formDocuments.entityType.appointment", "Wizyta"), value: "appointment" },
      { label: t("gabinet.formDocuments.entityType.employee", "Pracownik"), value: "employee" },
      { label: t("gabinet.formDocuments.entityType.treatment", "Zabieg"), value: "treatment" },
    ]},
    { id: "category", label: t("common.category", "Kategoria"), type: "select", options: availableCategories.map(cat => {
      const labels = FORM_CATEGORY_LABELS[cat];
      return { label: labels ? labels[lang] : cat, value: cat };
    })},
    { id: "createdAt", label: t("common.created", "Utworzono"), type: "date" },
  ], [t, lang, availableCategories]);

  // --- Filtered data ---
  const filteredDocuments = useMemo(() => {
    if (!documents) return [];

    // Apply view-based filtering
    let viewFiltered = documents;
    switch (activeViewId) {
      case "draft":
        viewFiltered = documents.filter((d) => d.status === "draft");
        break;
      case "pending_signature":
        viewFiltered = documents.filter((d) => d.status === "pending_signature");
        break;
      case "signed":
        viewFiltered = documents.filter((d) => d.status === "signed");
        break;
      default:
        // "all" - no filtering
        break;
    }

    // Apply filters from saved views or manual filters
    return applyFilters(viewFiltered);
  }, [documents, activeViewId, applyFilters]);

  // --- Selected document for viewer ---
  const selectedDoc = useMemo(() => {
    if (!selectedId || !documents) return null;
    return documents.find((d) => d._id === selectedId) ?? null;
  }, [selectedId, documents]);

  const selectedTemplate = useMemo(() => {
    if (!selectedDoc) return null;
    return templateMap.get(selectedDoc.templateId) ?? null;
  }, [selectedDoc, templateMap]);

  // --- Helpers ---
  const getCategoryLabel = useCallback(
    (templateId: string) => {
      const tpl = templateMap.get(templateId);
      if (!tpl) return "—";
      const labels = FORM_CATEGORY_LABELS[tpl.category];
      return labels ? labels[lang] : tpl.category;
    },
    [templateMap, lang],
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
      if (!u) return "—";
      return u.name ?? u.email ?? "—";
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

  // --- Column definitions ---
  const columns = useMemo(() => {
    const result: CrmColumn<any>[] = [
      {
        id: "title",
        label: t("gabinet.formDocuments.colTitle", "Tytuł"),
        render: (item) => (
          <div className="font-medium">{item.title}</div>
        ),
      },
      {
        id: "category",
        label: t("gabinet.formDocuments.colCategory", "Kategoria"),
        render: (item) => (
          <Badge variant="secondary" className="text-xs">
            {getCategoryLabel(item.templateId)}
          </Badge>
        ),
      },
      {
        id: "entityType",
        label: t("gabinet.formDocuments.colEntityType", "Typ"),
        render: (item) => (
          <span className="text-sm text-muted-foreground">
            {getEntityTypeLabel(item.entityType)}
          </span>
        ),
      },
      {
        id: "status",
        label: t("gabinet.formDocuments.colStatus", "Status"),
        render: (item) => (
          <DocumentStatusBadge status={item.status as any} />
        ),
      },
      {
        id: "createdAt",
        label: t("gabinet.formDocuments.colCreatedAt", "Data utworzenia"),
        render: (item) => (
          <span className="text-sm text-muted-foreground">
            {formatDate(item.createdAt)}
          </span>
        ),
      },
      {
        id: "createdBy",
        label: t("gabinet.formDocuments.colCreatedBy", "Utworzony przez"),
        render: (item) => (
          <span className="text-sm text-muted-foreground">
            {getUserName(item.createdBy)}
          </span>
        ),
      },
      {
        id: "actions",
        render: (item) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <span className="sr-only">Otwórz menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSelectedId(item._id)}>
                <FileText className="mr-2 h-4 w-4" />
                {t("common.view", "Podgląd")}
              </DropdownMenuItem>
              {item.status === "draft" ||
              item.status === "pending_signature" ? (
                <DropdownMenuItem
                  onClick={() => handleResendSigningEmail(item._id)}
                >
                  <Send className="mr-2 h-4 w-4" />
                  {t("gabinet.formDocuments.resendSigningEmail", "Wyślij e-mail podpisu")}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setSelectedId(item._id)}
              >
                <Download className="mr-2 h-4 w-4" />
                {t("common.download", "Pobierz")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => handleDeleteClick(item._id)}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t("common.delete", "Usuń")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ];
    return result;
  }, [t, getCategoryLabel, getEntityTypeLabel, getUserName, formatDate]);

  // --- Column visibility ---
  const { allColumns, defaultHidden } = useAllColumns(columns, filterableFields);
  const { hiddenColumnIds, toggleColumn, setHiddenColumns } = useColumnVisibility(defaultHidden, "gabinetDocuments");

  // --- Handlers ---
  const handleResendSigningEmail = (docId: string) => {
    resendSigningEmail({
      organizationId,
      documentId: docId as any,
    });
  };

  const handleDeleteConfirm = () => {
    if (!docToDelete) return;
    try {
      removeDocument({
        organizationId,
        documentId: docToDelete as any,
      });
      setDeleteDialogOpen(false);
      setDocToDelete(null);
    } catch (error) {
      console.error("Failed to delete document:", error);
    }
  };

  const handleDeleteClick = (docId: string) => {
    setDocToDelete(docId);
    setDeleteDialogOpen(true);
  };

  const handleBulkDelete = (items: any[]) => {
    if (!items.length) return;
    items.forEach((item) => {
      try {
        removeDocument({
          organizationId,
          documentId: item._id as any,
        });
      } catch (error) {
        console.error("Failed to delete document:", error);
      }
    });
  };

  // --- Render ---

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("gabinet.formDocuments.title", "Dokumenty")}
        description={t(
          "gabinet.formDocuments.description",
          "Dokumenty formularzy pacjentów i wizyt",
        )}
        actions={
          <Button
            onClick={() =>
              navigate({ to: "/dashboard/settings/form-templates" })
            }
            variant="outline"
          >
            <FileText className="mr-2 h-4 w-4" />
            {t("gabinet.formDocuments.manageTemplates", "Szablony")}
          </Button>
        }
      />

      {/* Filter bar */}
      <DataListFilterBar
        views={views}
        activeViewId={activeViewId ?? undefined}
        onViewChange={onViewChange}
        onCreateView={onCreateView}
        onDeleteView={async (id) => { onDeleteView(id); }}
        filterableFields={filterableFields}
        filterSlideoutOpen={filterSlideoutOpen}
        onFilterSlideoutOpenChange={setFilterSlideoutOpen}
        createDialogOpen={savedViewsDialogOpen}
        onCreateDialogOpenChange={setSavedViewsDialogOpen}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder={t(
          "gabinet.formDocuments.searchPlaceholder",
          "Szukaj po tytule...",
        )}
        onFiltersChange={setActiveFilters}
        onTagsManage={() => setTagsSlideoutOpen(true)}
        onCategoriesManage={() => setCategoriesSlideoutOpen(true)}
        columnDefs={allColumns.map(c => ({ id: c.id, label: c.label ?? c.id }))}
        hiddenColumnIds={hiddenColumnIds}
        onToggleColumn={toggleColumn}
        onSetHiddenColumns={setHiddenColumns}
      />

      {/* Loading state */}
      {docsLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      )}

      {/* Mini charts */}
      {!docsLoading && documents && documents.length > 0 && (
        <MiniChartsRow
          leftChart={{
            title: t("gabinet.formDocuments.byDay", "Dokumenty w czasie"),
            data: documentsByDay,
          }}
          rightChart={{
            title: t("gabinet.formDocuments.byStatus", "Dokumenty według statusu"),
            data: documentsByStatus,
          }}
        />
      )}

      {/* Empty state */}
      {!docsLoading && filteredDocuments.length === 0 && (
        <EmptyState
          icon={FileText}
          title={t("gabinet.formDocuments.emptyTitle", "Brak dokumentów")}
          description={t(
            "gabinet.formDocuments.emptyDescription",
            "Dokumenty formularzy pojawią się tutaj po ich wygenerowaniu z poziomu pacjenta lub wizyty.",
          )}
        />
      )}

      {/* Data Table */}
      {!docsLoading && filteredDocuments.length > 0 && (
        <CrmDataTable
          data={filteredDocuments}
          columns={allColumns}
          hiddenColumnIds={hiddenColumnIds}
          enableBulkSelect={true}
          getRowId={(item, index) => item._id ?? String(index)}
          onBulkAction={(action, items) => {
            if (action === "view") {
              if (items.length === 1) {
                setSelectedId(items[0]._id);
              }
            } else if (action === "resend") {
              items.forEach((item) => handleResendSigningEmail(item._id));
            } else if (action === "delete") {
              handleBulkDelete(items);
            }
          }}
          bulkActions={[
            {
              value: "view",
              label: t("common.view", "Podgląd"),
              icon: <FileText className="h-4 w-4" />,
            },
            {
              value: "resend",
              label: t("gabinet.formDocuments.resendSigningEmail", "Wyślij e-mail podpisu"),
              icon: <Send className="h-4 w-4" />,
            },
            {
              value: "delete",
              label: t("common.delete", "Usuń"),
              variant: "destructive",
              icon: <Trash2 className="h-4 w-4" />,
            },
          ]}
        />
      )}

      {/* Document viewer side panel */}
      <SidePanel
        open={!!selectedId}
        onOpenChange={(open) => {
          if (!open) setSelectedId(undefined);
        }}
        title={selectedDoc?.title ?? "—"}
        description={
          selectedDoc && (
            <span className="flex items-center gap-2">
              <DocumentStatusBadge
                status={selectedDoc.status as any}
              />
              <span className="text-xs">
                {formatDate(selectedDoc.createdAt)}
              </span>
            </span>
          )
        }
      >
        {selectedDoc && (
          <>
            {/* Statistics section */}
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                {t("gabinet.treatmentDetail.statistics", "Statystyki")}
              </p>
              <div className="rounded-md border p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar size={12} variant="stroke" />
                    {t("gabinet.formDocuments.createdAt", "Data utworzenia")}
                  </span>
                  <span className="text-xs font-semibold tabular-nums">
                    {formatDate(selectedDoc.createdAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <User size={12} variant="stroke" />
                    {t("gabinet.formDocuments.createdBy", "Utworzony przez")}
                  </span>
                  <span className="text-xs font-semibold tabular-nums">
                    {getUserName(selectedDoc.createdBy)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Tag size={12} variant="stroke" />
                    {t("gabinet.formDocuments.category", "Kategoria")}
                  </span>
                  <span className="text-xs font-semibold">
                    {getCategoryLabel(selectedDoc.templateId)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FileText size={12} variant="stroke" />
                    {t("gabinet.formDocuments.entityType", "Typ")}
                  </span>
                  <span className="text-xs font-semibold">
                    {getEntityTypeLabel(selectedDoc.entityType)}
                  </span>
                </div>
                {selectedDoc.status === "signed" && selectedDoc.signedAt && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <FileSignature size={12} variant="stroke" />
                      {t("gabinet.formDocuments.signedAt", "Podpisano")}
                    </span>
                    <span className="text-xs font-semibold tabular-nums">
                      {formatDate(selectedDoc.signedAt)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Document content */}
            {selectedTemplate &&
              (() => {
                // Try to extract rendered HTML from responseData
                try {
                  const parsed = JSON.parse(selectedDoc.responseData) as {
                    html?: string;
                  };
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

                // Fallback: re-render from contentJson + scope data
                if (selectedTemplate.contentJson) {
                  try {
                    const scopeFlat: Record<string, string> = {};
                    const parsed = JSON.parse(selectedDoc.responseData) as Record<
                      string,
                      unknown
                    >;
                    for (const [k, v] of Object.entries(parsed)) {
                      if (v != null) scopeFlat[k] = String(v);
                    }
                    const html = renderDocument(
                      selectedTemplate.contentJson,
                      scopeFlat,
                    );
                    return (
                      <div className="mt-6">
                        <DocumentViewer
                          title={selectedDoc.title}
                          html={html}
                          signatureData={selectedDoc.signatureData}
                          signedAt={selectedDoc.signedAt}
                        />
                      </div>
                    );
                  } catch {
                    // contentJson invalid — fall through
                  }
                }

                // Fallback: no viewable content
                return (
                  <div className="mt-6 flex items-center justify-center py-12 text-sm text-muted-foreground">
                    {t(
                      "gabinet.formDocuments.templateNotFound",
                      "Szablon dokumentu nie jest dostępny.",
                    )}
                  </div>
                );
              })()}
          </>
        )}

        {selectedDoc && !selectedTemplate && (
          <div className="mt-6 flex items-center justify-center py-12 text-sm text-muted-foreground">
            {t(
              "gabinet.formDocuments.templateNotFound",
              "Szablon dokumentu nie jest dostępny.",
            )}
          </div>
        )}
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
        entityType="gabinetDocument"
        categories={categories}
      />

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("gabinet.formDocuments.deleteDialogTitle", "Usuń dokument")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "gabinet.formDocuments.deleteDialogDescription",
                "Czy na pewno chcesz usunąć ten dokument? Tej operacji nie można cofnąć.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("common.cancel", "Anuluj")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete", "Usuń")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
