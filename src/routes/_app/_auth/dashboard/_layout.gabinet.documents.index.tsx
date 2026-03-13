import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { DocumentInstanceTable } from "@/components/documents/document-instance-table";
import { DocumentFromTemplateDialog } from "@/components/documents/document-from-template-dialog";
import { DocumentInstanceView } from "@/components/documents/document-instance-view";
import type { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";

// shadcn/studio statistics blocks
import StatisticsOrderCard from "@/components/shadcn-studio/blocks/statistics-order-card";
import StatisticsProfitCard from "@/components/shadcn-studio/blocks/statistics-profit-card";
import StatisticsImpressionCard from "@/components/shadcn-studio/blocks/statistics-impression-card";

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

  const { data: kpis } = useQuery(
    convexQuery(api.gabinet.sidebarWidgets.getDocumentsKpis, { organizationId })
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={t("gabinet.documents.title")}
        description={t("gabinet.documents.description")}
      />

      {/* KPI Statistics Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatisticsOrderCard
          title={t("gabinet.documents.templates", "Szablony")}
          description={t("gabinet.documents.available", "Dostępne")}
          value={String(kpis?.totalTemplates ?? 0)}
          changePercentage={t("gabinet.documents.inLibrary", "w bibliotece")}
        />
        <StatisticsProfitCard
          title={t("gabinet.documents.newThisMonth", "Nowe w tym mies.")}
          description={t("gabinet.documents.thisMonth", "Ten miesiąc")}
          value={String(kpis?.newDocumentsThisMonth ?? 0)}
          changePercentage={t("gabinet.documents.generated", "wygenerowanych")}
        />
        <StatisticsImpressionCard
          title={t("gabinet.documents.pendingSignature", "Do podpisu")}
          description={t("gabinet.documents.awaitingSignature", "Oczekujące")}
          value={String(kpis?.pendingSignature ?? 0)}
          changePercentage={
            kpis && kpis.pendingSignature > 0
              ? t("gabinet.documents.needsSignature", "wymaga podpisu")
              : t("gabinet.documents.allSigned", "wszystkie podpisane")
          }
        />
      </div>

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
