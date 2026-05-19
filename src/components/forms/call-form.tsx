import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/gabinet/rich-text-editor";
import { TagsPicker } from "@/components/categories-tags/tags-picker";
import { CategoryPicker } from "@/components/categories-tags/category-picker";
import type { Id } from "@cvx/_generated/dataModel";
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

interface TagDef {
  _id: Id<"tagDefinitions">;
  name: string;
  color: string;
}

interface CategoryDef {
  _id: Id<"categoryDefinitions">;
  name: string;
  parentId?: Id<"categoryDefinitions">;
  color?: string;
}

export interface CallFormData {
  outcome: CallOutcome;
  callDate: number;
  note?: string;
  tagIds?: Id<"tagDefinitions">[];
  categoryId?: Id<"categoryDefinitions">;
}

interface CallFormProps {
  initialData?: Partial<CallFormData>;
  onSubmit: (data: CallFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  tagDefinitions?: TagDef[];
  categoryDefinitions?: CategoryDef[];
  organizationId?: Id<"organizations">;
}

export function CallForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false,
  tagDefinitions = [],
  categoryDefinitions = [],
  organizationId,
}: CallFormProps) {
  const { t } = useTranslation();
  const [outcome, setOutcome] = useState<CallOutcome>(
    initialData?.outcome ?? "movedConversationForward"
  );
  const [note, setNote] = useState(initialData?.note ?? "");
  const [tagIds, setTagIds] = useState<Id<"tagDefinitions">[]>(initialData?.tagIds ?? []);
  const [categoryId, setCategoryId] = useState<Id<"categoryDefinitions"> | undefined>(initialData?.categoryId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      outcome,
      callDate: Date.now(),
      note: note || undefined,
      tagIds: tagIds.length > 0 ? tagIds : undefined,
      categoryId: categoryId || undefined,
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
          <RichTextEditor
            value={note}
            onChange={(v) => setNote(v ?? "")}
            placeholder={t("calls.form.notePlaceholder")}
          />
        </div>
        {tagDefinitions.length > 0 && (
          <div className="space-y-1.5">
            <Label>{t('common.tags', { defaultValue: "Tagi" })}</Label>
            <TagsPicker tags={tagDefinitions} selectedIds={tagIds} onChange={setTagIds} />
          </div>
        )}
        {organizationId && (
          <div className="space-y-1.5">
            <Label>{t('common.category', { defaultValue: "Kategoria" })}</Label>
            <CategoryPicker
              categories={categoryDefinitions}
              selectedId={categoryId}
              onChange={setCategoryId}
              organizationId={organizationId}
              entityType="call"
            />
          </div>
        )}
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
