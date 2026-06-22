import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@/components/org-context";
import { useSupabasePipelinesList } from "@/hooks/use-supabase-pipelines";
import { useSupabaseLeadsByPipeline } from "@/hooks/use-supabase-leads";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { KanbanBoard, KanbanLead } from "@/components/kanban/kanban-board";
import { KanbanCardDetailSheet } from "@/components/kanban/kanban-card-detail-sheet";
import { api } from "@cvx/_generated/api";
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
  // @ts-ignore — Convex type instantiation too deep (pre-existing)
  const moveToStage = useAction(api.leads.moveToStage);
  const updateLead = useAction(api.leads.update);
  const removeLead = useAction(api.leads.remove);
  const queryClient = useQueryClient();

  const { data: pipelines } = useSupabasePipelinesList(organizationId);

  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(
    null
  );
  const [selectedLead, setSelectedLead] = useState<KanbanLead | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const activePipeline =
    pipelines?.find((p) => p._id === selectedPipelineId) ??
    pipelines?.find((p) => p.isDefault) ??
    pipelines?.[0];

  const { data: stagesWithLeads } = useSupabaseLeadsByPipeline(
    organizationId,
    activePipeline?._id,
    { enabled: !!activePipeline },
  );

  const stages = (stagesWithLeads ?? []).map((s) => ({
    _id: s._id as Id<"pipelineStages">,
    name: s.name,
    color: s.color,
    order: s.order,
  }));

  const kanbanLeads: KanbanLead[] = (stagesWithLeads ?? []).flatMap((stage) =>
    stage.leads.map((l) => ({
      _id: l._id as Id<"leads">,
      title: l.title,
      value: l.value,
      currency: l.currency,
      pipelineStageId: l.pipelineStageId as Id<"pipelineStages"> | undefined,
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
    queryClient.invalidateQueries({ queryKey: supabaseKeys.leads.all });
    queryClient.invalidateQueries({ queryKey: supabaseKeys.pipelineStages.all });
  };

  const handleMarkWon = async (leadId: Id<"leads">) => {
    await updateLead({
      organizationId,
      leadId,
      status: "won",
    });
    queryClient.invalidateQueries({ queryKey: supabaseKeys.leads.all });
  };

  const handleMarkLost = async (leadId: Id<"leads">) => {
    await updateLead({
      organizationId,
      leadId,
      status: "lost",
    });
    queryClient.invalidateQueries({ queryKey: supabaseKeys.leads.all });
  };

  const handleDelete = async (leadId: Id<"leads">) => {
    await removeLead({
      organizationId,
      leadId,
    });
    queryClient.invalidateQueries({ queryKey: supabaseKeys.leads.all });
  };

  return (
    <div>
      <PageHeader
        title={t('pipelines.title')}
        description={t('pipelines.description')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
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
                <TableIcon className="h-4 w-4" variant="stroke" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-l-none bg-accent"
              >
                <KanbanIcon className="h-4 w-4" variant="stroke" />
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
