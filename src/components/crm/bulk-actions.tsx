import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronDown, X } from "@/lib/ez-icons";
import { cn } from "@/lib/utils";
import type { BulkAction } from "./types";

export interface BulkActionsBarProps {
  selectedCount: number;
  actions: BulkAction[];
  onAction: (actionValue: string) => void;
  onClearSelection: () => void;
}

export function BulkActionsBar({
  selectedCount,
  actions,
  onAction,
  onClearSelection,
}: BulkActionsBarProps) {
  const { t } = useTranslation();
  const [confirmAction, setConfirmAction] = useState<BulkAction | null>(null);

  if (selectedCount === 0) return null;

  const handleActionSelect = (action: BulkAction) => {
    if (action.variant === "destructive") {
      setConfirmAction(action);
    } else {
      onAction(action.value);
    }
  };

  const handleConfirm = () => {
    if (confirmAction) {
      onAction(confirmAction.value);
      setConfirmAction(null);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 rounded-md border bg-muted/50 px-4 py-2">
        <span className="text-sm font-medium">
          {t('table.selectedRecords', { count: selectedCount })}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8">
              Select Action
              <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {actions.map((action) => (
              <DropdownMenuItem
                key={action.value}
                className={cn(action.variant === "destructive" && "text-destructive")}
                onClick={() => handleActionSelect(action)}
              >
                {action.icon && <span className="mr-2">{action.icon}</span>}
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="icon" className="h-7 w-7 ml-auto" onClick={onClearSelection}>
          <X className="h-4 w-4" />
          <span className="sr-only">{t('table.clearSelection')}</span>
        </Button>
      </div>

      <Dialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Confirm Action</DialogTitle>
            <DialogDescription>
              {t('table.confirmBulk', { action: confirmAction?.label?.toLowerCase(), count: selectedCount })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmAction(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" size="sm" onClick={handleConfirm}>
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function useBulkSelection<T extends { _id: string }>() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds]
  );

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const clearAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return {
    selectedIds,
    isSelected,
    toggle,
    selectAll,
    clearAll,
    selectedCount: selectedIds.size,
  };
}
