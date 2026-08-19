import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSupabaseLostReasonsList } from "@/hooks/use-supabase-lost-reasons";
import { useSupabaseOrgSettings } from "@/hooks/use-supabase-organizations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface LostReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  organizationId: string;
}

export function LostReasonDialog({
  open,
  onOpenChange,
  onConfirm,
  organizationId,
}: LostReasonDialogProps) {
  const { data: lostReasons } = useSupabaseLostReasonsList(organizationId);
  const { data: orgSettings } = useSupabaseOrgSettings(organizationId);
  const { t } = useTranslation();
  const [selectedReason, setSelectedReason] = useState("");
  const [customReason, setCustomReason] = useState("");

  // Hide freeform custom entry when org has disabled custom lost reasons.
  // Defaults to allowed (fail-open) when settings are not yet loaded or not configured.
  const allowCustom = orgSettings?.allowCustomLostReason !== false;

  const handleSubmit = () => {
    const reason = selectedReason === "__custom__" ? customReason : selectedReason;
    if (reason.trim()) {
      onConfirm(reason.trim());
      setSelectedReason("");
      setCustomReason("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{t("detail.lostDialog.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Select value={selectedReason} onValueChange={setSelectedReason}>
            <SelectTrigger>
              <SelectValue placeholder={t("detail.lostDialog.selectReason")} />
            </SelectTrigger>
            <SelectContent>
              {lostReasons?.map((r) => (
                <SelectItem key={r._id} value={r.label}>
                  {r.label}
                </SelectItem>
              ))}
              {allowCustom && (
                <SelectItem value="__custom__">
                  {t("detail.lostDialog.customReason")}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          {selectedReason === "__custom__" && allowCustom && (
            <Input
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder={t("detail.lostDialog.customPlaceholder")}
              autoFocus
            />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={
              !selectedReason ||
              (selectedReason === "__custom__" && !customReason.trim())
            }
            onClick={handleSubmit}
          >
            {t("detail.lostDialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
