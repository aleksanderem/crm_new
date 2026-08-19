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
import { LostReasonDialog } from "@/components/crm/lost-reason-dialog";
import { api } from "@cvx/_generated/api";
import { Button } from "@/components/ui/button";
import { Kanban, TableIcon, KanbanIcon } from "@/lib/ez-icons";
import { useState } from "react";
import { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { formatActionError } from "@/lib/format-action-error";

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
  const moveToStage = useAction(api.crm.leads.moveToStage);
  const updateLead = useAction(api.crm.leads.update);
  const removeLead = useAction(api.crm.leads.remove);
  const queryClient = useQueryClient();

  const { data: pipelines } = useSupabasePipelinesList(organizationId);

  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(
    null
  );
  const [selectedLead, setSelectedLead] = useState<KanbanLead | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [lostDialogOpen, setLostDialogOpen] = useState(false);
  type PendingMove = { leadId: Id<"leads">; stageId: Id<"pipelineStages">; order: number };
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [pendingMarkLostId, setPendingMarkLostId] = useState<Id<"leads"> | null>(null);

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
    const targetStage = stagesWithLeads?.find((s) => s._id === stageId);
    if (targetStage?.isLostStage) {
      setPendingMove({ leadId, stageId, order });
      setLostDialogOpen(true);
      return;
    }
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

  const handleMarkLost = (leadId: Id<"leads">) => {
    setPendingMarkLostId(leadId);
    setLostDialogOpen(true);
  };

  const handleLostConfirm = async (reason: string) => {
    try {
      if (pendingMove) {
        await moveToStage({
          organizationId,
          leadId: pendingMove.leadId,
          pipelineStageId: pendingMove.stageId,
          stageOrder: pendingMove.order,
          lostReason: reason,
        });
        queryClient.invalidateQueries({ queryKey: supabaseKeys.leads.all });
        queryClient.invalidateQueries({ queryKey: supabaseKeys.pipelineStages.all });
      } else if (pendingMarkLostId) {
        await updateLead({
          organizationId,
          leadId: pendingMarkLostId,
          status: "lost",
          lostReason: reason,
        });
        queryClient.invalidateQueries({ queryKey: supabaseKeys.leads.all });
      }
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "leads.errors.updateFailed",
          defaultValue: "Nie udało się oznaczyć szansy jako przegranej.",
        }),
      );
    } finally {
      setLostDialogOpen(false);
      setPendingMove(null);
      setPendingMarkLostId(null);
    }
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

      <LostReasonDialog
        open={lostDialogOpen}
        onOpenChange={(open) => {
          setLostDialogOpen(open);
          if (!open) {
            setPendingMove(null);
            setPendingMarkLostId(null);
          }
        }}
        onConfirm={handleLostConfirm}
        organizationId={organizationId}
      />
    </div>
  );
}
