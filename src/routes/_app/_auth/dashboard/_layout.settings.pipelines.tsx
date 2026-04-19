import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { useSupabasePipelinesList, useSupabasePipelineStages, useSupabasePipelineStageActions } from "@/hooks/use-supabase-pipelines";
import { supabaseKeys } from "@/lib/supabase/query-keys";
import { SectionHeader } from "@untitled/app/section-headers/section-headers";
import { UntitledAlert } from "@/components/ui/untitled-alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Trash2, GripVertical } from "@/lib/ez-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Id } from "@cvx/_generated/dataModel";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/pipelines"
)({
  component: PipelinesSettings,
});

function PipelinesSettings() {
  const { organizationId } = useOrganization();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [newPipelineName, setNewPipelineName] = useState("");
  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState("#3b82f6");
  const [addingStageFor, setAddingStageFor] = useState<string | null>(null);

  // @ts-ignore — TS2589 excessive depth in useAction type instantiation (pre-existing)
  const createPipeline = useAction(api.pipelines.create);
  const removePipeline = useAction(api.pipelines.remove);
  const addStage = useAction(api.pipelines.addStage);
  const removeStage = useAction(api.pipelines.removeStage);

  const { data: pipelines } = useSupabasePipelinesList(organizationId);

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <SectionHeader.Root className="pt-4">
        <SectionHeader.Group>
          <SectionHeader.Heading className="flex-1">
            {t("settings.pipelines.title")}
          </SectionHeader.Heading>
        </SectionHeader.Group>
        <UntitledAlert>{t("settings.pipelines.description")}</UntitledAlert>
      </SectionHeader.Root>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("settings.pipelines.createPipeline")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newPipelineName.trim()) return;
              await createPipeline({
                organizationId,
                name: newPipelineName,
              });
              queryClient.invalidateQueries({ queryKey: supabaseKeys.pipelines.all });
              setNewPipelineName("");
            }}
          >
            <Input
              value={newPipelineName}
              onChange={(e) => setNewPipelineName(e.target.value)}
              placeholder={t("settings.pipelines.pipelineNamePlaceholder")}
            />
            <Button type="submit" disabled={!newPipelineName.trim()}>
              <Plus className="mr-2 h-4 w-4" variant="stroke" />
              {t("common.create")}
            </Button>
          </form>
        </CardContent>
      </Card>

      {pipelines?.map((pipeline) => (
        <PipelineCard
          key={pipeline._id}
          pipeline={pipeline}
          organizationId={organizationId}
          addingStageFor={addingStageFor}
          setAddingStageFor={setAddingStageFor}
          newStageName={newStageName}
          setNewStageName={setNewStageName}
          newStageColor={newStageColor}
          setNewStageColor={setNewStageColor}
          onAddStage={addStage}
          onRemoveStage={removeStage}
          onRemovePipeline={removePipeline}
        />
      ))}
    </div>
  );
}

function PipelineCard({
  pipeline,
  organizationId,
  addingStageFor,
  setAddingStageFor,
  newStageName,
  setNewStageName,
  newStageColor,
  setNewStageColor,
  onAddStage,
  onRemoveStage,
  onRemovePipeline,
}: {
  pipeline: { _id: string; name: string };
  organizationId: Id<"organizations">;
  addingStageFor: string | null;
  setAddingStageFor: (id: string | null) => void;
  newStageName: string;
  setNewStageName: (v: string) => void;
  newStageColor: string;
  setNewStageColor: (v: string) => void;
  onAddStage: (args: { organizationId: Id<"organizations">; pipelineId: string; name: string; color?: string; order: number }) => Promise<unknown>;
  onRemoveStage: (args: { organizationId: Id<"organizations">; stageId: string }) => Promise<unknown>;
  onRemovePipeline: (args: { organizationId: Id<"organizations">; pipelineId: string }) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const { data: stages } = useSupabasePipelineStages(
    organizationId,
    pipeline._id,
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{pipeline.name}</CardTitle>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setDeleteDialogOpen(true)}
        >
          <Trash2 className="h-4 w-4" variant="stroke" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {stages?.map((stage) => (
          <div key={stage._id} className="space-y-2">
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-muted-foreground" variant="stroke" />
                {stage.color && (
                  <div
                    className="h-4 w-4 rounded-full"
                    style={{ backgroundColor: stage.color }}
                  />
                )}
                <span className="text-sm">{stage.name}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() =>
                  onRemoveStage({ organizationId, stageId: stage._id }).then(() => {
                    queryClient.invalidateQueries({ queryKey: supabaseKeys.pipelineStages.all });
                  })
                }
              >
                <Trash2 className="h-4 w-4" variant="stroke" />
              </Button>
            </div>
            <StageActions organizationId={organizationId} stageId={stage._id} />
          </div>
        ))}

        <Separator />

        {addingStageFor === pipeline._id ? (
          <form
            className="flex items-end gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newStageName.trim()) return;
              await onAddStage({
                organizationId,
                pipelineId: pipeline._id,
                name: newStageName,
                color: newStageColor,
                order: (stages?.length ?? 0) + 1,
              });
              queryClient.invalidateQueries({ queryKey: supabaseKeys.pipelineStages.all });
              setNewStageName("");
              setAddingStageFor(null);
            }}
          >
            <div className="flex-1 space-y-1">
              <Label className="text-xs">{t("settings.pipelines.stageName")}</Label>
              <Input
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                placeholder={t("settings.pipelines.stageNamePlaceholder")}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("settings.pipelines.color")}</Label>
              <input
                type="color"
                value={newStageColor}
                onChange={(e) => setNewStageColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded-md border"
              />
            </div>
            <Button type="submit" size="sm">
              {t("common.add")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setAddingStageFor(null)}
            >
              {t("common.cancel")}
            </Button>
          </form>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAddingStageFor(pipeline._id);
              setNewStageName("");
            }}
          >
            <Plus className="mr-2 h-4 w-4" variant="stroke" />
            {t("settings.pipelines.addStage")}
          </Button>
        )}
      </CardContent>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("common.confirmDeleteDescription", { name: pipeline.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await onRemovePipeline({
                  organizationId,
                  pipelineId: pipeline._id,
                });
                queryClient.invalidateQueries({ queryKey: supabaseKeys.pipelines.all });
                setDeleteDialogOpen(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function StageActions({
  organizationId,
  stageId,
}: {
  organizationId: Id<"organizations">;
  stageId: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [dueInDays, setDueInDays] = useState(3);
  const [assignToOwner, setAssignToOwner] = useState(true);
  const [description, setDescription] = useState("");

  const createAction = useAction(api.pipelineStageActions.create);
  const removeAction = useAction(api.pipelineStageActions.remove);

  const { data: actions } = useSupabasePipelineStageActions(
    organizationId,
    stageId,
  );

  if (!actions?.length && !isAdding) {
    return (
      <div className="ml-6">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground"
          onClick={() => setIsAdding(true)}
        >
          <Plus className="mr-1 h-3 w-3" variant="stroke" />
          {t("stageActions.addAutoAction")}
        </Button>
      </div>
    );
  }

  return (
    <div className="ml-6 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        {t("stageActions.autoActions")}
      </p>

      {actions?.map((action) => {
        const cfg = action.config as { title: string; dueInDays: number; assignToOwner?: boolean; description?: string };
        return (
        <div
          key={action._id}
          className="flex items-center justify-between rounded border border-dashed px-2 py-1.5 text-xs"
        >
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">{cfg.title}</span>
            <span className="text-muted-foreground">
              {t("stageActions.dueInDaysLabel", { count: cfg.dueInDays })}
              {cfg.assignToOwner
                ? ` · ${t("stageActions.assignedToDealOwner")}`
                : ""}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() =>
              removeAction({ organizationId, actionId: action._id as Id<"pipelineStageActions"> }).then(() => {
                queryClient.invalidateQueries({ queryKey: supabaseKeys.pipelineStageActions.all });
              })
            }
          >
            <Trash2 className="h-3 w-3" variant="stroke" />
          </Button>
        </div>
        );
      })}

      {isAdding ? (
        <form
          className="space-y-2 rounded border border-dashed p-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim()) return;
            await createAction({
              organizationId,
              stageId: stageId as Id<"pipelineStages">,
              config: {
                title: title.trim(),
                description: description.trim() || undefined,
                dueInDays,
                assignToOwner,
              },
            });
            queryClient.invalidateQueries({ queryKey: supabaseKeys.pipelineStageActions.all });
            setTitle("");
            setDescription("");
            setDueInDays(3);
            setAssignToOwner(true);
            setIsAdding(false);
          }}
        >
          <div className="space-y-1">
            <Label className="text-xs">{t("stageActions.taskTitle")}</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("stageActions.taskTitlePlaceholder")}
              className="h-8 text-xs"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("stageActions.taskDescription")}</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("stageActions.taskDescriptionPlaceholder")}
              className="h-8 text-xs"
            />
          </div>
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t("stageActions.dueInDays")}</Label>
              <Input
                type="number"
                min={0}
                value={dueInDays}
                onChange={(e) => setDueInDays(Number(e.target.value))}
                className="h-8 w-20 text-xs"
              />
            </div>
            <div className="flex items-center gap-2 pb-1">
              <Checkbox
                id={`assign-owner-${stageId}`}
                checked={assignToOwner}
                onCheckedChange={(v) => setAssignToOwner(v === true)}
              />
              <Label htmlFor={`assign-owner-${stageId}`} className="text-xs">
                {t("stageActions.assignToOwner")}
              </Label>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" className="h-7 text-xs" disabled={!title.trim()}>
              {t("common.add")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setIsAdding(false)}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground"
          onClick={() => setIsAdding(true)}
        >
          <Plus className="mr-1 h-3 w-3" variant="stroke" />
          {t("stageActions.addAutoAction")}
        </Button>
      )}
    </div>
  );
}
