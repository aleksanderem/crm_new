import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { toast } from "sonner";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import {
  CircleCheck,
  Clock,
  AlertCircle,
  FileText,
  Eye,
  Plus,
  Loader2,
  Send,
} from "@/lib/ez-icons";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { DocumentStatusBadge } from "./document-status-badge";
import { DocumentViewer } from "./document-viewer";
import { TemplateFallbackViewer } from "./template-fallback-viewer";
import { GenerateDocumentDialog } from "./generate-document-dialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AppointmentDocumentChecklistProps {
  appointmentId: string;
  organizationId: Id<"organizations">;
  treatmentId?: string;
  onDocumentClick?: (documentId: string) => void;
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
  timing?: "before_start" | "after_completion";
  signedAt?: number;
  responseData?: string;
  signingToken?: string;
  signingEmailSentAt?: number;
  signatureData?: string;
  signedByName?: string;
}

interface FormTemplate {
  templateType?: string;
  contentJson?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isDocumentCompleted(status: FormDocumentStatus): boolean {
  return status === "signed" || status === "completed";
}

function getStatusIcon(status: FormDocumentStatus) {
  if (isDocumentCompleted(status)) {
    return <CircleCheck className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />;
  }
  if (status === "pending_signature" || status === "draft") {
    return <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />;
  }
  return <AlertCircle className="h-5 w-5 text-red-500 dark:text-red-400 shrink-0" />;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AppointmentDocumentChecklist({
  appointmentId,
  organizationId,
  treatmentId: _treatmentId,
  onDocumentClick,
}: AppointmentDocumentChecklistProps) {
  const { t, i18n } = useTranslation();

  const [viewingDocId, setViewingDocId] =
    useState<Id<"formDocuments"> | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);

  // Fetch all documents for this appointment
  const listDocumentsByEntity = useAction(api.documents.documents.listByEntity);
  const {
    data: documents,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["documents.documents.listByEntity", organizationId, "appointment", appointmentId],
    queryFn: () =>
      listDocumentsByEntity({
        organizationId,
        entityType: "appointment",
        entityId: appointmentId,
      }),
    enabled: !!organizationId && !!appointmentId,
  });

  // Viewing document (Supabase-primary actions)
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

  const handleDocumentCreated = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleDocClick = useCallback(
    (docId: string) => {
      if (onDocumentClick) {
        onDocumentClick(docId);
      } else {
        setViewingDocId(docId as Id<"formDocuments">);
      }
    },
    [onDocumentClick],
  );

  // --- Loading ---
  if (isLoading) {
    return (
      <div className="space-y-4 p-1">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-3 w-full rounded-full" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const allDocs = (documents ?? []) as unknown as FormDocument[];

  // Split by timing
  const beforeDocs = allDocs.filter((d) => d.timing === "before_start");
  const afterDocs = allDocs.filter((d) => d.timing === "after_completion");
  const untimed = allDocs.filter(
    (d) => !d.timing || (d.timing !== "before_start" && d.timing !== "after_completion"),
  );

  const hasRequiredDocs = beforeDocs.length > 0 || afterDocs.length > 0;

  // --- Empty state ---
  if (!hasRequiredDocs && untimed.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={FileText}
          title={t(
            "documents.noRequiredDocuments",
            "Brak wymaganych dokumentow",
          )}
          description={t(
            "documents.noRequiredDocumentsDesc",
            "Zabieg nie ma przypisanych szablonow dokumentow. Mozesz wygenerowac dokument recznie.",
          )}
          action={
            <Button onClick={() => setGenerateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" variant="stroke" />
              {t("documents.generate", "Wygeneruj dokument")}
            </Button>
          }
        />

        <GenerateDocumentDialog
          open={generateOpen}
          onOpenChange={setGenerateOpen}
          entityType="appointment"
          entityId={appointmentId}
          organizationId={organizationId}
          onDocumentCreated={handleDocumentCreated}
        />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6 p-1">
        {/* Before appointment section */}
        {beforeDocs.length > 0 && (
          <DocumentSection
            title={t("documents.beforeAppointment", "Przed wizyta")}
            documents={beforeDocs}
            organizationId={organizationId}
            onDocumentClick={handleDocClick}
            t={t as (key: string, fallback?: string) => string}
          />
        )}

        {/* After appointment section */}
        {afterDocs.length > 0 && (
          <DocumentSection
            title={t("documents.afterAppointment", "Po wizycie")}
            documents={afterDocs}
            organizationId={organizationId}
            onDocumentClick={handleDocClick}
            t={t as (key: string, fallback?: string) => string}
          />
        )}

        {/* Untimed / ad-hoc documents */}
        {untimed.length > 0 && (
          <DocumentSection
            title={t("documents.otherDocuments", "Inne dokumenty")}
            documents={untimed}
            organizationId={organizationId}
            onDocumentClick={handleDocClick}
            t={t as (key: string, fallback?: string) => string}
          />
        )}

        {/* Generate additional document button */}
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setGenerateOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" variant="stroke" />
            {t("documents.generateAdditional", "Wygeneruj dodatkowy dokument")}
          </Button>
        </div>
      </div>

      {/* Generate dialog */}
      <GenerateDocumentDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        entityType="appointment"
        entityId={appointmentId}
        organizationId={organizationId}
        onDocumentCreated={handleDocumentCreated}
      />

      {/* Document viewer sheet */}
      <Sheet
        open={!!viewingDocId}
        onOpenChange={(open) => !open && setViewingDocId(null)}
      >
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {viewingDoc?.title ?? t("documents.document", "Dokument")}
            </SheetTitle>
          </SheetHeader>

          {viewingDocLoading && (
            <div className="flex items-center justify-center py-24 text-sm text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("common.loading", "Ladowanie...")}
            </div>
          )}

          {viewingDoc && !viewingDocLoading && (
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

              {viewingTemplate && viewingDoc.responseData &&
                (() => {
                  // Try document-type viewer: check responseData for { html } field
                  try {
                    const parsed = JSON.parse(viewingDoc.responseData) as { html?: string };
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
                    // fall through
                  }

                  // Fallback: re-render from contentJson for document-type templates
                  if (
                    viewingTemplate.templateType === "document" &&
                    viewingTemplate.contentJson
                  ) {
                    try {
                      const scope: Record<string, string> = {};
                      const rd = JSON.parse(viewingDoc.responseData);
                      for (const [k, v] of Object.entries(rd)) {
                        if (v != null) scope[k] = String(v);
                      }
                      return (
                        <TemplateFallbackViewer
                          title={viewingDoc.title}
                          contentJson={viewingTemplate.contentJson}
                          scopeData={scope}
                          signatureData={viewingDoc.signatureData}
                          signedByName={viewingDoc.signedByName}
                          signedAt={viewingDoc.signedAt}
                        />
                      );
                    } catch {
                      // fall through to empty state
                    }
                  }

                  // Fallback: no viewable content
                  return (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                      <FileText className="h-7 w-7" />
                      <p className="text-sm">
                        Brak tresci dokumentu do wyswietlenia.
                      </p>
                    </div>
                  );
                })()}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

// ---------------------------------------------------------------------------
// Document Section sub-component
// ---------------------------------------------------------------------------

function DocumentSection({
  title,
  documents,
  organizationId,
  onDocumentClick,
  t,
}: {
  title: string;
  documents: FormDocument[];
  organizationId: Id<"organizations">;
  onDocumentClick: (docId: string) => void;
  t: (key: string, fallback?: string) => string;
}) {
  const resendSigningEmail = useAction(api.documents.documents.resendSigningEmail);
  const [resendingDocId, setResendingDocId] = useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = useState<string | null>(null);

  const handleResend = useCallback(
    async (e: React.MouseEvent, docId: Id<"formDocuments">) => {
      e.stopPropagation();
      setResendingDocId(docId);
      setResendSuccess(null);
      try {
        await resendSigningEmail({ organizationId, documentId: docId });
        setResendSuccess(docId);
        toast.success(t("documents.emailSent", "Wysłano e-mail do klienta"));
        setTimeout(() => setResendSuccess(null), 3000);
      } catch (err) {
        // Surface the real reason — previously this was a silent `catch {}`
        // so users on the appointment > Dokumenty tab saw the send button
        // spin briefly and then nothing, with no clue why no mail went out
        // (no email on patient, expired Gmail OAuth, missing default email
        // account on the org, etc).
        toast.error(
          err instanceof Error
            ? err.message
            : t("documents.sendFailed", "Nie udało się wysłać e-maila"),
        );
      } finally {
        setResendingDocId(null);
      }
    },
    [resendSigningEmail, organizationId],
  );

  const completedCount = documents.filter((d) =>
    isDocumentCompleted(d.status),
  ).length;
  const totalCount = documents.length;
  const progressPercent =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">{title}</h4>
        <span className="text-xs text-muted-foreground">
          {completedCount}/{totalCount}{" "}
          {t("documents.documentsCompleted", "dokumentow")}
        </span>
      </div>

      <Progress value={progressPercent} className="h-2" />

      <div className="rounded-lg border divide-y">
        {documents.map((doc) => {
          const canResend =
            !isDocumentCompleted(doc.status) &&
            doc.status !== "expired" &&
            doc.status !== "voided" &&
            !!doc.signingToken;

          return (
            <button
              key={doc._id}
              type="button"
              onClick={() => onDocumentClick(doc._id)}
              className={cn(
                "w-full flex items-center justify-between gap-3 px-4 py-3",
                "text-left transition-colors hover:bg-accent cursor-pointer",
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                {getStatusIcon(doc.status)}
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{doc.title}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <DocumentStatusBadge status={doc.status} />
                {isDocumentCompleted(doc.status) ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDocumentClick(doc._id);
                    }}
                  >
                    <Eye className="h-3.5 w-3.5 mr-1" />
                    {t("documents.preview", "Podglad")}
                  </Button>
                ) : (
                  <>
                    {canResend && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        disabled={resendingDocId === doc._id}
                        onClick={(e) => handleResend(e, doc._id)}
                      >
                        {resendingDocId === doc._id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : resendSuccess === doc._id ? (
                          <CircleCheck className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <Send className="h-3.5 w-3.5 mr-1" />
                        )}
                        {resendSuccess === doc._id
                          ? t("documents.emailSent", "Wysłano")
                          : t("documents.resendEmail", "Wyślij ponownie")}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 px-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDocumentClick(doc._id);
                      }}
                    >
                      {t("documents.fill", "Wypelnij")}
                    </Button>
                  </>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hook: useAppointmentDocumentCounts
// ---------------------------------------------------------------------------

export function useAppointmentDocumentCounts(
  appointmentId: string,
  organizationId: Id<"organizations">,
) {
  const listDocumentsByEntityHook = useAction(api.documents.documents.listByEntity);
  const { data: documents } = useQuery({
    queryKey: ["documents.documents.listByEntity", organizationId, "appointment", appointmentId],
    queryFn: () =>
      listDocumentsByEntityHook({
        organizationId,
        entityType: "appointment",
        entityId: appointmentId,
      }),
    enabled: !!organizationId && !!appointmentId,
  });

  const allDocs = (documents ?? []) as unknown as FormDocument[];

  const beforeDocs = allDocs.filter((d) => d.timing === "before_start");
  const afterDocs = allDocs.filter((d) => d.timing === "after_completion");

  const missingBefore = beforeDocs.filter(
    (d) => !isDocumentCompleted(d.status),
  ).length;
  const missingAfter = afterDocs.filter(
    (d) => !isDocumentCompleted(d.status),
  ).length;

  const missingBeforeDocs = beforeDocs.filter(
    (d) => !isDocumentCompleted(d.status),
  );
  const missingAfterDocs = afterDocs.filter(
    (d) => !isDocumentCompleted(d.status),
  );

  return {
    missingBefore,
    missingAfter,
    missingBeforeDocs,
    missingAfterDocs,
    totalBefore: beforeDocs.length,
    totalAfter: afterDocs.length,
    hasBefore: beforeDocs.length > 0,
    hasAfter: afterDocs.length > 0,
  };
}

export type { AppointmentDocumentChecklistProps };
