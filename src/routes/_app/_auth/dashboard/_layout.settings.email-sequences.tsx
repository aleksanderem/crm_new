import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Mail,
} from "lucide-react";
import { toast } from "sonner";
import { Id } from "@cvx/_generated/dataModel";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/email-sequences"
)({
  component: EmailSequencesSettings,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Sequence {
  _id: Id<"emailSequences">;
  name: string;
  triggerEventType: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

interface SequenceStep {
  _id: Id<"emailSequenceSteps">;
  sequenceId: Id<"emailSequences">;
  order: number;
  delayMs: number;
  templateId: Id<"emailTemplates">;
}



// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MS_PER_HOUR = 3_600_000;

function msToHours(ms: number) {
  return Math.round(ms / MS_PER_HOUR);
}

function hoursToMs(hours: number) {
  return Math.max(0, Math.round(hours)) * MS_PER_HOUR;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function EmailSequencesSettings() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();

  // Sequence to edit (open the editor dialog)
  const [editingSequenceId, setEditingSequenceId] =
    useState<Id<"emailSequences"> | null>(null);
  // "new" dialog
  const [showCreate, setShowCreate] = useState(false);
  // Delete confirmation
  const [deletingSequenceId, setDeletingSequenceId] =
    useState<Id<"emailSequences"> | null>(null);

  // Sequences list
  const { data: sequences, isLoading } = useQuery(
    convexQuery(api.emailSequences.listSequences, { organizationId })
  );

  // Mutations
  const updateSequence = useMutation(api.emailSequences.updateSequence);
  const deleteSequence = useMutation(api.emailSequences.deleteSequence);

  // Toggle active
  const handleToggleActive = async (seq: Sequence) => {
    try {
      await updateSequence({
        organizationId,
        sequenceId: seq._id,
        isActive: !seq.isActive,
      });
      toast.success(
        seq.isActive
          ? t("emailSequences.deactivatedSuccess")
          : t("emailSequences.activatedSuccess")
      );
    } catch {
      toast.error(t("emailSequences.toggleError"));
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingSequenceId) return;
    try {
      await deleteSequence({ organizationId, sequenceId: deletingSequenceId });
      toast.success(t("emailSequences.deleteSuccess"));
    } catch {
      toast.error(t("emailSequences.deleteError"));
    } finally {
      setDeletingSequenceId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("emailSequences.title")}
        description={t("emailSequences.description")}
        actions={
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-1 h-4 w-4" />
            {t("emailSequences.createSequence")}
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !sequences || sequences.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Mail className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-medium">{t("emailSequences.empty")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("emailSequences.emptyHint")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sequences.map((seq) => (
            <Card key={seq._id}>
              <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{seq.name}</span>
                    <Badge variant={seq.isActive ? "default" : "secondary"}>
                      {seq.isActive
                        ? t("emailSequences.active")
                        : t("emailSequences.inactive")}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("emailSequences.trigger")}:{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                      {seq.triggerEventType}
                    </code>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Active toggle */}
                  <div className="flex items-center gap-1.5">
                    <Switch
                      id={`seq-active-${seq._id}`}
                      checked={seq.isActive}
                      onCheckedChange={() => handleToggleActive(seq)}
                      aria-label={t("emailSequences.toggleActive")}
                    />
                    <Label
                      htmlFor={`seq-active-${seq._id}`}
                      className="text-xs"
                    >
                      {t("emailSequences.isActive")}
                    </Label>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingSequenceId(seq._id)}
                  >
                    {t("emailSequences.editSteps")}
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => setDeletingSequenceId(seq._id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <CreateSequenceDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        organizationId={organizationId}
      />

      {/* Editor dialog */}
      {editingSequenceId && (
        <SequenceEditorDialog
          sequenceId={editingSequenceId}
          organizationId={organizationId}
          onClose={() => setEditingSequenceId(null)}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deletingSequenceId}
        onOpenChange={(open) => !open && setDeletingSequenceId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("emailSequences.deleteConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("emailSequences.deleteConfirmDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteConfirm}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}

// ---------------------------------------------------------------------------
// CreateSequenceDialog
// ---------------------------------------------------------------------------

function CreateSequenceDialog({
  open,
  onClose,
  organizationId,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: Id<"organizations">;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [triggerEventType, setTriggerEventType] = useState("");
  const [saving, setSaving] = useState(false);

  const createSequence = useMutation(api.emailSequences.createSequence);

  const { data: eventTypes } = useQuery(
    convexQuery(api.emailEvents.listEventTypes, { organizationId })
  );

  const handleSave = async () => {
    if (!name.trim() || !triggerEventType) return;
    setSaving(true);
    try {
      await createSequence({
        organizationId,
        name: name.trim(),
        triggerEventType,
        isActive: false,
      });
      toast.success(t("emailSequences.createSuccess"));
      setName("");
      setTriggerEventType("");
      onClose();
    } catch {
      toast.error(t("emailSequences.createError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("emailSequences.createSequence")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="seq-name">{t("emailSequences.name")}</Label>
            <Input
              id="seq-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("emailSequences.namePlaceholder")}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="seq-trigger">
              {t("emailSequences.triggerEvent")}
            </Label>
            <Select
              value={triggerEventType}
              onValueChange={setTriggerEventType}
            >
              <SelectTrigger id="seq-trigger">
                <SelectValue
                  placeholder={t("emailSequences.selectTrigger")}
                />
              </SelectTrigger>
              <SelectContent>
                {(eventTypes ?? []).map((et) => (
                  <SelectItem key={et._id} value={et.eventType}>
                    {et.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !name.trim() || !triggerEventType}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("emailSequences.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// SequenceEditorDialog — edit name/trigger + manage steps
// ---------------------------------------------------------------------------

function SequenceEditorDialog({
  sequenceId,
  organizationId,
  onClose,
}: {
  sequenceId: Id<"emailSequences">;
  organizationId: Id<"organizations">;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  const { data: sequence, isLoading } = useQuery(
    convexQuery(api.emailSequences.getSequence, { organizationId, sequenceId })
  );

  const { data: eventTypes } = useQuery(
    convexQuery(api.emailEvents.listEventTypes, { organizationId })
  );

  const { data: templates } = useQuery(
    convexQuery(api.emailTemplates.list, { organizationId, activeOnly: true })
  );

  const updateSequence = useMutation(api.emailSequences.updateSequence);
  const upsertStep = useMutation(api.emailSequences.upsertStep);
  const deleteStep = useMutation(api.emailSequences.deleteStep);

  // Local editable fields
  const [name, setName] = useState<string | null>(null);
  const [trigger, setTrigger] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Resolved values (local edits override server data)
  const resolvedName = name ?? sequence?.name ?? "";
  const resolvedTrigger = trigger ?? sequence?.triggerEventType ?? "";

  const handleSaveHeader = async () => {
    if (!sequence) return;
    setSaving(true);
    try {
      await updateSequence({
        organizationId,
        sequenceId,
        name: resolvedName,
        triggerEventType: resolvedTrigger,
      });
      toast.success(t("emailSequences.savedSuccess"));
      setName(null);
      setTrigger(null);
    } catch {
      toast.error(t("emailSequences.saveError"));
    } finally {
      setSaving(false);
    }
  };

  // Move step up/down by swapping order values
  const handleMoveStep = async (
    step: SequenceStep,
    direction: "up" | "down"
  ) => {
    if (!sequence) return;
    const sorted = [...sequence.steps].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((s) => s._id === step._id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const sibling = sorted[swapIdx];
    try {
      await upsertStep({
        organizationId,
        sequenceId,
        stepId: step._id,
        order: sibling.order,
        delayMs: step.delayMs,
        templateId: step.templateId,
      });
      await upsertStep({
        organizationId,
        sequenceId,
        stepId: sibling._id,
        order: step.order,
        delayMs: sibling.delayMs,
        templateId: sibling.templateId,
      });
    } catch {
      toast.error(t("emailSequences.stepMoveError"));
    }
  };

  const handleAddStep = async () => {
    if (!sequence) return;
    const maxOrder = sequence.steps.reduce(
      (m, s) => Math.max(m, s.order),
      -1
    );
    const defaultTemplate = templates?.[0]?._id;
    if (!defaultTemplate) {
      toast.error(t("emailSequences.noTemplateError"));
      return;
    }
    try {
      await upsertStep({
        organizationId,
        sequenceId,
        order: maxOrder + 1,
        delayMs: MS_PER_HOUR * 24, // 24h default
        templateId: defaultTemplate,
      });
    } catch {
      toast.error(t("emailSequences.stepAddError"));
    }
  };

  const handleDeleteStep = async (stepId: Id<"emailSequenceSteps">) => {
    try {
      await deleteStep({ organizationId, stepId });
    } catch {
      toast.error(t("emailSequences.stepDeleteError"));
    }
  };

  const handleUpdateStep = async (
    step: SequenceStep,
    patch: { delayMs?: number; templateId?: Id<"emailTemplates"> }
  ) => {
    try {
      await upsertStep({
        organizationId,
        sequenceId,
        stepId: step._id,
        order: step.order,
        delayMs: patch.delayMs ?? step.delayMs,
        templateId: patch.templateId ?? step.templateId,
      });
    } catch {
      toast.error(t("emailSequences.stepSaveError"));
    }
  };

  const sortedSteps = [...(sequence?.steps ?? [])].sort(
    (a, b) => a.order - b.order
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("emailSequences.editSequence")}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !sequence ? (
          <p className="text-sm text-muted-foreground">
            {t("emailSequences.notFound")}
          </p>
        ) : (
          <div className="space-y-6 py-2">
            {/* Sequence header fields */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-seq-name">{t("emailSequences.name")}</Label>
                <Input
                  id="edit-seq-name"
                  value={resolvedName}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-seq-trigger">
                  {t("emailSequences.triggerEvent")}
                </Label>
                <Select value={resolvedTrigger} onValueChange={setTrigger}>
                  <SelectTrigger id="edit-seq-trigger">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(eventTypes ?? []).map((et) => (
                      <SelectItem key={et._id} value={et.eventType}>
                        {et.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(name !== null || trigger !== null) && (
              <Button
                size="sm"
                onClick={handleSaveHeader}
                disabled={saving || !resolvedName.trim() || !resolvedTrigger}
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("emailSequences.save")}
              </Button>
            )}

            {/* Steps */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3 pt-4">
                <CardTitle className="text-sm font-semibold">
                  {t("emailSequences.steps")}
                </CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddStep}
                  disabled={!templates || templates.length === 0}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  {t("emailSequences.addStep")}
                </Button>
              </CardHeader>
              <CardContent className="space-y-3 pb-4">
                {sortedSteps.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    {t("emailSequences.noSteps")}
                  </p>
                ) : (
                  sortedSteps.map((step, idx) => (
                    <StepRow
                      key={step._id}
                      step={step}
                      index={idx}
                      total={sortedSteps.length}
                      templates={templates ?? []}
                      onMoveUp={() => handleMoveStep(step, "up")}
                      onMoveDown={() => handleMoveStep(step, "down")}
                      onDelete={() => handleDeleteStep(step._id)}
                      onUpdate={(patch) => handleUpdateStep(step, patch)}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// StepRow — individual step editor
// ---------------------------------------------------------------------------

function StepRow({
  step,
  index,
  total,
  templates,
  onMoveUp,
  onMoveDown,
  onDelete,
  onUpdate,
}: {
  step: SequenceStep;
  index: number;
  total: number;
  templates: { _id: Id<"emailTemplates">; name: string }[];
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onUpdate: (patch: {
    delayMs?: number;
    templateId?: Id<"emailTemplates">;
  }) => void;
}) {
  const { t } = useTranslation();
  const [delayHours, setDelayHours] = useState(msToHours(step.delayMs));

  // Sync local state when step.delayMs changes (e.g. after save)
  const committedHours = msToHours(step.delayMs);
  if (delayHours !== committedHours && delayHours === msToHours(step.delayMs)) {
    setDelayHours(committedHours);
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-start">
      {/* Step number */}
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
        {index + 1}
      </span>

      {/* Delay */}
      <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-1.5">
          <Label
            htmlFor={`step-delay-${step._id}`}
            className="shrink-0 text-xs"
          >
            {t("emailSequences.delayHours")}
          </Label>
          <Input
            id={`step-delay-${step._id}`}
            type="number"
            min={0}
            className="h-8 w-20 text-xs"
            value={delayHours}
            onChange={(e) => setDelayHours(Number(e.target.value))}
            onBlur={() => {
              const ms = hoursToMs(delayHours);
              if (ms !== step.delayMs) {
                onUpdate({ delayMs: ms });
              }
            }}
          />
        </div>

        {/* Template */}
        <div className="flex flex-1 items-center gap-1.5">
          <Label
            htmlFor={`step-template-${step._id}`}
            className="shrink-0 text-xs"
          >
            {t("emailSequences.template")}
          </Label>
          <Select
            value={step.templateId}
            onValueChange={(v) =>
              onUpdate({ templateId: v as Id<"emailTemplates"> })
            }
          >
            <SelectTrigger
              id={`step-template-${step._id}`}
              className="h-8 flex-1 text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {templates.map((tpl) => (
                <SelectItem key={tpl._id} value={tpl._id}>
                  {tpl.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Order controls + delete */}
      <div className="flex items-center gap-1 self-start">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={index === 0}
          onClick={onMoveUp}
          aria-label={t("emailSequences.moveUp")}
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={index === total - 1}
          onClick={onMoveDown}
          aria-label={t("emailSequences.moveDown")}
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:bg-destructive/10"
          onClick={onDelete}
          aria-label={t("emailSequences.deleteStep")}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
