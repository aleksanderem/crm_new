import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { KanbanLead } from "./kanban-board";

interface KanbanCardProps {
  lead: KanbanLead;
  isDragging?: boolean;
  onClick?: () => void;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

const priorityColors: Record<string, string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

export function KanbanCard({ lead, isDragging, onClick }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortDragging,
  } = useSortable({ id: lead._id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "cursor-grab rounded-md border bg-card p-3 shadow-sm transition-shadow hover:shadow-md",
        (isDragging || isSortDragging) && "opacity-50 shadow-lg",
        onClick && "cursor-pointer"
      )}
      onClick={onClick}
    >
      <p className="text-sm font-medium leading-tight">{lead.title}</p>

      {lead.companyName && (
        <p className="mt-1 text-xs text-muted-foreground">
          {lead.companyName}
        </p>
      )}

      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {lead.value != null && lead.value > 0 && (
            <Badge variant="secondary" className="text-xs font-normal">
              {formatCurrency(lead.value)}
            </Badge>
          )}
          {lead.priority && (
            <Badge
              className={cn(
                "text-xs font-normal",
                priorityColors[lead.priority] ?? ""
              )}
              variant="secondary"
            >
              {lead.priority}
            </Badge>
          )}
        </div>

        {lead.assigneeName && (
          <Avatar className="h-6 w-6">
            <AvatarFallback className="text-[10px]">
              {lead.assigneeName
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2)}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    </div>
  );
}
