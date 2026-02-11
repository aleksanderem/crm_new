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
  useDroppable,
} from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { KanbanColumn } from "./kanban-column";
import { KanbanCard } from "./kanban-card";
import { Id } from "@cvx/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Trophy, XCircle, Trash2 } from "lucide-react";

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
  expectedCloseDate?: number;
}

interface KanbanBoardProps {
  stages: KanbanStage[];
  leads: KanbanLead[];
  onMoveToStage: (leadId: Id<"leads">, stageId: Id<"pipelineStages">, order: number) => void;
  onCardClick?: (lead: KanbanLead) => void;
  onMarkWon?: (leadId: Id<"leads">) => void;
  onMarkLost?: (leadId: Id<"leads">) => void;
  onDelete?: (leadId: Id<"leads">) => void;
}

const DROPPABLE_WON = "droppable-won";
const DROPPABLE_LOST = "droppable-lost";
const DROPPABLE_DELETE = "droppable-delete";

function BottomDropZone({
  id,
  label,
  icon,
  colorClass,
  isOver,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  colorClass: string;
  isOver: boolean;
}) {
  const { setNodeRef, isOver: localIsOver } = useDroppable({ id });
  const active = isOver || localIsOver;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-lg border-2 border-dashed py-3 text-sm font-medium transition-all",
        active ? colorClass : "border-muted-foreground/30 text-muted-foreground"
      )}
    >
      {icon}
      {label}
    </div>
  );
}

export function KanbanBoard({
  stages,
  leads,
  onMoveToStage,
  onCardClick,
  onMarkWon,
  onMarkLost,
  onDelete,
}: KanbanBoardProps) {
  const { t } = useTranslation();
  const [activeId, setActiveId] = useState<Id<"leads"> | null>(null);
  const [overDropZone, setOverDropZone] = useState<string | null>(null);

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

  const handleDragOver = (event: DragOverEvent) => {
    const overId = event.over?.id as string | undefined;
    if (overId === DROPPABLE_WON || overId === DROPPABLE_LOST || overId === DROPPABLE_DELETE) {
      setOverDropZone(overId);
    } else {
      setOverDropZone(null);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setOverDropZone(null);

    if (!over) return;

    const leadId = active.id as Id<"leads">;
    const overId = over.id as string;

    // Check bottom bar drop zones
    if (overId === DROPPABLE_WON) {
      onMarkWon?.(leadId);
      return;
    }
    if (overId === DROPPABLE_LOST) {
      onMarkLost?.(leadId);
      return;
    }
    if (overId === DROPPABLE_DELETE) {
      onDelete?.(leadId);
      return;
    }

    // Determine the target stage
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
  const isDragging = activeId !== null;
  const hasDropCallbacks = onMarkWon || onMarkLost || onDelete;

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

      {/* Bottom dropper bar */}
      {isDragging && hasDropCallbacks && (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex gap-3 bg-background/95 backdrop-blur-sm border-t p-3 shadow-lg">
          {onMarkWon && (
            <BottomDropZone
              id={DROPPABLE_WON}
              label={t('kanban.won')}
              icon={<Trophy className="h-4 w-4" />}
              colorClass="border-green-500 bg-green-50 text-green-700"
              isOver={overDropZone === DROPPABLE_WON}
            />
          )}
          {onMarkLost && (
            <BottomDropZone
              id={DROPPABLE_LOST}
              label={t('kanban.lost')}
              icon={<XCircle className="h-4 w-4" />}
              colorClass="border-red-500 bg-red-50 text-red-700"
              isOver={overDropZone === DROPPABLE_LOST}
            />
          )}
          {onDelete && (
            <BottomDropZone
              id={DROPPABLE_DELETE}
              label={t('kanban.delete')}
              icon={<Trash2 className="h-4 w-4" />}
              colorClass="border-gray-500 bg-gray-100 text-gray-700"
              isOver={overDropZone === DROPPABLE_DELETE}
            />
          )}
        </div>
      )}
    </DndContext>
  );
}
