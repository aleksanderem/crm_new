import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { DocumentInstanceTable } from "@/components/documents/document-instance-table";
import { DocumentFromTemplateDialog } from "@/components/documents/document-from-template-dialog";
import { DocumentInstanceView } from "@/components/documents/document-instance-view";
import type { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/gabinet/documents/",
)({
  component: DocumentsIndex,
});

function DocumentsIndex() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [viewingDocId, setViewingDocId] =
    useState<Id<"documentInstances"> | null>(null);

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t("gabinet.documents.title")}
        description={t("gabinet.documents.description")}
      />

      <DocumentInstanceTable
        organizationId={organizationId}
        module="gabinet"
        onView={(instanceId) => setViewingDocId(instanceId)}
        onNewFromTemplate={() => setTemplateDialogOpen(true)}
        showNewButton
      />

      <DocumentFromTemplateDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        organizationId={organizationId}
        module="gabinet"
        sources={{}}
        onComplete={(instanceId) => setViewingDocId(instanceId)}
      />

      {viewingDocId && (
        <DocumentInstanceView
          instanceId={viewingDocId}
          onClose={() => setViewingDocId(null)}
        />
      )}
    </div>
  );
}
