import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { cn } from "@/lib/utils";
import { KanbanCard } from "./kanban-card";
import type { KanbanStage, KanbanLead } from "./kanban-board";
import { ScrollArea } from "@/components/ui/scroll-area";

interface KanbanColumnProps {
  stage: KanbanStage;
  leads: KanbanLead[];
  onCardClick?: (lead: KanbanLead) => void;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function KanbanColumn({ stage, leads, onCardClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage._id });

  const totalValue = leads.reduce((sum, l) => sum + (l.value ?? 0), 0);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-lg bg-muted/50",
        isOver && "ring-2 ring-primary/20"
      )}
    >
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2">
          {stage.color && (
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: stage.color }}
            />
          )}
          <h3 className="text-sm font-medium">{stage.name}</h3>
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
            {leads.length}
          </span>
        </div>
        {totalValue > 0 && (
          <span className="text-xs text-muted-foreground">
            {formatCurrency(totalValue)}
          </span>
        )}
      </div>

      <ScrollArea className="flex-1 px-2 pb-2">
        <SortableContext
          items={leads.map((l) => l._id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-2">
            {leads.map((lead) => (
              <KanbanCard
                key={lead._id}
                lead={lead}
                onClick={() => onCardClick?.(lead)}
              />
            ))}
          </div>
        </SortableContext>
      </ScrollArea>
    </div>
  );
}
