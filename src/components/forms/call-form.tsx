import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CALL_OUTCOMES = [
  "busy",
  "leftVoiceMessage",
  "movedConversationForward",
  "wrongNumber",
  "noAnswer",
] as const;

export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export interface CallFormData {
  outcome: CallOutcome;
  callDate: number;
  note?: string;
}

interface CallFormProps {
  initialData?: Partial<CallFormData>;
  onSubmit: (data: CallFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function CallForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: CallFormProps) {
  const { t } = useTranslation();
  const [outcome, setOutcome] = useState<CallOutcome>(
    initialData?.outcome ?? "movedConversationForward"
  );
  const [note, setNote] = useState(initialData?.note ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      outcome,
      callDate: Date.now(),
      note: note || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4">
        <div className="space-y-1.5">
          <Label>
            {t("calls.form.outcome")} <span className="text-destructive">*</span>
          </Label>
          <Select value={outcome} onValueChange={(v) => setOutcome(v as CallOutcome)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CALL_OUTCOMES.map((o) => (
                <SelectItem key={o} value={o}>
                  {t(`calls.outcomes.${o}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t("calls.form.note")}</Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("calls.form.notePlaceholder")}
            rows={4}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("common.saving") : t("calls.form.logCall")}
        </Button>
      </div>
    </form>
  );
}
