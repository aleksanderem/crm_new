import { useState, useCallback, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { toast } from "sonner";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import {
  Plus,
  FileText,
  Eye,
  Loader2,
  Send,
  CircleCheck,
  GripVertical,
  Trash2,
} from "@/lib/ez-icons";
import { ScrollShadow } from "@/components/ui/scroll-shadow";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { DocumentStatusBadge } from "./document-status-badge";
import { GenerateDocumentDialog } from "./generate-document-dialog";
import { DocumentViewer } from "./document-viewer";
import { renderDocument } from "./document-renderer";
import { flattenScopeData } from "@/lib/document-variables";

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
  signingToken?: string;
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
  const [sendingDocId, setSendingDocId] = useState<string | null>(null);
  const [sendSuccessDocId, setSendSuccessDocId] = useState<string | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<Id<"formDocuments"> | null>(null);
  const [docToDelete, setDocToDelete] = useState<Id<"formDocuments"> | null>(null);

  const resendSigningEmail = useAction(api.documents.documents.resendSigningEmail);
  const reorderByEntity = useAction(api.documents.documents.reorderByEntity);
  const removeDocument = useAction(api.documents.documents.remove);

  const handleSend = useCallback(
    async (e: React.MouseEvent, docId: Id<"formDocuments">) => {
      e.stopPropagation();
      setSendingDocId(docId);
      setSendSuccessDocId(null);
      try {
        await resendSigningEmail({ organizationId, documentId: docId });
        setSendSuccessDocId(docId);
        toast.success(t("documents.emailSent", "Wysłano e-mail do klienta"));
        setTimeout(() => setSendSuccessDocId(null), 3000);
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : t("documents.sendFailed", "Nie udało się wysłać e-maila"),
        );
      } finally {
        setSendingDocId(null);
      }
    },
    [resendSigningEmail, organizationId, t],
  );

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

  // Local ordering so drag-and-drop is responsive while the server persists.
  // Resynced whenever the server-side list changes (creation, deletion).
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  useEffect(() => {
    if (!documents) return;
    setOrderedIds(documents.map((d) => String(d._id)));
  }, [documents]);

  const orderedDocuments = useMemo(() => {
    if (!documents) return undefined;
    const byId = new Map(documents.map((d) => [String(d._id), d]));
    const list: FormDocument[] = [];
    for (const id of orderedIds) {
      const d = byId.get(id);
      if (d) list.push(d);
    }
    // Append any docs not present in orderedIds yet (e.g. just-created).
    for (const d of documents) {
      if (!orderedIds.includes(String(d._id))) list.push(d);
    }
    return list;
  }, [documents, orderedIds]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = orderedIds.indexOf(String(active.id));
      const newIndex = orderedIds.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      const next = arrayMove(orderedIds, oldIndex, newIndex);
      setOrderedIds(next);
      reorderByEntity({
        organizationId,
        entityType,
        entityId,
        documentIds: next,
      }).catch((err) => {
        toast.error(
          err instanceof Error
            ? err.message
            : t("documents.reorderFailed", "Nie udało się zmienić kolejności"),
        );
        // Roll back on failure so UI matches server state.
        setOrderedIds(orderedIds);
      });
    },
    [orderedIds, reorderByEntity, organizationId, entityType, entityId, t],
  );

  const handleDocumentCreated = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent, docId: Id<"formDocuments">) => {
      e.stopPropagation();
      setDocToDelete(docId);
    },
    [],
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!docToDelete) return;
    const docId = docToDelete;
    setDeletingDocId(docId);
    setDocToDelete(null);
    try {
      await removeDocument({ organizationId, documentId: docId });
      toast.success(t("documents.deleted", "Dokument usunięty"));
      refetch();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("documents.deleteFailed", "Nie udało się usunąć dokumentu"),
      );
    } finally {
      setDeletingDocId(null);
    }
  }, [docToDelete, removeDocument, organizationId, refetch, t]);

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
    const scopeFlat: Record<string, string> = scopeData
      ? flattenScopeData(scopeData as Record<string, Record<string, unknown>>)
      : {};

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

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={(orderedDocuments ?? []).map((d) => String(d._id))}
            strategy={verticalListSortingStrategy}
          >
            <div className="rounded-lg border divide-y">
              {(orderedDocuments ?? []).map((doc) => (
                <SortableDocumentRow
                  key={doc._id}
                  doc={doc}
                  locale={i18n.language === "en" ? "en-US" : "pl-PL"}
                  sendingDocId={sendingDocId}
                  sendSuccessDocId={sendSuccessDocId}
                  deletingDocId={deletingDocId}
                  onOpen={() => setViewingDocId(doc._id)}
                  onSend={handleSend}
                  onDelete={handleDeleteClick}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
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

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={!!docToDelete}
        onOpenChange={(open) => !open && setDocToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("documents.deleteDialogTitle", "Usuń dokument")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "documents.deleteDialogDescription",
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
    </>
  );
}

// ---------------------------------------------------------------------------
// Sortable row
// ---------------------------------------------------------------------------

interface SortableDocumentRowProps {
  doc: FormDocument;
  locale: string;
  sendingDocId: string | null;
  sendSuccessDocId: string | null;
  deletingDocId: Id<"formDocuments"> | null;
  onOpen: () => void;
  onSend: (e: React.MouseEvent, docId: Id<"formDocuments">) => void;
  onDelete: (e: React.MouseEvent, docId: Id<"formDocuments">) => void;
}

function SortableDocumentRow({
  doc,
  locale,
  sendingDocId,
  sendSuccessDocId,
  deletingDocId,
  onOpen,
  onSend,
  onDelete,
}: SortableDocumentRowProps) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: String(doc._id) });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const canSend =
    doc.status !== "signed" &&
    doc.status !== "completed" &&
    doc.status !== "expired" &&
    doc.status !== "voided" &&
    !!doc.signingToken;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 px-2 py-3 bg-card transition-colors hover:bg-accent",
        isDragging && "opacity-50 z-10",
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={t("documents.dragToReorder", "Przeciągnij, aby zmienić kolejność")}
        className="flex h-8 w-6 shrink-0 items-center justify-center text-muted-foreground/60 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" variant="stroke" />
      </button>

      <button
        type="button"
        onClick={onOpen}
        className="flex flex-1 items-center justify-between gap-3 min-w-0 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{doc.title}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(doc.createdAt).toLocaleDateString(locale)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <DocumentStatusBadge status={doc.status} />
          {canSend && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2"
              disabled={sendingDocId === doc._id}
              onClick={(e) => onSend(e, doc._id)}
            >
              {sendingDocId === doc._id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : sendSuccessDocId === doc._id ? (
                <CircleCheck className="h-3.5 w-3.5 text-green-600 mr-1" />
              ) : (
                <Send className="h-3.5 w-3.5 mr-1" variant="stroke" />
              )}
              {sendSuccessDocId === doc._id
                ? t("documents.emailSentShort", "Wysłano")
                : t("documents.send", "Wyślij")}
            </Button>
          )}
          <Eye className="h-4 w-4 text-muted-foreground" />
        </div>
      </button>

      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
        disabled={deletingDocId === doc._id}
        aria-label={t("common.delete", "Usuń")}
        onClick={(e) => onDelete(e, doc._id)}
      >
        {deletingDocId === doc._id ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" variant="stroke" />
        )}
      </Button>
    </div>
  );
}

export type { EntityDocumentsTabProps };
