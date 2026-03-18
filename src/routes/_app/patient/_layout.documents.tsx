import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SignaturePad } from "@/components/documents/signature-pad";
import { SurveyFormViewer } from "@/components/documents/survey-form-viewer";
import { DocumentStatusBadge } from "@/components/documents/document-status-badge";
import { Eye, PenTool, FileText } from "@/lib/ez-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/patient/_layout/documents")({
  component: PatientDocuments,
});

function PatientDocuments() {
  const { t } = useTranslation();
  const tokenHash =
    typeof window !== "undefined"
      ? (localStorage.getItem("patientPortalToken") ?? "")
      : "";

  // Old documents system (gabinetDocuments)
  const signDoc = useMutation(api.gabinet.patientPortal.signDocument);
  const { data: legacyDocuments } = useQuery(
    convexQuery(api.gabinet.patientPortal.getMyDocuments, { tokenHash }),
  );

  // New SurveyJS form documents
  const { data: formDocuments } = useQuery(
    convexQuery(api.documents.documents.listByPatientToken, { tokenHash }),
  );

  // --- Legacy document dialogs ---
  const [viewDocId, setViewDocId] = useState<string | null>(null);
  const [signDocId, setSignDocId] = useState<string | null>(null);

  const viewDoc = (legacyDocuments ?? []).find((d) => d._id === viewDocId);

  const handleLegacySign = async (signatureData: string) => {
    if (!signDocId) return;
    try {
      await signDoc({
        tokenHash,
        documentId: signDocId as any,
        signatureData,
      });
      toast.success(t("patientPortal.documents.signed"));
      setSignDocId(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "draft":
        return "secondary" as const;
      case "pending_signature":
        return "outline" as const;
      case "signed":
        return "default" as const;
      default:
        return "secondary" as const;
    }
  };

  // --- New form document dialogs ---
  const [viewFormDocId, setViewFormDocId] = useState<string | null>(null);
  const viewFormDoc = (formDocuments ?? []).find(
    (d) => d._id === viewFormDocId,
  );

  // Signing for new form documents — uses the public signing token flow
  const recordSignature = useMutation(
    api.documents.documents.recordSignature,
  );
  const [signFormDocId, setSignFormDocId] = useState<string | null>(null);
  const signFormDoc = (formDocuments ?? []).find(
    (d) => d._id === signFormDocId,
  );

  const handleFormSign = async (signatureData: string) => {
    if (!signFormDoc?.signingToken) return;
    try {
      await recordSignature({
        token: signFormDoc.signingToken,
        signatureData,
        signedByName: t("patientPortal.documents.patientSigner", "Patient"),
      });
      toast.success(t("patientPortal.documents.signed"));
      setSignFormDocId(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const legacyItems = legacyDocuments ?? [];
  const formItems = formDocuments ?? [];
  const hasLegacy = legacyItems.length > 0;
  const hasForms = formItems.length > 0;
  const isEmpty = !hasLegacy && !hasForms;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">
        {t("patientPortal.documents.title")}
      </h1>

      {isEmpty && (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          {t("patientPortal.documents.empty")}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* New SurveyJS form documents                                        */}
      {/* ------------------------------------------------------------------ */}
      {hasForms && (
        <section className="space-y-2">
          {hasLegacy && (
            <h2 className="text-sm font-medium text-muted-foreground">
              {t("patientPortal.documents.formDocuments", "Form Documents")}
            </h2>
          )}
          <div className="rounded-lg border">
            <div className="divide-y">
              {formItems.map((doc) => (
                <div
                  key={doc._id}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{doc.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.templateName}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <DocumentStatusBadge status={doc.status as any} />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setViewFormDocId(doc._id)}
                    >
                      <Eye className="h-4 w-4" variant="stroke" />
                    </Button>
                    {doc.status === "pending_signature" &&
                      doc.signingToken && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSignFormDocId(doc._id)}
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
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Legacy gabinetDocuments (backward compatibility)                    */}
      {/* ------------------------------------------------------------------ */}
      {hasLegacy && (
        <section className="space-y-2">
          {hasForms && (
            <h2 className="text-sm font-medium text-muted-foreground">
              {t(
                "patientPortal.documents.legacyDocuments",
                "Other Documents",
              )}
            </h2>
          )}
          <div className="rounded-lg border">
            <div className="divide-y">
              {legacyItems.map((doc) => (
                <div
                  key={doc._id}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{doc.title}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {doc.type.replace("_", " ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={statusColor(doc.status)}>
                      {doc.status.replace("_", " ")}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setViewDocId(doc._id)}
                    >
                      <Eye className="h-4 w-4" variant="stroke" />
                    </Button>
                    {doc.status === "pending_signature" && (
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
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Legacy: View dialog                                                */}
      {/* ------------------------------------------------------------------ */}
      <Dialog open={!!viewDocId} onOpenChange={(o) => !o && setViewDocId(null)}>
        <DialogContent className="max-w-2xl">
          {viewDoc && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium">{viewDoc.title}</h3>
                  <span className="text-sm text-muted-foreground capitalize">{viewDoc.type.replace("_", " ")}</span>
                </div>
                <Badge variant={statusColor(viewDoc.status)}>{viewDoc.status.replace("_", " ")}</Badge>
              </div>
              <div
                className="prose prose-sm max-w-none rounded-lg border bg-white p-6 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: viewDoc.content }}
              />
              {viewDoc.signatureData && (
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground mb-2">{t("gabinet.documents.signature")}</p>
                  <img src={viewDoc.signatureData} alt="Signature" className="h-20 object-contain" />
                  {viewDoc.signedAt && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("gabinet.documents.signedOn")} {new Date(viewDoc.signedAt).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Legacy: Sign dialog */}
      <Dialog open={!!signDocId} onOpenChange={(o) => !o && setSignDocId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("patientPortal.documents.signDocument")}
            </DialogTitle>
          </DialogHeader>
          <SignaturePad
            onSign={handleLegacySign}
            onCancel={() => setSignDocId(null)}
          />
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------------ */}
      {/* New form document: View dialog with SurveyFormViewer               */}
      {/* ------------------------------------------------------------------ */}
      <Dialog
        open={!!viewFormDocId}
        onOpenChange={(o) => !o && setViewFormDocId(null)}
      >
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {viewFormDoc && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" variant="stroke" />
                  {viewFormDoc.title}
                </DialogTitle>
                <div className="flex items-center gap-2 pt-1">
                  <DocumentStatusBadge status={viewFormDoc.status as any} />
                  <span className="text-xs text-muted-foreground">
                    {viewFormDoc.templateName}
                  </span>
                </div>
              </DialogHeader>
              <SurveyFormViewer
                formJson={viewFormDoc.formJson}
                responseData={
                  JSON.parse(viewFormDoc.responseData || "{}") as Record<
                    string,
                    unknown
                  >
                }
                signatureData={viewFormDoc.signatureData}
                signedAt={viewFormDoc.signedAt}
              />
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------------ */}
      {/* New form document: Sign dialog                                     */}
      {/* ------------------------------------------------------------------ */}
      <Dialog
        open={!!signFormDocId}
        onOpenChange={(o) => !o && setSignFormDocId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("patientPortal.documents.signDocument")}
            </DialogTitle>
          </DialogHeader>
          {signFormDoc && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t(
                  "patientPortal.documents.signPrompt",
                  "Please review the document and provide your signature below.",
                )}
              </p>
              <SignaturePad
                onSign={handleFormSign}
                onCancel={() => setSignFormDocId(null)}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
