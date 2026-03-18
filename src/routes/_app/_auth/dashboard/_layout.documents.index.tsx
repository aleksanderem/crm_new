import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import type { FormDocumentStatus } from "@/components/documents/document-status-badge";
import { SurveyFormViewer } from "@/components/documents/survey-form-viewer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { ClipboardList, Search, FileText } from "@/lib/ez-icons";
import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { Id } from "@cvx/_generated/dataModel";

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/documents/",
)({
  component: DocumentsPage,
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function DocumentsPage() {
  const { t, i18n } = useTranslation();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const lang = i18n.language === "en" ? "en" : "pl";

  // --- State ---
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selectedDocId, setSelectedDocId] =
    useState<Id<"formDocuments"> | null>(null);

  // --- Data ---
  const { data: documents, isLoading: docsLoading } = useQuery({
    ...convexQuery(api.documents.documents.listAll, {
      organizationId,
    }),
  });

  const { data: templates } = useQuery({
    ...convexQuery(api.documents.templates.list, {
      organizationId,
    }),
  });

  const { data: members } = useQuery({
    ...convexQuery(api.organizations.getMembers, {
      organizationId,
    }),
  });

  // Build template lookup
  type TemplateDoc = NonNullable<typeof templates>[number];
  const templateMap = useMemo(() => {
    if (!templates) return new Map<Id<"formTemplates">, TemplateDoc>();
    return new Map(templates.map((tpl) => [tpl._id, tpl]));
  }, [templates]);

  // Build user lookup from org members
  const userMap = useMemo(() => {
    if (!members)
      return new Map<
        Id<"users">,
        { name?: string; email?: string }
      >();
    const map = new Map<
      Id<"users">,
      { name?: string; email?: string }
    >();
    for (const m of members) {
      if (m.user) map.set(m.user._id, m.user);
    }
    return map;
  }, [members]);

  // Extract unique categories from loaded templates
  const availableCategories = useMemo(() => {
    if (!templates) return [] as string[];
    const cats = new Set(templates.map((tpl) => tpl.category));
    return Array.from(cats).sort();
  }, [templates]);

  // --- Filtered data ---
  const filteredDocuments = useMemo(() => {
    if (!documents) return [];
    return documents.filter((doc) => {
      // Status filter
      if (statusFilter !== "all" && doc.status !== statusFilter) return false;
      // Category filter (look up template)
      if (categoryFilter !== "all") {
        const tpl = templateMap.get(doc.templateId);
        if (!tpl || tpl.category !== categoryFilter) return false;
      }
      // Search by title
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!doc.title.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [documents, statusFilter, categoryFilter, search, templateMap]);

  // --- Selected document for viewer ---
  const selectedDoc = useMemo(() => {
    if (!selectedDocId || !documents) return null;
    return documents.find((d) => d._id === selectedDocId) ?? null;
  }, [selectedDocId, documents]);

  const selectedTemplate = useMemo(() => {
    if (!selectedDoc) return null;
    return templateMap.get(selectedDoc.templateId) ?? null;
  }, [selectedDoc, templateMap]);

  // --- Helpers ---
  const getCategoryLabel = useCallback(
    (templateId: Id<"formTemplates">) => {
      const tpl = templateMap.get(templateId);
      if (!tpl) return "\u2014";
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
    (userId: Id<"users">) => {
      const u = userMap.get(userId);
      if (!u) return "\u2014";
      return u.name ?? u.email ?? "\u2014";
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

  // --- Render ---

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("documents.title", "Dokumenty")}
        description={t(
          "documents.description",
          "Dokumenty formularzy kontakt\u00F3w, firm i lead\u00F3w",
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

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t(
              "documents.searchPlaceholder",
              "Szukaj po tytule...",
            )}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue
              placeholder={t("documents.allStatuses", "Wszystkie statusy")}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {t("documents.allStatuses", "Wszystkie statusy")}
            </SelectItem>
            {STATUS_OPTIONS.map((status) => (
              <SelectItem key={status} value={status}>
                <DocumentStatusBadge status={status} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue
              placeholder={t(
                "documents.allCategories",
                "Wszystkie kategorie",
              )}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {t("documents.allCategories", "Wszystkie kategorie")}
            </SelectItem>
            {availableCategories.map((cat) => {
              const labels = FORM_CATEGORY_LABELS[cat];
              return (
                <SelectItem key={cat} value={cat}>
                  {labels ? labels[lang] : cat}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Loading state */}
      {docsLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!docsLoading && filteredDocuments.length === 0 && (
        <EmptyState
          icon={ClipboardList}
          title={t("documents.emptyTitle", "Brak dokument\u00F3w")}
          description={t(
            "documents.emptyDescription",
            "Dokumenty formularzy pojawi\u0105 si\u0119 tutaj po ich wygenerowaniu z poziomu kontaktu, firmy lub leada.",
          )}
        />
      )}

      {/* Table */}
      {!docsLoading && filteredDocuments.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  {t("documents.colTitle", "Tytu\u0142")}
                </TableHead>
                <TableHead>
                  {t("documents.colCategory", "Kategoria")}
                </TableHead>
                <TableHead>
                  {t("documents.colEntityType", "Typ")}
                </TableHead>
                <TableHead>
                  {t("documents.colStatus", "Status")}
                </TableHead>
                <TableHead>
                  {t("documents.colCreatedAt", "Data utworzenia")}
                </TableHead>
                <TableHead>
                  {t("documents.colCreatedBy", "Utworzony przez")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDocuments.map((doc) => (
                <TableRow
                  key={doc._id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedDocId(doc._id)}
                >
                  <TableCell className="font-medium">{doc.title}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {getCategoryLabel(doc.templateId)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {getEntityTypeLabel(doc.entityType)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <DocumentStatusBadge
                      status={doc.status as FormDocumentStatus}
                    />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(doc.createdAt)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {getUserName(doc.createdBy)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

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

          {selectedDoc && selectedTemplate && (
            <div className="mt-6">
              <SurveyFormViewer
                formJson={selectedTemplate.formJson}
                responseData={
                  JSON.parse(selectedDoc.responseData) as Record<
                    string,
                    unknown
                  >
                }
                signatureData={selectedDoc.signatureData}
                signedAt={selectedDoc.signedAt}
              />
            </div>
          )}

          {selectedDoc && !selectedTemplate && (
            <div className="mt-6 flex items-center justify-center py-12 text-sm text-muted-foreground">
              {t(
                "documents.templateNotFound",
                "Szablon dokumentu nie jest dost\u0119pny.",
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
