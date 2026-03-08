import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [newPipelineName, setNewPipelineName] = useState("");
  const [newStageName, setNewStageName] = useState("");
  const [newStageColor, setNewStageColor] = useState("#3b82f6");
  const [addingStageFor, setAddingStageFor] = useState<string | null>(null);

  const createPipeline = useMutation(api.pipelines.create);
  const removePipeline = useMutation(api.pipelines.remove);
  const addStage = useMutation(api.pipelines.addStage);
  const removeStage = useMutation(api.pipelines.removeStage);

  const { data: pipelines } = useQuery(
    convexQuery(api.pipelines.list, { organizationId })
  );

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <PageHeader
        title={t("settings.pipelines.title")}
        description={t("settings.pipelines.description")}
      />

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
  pipeline: { _id: Id<"pipelines">; name: string; stages?: { _id: Id<"pipelineStages">; name: string; color?: string; order: number }[] };
  organizationId: Id<"organizations">;
  addingStageFor: string | null;
  setAddingStageFor: (id: string | null) => void;
  newStageName: string;
  setNewStageName: (v: string) => void;
  newStageColor: string;
  setNewStageColor: (v: string) => void;
  onAddStage: (args: { organizationId: Id<"organizations">; pipelineId: Id<"pipelines">; name: string; color?: string; order: number }) => Promise<unknown>;
  onRemoveStage: (args: { organizationId: Id<"organizations">; stageId: Id<"pipelineStages"> }) => Promise<unknown>;
  onRemovePipeline: (args: { organizationId: Id<"organizations">; pipelineId: Id<"pipelines"> }) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const { data: stages } = useQuery(
    convexQuery(api.pipelines.getStages, {
      organizationId,
      pipelineId: pipeline._id,
    })
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{pipeline.name}</CardTitle>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={async () => {
            if (window.confirm(t("settings.pipelines.confirmDeletePipeline", { name: pipeline.name }))) {
              await onRemovePipeline({
                organizationId,
                pipelineId: pipeline._id,
              });
            }
          }}
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
                  onRemoveStage({ organizationId, stageId: stage._id })
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
    </Card>
  );
}

function StageActions({
  organizationId,
  stageId,
}: {
  organizationId: Id<"organizations">;
  stageId: Id<"pipelineStages">;
}) {
  const { t } = useTranslation();
  const [isAdding, setIsAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [dueInDays, setDueInDays] = useState(3);
  const [assignToOwner, setAssignToOwner] = useState(true);
  const [description, setDescription] = useState("");

  const createAction = useMutation(api.pipelineStageActions.create);
  const removeAction = useMutation(api.pipelineStageActions.remove);

  const { data: actions } = useQuery(
    convexQuery(api.pipelineStageActions.listByStage, {
      organizationId,
      stageId,
    })
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

      {actions?.map((action) => (
        <div
          key={action._id}
          className="flex items-center justify-between rounded border border-dashed px-2 py-1.5 text-xs"
        >
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">{action.config.title}</span>
            <span className="text-muted-foreground">
              {t("stageActions.dueInDaysLabel", { count: action.config.dueInDays })}
              {action.config.assignToOwner
                ? ` · ${t("stageActions.assignedToDealOwner")}`
                : ""}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() =>
              removeAction({ organizationId, actionId: action._id })
            }
          >
            <Trash2 className="h-3 w-3" variant="stroke" />
          </Button>
        </div>
      ))}

      {isAdding ? (
        <form
          className="space-y-2 rounded border border-dashed p-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim()) return;
            await createAction({
              organizationId,
              stageId,
              config: {
                title: title.trim(),
                description: description.trim() || undefined,
                dueInDays,
                assignToOwner,
              },
            });
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
