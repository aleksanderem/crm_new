import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, Circle } from "@/lib/ez-icons";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { DocumentStatusBadge } from "./document-status-badge";
import { useDraggableDialog } from "@/hooks/use-draggable-dialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FormDocumentStatus =
  | "draft"
  | "pending_signature"
  | "signed"
  | "completed"
  | "expired"
  | "voided";

interface MissingDocument {
  _id: Id<"formDocuments">;
  title: string;
  status: FormDocumentStatus;
}

interface DocumentGateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId: string;
  organizationId: Id<"organizations">;
  timing: "before_start" | "after_completion";
  targetStatus: string;
  onProceed: () => void;
  onFillDocument: (documentId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DocumentGateDialog({
  open,
  onOpenChange,
  appointmentId,
  organizationId,
  timing,
  targetStatus: _targetStatus,
  onProceed,
  onFillDocument,
}: DocumentGateDialogProps) {
  const { t } = useTranslation();

  // Fetch documents for this appointment (Supabase-primary action)
  const listDocumentsByEntity = useAction(api.documents.documents.listByEntity);
  const { data: documents } = useQuery({
    queryKey: ["documents.documents.listByEntity", organizationId, "appointment", appointmentId],
    queryFn: () =>
      listDocumentsByEntity({
        organizationId,
        entityType: "appointment",
        entityId: appointmentId,
      }),
    enabled: open && !!organizationId && !!appointmentId,
  });

  const allDocs = (documents ?? []) as Array<{
    _id: Id<"formDocuments">;
    title: string;
    status: FormDocumentStatus;
    timing?: "before_start" | "after_completion";
  }>;

  const missingDocs: MissingDocument[] = allDocs.filter(
    (d) =>
      d.timing === timing &&
      d.status !== "signed" &&
      d.status !== "completed",
  );

  // Count completed docs for progress
  const allTimingDocs = allDocs.filter((d) => d.timing === timing);
  const completedCount = allTimingDocs.length - missingDocs.length;
  const totalCount = allTimingDocs.length;

  const timingLabel =
    timing === "before_start"
      ? t("documents.gate.timingBefore", "Przed wizytą")
      : t("documents.gate.timingAfter", "Po wizycie");

  const drag = useDraggableDialog(open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={drag.contentRef}
        onPointerDown={drag.onPointerDown}
        className={cn(
          "sm:max-w-md",
          drag.isDragging && "cursor-grabbing select-none",
        )}
      >
        {/* Warning header banner */}
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-4 -mt-2">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/50">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <DialogHeader className="p-0 space-y-1">
                <DialogTitle className="text-base">
                  {t("documents.gate.title", "Niekompletne dokumenty")}
                </DialogTitle>
                <DialogDescription className="text-amber-800 dark:text-amber-300/80">
                  {timing === "before_start"
                    ? t(
                        "documents.gate.beforeDescription",
                        "Nastepujace dokumenty powinny byc wypelnione przed rozpoczeciem wizyty:",
                      )
                    : t(
                        "documents.gate.afterDescription",
                        "Nastepujace dokumenty powinny byc wypelnione przed zakonczeniem wizyty:",
                      )}
                </DialogDescription>
              </DialogHeader>
            </div>
          </div>
        </div>

        {/* Progress summary */}
        {totalCount > 0 && (
          <div className="flex items-center justify-between px-1">
            <p className="text-xs text-muted-foreground">
              {t("documents.gate.progress", "Wypelniono {{completed}} z {{total}} wymaganych dokumentow", {
                completed: completedCount,
                total: totalCount,
              })}
            </p>
            <Badge variant="outline" className="text-[10px]">
              {timingLabel}
            </Badge>
          </div>
        )}

        {/* Missing documents list */}
        <div className="space-y-2">
          {missingDocs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t("documents.gate.allComplete", "Wszystkie dokumenty sa wypelnione.")}
            </p>
          ) : (
            <div className="rounded-lg border divide-y">
              {missingDocs.map((doc) => {
                const isNotStarted = doc.status === "draft";
                return (
                  <div
                    key={doc._id}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Circle
                        className={cn(
                          "h-2.5 w-2.5 shrink-0 fill-current",
                          isNotStarted
                            ? "text-red-500"
                            : "text-amber-500",
                        )}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {doc.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <DocumentStatusBadge status={doc.status} className="text-[10px]" />
                          <Badge variant="outline" className="text-[10px]">
                            {timingLabel}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="default"
                      className="h-8 px-3 shrink-0"
                      onClick={() => {
                        onOpenChange(false);
                        onFillDocument(doc._id);
                      }}
                    >
                      {t("documents.fill", "Wypelnij")}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button
            variant="destructive"
            className="w-full sm:w-auto"
            onClick={() => {
              onOpenChange(false);
              onProceed();
            }}
          >
            {t("documents.gate.proceedAnyway", "Wiem, kontynuuj bez dokumentow")}
          </Button>
          <Button
            className="w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
          >
            {t("documents.gate.fillDocuments", "Wypelnij dokumenty")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { DocumentGateDialogProps };
