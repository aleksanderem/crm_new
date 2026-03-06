import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { SidePanel } from "@/components/crm/side-panel";
import { Route as NewTemplateRoute } from "@/routes/_app/_auth/dashboard/_layout.gabinet.documents.templates.new";
import { Route as EditTemplateRoute } from "@/routes/_app/_auth/dashboard/_layout.gabinet.documents.templates.$templateId";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TemplateEditor } from "@/components/gabinet/template-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, FileText } from "@/lib/ez-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Id } from "@cvx/_generated/dataModel";
import { EmptyState } from "@/components/layout/empty-state";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/settings/document-templates"
)({
  component: DocumentTemplatesPage,
});

const DOC_TYPES = ["consent", "medical_record", "prescription", "referral", "custom"] as const;

function isEditorEmpty(html: string) {
  const stripped = html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  return stripped.length === 0;
}

function DocumentTemplatesPage() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const createTpl = useMutation(api.gabinet.documentTemplates.create);
  const updateTpl = useMutation(api.gabinet.documentTemplates.update);
  const removeTpl = useMutation(api.gabinet.documentTemplates.remove);

  const { data: templates } = useQuery(
    convexQuery(api.gabinet.documentTemplates.list, { organizationId })
  );

  const [panelOpen, setPanelOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("consent");
  const [content, setContent] = useState("");
  const [requiresSignature, setRequiresSignature] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const openCreate = () => {
    // navigate to full-page editor for new template
    window.location.href = NewTemplateRoute.fullPath;
  };

  const openEdit = (tpl: any) => {
    // navigate to full-page editor for editing
    window.location.href = EditTemplateRoute.fullPath.replace('$templateId', tpl._id);
  };

  const handleSubmit = async () => {
    if (!name || isEditorEmpty(content)) return;
    setSubmitting(true);
    try {
      if (editId) {
        await updateTpl({
          organizationId,
          templateId: editId as Id<"gabinetDocumentTemplates">,
          name,
          type: type as any,
          content,
          requiresSignature,
        });
        toast.success(t("common.updated"));
      } else {
        await createTpl({
          organizationId,
          name,
          type: type as any,
          content,
          requiresSignature,
        });
        toast.success(t("common.created"));
      }
      setPanelOpen(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (id: Id<"gabinetDocumentTemplates">) => {
    try {
      await removeTpl({ organizationId, templateId: id });
      toast.success(t("common.delete"));
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const items = templates ?? [];

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title={t("gabinet.documentTemplates.title")}
          description={t("gabinet.documentTemplates.description")}
        />
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" variant="stroke" />
          {t("gabinet.documentTemplates.addTemplate")}
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t("gabinet.documentTemplates.emptyTitle")}
          description={t("gabinet.documentTemplates.emptyDescription")}
        />
      ) : (
        <div className="rounded-lg border">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50 text-xs font-medium text-muted-foreground">
                <th className="px-4 py-2 text-left">{t("common.name")}</th>
                <th className="px-4 py-2 text-left">{t("gabinet.documents.type")}</th>
                <th className="px-4 py-2 text-left">{t("gabinet.documentTemplates.requiresSignature")}</th>
                <th className="px-4 py-2 text-left">{t("common.status")}</th>
                <th className="px-4 py-2 text-right">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((tpl) => (
                <tr key={tpl._id} className="border-b last:border-b-0">
                  <td className="px-4 py-2 text-sm font-medium">{tpl.name}</td>
                  <td className="px-4 py-2 text-sm capitalize">{tpl.type.replace("_", " ")}</td>
                  <td className="px-4 py-2 text-sm">{tpl.requiresSignature ? t("common.yes") : t("common.no")}</td>
                  <td className="px-4 py-2">
                    <Badge variant={tpl.isActive ? "default" : "secondary"}>
                      {tpl.isActive ? t("common.active") : t("common.inactive")}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(tpl)}>
                        {t("common.edit")}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleRemove(tpl._id)}>
                        <Trash2 className="h-4 w-4" variant="stroke" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SidePanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        title={editId ? t("gabinet.documentTemplates.editTemplate") : t("gabinet.documentTemplates.addTemplate")}
        onSubmit={handleSubmit}
        isSubmitting={submitting}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("common.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("gabinet.documents.type")}</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((dt) => (
                  <SelectItem key={dt} value={dt}>{dt.replace("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="requiresSignature"
              checked={requiresSignature}
              onCheckedChange={(checked) => setRequiresSignature(checked as boolean)}
            />
            <Label htmlFor="requiresSignature">{t("gabinet.documentTemplates.requiresSignature")}</Label>
          </div>
          <div className="space-y-1.5">
            <Label>{t("gabinet.documentTemplates.contentLabel")}</Label>
            <p className="text-xs text-muted-foreground">{t("gabinet.documentTemplates.placeholderHint")}</p>
            <TemplateEditor value={content} onChange={setContent} minHeightClassName="min-h-[320px]" />
          </div>
        </div>
      </SidePanel>
    </div>
  );
}
