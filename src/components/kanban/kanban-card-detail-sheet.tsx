import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { KanbanLead } from "./kanban-board";

interface KanbanCardDetailSheetProps {
  lead: KanbanLead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function KanbanCardDetailSheet({
  lead,
  open,
  onOpenChange,
}: KanbanCardDetailSheetProps) {
  if (!lead) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{lead.title}</SheetTitle>
          <SheetDescription>
            {lead.companyName ?? "No company"}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div className="flex items-center gap-2">
            {lead.value != null && lead.value > 0 && (
              <Badge variant="secondary">{formatCurrency(lead.value)}</Badge>
            )}
            {lead.priority && (
              <Badge variant="outline">{lead.priority}</Badge>
            )}
          </div>

          <Separator />

          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Assigned to</p>
              <p className="text-sm">{lead.assigneeName ?? "Unassigned"}</p>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
