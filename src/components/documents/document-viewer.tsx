import { useState } from "react";
import type { Doc } from "@cvx/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  FileText,
  Download,
  Archive,
  Pencil,
  Check,
  X,
  Send,
  FileSignature,
  Trash2,
  Undo2,
} from "@/lib/ez-icons";
import { SendForSigningDialog } from "./send-for-signing-dialog";
import { PdfExportButton } from "./pdf-export";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DocumentInstance = Doc<"documentInstances">;
type DocumentStatus = DocumentInstance["status"];

interface DocumentViewerProps {
  instance: DocumentInstance;
  onSign?: (slotId: string) => void;
  onStatusChange?: (status: DocumentStatus) => void;
  onEdit?: () => void;
  onSendForSigning?: () => void;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_VARIANT: Record<DocumentStatus, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "secondary",
  pending_review: "outline",
  approved: "default",
  pending_signature: "outline",
  signed: "default",
  archived: "secondary",
};

const STATUS_LABEL: Record<DocumentStatus, string> = {
  draft: "Szkic",
  pending_review: "Oczekuje na przegląd",
  approved: "Zatwierdzony",
  pending_signature: "Oczekuje na podpis",
  signed: "Podpisany",
  archived: "Zarchiwizowany",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DocumentViewer({ instance, onSign, onStatusChange, onEdit, onSendForSigning }: DocumentViewerProps) {
  const { title, status, renderedContent, signatures, createdAt } = instance;
  const [showSendDialog, setShowSendDialog] = useState(false);

  return (
    <>
    <SendForSigningDialog
      open={showSendDialog}
      onOpenChange={setShowSendDialog}
      instanceId={instance._id}
      organizationId={instance.organizationId}
      signatures={signatures}
      onSent={onSendForSigning}
    />
    <Card>
      {/* Header */}
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <CardTitle className="truncate text-lg">{title}</CardTitle>
              <p className="text-sm text-muted-foreground">
                Utworzono {new Date(createdAt).toLocaleDateString("pl-PL")}
              </p>
            </div>
          </div>
          <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
        </div>
      </CardHeader>

      {/* Rendered document content */}
      <CardContent className="space-y-6">
        <div
          className="prose prose-sm max-w-none rounded-lg border bg-white p-6 leading-relaxed dark:bg-muted/30"
          dangerouslySetInnerHTML={{ __html: renderedContent }}
        />

        {/* Signature section */}
        {signatures.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Podpisy</h4>
            <div className="divide-y rounded-lg border">
              {signatures.map((slot) => {
                const isSigned = !!slot.signatureData;
                return (
                  <div
                    key={slot.slotId}
                    className="flex items-center justify-between gap-4 p-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{slot.slotLabel}</p>
                      {isSigned ? (
                        <div className="mt-1 space-y-1">
                          <img
                            src={slot.signatureData}
                            alt={`Podpis — ${slot.signedByName}`}
                            className="h-12 object-contain"
                          />
                          <p className="text-xs text-muted-foreground">
                            {slot.signedByName}
                            {slot.signedAt && (
                              <> — {new Date(slot.signedAt).toLocaleString("pl-PL")}</>
                            )}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Oczekuje na podpis</p>
                      )}
                    </div>

                    <div className="shrink-0">
                      {isSigned ? (
                        <Badge variant="default">Podpisano</Badge>
                      ) : onSign ? (
                        <Button size="sm" onClick={() => onSign(slot.slotId)}>
                          <FileSignature className="mr-1 h-4 w-4" />
                          Podpisz
                        </Button>
                      ) : (
                        <Badge variant="outline">Oczekuje</Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>

      {/* Action buttons */}
      <CardFooter>
        <div className={cn("flex w-full flex-wrap gap-2")}>
          <StatusActions
            status={status}
            instance={instance}
            onStatusChange={onStatusChange}
            onEdit={onEdit}
            onSign={onSign ? () => onSign(signatures.find((s) => !s.signatureData)?.slotId ?? "") : undefined}
            onSendForSigning={() => setShowSendDialog(true)}
            hasUnsignedSlots={signatures.some((s) => !s.signatureData)}
          />
        </div>
      </CardFooter>
    </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Status-dependent action buttons
// ---------------------------------------------------------------------------

interface StatusActionsProps {
  status: DocumentStatus;
  instance: DocumentInstance;
  onStatusChange?: (status: DocumentStatus) => void;
  onEdit?: () => void;
  onSign?: () => void;
  onSendForSigning?: () => void;
  hasUnsignedSlots: boolean;
}

function StatusActions({ status, instance, onStatusChange, onEdit, onSign, onSendForSigning, hasUnsignedSlots }: StatusActionsProps) {
  const actions: React.ReactNode[] = [];

  switch (status) {
    case "draft":
      if (onEdit) {
        actions.push(
          <Button key="edit" variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="mr-1 h-4 w-4" />
            Edytuj
          </Button>,
        );
      }
      if (onStatusChange) {
        actions.push(
          <Button key="approve" variant="outline" size="sm" onClick={() => onStatusChange("approved")}>
            <Check className="mr-1 h-4 w-4" />
            Zatwierdz
          </Button>,
        );
        actions.push(
          <Button key="delete" variant="destructive" size="sm" onClick={() => onStatusChange("pending_review")}>
            <Trash2 className="mr-1 h-4 w-4" />
            Usun
          </Button>,
        );
      }
      break;

    case "pending_review":
      if (onStatusChange) {
        actions.push(
          <Button key="approve" size="sm" onClick={() => onStatusChange("approved")}>
            <Check className="mr-1 h-4 w-4" />
            Zatwierdz
          </Button>,
        );
        actions.push(
          <Button key="reject" variant="destructive" size="sm" onClick={() => onStatusChange("draft")}>
            <X className="mr-1 h-4 w-4" />
            Odrzuc
          </Button>,
        );
      }
      break;

    case "approved":
      if (onStatusChange) {
        actions.push(
          <Button key="send-sign" size="sm" onClick={onSendForSigning}>
            <Send className="mr-1 h-4 w-4" />
            Wyslij do podpisu
          </Button>,
        );
        actions.push(
          <Button key="archive" variant="outline" size="sm" onClick={() => onStatusChange("archived")}>
            <Archive className="mr-1 h-4 w-4" />
            Archiwizuj
          </Button>,
        );
      }
      actions.push(
        <PdfExportButton
          key="download"
          title={instance.title}
          content={instance.renderedContent}
          signatures={instance.signatures}
        />,
      );
      break;

    case "pending_signature":
      if (onSign && hasUnsignedSlots) {
        actions.push(
          <Button key="sign" size="sm" onClick={onSign}>
            <FileSignature className="mr-1 h-4 w-4" />
            Podpisz
          </Button>,
        );
      }
      actions.push(
        <PdfExportButton
          key="download"
          title={instance.title}
          content={instance.renderedContent}
          signatures={instance.signatures}
        />,
      );
      break;

    case "signed":
      actions.push(
        <PdfExportButton
          key="download"
          title={instance.title}
          content={instance.renderedContent}
          signatures={instance.signatures}
        />,
      );
      if (onStatusChange) {
        actions.push(
          <Button key="archive" variant="outline" size="sm" onClick={() => onStatusChange("archived")}>
            <Archive className="mr-1 h-4 w-4" />
            Archiwizuj
          </Button>,
        );
      }
      break;

    case "archived":
      actions.push(
        <PdfExportButton
          key="download"
          title={instance.title}
          content={instance.renderedContent}
          signatures={instance.signatures}
        />,
      );
      if (onStatusChange) {
        actions.push(
          <Button key="restore" variant="outline" size="sm" onClick={() => onStatusChange("approved")}>
            <Undo2 className="mr-1 h-4 w-4" />
            Przywroc
          </Button>,
        );
      }
      break;
  }

  return <>{actions}</>;
}
