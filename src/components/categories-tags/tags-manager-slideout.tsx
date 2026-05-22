import { useState, useCallback } from "react";
import { useAction } from "convex/react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Tag01, Plus, Pencil01, Trash01 } from "@untitledui/icons";
import { Button } from "@untitled/base/buttons/button";
import { Input } from "@untitled/base/input/input";
import { SlideoutMenu } from "@untitled/app/slideout-menus/slideout-menu";
import { FeaturedIcon } from "@untitled/foundations/featured-icon/featured-icon";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import { TAG_COLOR_PALETTE } from "./color-palette";

interface TagDef {
  _id: Id<"tagDefinitions">;
  name: string;
  color: string;
  sortOrder: number;
}

interface TagsManagerSlideoutProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: Id<"organizations">;
  tags: TagDef[];
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function TagsManagerSlideout({
  isOpen,
  onOpenChange,
  organizationId,
  tags,
  canCreate = true,
  canEdit = true,
  canDelete = true,
}: TagsManagerSlideoutProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const createTag = useAction(api.tagDefinitions.create);
  const updateTag = useAction(api.tagDefinitions.update);
  const removeTag = useAction(api.tagDefinitions.remove);

  const [searchQuery, setSearchQuery] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(TAG_COLOR_PALETTE[0]);
  const [editingId, setEditingId] = useState<Id<"tagDefinitions"> | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");

  const invalidateTags = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: ["tagDefinitions.list", organizationId],
      }),
    [queryClient, organizationId],
  );

  const filteredTags = searchQuery.trim()
    ? tags.filter((tag) =>
        tag.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : tags;

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    try {
      await createTag({ organizationId, name: newName.trim(), color: newColor });
      await invalidateTags();
      toast.success(t("common.created", { defaultValue: "Dodano" }));
      setNewName("");
      setNewColor(TAG_COLOR_PALETTE[0]);
      setIsAdding(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }, [createTag, organizationId, newName, newColor, invalidateTags, t]);

  const handleUpdate = useCallback(async () => {
    if (!editingId || !editName.trim()) return;
    try {
      await updateTag({ organizationId, tagId: editingId, name: editName.trim(), color: editColor });
      await invalidateTags();
      toast.success(t("common.saved", { defaultValue: "Zapisano" }));
      setEditingId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }, [updateTag, organizationId, editingId, editName, editColor, invalidateTags, t]);

  const handleRemove = useCallback(async (tagId: Id<"tagDefinitions">) => {
    try {
      await removeTag({ organizationId, tagId });
      await invalidateTags();
      toast.success(t("common.deleted", { defaultValue: "Usunięto" }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }, [removeTag, organizationId, invalidateTags, t]);

  const startEdit = (tag: TagDef) => {
    setEditingId(tag._id);
    setEditName(tag.name);
    setEditColor(tag.color);
  };

  return (
    <SlideoutMenu isOpen={isOpen} onOpenChange={onOpenChange} isDismissable className="z-50">
      <SlideoutMenu.Header
        onClose={() => onOpenChange(false)}
        className="relative flex w-full items-start gap-3 px-4 pt-6 md:px-6"
      >
        <FeaturedIcon size="md" color="gray" theme="modern" icon={Tag01} />
        <section className="flex flex-col gap-0.5">
          <h1 className="text-md font-semibold text-fg-primary">
            {t("tags.manage", { defaultValue: "Tagi" })}
          </h1>
          <p className="text-sm text-fg-tertiary">
            {t("tags.manageDescription", { defaultValue: "Zarządzaj tagami organizacji" })}
          </p>
        </section>
      </SlideoutMenu.Header>

      <SlideoutMenu.Content>
        <div className="flex flex-col gap-3">
          <Input
            size="sm"
            placeholder={t("tags.search", { defaultValue: "Szukaj tagu..." })}
            value={searchQuery}
            onChange={setSearchQuery}
          />

          <div className="flex flex-col gap-1">
            {filteredTags.map((tag) => (
              <div key={tag._id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-bg-secondary">
                {editingId === tag._id ? (
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Input
                        size="sm"
                        value={editName}
                        onChange={setEditName}
                        onKeyDown={(e) => e.key === "Enter" && handleUpdate()}
                        autoFocus
                      />
                    </div>
                    <ColorPalette selected={editColor} onSelect={setEditColor} />
                    <div className="flex gap-1">
                      <Button size="sm" color="primary" onClick={handleUpdate}>
                        {t("common.save", { defaultValue: "Zapisz" })}
                      </Button>
                      <Button size="sm" color="secondary" onClick={() => setEditingId(null)}>
                        {t("common.cancel", { defaultValue: "Anuluj" })}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="flex-1 text-sm text-fg-primary">{tag.name}</span>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => startEdit(tag)}
                        className="rounded p-1 text-fg-quaternary hover:text-fg-secondary"
                      >
                        <Pencil01 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleRemove(tag._id)}
                        className="rounded p-1 text-fg-quaternary hover:text-fg-error-secondary"
                      >
                        <Trash01 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          {filteredTags.length === 0 && (
            <p className="px-2 text-sm text-fg-tertiary">
              {t("tags.noTags", { defaultValue: "Brak tagów" })}
            </p>
          )}

          {isAdding ? (
            <div className="flex flex-col gap-2 rounded-md border border-border-secondary p-3">
              <Input
                size="sm"
                placeholder={t("tags.newName", { defaultValue: "Nazwa tagu" })}
                value={newName}
                onChange={setNewName}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus
              />
              <ColorPalette selected={newColor} onSelect={setNewColor} />
              <div className="flex gap-1">
                <Button size="sm" color="primary" onClick={handleCreate}>
                  {t("common.add", { defaultValue: "Dodaj" })}
                </Button>
                <Button size="sm" color="secondary" onClick={() => setIsAdding(false)}>
                  {t("common.cancel", { defaultValue: "Anuluj" })}
                </Button>
              </div>
            </div>
          ) : canCreate ? (
            <Button size="sm" color="link-color" iconLeading={Plus} onClick={() => setIsAdding(true)}>
              {t("tags.addTag", { defaultValue: "Dodaj tag" })}
            </Button>
          ) : null}
        </div>
      </SlideoutMenu.Content>
    </SlideoutMenu>
  );
}

function ColorPalette({ selected, onSelect }: { selected: string; onSelect: (color: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TAG_COLOR_PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onSelect(color)}
          className={`h-5 w-5 rounded-full border-2 transition-all ${
            selected === color ? "border-fg-primary scale-110" : "border-transparent"
          }`}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}
