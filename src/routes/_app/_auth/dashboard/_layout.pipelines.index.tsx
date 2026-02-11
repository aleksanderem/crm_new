import { createFileRoute } from "@tanstack/react-router";
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
import { Kanban } from "lucide-react";
import { useState } from "react";
import { Id } from "@cvx/_generated/dataModel";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/pipelines/"
)({
  component: PipelinesIndex,
});

function PipelinesIndex() {
  const { organizationId } = useOrganization();
  const moveToStage = useMutation(api.leads.moveToStage);

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

  return (
    <div>
      <PageHeader
        title="Pipelines"
        description="Visualize and manage your deal pipeline."
        actions={
          pipelines && pipelines.length > 1 ? (
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
          ) : undefined
        }
      />

      {!pipelines || pipelines.length === 0 ? (
        <EmptyState
          icon={Kanban}
          title="No pipelines yet"
          description="Create a pipeline in Settings to start managing your deals visually."
        />
      ) : (
        <KanbanBoard
          stages={stages ?? []}
          leads={kanbanLeads}
          onMoveToStage={handleMoveToStage}
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
