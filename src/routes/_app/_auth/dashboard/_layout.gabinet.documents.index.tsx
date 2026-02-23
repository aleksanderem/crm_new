import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { SidePanel } from "@/components/crm/side-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DocumentViewer } from "@/components/gabinet/documents/document-viewer";
import { SignaturePad } from "@/components/gabinet/documents/signature-pad";
import { Plus, FileText, Eye, PenTool, Pencil } from "@/lib/ez-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Id } from "@cvx/_generated/dataModel";
import { EmptyState } from "@/components/layout/empty-state";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/documents/"
)({
  component: DocumentsIndex,
});

const DOC_TYPES = ["consent", "medical_record", "prescription", "referral", "custom"] as const;

function DocumentsIndex() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const createDoc = useMutation(api["gabinet/documents"].create);
  const updateDoc = useMutation(api["gabinet/documents"].update);
  const signDoc = useMutation(api["gabinet/documents"].sign);
  const requestSig = useMutation(api["gabinet/documents"].requestSignature);

  const { data: docs } = useQuery(
    convexQuery(api["gabinet/documents"].list, {
      organizationId,
      paginationOpts: { numItems: 50, cursor: null },
    })
  );

  const { data: patients } = useQuery(
    convexQuery(api["gabinet/patients"].list, {
      organizationId,
      paginationOpts: { numItems: 200, cursor: null },
    })
  );

  const { data: templates } = useQuery(
    convexQuery(api["gabinet/documentTemplates"].list, { organizationId })
  );

  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewDocId, setViewDocId] = useState<string | null>(null);
  const [signDocId, setSignDocId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState<string>("consent");
  const [patientId, setPatientId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setTitle(""); setContent(""); setPatientId(""); setTemplateId(""); setDocType("consent"); setEditingId(null);
  };

  const openEdit = (doc: any) => {
    setEditingId(doc._id);
    setTitle(doc.title);
    setContent(doc.content ?? "");
    setDocType(doc.type);
    setPatientId(doc.patientId);
    setPanelOpen(true);
  };

  const handleSubmit = async () => {
    if (editingId) {
      setSubmitting(true);
      try {
        await updateDoc({
          organizationId,
          documentId: editingId as Id<"gabinetDocuments">,
          title: title || undefined,
          content: content || undefined,
        });
        toast.success(t("common.saved"));
        setPanelOpen(false);
        resetForm();
      } catch (e: any) {
        toast.error(e.message);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!title || !patientId) return;
    setSubmitting(true);
    try {
      await createDoc({
        organizationId,
        patientId: patientId as Id<"gabinetPatients">,
        templateId: templateId ? templateId as Id<"gabinetDocumentTemplates"> : undefined,
        title,
        type: docType as any,
        content: content || undefined,
      });
      toast.success(t("gabinet.documents.created"));
      setPanelOpen(false);
      resetForm();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestSignature = async (id: Id<"gabinetDocuments">) => {
    try {
      await requestSig({ organizationId, documentId: id });
      toast.success(t("gabinet.documents.signatureRequested"));
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleSign = async (signatureData: string) => {
    if (!signDocId) return;
    try {
      await signDoc({
        organizationId,
        documentId: signDocId as Id<"gabinetDocuments">,
        signatureData,
      });
      toast.success(t("gabinet.documents.signed"));
      setSignDocId(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const viewDoc = docs?.page?.find((d) => d._id === viewDocId);
  const allItems = docs?.page ?? [];
  const items = allItems.filter((d) => {
    if (filterType !== "all" && d.type !== filterType) return false;
    if (filterStatus !== "all" && d.status !== filterStatus) return false;
    return true;
  });

  const statusColor = (s: string) => {
    switch (s) {
      case "draft": return "secondary" as const;
      case "pending_signature": return "outline" as const;
      case "signed": return "default" as const;
      case "archived": return "secondary" as const;
      default: return "secondary" as const;
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <PageHeader title={t("gabinet.documents.title")} description={t("gabinet.documents.description")} />
        <Button size="sm" onClick={() => { resetForm(); setPanelOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          {t("gabinet.documents.createDocument")}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue placeholder={t("gabinet.documents.type")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("gabinet.documents.type")}: {t("common.all")}</SelectItem>
            {DOC_TYPES.map((type) => (
              <SelectItem key={type} value={type}>{t(`gabinet.documents.types.${type}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <SelectValue placeholder={t("gabinet.documents.status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("gabinet.documents.status")}: {t("common.all")}</SelectItem>
            {(["draft", "pending_signature", "signed", "archived"] as const).map((s) => (
              <SelectItem key={s} value={s}>{t(`gabinet.documents.statuses.${s}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t("gabinet.documents.emptyTitle")}
          description={t("gabinet.documents.emptyDescription")}
        />
      ) : (
        <div className="rounded-lg border">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50 text-xs font-medium text-muted-foreground">
                <th className="px-4 py-2 text-left">{t("gabinet.documents.titleField")}</th>
                <th className="px-4 py-2 text-left">{t("gabinet.documents.type")}</th>
                <th className="px-4 py-2 text-left">{t("gabinet.documents.status")}</th>
                <th className="px-4 py-2 text-left">{t("gabinet.documents.date")}</th>
                <th className="px-4 py-2 text-right">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((doc) => (
                <tr key={doc._id} className="border-b last:border-b-0">
                  <td className="px-4 py-2 text-sm font-medium">{doc.title}</td>
                  <td className="px-4 py-2 text-sm">{t(`gabinet.documents.types.${doc.type}`)}</td>
                  <td className="px-4 py-2"><Badge variant={statusColor(doc.status)}>{t(`gabinet.documents.statuses.${doc.status}`)}</Badge></td>
                  <td className="px-4 py-2 text-sm text-muted-foreground">{new Date(doc.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setViewDocId(doc._id)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {doc.status === "draft" && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => openEdit(doc)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleRequestSignature(doc._id)}>
                            <PenTool className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {doc.status === "pending_signature" && (
                        <Button variant="ghost" size="sm" onClick={() => setSignDocId(doc._id)}>
                          <PenTool className="h-4 w-4 text-primary" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit panel */}
      <SidePanel
        open={panelOpen}
        onOpenChange={(o) => { setPanelOpen(o); if (!o) resetForm(); }}
        title={editingId ? t("common.edit") : t("gabinet.documents.createDocument")}
        onSubmit={handleSubmit}
        isSubmitting={submitting}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("gabinet.documents.titleField")}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("gabinet.documents.type")}</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>{t(`gabinet.documents.types.${type}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("gabinet.documents.patient")}</Label>
            <Select value={patientId} onValueChange={setPatientId}>
              <SelectTrigger className="h-9"><SelectValue placeholder={t("gabinet.appointments.selectPatient")} /></SelectTrigger>
              <SelectContent>
                {(patients?.page ?? []).map((p) => (
                  <SelectItem key={p._id} value={p._id}>{p.firstName} {p.lastName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("gabinet.documents.template")}</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger className="h-9"><SelectValue placeholder={t("gabinet.documents.noTemplate")} /></SelectTrigger>
              <SelectContent>
                {(templates ?? []).filter((tmpl) => tmpl.isActive).map((tmpl) => (
                  <SelectItem key={tmpl._id} value={tmpl._id}>{tmpl.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("gabinet.documents.content")}</Label>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={6} />
          </div>
        </div>
      </SidePanel>

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
            <DialogTitle>{t("gabinet.documents.signDocument")}</DialogTitle>
          </DialogHeader>
          <SignaturePad onSign={handleSign} onCancel={() => setSignDocId(null)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
