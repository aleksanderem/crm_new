import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { KanbanBoard, KanbanLead } from "@/components/kanban/kanban-board";
import { KanbanCardDetailSheet } from "@/components/kanban/kanban-card-detail-sheet";
import { Button } from "@/components/ui/button";
import { Kanban, TableIcon, KanbanIcon } from "@/lib/ez-icons";
import { useState } from "react";
import { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/pipelines/"
)({
  component: PipelinesIndex,
});

function PipelinesIndex() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const moveToStage = useMutation(api.leads.moveToStage);
  const updateLead = useMutation(api.leads.update);
  const removeLead = useMutation(api.leads.remove);

  const { data: pipelines } = useQuery(
    convexQuery(api.pipelines.list, { organizationId })
  );

  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(
    null
  );
  const [selectedLead, setSelectedLead] = useState<KanbanLead | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const activePipeline =
    pipelines?.find((p) => p._id === selectedPipelineId) ??
    pipelines?.find((p) => p.isDefault) ??
    pipelines?.[0];

  const { data: stagesWithLeads } = useQuery({
    ...convexQuery(api.leads.getByPipeline, {
      organizationId,
      pipelineId: activePipeline?._id ?? ("" as Id<"pipelines">),
    }),
    enabled: !!activePipeline,
  });

  const stages = (stagesWithLeads ?? []).map((s) => ({
    _id: s._id,
    name: s.name,
    color: s.color,
    order: s.order,
  }));

  const kanbanLeads: KanbanLead[] = (stagesWithLeads ?? []).flatMap((stage) =>
    stage.leads.map((l) => ({
      _id: l._id,
      title: l.title,
      value: l.value,
      currency: l.currency,
      pipelineStageId: l.pipelineStageId,
      stageOrder: l.stageOrder,
      priority: l.priority,
      expectedCloseDate: l.expectedCloseDate,
    }))
  );

  const handleMoveToStage = async (
    leadId: Id<"leads">,
    stageId: Id<"pipelineStages">,
    order: number
  ) => {
    await moveToStage({
      organizationId,
      leadId,
      pipelineStageId: stageId,
      stageOrder: order,
    });
  };

  const handleMarkWon = async (leadId: Id<"leads">) => {
    await updateLead({
      organizationId,
      leadId,
      status: "won",
    });
  };

  const handleMarkLost = async (leadId: Id<"leads">) => {
    await updateLead({
      organizationId,
      leadId,
      status: "lost",
    });
  };

  const handleDelete = async (leadId: Id<"leads">) => {
    await removeLead({
      organizationId,
      leadId,
    });
  };

  return (
    <div>
      <PageHeader
        title={t('pipelines.title')}
        description={t('pipelines.description')}
        actions={
          <div className="flex items-center gap-2">
            {pipelines && pipelines.length > 1 && (
              <div className="flex gap-1">
                {pipelines.map((p) => (
                  <Button
                    key={p._id}
                    variant={
                      activePipeline?._id === p._id ? "default" : "outline"
                    }
                    size="sm"
                    onClick={() => setSelectedPipelineId(p._id)}
                  >
                    {p.name}
                  </Button>
                ))}
              </div>
            )}

            {/* Table/Board toggle */}
            <div className="flex rounded-md border">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-r-none"
                onClick={() => navigate({ to: "/dashboard/leads" })}
              >
                <TableIcon className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-l-none bg-accent"
              >
                <KanbanIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>
        }
      />

      {!pipelines || pipelines.length === 0 ? (
        <EmptyState
          icon={Kanban}
          title={t('pipelines.emptyTitle')}
          description={t('pipelines.emptyDescription')}
        />
      ) : (
        <KanbanBoard
          stages={stages ?? []}
          leads={kanbanLeads}
          onMoveToStage={handleMoveToStage}
          onMarkWon={handleMarkWon}
          onMarkLost={handleMarkLost}
          onDelete={handleDelete}
          onCardClick={(lead) => {
            setSelectedLead(lead);
            setSheetOpen(true);
          }}
        />
      )}

      <KanbanCardDetailSheet
        lead={selectedLead}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
