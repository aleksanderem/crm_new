// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TemplateEditor } from "@/components/gabinet/template-editor";
import { TEMPLATE_VARIABLE_CATEGORIES, TEMPLATE_VARIABLES } from "@/components/gabinet/variable-mention";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_app/_auth/dashboard/_layout/gabinet/documents/templates/$templateId")({
  component: EditTemplatePage,
});

function EditTemplatePage({ params }: any) {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const templateId = params.templateId as string;
  const { data: tpl } = useQuery(convexQuery(api.gabinet.documentTemplates.get, { organizationId, templateId }));
  const updateTpl = useMutation(api.gabinet.documentTemplates.update);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const editorRef = useRef<any>(null);

  useEffect(() => {
    if (tpl) {
      setName(tpl.name || "");
      setType(tpl.type || "");
    }
  }, [tpl]);

  const handleSave = async () => {
    const html = editorRef.current?.getHTML?.() ?? "";
    if (!name || !html) return;
    await updateTpl({ organizationId, templateId, name, type, content: html });
    window.location.href = "/dashboard/gabinet/settings/document-templates";
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <PageHeader title={t("gabinet.documentTemplates.editTitle") || "Edytuj szablon"} description={t("gabinet.documentTemplates.editDescription") || "Edytuj istniejący szablon dokumentu."} />
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => (window.location.href = "/dashboard/gabinet/settings/document-templates")}>{t("common.cancel") || "Anuluj"}</Button>
          <Button onClick={handleSave}>{t("common.save") || "Zapisz"}</Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <aside className="col-span-3">
          <div className="rounded-lg border p-4 space-y-3">
            <div>
              <Label>{t("common.name") || "Nazwa"}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>{t("gabinet.documents.type") || "Typ"}</Label>
              <Input value={type} onChange={(e) => setType(e.target.value)} />
            </div>

            <div>
              <Label>{t("gabinet.documentTemplates.variables") || "Zmienne"}</Label>
              <div className="space-y-2 max-h-[60vh] overflow-auto">
                {TEMPLATE_VARIABLE_CATEGORIES.map((cat) => (
                  <div key={cat.id}>
                    <div className="text-xs uppercase text-muted-foreground mb-2">{cat.label}</div>
                    <div className="flex flex-wrap gap-2">
                      {TEMPLATE_VARIABLES.filter((v) => v.category === cat.id).map((v) => (
                        <button
                          key={v.key}
                          type="button"
                          className="px-2 py-1 text-xs rounded border hover:bg-muted"
                          onClick={() => editorRef.current?.insertVariable?.(v.key)}
                        >
                          @{v.key}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>

        <main className="col-span-9">
          <div className="rounded-lg border p-4">
            <TemplateEditor ref={editorRef} value={tpl?.content ?? ""} onChange={() => {}} minHeightClassName="min-h-[520px]" />
          </div>
        </main>
      </div>
    </div>
  );
}
