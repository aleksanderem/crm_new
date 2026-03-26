import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cx } from "@/lib/utils/cx";
import { Button } from "@untitled/base/buttons/button";
import { CloseButton } from "@untitled/base/buttons/close-button";
import { Dropdown } from "@untitled/base/dropdown/dropdown";
import { ChevronDown } from "@untitledui/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BulkAction } from "./types";

export interface BulkActionsBarProps {
  selectedCount: number;
  actions: BulkAction[];
  onAction: (actionValue: string) => void;
  onClearSelection: () => void;
  className?: string;
}

export function BulkActionsBar({
  selectedCount,
  actions,
  onAction,
  onClearSelection,
  className,
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
      <div className={cx("flex items-center gap-3 rounded-lg border border-border-secondary bg-bg-secondary px-4 py-2", className)}>
        <span className="text-sm font-medium text-fg-secondary">
          {t("table.selectedRecords", { count: selectedCount })}
        </span>

        <Dropdown.Root>
          <Button size="xs" color="secondary" iconTrailing={ChevronDown}>
            {t("table.selectAction", { defaultValue: "Select Action" })}
          </Button>
          <Dropdown.Popover className="w-min">
            <Dropdown.Menu>
              {actions.map((action) => (
                <Dropdown.Item
                  key={action.value}
                  label={action.label}
                  onAction={() => handleActionSelect(action)}
                />
              ))}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown.Root>

        <div className="ml-auto">
          <CloseButton
            size="xs"
            onPress={onClearSelection}
            label={t("table.clearSelection")}
          />
        </div>
      </div>

      {/* Confirmation dialog for destructive actions — kept as shadcn Dialog for now */}
      <Dialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Confirm Action</DialogTitle>
            <DialogDescription>
              {t("table.confirmBulk", {
                action: confirmAction?.label?.toLowerCase(),
                count: selectedCount,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button size="sm" color="secondary" onClick={() => setConfirmAction(null)}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" color="primary-destructive" onClick={handleConfirm}>
              {t("common.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function useBulkSelection<_T extends { _id: string }>() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds],
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
