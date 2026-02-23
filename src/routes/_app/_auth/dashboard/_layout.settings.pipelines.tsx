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
import { Plus, Trash2, GripVertical } from "@/lib/ez-icons";
import { useState } from "react";
import { Id } from "@cvx/_generated/dataModel";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/pipelines"
)({
  component: PipelinesSettings,
});

function PipelinesSettings() {
  const { organizationId } = useOrganization();
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
        title="Pipelines"
        description="Configure your deal pipelines and stages."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create Pipeline</CardTitle>
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
              placeholder="Pipeline name"
            />
            <Button type="submit" disabled={!newPipelineName.trim()}>
              <Plus className="mr-2 h-4 w-4" />
              Create
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
            if (window.confirm(`Delete pipeline "${pipeline.name}"?`)) {
              await onRemovePipeline({
                organizationId,
                pipelineId: pipeline._id,
              });
            }
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {stages?.map((stage) => (
          <div
            key={stage._id}
            className="flex items-center justify-between rounded-md border px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
              {stage.color && (
                <div
                  className="h-3 w-3 rounded-full"
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
              <Trash2 className="h-3 w-3" />
            </Button>
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
              <Label className="text-xs">Stage Name</Label>
              <Input
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                placeholder="e.g. Qualification"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Color</Label>
              <input
                type="color"
                value={newStageColor}
                onChange={(e) => setNewStageColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded-md border"
              />
            </div>
            <Button type="submit" size="sm">
              Add
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setAddingStageFor(null)}
            >
              Cancel
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
            <Plus className="mr-2 h-4 w-4" />
            Add Stage
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
