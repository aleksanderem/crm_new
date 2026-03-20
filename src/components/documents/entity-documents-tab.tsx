import { useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { Plus, FileText, Eye, Loader2 } from "@/lib/ez-icons";
import { ScrollShadow } from "@/components/ui/scroll-shadow";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { DocumentStatusBadge } from "./document-status-badge";
import { GenerateDocumentDialog } from "./generate-document-dialog";
import { SurveyFormViewer } from "./survey-form-viewer";
import { SurveyPdfExportButton } from "./survey-pdf-export-button";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EntityDocumentsTabProps {
  entityType: string;
  entityId: string;
  organizationId: Id<"organizations">;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EntityDocumentsTab({
  entityType,
  entityId,
  organizationId,
}: EntityDocumentsTabProps) {
  const { t, i18n } = useTranslation();

  const [generateOpen, setGenerateOpen] = useState(false);
  const [viewingDocId, setViewingDocId] =
    useState<Id<"formDocuments"> | null>(null);

  // --- Document list ---

  const {
    data: documents,
    isLoading,
    refetch,
  } = useQuery(
    convexQuery(api.documents.documents.listByEntity, {
      organizationId,
      entityType,
      entityId,
    }),
  );

  const handleDocumentCreated = useCallback(() => {
    refetch();
  }, [refetch]);

  // --- Viewing document ---

  const { data: viewingDoc, isLoading: viewingDocLoading } = useQuery({
    ...convexQuery(api.documents.documents.getById, {
      organizationId,
      documentId: viewingDocId!,
    }),
    enabled: !!viewingDocId,
  });

  const { data: viewingTemplate } = useQuery({
    ...convexQuery(api.documents.templates.getById, {
      organizationId,
      templateId: viewingDoc?.templateId!,
    }),
    enabled: !!viewingDoc?.templateId,
  });

  // Fetch scope data to merge with responseData for viewer pre-fill
  const { data: scopeData } = useQuery({
    ...convexQuery(api.documents.generate.resolveEntityScope, {
      organizationId,
      entityType,
      entityId,
    }),
    enabled: !!viewingDocId,
  });

  // Merge scope data (pre-fill) with saved responseData
  const mergedResponseData = useMemo(() => {
    const saved = viewingDoc?.responseData
      ? (JSON.parse(viewingDoc.responseData) as Record<string, unknown>)
      : {};

    // Flatten scope data to dot-notation (patient.firstName, treatment.name, etc.)
    const scopeFlat: Record<string, string> = {};
    if (scopeData) {
      for (const [entityType, fields] of Object.entries(scopeData)) {
        if (typeof fields !== "object" || fields === null) continue;
        for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
          if (value !== null && value !== undefined) {
            scopeFlat[`${entityType}.${key}`] = String(value);
          }
        }
      }
    }

    // Fallback mappings: if contact.* missing, use patient.* and vice versa
    if (scopeFlat["patient.firstName"] && !scopeFlat["contact.firstName"]) {
      scopeFlat["contact.firstName"] = scopeFlat["patient.firstName"];
      scopeFlat["contact.lastName"] = scopeFlat["patient.lastName"] ?? "";
      scopeFlat["contact.email"] = scopeFlat["patient.email"] ?? "";
      scopeFlat["contact.phone"] = scopeFlat["patient.phone"] ?? "";
    }

    // System date fallback if backend hasn't provided it
    if (!scopeFlat["system.date_pl"]) {
      const now = new Date();
      scopeFlat["system.date"] = now.toISOString().split("T")[0];
      scopeFlat["system.date_pl"] = now.toLocaleDateString("pl-PL", {
        day: "numeric", month: "long", year: "numeric",
      });
      scopeFlat["system.year"] = String(now.getFullYear());
    }

    // Scope data as base, saved responseData overrides
    return { ...scopeFlat, ...saved };
  }, [viewingDoc?.responseData, scopeData]);

  // --- Loading ---

  if (isLoading) {
    return (
      <div className="space-y-3 p-1">
        <div className="flex justify-end">
          <Skeleton className="h-9 w-52" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  // --- Empty state ---

  if (!documents || documents.length === 0) {
    return (
      <>
        <EmptyState
          icon={FileText}
          title={t("documents.noDocuments", "Brak dokumentow")}
          description={t(
            "documents.noDocumentsDesc",
            "Nie ma jeszcze zadnych dokumentow. Wygeneruj pierwszy z szablonu.",
          )}
          action={
            <Button size="sm" onClick={() => setGenerateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" variant="stroke" />
              {t("documents.generate", "Wygeneruj dokument")}
            </Button>
          }
        />

        <GenerateDocumentDialog
          open={generateOpen}
          onOpenChange={setGenerateOpen}
          entityType={entityType}
          entityId={entityId}
          organizationId={organizationId}
          onDocumentCreated={handleDocumentCreated}
        />
      </>
    );
  }

  // --- Document list ---

  return (
    <>
      <div className="space-y-3 p-1">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setGenerateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" variant="stroke" />
            {t("documents.generate", "Wygeneruj dokument")}
          </Button>
        </div>

        <div className="rounded-lg border divide-y">
          {documents.map((doc) => (
            <button
              key={doc._id}
              type="button"
              onClick={() => setViewingDocId(doc._id)}
              className={cn(
                "w-full flex items-center justify-between gap-3 px-4 py-3",
                "text-left transition-colors hover:bg-accent cursor-pointer",
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{doc.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(doc.createdAt).toLocaleDateString(
                      i18n.language === "en" ? "en-US" : "pl-PL",
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <DocumentStatusBadge status={doc.status} />
                <Eye className="h-4 w-4 text-muted-foreground" variant="stroke" />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Generate dialog */}
      <GenerateDocumentDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        entityType={entityType}
        entityId={entityId}
        organizationId={organizationId}
        onDocumentCreated={handleDocumentCreated}
      />

      {/* Document viewer sheet */}
      <Sheet
        open={!!viewingDocId}
        onOpenChange={(open) => !open && setViewingDocId(null)}
      >
        <SheetContent className="w-full sm:max-w-2xl flex flex-col overflow-hidden">
          <SheetHeader>
            <SheetTitle>
              {viewingDoc?.title ??
                t("documents.document", "Dokument")}
            </SheetTitle>
          </SheetHeader>

          <ScrollShadow className="flex-1 min-h-0 overflow-y-auto">
            {viewingDocLoading && (
              <div className="flex items-center justify-center py-24 text-sm text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("common.loading", "Ladowanie...")}
              </div>
            )}

            {viewingDoc && (
              <div className="space-y-4 mt-4">
                <div className="flex items-center gap-2">
                  <DocumentStatusBadge status={viewingDoc.status} />
                  {viewingDoc.signedAt && (
                    <span className="text-xs text-muted-foreground">
                      {t("documents.signedAt", "Podpisano")}:{" "}
                      {new Date(viewingDoc.signedAt).toLocaleDateString(
                        i18n.language === "en" ? "en-US" : "pl-PL",
                      )}
                    </span>
                  )}
                </div>

                {viewingTemplate && (
                  <>
                    <SurveyFormViewer
                      formJson={viewingTemplate.formJson}
                      responseData={mergedResponseData}
                      signatureData={viewingDoc.signatureData}
                      signedAt={viewingDoc.signedAt}
                    />

                    <SurveyPdfExportButton
                      formJson={viewingTemplate.formJson}
                      responseData={mergedResponseData}
                      title={viewingDoc.title}
                    />
                  </>
                )}
              </div>
            )}
          </ScrollShadow>
        </SheetContent>
      </Sheet>
    </>
  );
}

export type { EntityDocumentsTabProps };
