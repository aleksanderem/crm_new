import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { useState, useCallback } from "react";
import { KanbanColumn } from "./kanban-column";
import { KanbanCard } from "./kanban-card";
import { Id } from "@cvx/_generated/dataModel";

export interface KanbanStage {
  _id: Id<"pipelineStages">;
  name: string;
  color?: string;
  order: number;
}

export interface KanbanLead {
  _id: Id<"leads">;
  title: string;
  value?: number;
  currency?: string;
  pipelineStageId?: Id<"pipelineStages">;
  stageOrder?: number;
  companyName?: string;
  assigneeName?: string;
  assigneeAvatar?: string;
  priority?: string;
}

interface KanbanBoardProps {
  stages: KanbanStage[];
  leads: KanbanLead[];
  onMoveToStage: (leadId: Id<"leads">, stageId: Id<"pipelineStages">, order: number) => void;
  onCardClick?: (lead: KanbanLead) => void;
}

export function KanbanBoard({
  stages,
  leads,
  onMoveToStage,
  onCardClick,
}: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<Id<"leads"> | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const activeLead = activeId
    ? leads.find((l) => l._id === activeId)
    : null;

  const getLeadsForStage = useCallback(
    (stageId: Id<"pipelineStages">) =>
      leads
        .filter((l) => l.pipelineStageId === stageId)
        .sort((a, b) => (a.stageOrder ?? 0) - (b.stageOrder ?? 0)),
    [leads]
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as Id<"leads">);
  };

  const handleDragOver = (_event: DragOverEvent) => {
    // Visual feedback handled by DnD context
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const leadId = active.id as Id<"leads">;
    const overId = over.id as string;

    // Determine the target stage: either dropped on a stage directly,
    // or on another card (find that card's stage)
    let targetStageId: Id<"pipelineStages"> | undefined;

    const isStage = stages.some((s) => s._id === overId);
    if (isStage) {
      targetStageId = overId as Id<"pipelineStages">;
    } else {
      const overLead = leads.find((l) => l._id === overId);
      targetStageId = overLead?.pipelineStageId;
    }

    if (!targetStageId) return;

    const stageLeads = getLeadsForStage(targetStageId);
    const newOrder = stageLeads.length > 0
      ? Math.max(...stageLeads.map((l) => l.stageOrder ?? 0)) + 1
      : 0;

    onMoveToStage(leadId, targetStageId, newOrder);
  };

  const sortedStages = [...stages].sort((a, b) => a.order - b.order);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        <SortableContext
          items={sortedStages.map((s) => s._id)}
          strategy={horizontalListSortingStrategy}
        >
          {sortedStages.map((stage) => {
            const stageLeads = getLeadsForStage(stage._id);
            return (
              <KanbanColumn
                key={stage._id}
                stage={stage}
                leads={stageLeads}
                onCardClick={onCardClick}
              />
            );
          })}
        </SortableContext>
      </div>
      <DragOverlay>
        {activeLead ? (
          <KanbanCard lead={activeLead} isDragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
