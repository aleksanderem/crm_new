import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CustomFieldFormSection } from "@/components/custom-fields/custom-field-form-section";
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
  _id: Id<"pipelineStages">;
  name: string;
  pipelineId: Id<"pipelines">;
}

interface Pipeline {
  _id: Id<"pipelines">;
  name: string;
}

interface LeadFormProps {
  initialData?: {
    title: string;
    value?: number;
    status: LeadStatus;
    priority?: LeadPriority;
    source?: string;
    pipelineStageId?: Id<"pipelineStages">;
    notes?: string;
  };
  pipelines?: Pipeline[];
  stages?: PipelineStage[];
  customFieldDefinitions?: FieldDefinition[];
  customFieldValues?: Record<string, unknown>;
  onSubmit: (
    data: {
      title: string;
      value?: number;
      status: LeadStatus;
      priority?: LeadPriority;
      source?: string;
      pipelineStageId?: Id<"pipelineStages">;
      notes?: string;
    },
    customFields: Record<string, unknown>
  ) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  extraFields?: React.ReactNode;
}

const statusOptions: LeadStatus[] = ["open", "won", "lost", "archived"];
const priorityOptions: LeadPriority[] = ["low", "medium", "high", "urgent"];

export function LeadForm({
  initialData,
  pipelines = [],
  stages = [],
  customFieldDefinitions = [],
  customFieldValues: initialCustomFieldValues = {},
  onSubmit,
  onCancel,
  isSubmitting = false,
  extraFields,
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
        value: value ? Number(value) : undefined,
        status,
        priority: priority || undefined,
        source: source || undefined,
        pipelineStageId: (stageId as Id<"pipelineStages">) || undefined,
        notes: notes || undefined,
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
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>
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
