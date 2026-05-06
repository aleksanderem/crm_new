import { useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
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
import { DocumentViewer } from "./document-viewer";
import { renderDocument } from "./document-renderer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EntityDocumentsTabProps {
  entityType: string;
  entityId: string;
  organizationId: Id<"organizations">;
}

type FormDocumentStatus =
  | "draft"
  | "pending_signature"
  | "signed"
  | "completed"
  | "expired"
  | "voided";

interface FormDocument {
  _id: Id<"formDocuments">;
  title: string;
  status: FormDocumentStatus;
  templateId: Id<"formTemplates">;
  createdAt: number;
  responseData?: string;
  signedAt?: number;
  signatureData?: string;
  signedByName?: string;
}

interface FormTemplate {
  templateType?: string;
  contentJson?: string;
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

  const listDocumentsByEntity = useAction(api.documents.documents.listByEntity);
  const {
    data: documentsRaw,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["documents.documents.listByEntity", organizationId, entityType, entityId],
    queryFn: () =>
      listDocumentsByEntity({
        organizationId,
        entityType,
        entityId,
      }),
    enabled: !!organizationId && !!entityType && !!entityId,
  });
  const documents = documentsRaw as unknown as FormDocument[] | undefined;

  const handleDocumentCreated = useCallback(() => {
    refetch();
  }, [refetch]);

  // --- Viewing document ---

  const getDocumentById = useAction(api.documents.documents.getById);
  const getTemplateById = useAction(api.documents.templates.getById);
  const { data: viewingDocRaw, isLoading: viewingDocLoading } = useQuery({
    queryKey: ["documents.documents.getById", organizationId, viewingDocId],
    queryFn: () =>
      getDocumentById({
        organizationId,
        documentId: viewingDocId!,
      }),
    enabled: !!viewingDocId,
  });
  const viewingDoc = viewingDocRaw as unknown as FormDocument | undefined;

  const { data: viewingTemplateRaw } = useQuery({
    queryKey: ["documents.templates.getById", organizationId, viewingDoc?.templateId],
    queryFn: () =>
      getTemplateById({
        organizationId,
        templateId: String(viewingDoc?.templateId ?? ""),
      }),
    enabled: !!viewingDoc?.templateId,
  });
  const viewingTemplate = viewingTemplateRaw as unknown as FormTemplate | undefined;

  // Fetch scope data to merge with responseData for viewer pre-fill (Supabase)
  const resolveEntityScopeAction = useAction(api.documents.generate.resolveEntityScope);
  const { data: scopeData } = useQuery({
    queryKey: ["documents.generate.resolveEntityScope", organizationId, entityType, entityId],
    queryFn: () =>
      resolveEntityScopeAction({
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

                {viewingTemplate &&
                  (() => {
                    // Try document-type viewer: check responseData for { html } field
                    try {
                      const parsed = JSON.parse(
                        viewingDoc.responseData ?? "{}",
                      ) as { html?: string };
                      if (parsed.html) {
                        return (
                          <DocumentViewer
                            title={viewingDoc.title}
                            html={parsed.html}
                            signatureData={viewingDoc.signatureData}
                            signedByName={viewingDoc.signedByName}
                            signedAt={viewingDoc.signedAt}
                          />
                        );
                      }
                    } catch {
                      // Not JSON with html — fall through
                    }

                    // Fallback for document-type templates generated via wrong path:
                    // re-render from contentJson + scope data on the fly
                    if (
                      viewingTemplate.templateType === "document" &&
                      viewingTemplate.contentJson
                    ) {
                      try {
                        const scopeFlat: Record<string, string> = {};
                        for (const [k, v] of Object.entries(
                          mergedResponseData,
                        )) {
                          if (v != null) scopeFlat[k] = String(v);
                        }
                        const html = renderDocument(
                          viewingTemplate.contentJson,
                          scopeFlat,
                        );
                        return (
                          <DocumentViewer
                            title={viewingDoc.title}
                            html={html}
                            signatureData={viewingDoc.signatureData}
                            signedByName={viewingDoc.signedByName}
                            signedAt={viewingDoc.signedAt}
                          />
                        );
                      } catch {
                        // contentJson invalid — fall through to empty state
                      }
                    }

                    // Fallback: no viewable content
                    return (
                      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                        <FileText className="h-7 w-7" />
                        <p className="text-sm">
                          {t("documents.noContentAvailable", "Brak tresci dokumentu do wyswietlenia.")}
                        </p>
                      </div>
                    );
                  })()}
              </div>
            )}
          </ScrollShadow>
        </SheetContent>
      </Sheet>
    </>
  );
}

export type { EntityDocumentsTabProps };
