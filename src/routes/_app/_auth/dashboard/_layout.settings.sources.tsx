import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Id } from "@cvx/_generated/dataModel";

export const Route = createFileRoute(
  "/_app/_auth/dashboard/_layout/settings/sources"
)({
  component: SourcesSettings,
});

function SourcesSettings() {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [newName, setNewName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createSource = useMutation(api.sources.create);
  const updateSource = useMutation(api.sources.update);
  const removeSource = useMutation(api.sources.remove);

  const { data: sources } = useQuery(
    convexQuery(api.sources.list, { organizationId })
  );

  const sortedSources = sources
    ? [...sources].sort((a, b) => a.order - b.order)
    : [];

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setIsSubmitting(true);
    try {
      await createSource({ organizationId, name: newName.trim() });
      setNewName("");
      setShowCreateForm(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (sourceId: string) => {
    if (!editName.trim()) return;
    setIsSubmitting(true);
    try {
      await updateSource({
        organizationId,
        sourceId: sourceId as Id<"sources">,
        name: editName.trim(),
      });
      setEditingId(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (sourceId: string, isActive: boolean) => {
    await updateSource({
      organizationId,
      sourceId: sourceId as Id<"sources">,
      isActive,
    });
  };

  const handleDelete = async (sourceId: string) => {
    if (window.confirm(t('sources.confirmDelete'))) {
      await removeSource({
        organizationId,
        sourceId: sourceId as Id<"sources">,
      });
    }
  };

  const inputClasses =
    "h-9 w-full rounded-md border bg-transparent px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <PageHeader
        title={t('sources.title')}
        description={t('sources.description')}
        actions={
          <Button onClick={() => setShowCreateForm(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t('sources.addSource')}
          </Button>
        }
      />

      {/* Create form */}
      {showCreateForm && (
        <Card>
          <CardContent className="py-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCreate();
              }}
              className="flex items-center gap-2"
            >
              <input
                className={inputClasses}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('common.name')}
                autoFocus
                required
              />
              <Button type="submit" size="sm" disabled={!newName.trim() || isSubmitting}>
                {isSubmitting ? t('common.saving') : t('common.create')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowCreateForm(false);
                  setNewName("");
                }}
              >
                {t('common.cancel')}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Sources list */}
      <div className="space-y-2">
        {sortedSources.length === 0 && !showCreateForm && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t('sources.emptySources')}
          </p>
        )}
        {sortedSources.map((source) => {
          if (editingId === source._id) {
            return (
              <Card key={source._id}>
                <CardContent className="py-3">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleUpdate(source._id);
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      className={inputClasses}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      autoFocus
                      required
                    />
                    <Button type="submit" size="sm" disabled={!editName.trim() || isSubmitting}>
                      {isSubmitting ? t('common.saving') : t('common.save')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingId(null)}
                    >
                      {t('common.cancel')}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            );
          }

          return (
            <Card key={source._id}>
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <p className="text-sm font-medium">{source.name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={source.isActive}
                    onCheckedChange={(checked) =>
                      handleToggleActive(source._id, checked)
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      setEditingId(source._id);
                      setEditName(source.name);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleDelete(source._id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
