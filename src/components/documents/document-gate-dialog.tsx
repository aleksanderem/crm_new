import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, FileText } from "@/lib/ez-icons";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { DocumentStatusBadge } from "./document-status-badge";

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
  targetStatus,
  onProceed,
  onFillDocument,
}: DocumentGateDialogProps) {
  const { t } = useTranslation();

  // Fetch documents for this appointment
  const { data: documents } = useQuery({
    ...convexQuery(api.documents.documents.listByEntity, {
      organizationId,
      entityType: "appointment",
      entityId: appointmentId,
    }),
    enabled: open,
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

  const descriptionText =
    timing === "before_start"
      ? t(
          "documents.gate.beforeDescription",
          "Nastepujace dokumenty powinny byc wypelnione przed rozpoczeciem wizyty:",
        )
      : t(
          "documents.gate.afterDescription",
          "Nastepujace dokumenty powinny byc wypelnione przed zakonczeniem wizyty:",
        );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <DialogTitle>
                {t("documents.gate.title", "Niekompletne dokumenty")}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {descriptionText}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Missing documents list */}
        <div className="space-y-2 my-4">
          {missingDocs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t("documents.gate.allComplete", "Wszystkie dokumenty sa wypelnione.")}
            </p>
          ) : (
            <div className="rounded-lg border divide-y">
              {missingDocs.map((doc) => (
                <div
                  key={doc._id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {doc.title}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <DocumentStatusBadge status={doc.status} />
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 px-2"
                      onClick={() => {
                        onOpenChange(false);
                        onFillDocument(doc._id);
                      }}
                    >
                      {t("documents.fill", "Wypelnij")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="flex-row gap-2 sm:justify-between">
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              onProceed();
            }}
          >
            {t("documents.gate.proceedAnyway", "Kontynuuj mimo to")}
          </Button>
          <Button onClick={() => onOpenChange(false)}>
            {t("documents.gate.fillDocuments", "Wypelnij dokumenty")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { DocumentGateDialogProps };
