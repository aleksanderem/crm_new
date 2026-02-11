import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
}: LeadFormProps) {
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

  const inputClasses =
    "h-9 w-full rounded-md border bg-transparent px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

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
            Title <span className="text-destructive">*</span>
          </Label>
          <input
            className={inputClasses}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Value</Label>
          <input
            type="number"
            className={inputClasses}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0"
            min={0}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <select
            className={inputClasses}
            value={status}
            onChange={(e) => setStatus(e.target.value as LeadStatus)}
          >
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Priority</Label>
          <select
            className={inputClasses}
            value={priority}
            onChange={(e) => setPriority(e.target.value as LeadPriority | "")}
          >
            <option value="">None</option>
            {priorityOptions.map((p) => (
              <option key={p} value={p}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Source</Label>
          <input
            className={inputClasses}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="e.g. Website, Referral"
          />
        </div>
        {pipelines.length > 0 && (
          <>
            <div className="space-y-1.5">
              <Label>Pipeline</Label>
              <select
                className={inputClasses}
                value={selectedPipeline}
                onChange={(e) => {
                  setSelectedPipeline(e.target.value);
                  setStageId("");
                }}
              >
                {pipelines.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Stage</Label>
              <select
                className={inputClasses}
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
              >
                <option value="">Select stage...</option>
                {filteredStages.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>
      </div>

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
          Cancel
        </Button>
        <Button type="submit" disabled={!title.trim() || isSubmitting}>
          {isSubmitting
            ? "Saving..."
            : initialData
              ? "Update Lead"
              : "Create Lead"}
        </Button>
      </div>
    </form>
  );
}
