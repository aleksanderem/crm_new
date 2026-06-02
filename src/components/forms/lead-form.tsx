import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/gabinet/rich-text-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CustomFieldFormSection } from "@/components/custom-fields/custom-field-form-section";
import { TagsPicker } from "@/components/categories-tags/tags-picker";
import { CategoryPicker } from "@/components/categories-tags/category-picker";
import type { CustomFieldType, LeadStatus, LeadPriority } from "@cvx/schema";
import type { Id } from "@cvx/_generated/dataModel";

interface FieldDefinition {
  _id: string;
  name: string;
  fieldKey: string;
  fieldType: CustomFieldType;
  options?: string[];
  isRequired?: boolean;
  group?: string;
}

interface PipelineStage {
  _id: string;
  name: string;
  pipelineId: string;
}

interface Pipeline {
  _id: string;
  name: string;
}

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

interface LeadFormProps {
  initialData?: {
    title: string;
    value?: number | null;
    status: LeadStatus;
    priority?: LeadPriority | null;
    source?: string | null;
    pipelineStageId?: Id<"pipelineStages"> | null;
    notes?: string | null;
    tagIds?: Id<"tagDefinitions">[];
    categoryId?: Id<"categoryDefinitions"> | null;
  };
  pipelines?: Pipeline[];
  stages?: PipelineStage[];
  customFieldDefinitions?: FieldDefinition[];
  customFieldValues?: Record<string, unknown>;
  tagDefinitions?: TagDef[];
  categoryDefinitions?: CategoryDef[];
  onSubmit: (
    data: {
      title: string;
      value?: number | null;
      status: LeadStatus;
      priority?: LeadPriority | null;
      source?: string | null;
      pipelineStageId?: Id<"pipelineStages"> | null;
      notes?: string | null;
      tagIds?: Id<"tagDefinitions">[];
      categoryId?: Id<"categoryDefinitions"> | null;
    },
    customFields: Record<string, unknown>
  ) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  extraFields?: React.ReactNode;
  organizationId?: Id<"organizations">;
}

const statusOptions: LeadStatus[] = ["open", "won", "lost", "archived"];
const priorityOptions: LeadPriority[] = ["low", "medium", "high", "urgent"];

export function LeadForm({
  initialData,
  pipelines = [],
  stages = [],
  customFieldDefinitions = [],
  customFieldValues: initialCustomFieldValues = {},
  tagDefinitions = [],
  categoryDefinitions = [],
  onSubmit,
  onCancel,
  isSubmitting = false,
  extraFields,
  organizationId,
}: LeadFormProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [value, setValue] = useState<string>(
    initialData?.value?.toString() ?? ""
  );
  const [status, setStatus] = useState<LeadStatus>(
    initialData?.status ?? "open"
  );
  const [priority, setPriority] = useState<LeadPriority | "">(
    initialData?.priority ?? ""
  );
  const [source, setSource] = useState(initialData?.source ?? "");
  const [selectedPipeline, setSelectedPipeline] = useState<string>(
    () => {
      if (initialData?.pipelineStageId) {
        const stage = stages.find((s) => s._id === initialData.pipelineStageId);
        return stage?.pipelineId ?? pipelines[0]?._id ?? "";
      }
      return pipelines[0]?._id ?? "";
    }
  );
  const [stageId, setStageId] = useState<string>(
    initialData?.pipelineStageId ?? ""
  );
  const [notes, setNotes] = useState(initialData?.notes ?? "");
  const [tagIds, setTagIds] = useState<Id<"tagDefinitions">[]>(initialData?.tagIds ?? []);
  const [categoryId, setCategoryId] = useState<Id<"categoryDefinitions"> | undefined>(initialData?.categoryId ?? undefined);
  const [customFields, setCustomFields] = useState<Record<string, unknown>>(
    initialCustomFieldValues
  );

  const filteredStages = stages.filter(
    (s) => s.pipelineId === selectedPipeline
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(
      {
        title,
        value: value ? Number(value) : null,
        status,
        priority: priority || null,
        source: source || null,
        pipelineStageId: (stageId as Id<"pipelineStages">) || null,
        notes: notes || null,
        tagIds: tagIds.length > 0 ? tagIds : undefined,
        categoryId: categoryId || null,
      },
      customFields
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>
            {t('leadForm.title')} <span className="text-destructive">*</span>
          </Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t('leadForm.value')}</Label>
          <Input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0"
            min={0}
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t('leadForm.status')}</Label>
          <Select value={status} onValueChange={(val) => setStatus(val as LeadStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`leadForm.statusOptions.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t('leadForm.priority')}</Label>
          <Select value={priority} onValueChange={(val) => setPriority(val as LeadPriority | "")}>
            <SelectTrigger>
              <SelectValue placeholder={t('common.none')} />
            </SelectTrigger>
            <SelectContent>
              {priorityOptions.map((p) => (
                <SelectItem key={p} value={p}>
                  {t(`leadForm.priorityOptions.${p}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t('leadForm.source')}</Label>
          <Input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder={t('leadForm.sourcePlaceholder')}
          />
        </div>
        {pipelines.length > 0 && (
          <>
            <div className="space-y-1.5">
              <Label>{t('leadForm.pipeline')}</Label>
              <Select value={selectedPipeline} onValueChange={(val) => {
                setSelectedPipeline(val);
                setStageId("");
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pipelines.map((p) => (
                    <SelectItem key={p._id} value={p._id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('leadForm.stage')}</Label>
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('leadForm.selectStage')} />
                </SelectTrigger>
                <SelectContent>
                  {filteredStages.map((s) => (
                    <SelectItem key={s._id} value={s._id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t('leadForm.notes')}</Label>
          <RichTextEditor
            value={notes}
            onChange={(v) => setNotes(v ?? "")}
            minHeight="80px"
          />
        </div>
        {tagDefinitions.length > 0 && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t('common.tags', { defaultValue: "Tagi" })}</Label>
            <TagsPicker
              tags={tagDefinitions}
              selectedIds={tagIds}
              onChange={setTagIds}
            />
          </div>
        )}
        {organizationId && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t('common.category', { defaultValue: "Kategoria" })}</Label>
            <CategoryPicker
              categories={categoryDefinitions}
              selectedId={categoryId}
              onChange={setCategoryId}
              organizationId={organizationId}
              entityType="lead"
            />
          </div>
        )}
      </div>

      {extraFields && (
        <div className="space-y-4 border-t pt-4">
          {extraFields}
        </div>
      )}

      {customFieldDefinitions.length > 0 && (
        <div className="border-t pt-6">
          <CustomFieldFormSection
            definitions={customFieldDefinitions}
            values={customFields}
            onChange={(key, val) =>
              setCustomFields((prev) => ({ ...prev, [key]: val }))
            }
          />
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={!title.trim() || isSubmitting}>
          {isSubmitting
            ? t('common.saving')
            : initialData
              ? t('common.save')
              : t('leadForm.createLead')}
        </Button>
      </div>
    </form>
  );
}
