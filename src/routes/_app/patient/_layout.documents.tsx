import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SignaturePad } from "@/components/documents/signature-pad";
import { DocumentViewer } from "@/components/documents/document-viewer";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import { Eye, PenTool, FileText } from "@/lib/ez-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { formatActionError } from "@/lib/format-action-error";

export const Route = createFileRoute("/_app/patient/_layout/documents")({
  component: PatientDocuments,
});

function PatientDocuments() {
  const { t } = useTranslation();
  const tokenHash =
    typeof window !== "undefined"
      ? (localStorage.getItem("patientPortalToken") ?? "")
      : "";

  const listByPatientToken = useAction(
    api.documents.documents.listByPatientToken,
  );
  const { data: formDocuments } = useQuery({
    queryKey: ["documents.documents.listByPatientToken", tokenHash],
    queryFn: () => listByPatientToken({ tokenHash }),
    enabled: !!tokenHash,
  });

  const getPortalSession = useAction(api.gabinet.patientAuth.getPortalSession);
  const { data: portalSession } = useQuery({
    queryKey: ["gabinet.patientAuth.getPortalSession", tokenHash],
    queryFn: () => getPortalSession({ token: tokenHash }),
    enabled: !!tokenHash,
  });

  const recordSignature = useAction(
    api.documents.documents.recordSignature,
  );

  const [viewDocId, setViewDocId] = useState<string | null>(null);
  const [signDocId, setSignDocId] = useState<string | null>(null);

  const items = formDocuments ?? [];
  const viewDoc = items.find((d) => d._id === viewDocId);
  const signDoc = items.find((d) => d._id === signDocId);

  const handleSign = async (signatureData: string) => {
    if (!signDoc?.signingToken) return;
    try {
      await recordSignature({
        token: signDoc.signingToken,
        signatureData,
        signedByName: portalSession?.patientName ?? t("patientPortal.documents.patientSigner", "Patient"),
      });
      toast.success(t("patientPortal.documents.signed"));
      setSignDocId(null);
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "patientPortal.documents.signFailed",
          defaultValue: "Nie udało się podpisać dokumentu.",
        }),
      );
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">
        {t("patientPortal.documents.title")}
      </h1>

      {items.length === 0 && (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          {t("patientPortal.documents.empty")}
        </div>
      )}

      {items.length > 0 && (
        <div className="rounded-lg border">
          <div className="divide-y">
            {items.map((doc) => (
              <div
                key={doc._id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-2 min-w-0 sm:flex-1 sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{doc.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.templateName}
                    </p>
                  </div>
                  <div className="shrink-0 self-start sm:self-auto">
                    <DocumentStatusBadge status={doc.status as any} />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-1 sm:gap-2 sm:shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setViewDocId(doc._id)}
                  >
                    <Eye className="h-4 w-4" variant="stroke" />
                  </Button>
                  {doc.status === "pending_signature" && doc.signingToken && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSignDocId(doc._id)}
                    >
                      <PenTool
                        className="h-4 w-4 text-primary"
                        variant="stroke"
                      />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View document dialog */}
      <Dialog open={!!viewDocId} onOpenChange={(o) => !o && setViewDocId(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          {viewDoc && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" variant="stroke" />
                  {viewDoc.title}
                </DialogTitle>
                <div className="flex items-center gap-2 pt-1">
                  <DocumentStatusBadge status={viewDoc.status as any} />
                  <span className="text-xs text-muted-foreground">
                    {viewDoc.templateName}
                  </span>
                </div>
              </DialogHeader>
              {(() => {
                // Try to extract rendered HTML from responseData
                try {
                  const parsed = JSON.parse(viewDoc.responseData || "{}") as { html?: string };
                  if (parsed.html) {
                    return (
                      <DocumentViewer
                        title={viewDoc.title}
                        html={parsed.html}
                        signatureData={viewDoc.signatureData}
                        signedAt={viewDoc.signedAt}
                      />
                    );
                  }
                } catch {
                  // Not JSON with html — fall through
                }

                // Fallback: no viewable content
                return (
                  <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                    {t("documents.noContentAvailable", "Brak treści dokumentu do wyświetlenia.")}
                  </div>
                );
              })()}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Sign document dialog */}
      <Dialog
        open={!!signDocId}
        onOpenChange={(o) => !o && setSignDocId(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("patientPortal.documents.signDocument")}
            </DialogTitle>
          </DialogHeader>
          {signDoc && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t(
                  "patientPortal.documents.signPrompt",
                  "Please review the document and provide your signature below.",
                )}
              </p>
              <SignaturePad
                onSign={handleSign}
                onCancel={() => setSignDocId(null)}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
