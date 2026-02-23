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
import { SignaturePad } from "@/components/gabinet/documents/signature-pad";
import { DocumentViewer } from "@/components/gabinet/documents/document-viewer";
import { Eye, PenTool } from "@/lib/ez-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/patient/_layout/documents")({
  component: PatientDocuments,
});

function PatientDocuments() {
  const { t } = useTranslation();
  const sessionId = typeof window !== "undefined" ? localStorage.getItem("patientPortalSessionId") ?? "" : "";
  const token = typeof window !== "undefined" ? localStorage.getItem("patientPortalToken") ?? "" : "";

  const signDoc = useMutation(api["gabinet/patientPortal"].signDocument);

  const { data: documents } = useQuery(
    convexQuery(api["gabinet/patientPortal"].getMyDocuments, { sessionId, token })
  );

  const [viewDocId, setViewDocId] = useState<string | null>(null);
  const [signDocId, setSignDocId] = useState<string | null>(null);

  const viewDoc = (documents ?? []).find((d) => d._id === viewDocId);

  const handleSign = async (signatureData: string) => {
    if (!signDocId) return;
    try {
      await signDoc({ sessionId, token, documentId: signDocId as any, signatureData });
      toast.success(t("patientPortal.documents.signed"));
      setSignDocId(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "draft": return "secondary" as const;
      case "pending_signature": return "outline" as const;
      case "signed": return "default" as const;
      default: return "secondary" as const;
    }
  };

  const items = documents ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t("patientPortal.documents.title")}</h1>

      {items.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          {t("patientPortal.documents.empty")}
        </div>
      ) : (
        <div className="rounded-lg border">
          <div className="divide-y">
            {items.map((doc) => (
              <div key={doc._id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{doc.title}</p>
                  <p className="text-xs text-muted-foreground capitalize">{doc.type.replace("_", " ")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusColor(doc.status)}>{doc.status.replace("_", " ")}</Badge>
                  <Button variant="ghost" size="sm" onClick={() => setViewDocId(doc._id)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  {doc.status === "pending_signature" && (
                    <Button variant="ghost" size="sm" onClick={() => setSignDocId(doc._id)}>
                      <PenTool className="h-4 w-4 text-primary" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* View dialog */}
      <Dialog open={!!viewDocId} onOpenChange={(o) => !o && setViewDocId(null)}>
        <DialogContent className="max-w-2xl">
          {viewDoc && (
            <DocumentViewer
              title={viewDoc.title}
              type={viewDoc.type}
              status={viewDoc.status}
              content={viewDoc.content}
              signatureData={viewDoc.signatureData}
              signedAt={viewDoc.signedAt}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Sign dialog */}
      <Dialog open={!!signDocId} onOpenChange={(o) => !o && setSignDocId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("patientPortal.documents.signDocument")}</DialogTitle>
          </DialogHeader>
          <SignaturePad onSign={handleSign} onCancel={() => setSignDocId(null)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
