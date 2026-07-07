import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PermissionGate } from "@/hooks/use-permission";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { toast } from "sonner";
import { useSupabaseOrganizationMembers } from "@/hooks/use-supabase-organizations";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import { DocumentViewer } from "@/components/documents/document-viewer";
import { DocumentFormFiller } from "@/components/documents/document-form-filler";
import { TemplateFallbackViewer } from "@/components/documents/template-fallback-viewer";
import {
  extractFormFields,
  renderDocument,
} from "@/components/documents/document-renderer";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { type CrmColumn, useColumnVisibility, useAllColumns } from "@/components/crm/enhanced-data-table";
import { DocumentsGroupedView } from "@/components/documents/documents-grouped-view";
import { DataListFilterBar } from "@/components/crm/data-list-filter-bar";
import { MiniChartsRow, type MiniChartData } from "@/components/crm/mini-charts";
import { SidePanel } from "@/components/crm/side-panel";
import { Button } from "@/components/ui/button";
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
import { FileText, Send, Download, Menu, Trash2, Calendar, User, Tag, FileSignature, Pencil } from "@/lib/ez-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { useState, useMemo, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { FieldDef, FilterCondition, SavedView } from "@/components/crm/types";
import { useTagDefinitions } from "@/hooks/use-tag-definitions";
import { useCategoryDefinitions } from "@/hooks/use-category-definitions";
import { TagsManagerSlideout } from "@/components/categories-tags/tags-manager-slideout";
import { CategoriesManagerSlideout } from "@/components/categories-tags/categories-manager-slideout";
import { useSupabaseFormDocumentsList } from "@/hooks/use-supabase-form-documents";
import { useSupabaseGabinetPatientsList } from "@/hooks/use-supabase-gabinet-patients";
import { useSavedViews, applyFilterConditions } from "@/hooks/use-saved-views";
import { useSidebarDispatch } from "@/components/layout/sidebar-context";

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

function GabinetDocumentsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-9 w-28" />
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/documents/",
)({
  component: () => (
    <PermissionGate feature="document_instances" action="view" loadingFallback={<GabinetDocumentsSkeleton />}>
      <GabinetDocumentsPage />
    </PermissionGate>
  ),
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
  const queryClient = useQueryClient();
  const lang = i18n.language === "en" ? "en" : "pl";

  const { tags } = useTagDefinitions(organizationId);
  const { categories } = useCategoryDefinitions(organizationId, "gabinetDocument");
  const [tagsSlideoutOpen, setTagsSlideoutOpen] = useState(false);
  const [categoriesSlideoutOpen, setCategoriesSlideoutOpen] = useState(false);
  const [filterSlideoutOpen, setFilterSlideoutOpen] = useState(false);

  useSidebarDispatch("openFilter", () => setFilterSlideoutOpen(true));
  useSidebarDispatch("createFromTemplate", () =>
    navigate({ to: "/dashboard/gabinet/document-templates" }),
  );

  // --- State ---
  const [searchValue, setSearchValue] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [docToDelete, setDocToDelete] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<FilterCondition[]>([]);
  const [savedViewsDialogOpen, setSavedViewsDialogOpen] = useState(false);

  // --- System views ---
  const systemViews = useMemo((): SavedView[] => [
    { id: "all", name: t("gabinet.formDocuments.views.all", "Wszystkie"), isSystem: true, isDefault: true },
    { id: "draft", name: t("gabinet.formDocuments.views.draft", "Wersje robocze"), isSystem: true, isDefault: false },
    { id: "pending_signature", name: t("gabinet.formDocuments.views.pendingSignature", "Oczekujące podpisu"), isSystem: true, isDefault: false },
    { id: "signed", name: t("gabinet.formDocuments.views.signed", "Podpisane"), isSystem: true, isDefault: false },
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

  useSidebarDispatch("pendingSignatures", () =>
    onViewChange("pending_signature"),
  );

  // --- Mutations ---
  const resendSigningEmail = useAction(api.documents.documents.resendSigningEmail);
  const removeDocument = useAction(api.documents.documents.remove);
  const updateResponseData = useAction(api.documents.documents.updateResponseData);
  const resolveContentJsonAction = useAction(
    api.documents.components.resolveContentJson,
  );

  // --- Edit mode state ---
  const [isEditing, setIsEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

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
    const map = new Map<string, { name?: string; email?: string }>();
    if (!members) return map;
    for (const m of members) {
      if (m.user) {
        map.set(m.user._id as string, {
          name: m.user.name ?? undefined,
          email: m.user.email ?? undefined,
        });
      }
    }
    return map;
  }, [members]);

  const { data: patients } = useSupabaseGabinetPatientsList(organizationId);
  const patientMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of patients ?? []) {
      map.set(p._id, [p.firstName, p.lastName].filter(Boolean).join(" "));
    }
    return map;
  }, [patients]);

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

    // Decorate rows with derived fields used by manual filters (e.g. category)
    let data = documents.map((doc) => ({
      ...doc,
      category: templateMap.get(doc.templateId)?.category ?? null,
    }));

    // Apply system-view (status-based) filtering
    switch (activeViewId) {
      case "draft":
        data = data.filter((d) => d.status === "draft");
        break;
      case "pending_signature":
        data = data.filter((d) => d.status === "pending_signature");
        break;
      case "signed":
        data = data.filter((d) => d.status === "signed");
        break;
      default:
        break;
    }

    // Apply saved-view filters
    data = applyFilters(data) as typeof data;

    // Apply manual filter conditions from the filter bar
    data = applyFilterConditions(data, activeFilters) as typeof data;

    // Apply free-text search on title
    if (searchValue.trim()) {
      const q = searchValue.trim().toLowerCase();
      data = data.filter((d) => d.title.toLowerCase().includes(q));
    }

    return data;
  }, [documents, activeViewId, applyFilters, activeFilters, searchValue, templateMap]);

  // --- Selected document for viewer ---
  const selectedDoc = useMemo(() => {
    if (!selectedId || !documents) return null;
    return documents.find((d) => d._id === selectedId) ?? null;
  }, [selectedId, documents]);

  const selectedTemplate = useMemo(() => {
    if (!selectedDoc) return null;
    return templateMap.get(selectedDoc.templateId) ?? null;
  }, [selectedDoc, templateMap]);

  // --- Editable form fields for selected document ---
  // Pulls employee-fillable fields from the template and pre-populates them
  // from the values stored in the document's responseData.
  const editableFormFields = useMemo(() => {
    if (!selectedTemplate?.contentJson) return [];
    try {
      const all = extractFormFields(JSON.parse(selectedTemplate.contentJson));
      return all.filter((f) => (f.filledBy || "employee") === "employee");
    } catch {
      return [];
    }
  }, [selectedTemplate?.contentJson]);

  const allTemplateFormFields = useMemo(() => {
    if (!selectedTemplate?.contentJson) return [];
    try {
      return extractFormFields(JSON.parse(selectedTemplate.contentJson));
    } catch {
      return [];
    }
  }, [selectedTemplate?.contentJson]);

  const parsedResponseData = useMemo(() => {
    if (!selectedDoc) return null;
    try {
      return JSON.parse(selectedDoc.responseData) as Record<string, unknown>;
    } catch {
      return null;
    }
  }, [selectedDoc]);

  const existingFormFieldValues = useMemo(() => {
    const out: Record<string, string> = {};
    const raw = parsedResponseData?.formFieldValues;
    if (raw && typeof raw === "object") {
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (v != null) out[k] = String(v);
      }
    }
    return out;
  }, [parsedResponseData]);

  const existingScopeData = useMemo(() => {
    if (!parsedResponseData) return {} as Record<string, string>;
    const out: Record<string, string> = {};
    // scopeData is nested when html is present, otherwise the top-level object IS the scope map
    const source =
      typeof parsedResponseData.scopeData === "object" && parsedResponseData.scopeData !== null
        ? (parsedResponseData.scopeData as Record<string, unknown>)
        : !parsedResponseData.html
          ? parsedResponseData
          : {};
    for (const [k, v] of Object.entries(source)) {
      if (k === "html" || k === "formFieldValues" || k === "scopeData") continue;
      if (v != null) out[k] = String(v);
    }
    return out;
  }, [parsedResponseData]);

  const canEditDocument =
    !!selectedDoc &&
    selectedDoc.status === "draft" &&
    editableFormFields.length > 0;

  // Reset edit mode whenever the selection changes
  useEffect(() => {
    setIsEditing(false);
  }, [selectedId]);

  const handleSaveEdit = useCallback(
    async (fieldValues: Record<string, string>) => {
      if (!selectedDoc || !selectedTemplate?.contentJson) return;
      setSavingEdit(true);
      try {
        const mergedFieldValues = { ...existingFormFieldValues, ...fieldValues };
        // Resolve componentBlock nodes before generateHTML so the persisted
        // HTML doesn't contain "[Komponent: <id>]" placeholders (#1915).
        const resolvedContentJson = await resolveContentJsonAction({
          organizationId,
          contentJson: selectedTemplate.contentJson,
        });
        const renderedHtml = renderDocument(
          resolvedContentJson,
          existingScopeData,
          mergedFieldValues,
        );
        const newResponseData: Record<string, unknown> = {
          html: renderedHtml,
          formFieldValues: mergedFieldValues,
        };
        if (Object.keys(existingScopeData).length > 0) {
          newResponseData.scopeData = existingScopeData;
        }
        await updateResponseData({
          organizationId,
          documentId: selectedDoc._id,
          responseData: JSON.stringify(newResponseData),
        });
        await queryClient.invalidateQueries({
          queryKey: supabaseKeys.formDocuments.all,
        });
        toast.success(
          t("gabinet.formDocuments.editSaved", "Dokument zaktualizowany"),
        );
        setIsEditing(false);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : t("common.error", "Wystąpił błąd");
        toast.error(message);
      } finally {
        setSavingEdit(false);
      }
    },
    [
      selectedDoc,
      selectedTemplate?.contentJson,
      existingFormFieldValues,
      existingScopeData,
      updateResponseData,
      resolveContentJsonAction,
      organizationId,
      queryClient,
      t,
    ],
  );

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
        className: "min-w-[200px]",
        render: (item) => (
          <div className="font-medium">{item.title}</div>
        ),
      },
      {
        id: "signedBy",
        label: t("gabinet.formDocuments.colSignedBy", "Podpisał/a"),
        className: "min-w-[140px]",
        render: (item) => {
          const name = item.signedByName ||
            (item.entityType === "patient" ? patientMap.get(item.entityId) : undefined);
          return (
            <span className="text-sm text-muted-foreground">
              {name || "—"}
            </span>
          );
        },
      },
      {
        id: "status",
        label: t("gabinet.formDocuments.colStatus", "Status"),
        className: "min-w-[140px]",
        render: (item) => (
          <DocumentStatusBadge status={item.status as any} />
        ),
      },
      {
        id: "createdAt",
        label: t("gabinet.formDocuments.colCreatedAt", "Data utworzenia"),
        className: "min-w-[130px]",
        render: (item) => (
          <span className="text-sm text-muted-foreground">
            {formatDate(item.createdAt)}
          </span>
        ),
      },
      {
        id: "signedAt",
        label: t("gabinet.formDocuments.colSignedAt", "Data podpisania"),
        className: "min-w-[130px]",
        render: (item) => (
          <span className="text-sm text-muted-foreground">
            {item.signedAt ? formatDate(item.signedAt) : "—"}
          </span>
        ),
      },
      {
        id: "expiresAt",
        label: t("gabinet.formDocuments.colExpiresAt", "Data wygaśnięcia"),
        className: "min-w-[130px]",
        render: (item) => (
          <span className="text-sm text-muted-foreground">
            {item.status !== "signed" && item.signingTokenExpiresAt
              ? formatDate(item.signingTokenExpiresAt)
              : "—"}
          </span>
        ),
      },
      {
        id: "createdBy",
        label: t("gabinet.formDocuments.colCreatedBy", "Utworzony przez"),
        className: "min-w-[130px]",
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
                <Menu className="h-4 w-4" />
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
  }, [t, getUserName, formatDate, patientMap]);

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
              navigate({ to: "/dashboard/gabinet/document-templates" })
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
        <div className="md:[&_th:first-child]:w-[72px] md:[&_td:first-child]:w-[72px]">
        <DocumentsGroupedView
          documents={filteredDocuments}
          columns={allColumns}
          hiddenColumnIds={hiddenColumnIds}
          getFolderPath={(doc) => templateMap.get(doc.templateId)?.folderPath ?? undefined}
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
        </div>
      )}

      {/* Document viewer side panel */}
      <SidePanel
        open={!!selectedId}
        onOpenChange={(open) => {
          if (!open) setSelectedId(undefined);
        }}
        title={selectedDoc?.title ?? "—"}
      >
        {selectedDoc && (
          <>
            <div className="flex items-center gap-2 -mt-2 mb-2">
              <DocumentStatusBadge status={selectedDoc.status as any} />
              <span className="text-xs text-muted-foreground">
                {formatDate(selectedDoc.createdAt)}
              </span>
              {canEditDocument && !isEditing && (
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto h-7"
                  onClick={() => setIsEditing(true)}
                >
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  {t("common.edit", "Edytuj")}
                </Button>
              )}
            </div>
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

            {/* Edit mode: re-fill form fields */}
            {isEditing && selectedTemplate && (
              <div className="mt-6 space-y-3">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  {t("gabinet.formDocuments.editFields", "Edytuj pola dokumentu")}
                </p>
                <DocumentFormFiller
                  formFields={allTemplateFormFields}
                  filledByFilter="employee"
                  initialValues={existingFormFieldValues}
                  submitLabel={
                    savingEdit
                      ? t("common.saving", "Zapisywanie...")
                      : t("common.save", "Zapisz")
                  }
                  onComplete={handleSaveEdit}
                  onCancel={() => setIsEditing(false)}
                />
              </div>
            )}

            {/* Document content (view mode) */}
            {!isEditing && selectedTemplate &&
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
