import { useState, useCallback, useMemo } from "react";
import { useAction } from "convex/react";
import { useTranslation } from "react-i18next";
import { LayersTwo02, Plus, Pencil01, Trash01 } from "@untitledui/icons";
import { Button } from "@untitled/base/buttons/button";
import { Input } from "@untitled/base/input/input";
import { SlideoutMenu } from "@untitled/app/slideout-menus/slideout-menu";
import { FeaturedIcon } from "@untitled/foundations/featured-icon/featured-icon";
import { TreeView } from "@untitled/app/tree-view/tree-view";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import type { EntityType } from "@cvx/schema";
import { TAG_COLOR_PALETTE } from "./color-palette";

interface CategoryDef {
  _id: Id<"categoryDefinitions">;
  name: string;
  parentId?: Id<"categoryDefinitions">;
  color?: string;
  sortOrder: number;
}

interface CategoriesManagerSlideoutProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: Id<"organizations">;
  entityType: EntityType;
  categories: CategoryDef[];
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}

interface TreeNode {
  id: string;
  name: string;
  color?: string;
  children: TreeNode[];
}

function buildTreeItems(categories: CategoryDef[]): TreeNode[] {
  const roots: TreeNode[] = [];
  const childMap = new Map<string, TreeNode[]>();

  for (const cat of categories) {
    const node: TreeNode = { id: cat._id, name: cat.name, color: cat.color, children: [] };
    if (!cat.parentId) {
      roots.push(node);
    } else {
      const siblings = childMap.get(cat.parentId) ?? [];
      siblings.push(node);
      childMap.set(cat.parentId, siblings);
    }
  }

  for (const root of roots) {
    root.children = childMap.get(root.id) ?? [];
  }

  return roots;
}

export function CategoriesManagerSlideout({
  isOpen,
  onOpenChange,
  organizationId,
  entityType,
  categories,
  canCreate = true,
  canEdit = true,
  canDelete = true,
}: CategoriesManagerSlideoutProps) {
  const { t } = useTranslation();
  const createCategory = useAction(api.categoryDefinitions.create);
  const updateCategory = useAction(api.categoryDefinitions.update);
  const removeCategory = useAction(api.categoryDefinitions.remove);

  const [addingParentId, setAddingParentId] = useState<Id<"categoryDefinitions"> | "root" | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(TAG_COLOR_PALETTE[0]);
  const [editingId, setEditingId] = useState<Id<"categoryDefinitions"> | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");

  const treeItems = useMemo(() => buildTreeItems(categories), [categories]);

  const handleCreate = useCallback(async () => {
    if (!newName.trim() || !addingParentId) return;
    await createCategory({
      organizationId,
      entityType,
      name: newName.trim(),
      parentId: addingParentId === "root" ? undefined : addingParentId,
      color: newColor,
    });
    setNewName("");
    setNewColor(TAG_COLOR_PALETTE[0]);
    setAddingParentId(null);
  }, [createCategory, organizationId, entityType, newName, newColor, addingParentId]);

  const handleUpdate = useCallback(async () => {
    if (!editingId || !editName.trim()) return;
    await updateCategory({
      organizationId,
      categoryId: editingId,
      name: editName.trim(),
      color: editColor || undefined,
    });
    setEditingId(null);
  }, [updateCategory, organizationId, editingId, editName, editColor]);

  const handleRemove = useCallback(async (categoryId: Id<"categoryDefinitions">) => {
    await removeCategory({ organizationId, categoryId });
  }, [removeCategory, organizationId]);

  const startEdit = (cat: CategoryDef) => {
    setEditingId(cat._id);
    setEditName(cat.name);
    setEditColor(cat.color ?? "");
  };

  const renderAddForm = () => (
    <div className="flex flex-col gap-2 rounded-md border border-border-secondary p-2">
      <Input
        size="sm"
        placeholder={t("categories.newName", { defaultValue: "Nazwa kategorii" })}
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
        <Button size="sm" color="secondary" onClick={() => setAddingParentId(null)}>
          {t("common.cancel", { defaultValue: "Anuluj" })}
        </Button>
      </div>
    </div>
  );

  const renderEditForm = () => (
    <div className="flex flex-col gap-2 rounded-md border border-border-secondary p-2">
      <Input
        size="sm"
        value={editName}
        onChange={setEditName}
        onKeyDown={(e) => e.key === "Enter" && handleUpdate()}
        autoFocus
      />
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
  );

  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c._id, c])),
    [categories],
  );

  const renderTreeNode = (node: TreeNode) => {
    const catDef = categoryById.get(node.id as Id<"categoryDefinitions">);
    const isParent = node.children.length > 0;

    if (editingId === node.id) {
      return (
        <TreeView.Item key={node.id} id={node.id} textValue={node.name}>
          <TreeView.ItemContent>{renderEditForm()}</TreeView.ItemContent>
        </TreeView.Item>
      );
    }

    return (
      <TreeView.Item
        key={node.id}
        id={node.id}
        textValue={node.name}
        {...(isParent ? { childItems: node.children } : {})}
      >
        <TreeView.ItemContent
          icon={
            node.color ? (
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: node.color }}
              />
            ) : undefined
          }
          action={
            <div className="flex items-center gap-0.5">
              {canCreate && !catDef?.parentId && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAddingParentId(node.id as Id<"categoryDefinitions">);
                  }}
                  className="rounded p-1 text-fg-quaternary hover:text-fg-secondary"
                  title={t("categories.addSub", { defaultValue: "Dodaj podkategorię" })}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (catDef) startEdit(catDef);
                  }}
                  className="rounded p-1 text-fg-quaternary hover:text-fg-secondary"
                >
                  <Pencil01 className="h-3.5 w-3.5" />
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(node.id as Id<"categoryDefinitions">);
                  }}
                  className="rounded p-1 text-fg-quaternary hover:text-fg-error-secondary"
                >
                  <Trash01 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          }
        >
          {node.name}
        </TreeView.ItemContent>
        {isParent && node.children.map(renderTreeNode)}
      </TreeView.Item>
    );
  };

  return (
    <SlideoutMenu isOpen={isOpen} onOpenChange={onOpenChange} isDismissable className="z-50">
      <SlideoutMenu.Header
        onClose={() => onOpenChange(false)}
        className="relative flex w-full items-start gap-3 px-4 pt-6 md:px-6"
      >
        <FeaturedIcon size="md" color="gray" theme="modern" icon={LayersTwo02} />
        <section className="flex flex-col gap-0.5">
          <h1 className="text-md font-semibold text-fg-primary">
            {t("categories.manage", { defaultValue: "Kategorie" })}
          </h1>
          <p className="text-sm text-fg-tertiary">
            {t("categories.manageDescription", { defaultValue: "Zarządzaj kategoriami" })}
          </p>
        </section>
      </SlideoutMenu.Header>

      <SlideoutMenu.Content>
        <div className="flex flex-col gap-2">
          {treeItems.length > 0 ? (
            <TreeView
              aria-label={t("categories.tree", { defaultValue: "Drzewo kategorii" })}
              selectionMode="none"
              size="sm"
              showConnectors
              defaultExpandedKeys={new Set(treeItems.map((n) => n.id))}
            >
              {treeItems.map(renderTreeNode)}
            </TreeView>
          ) : (
            <p className="px-2 text-sm text-fg-tertiary">
              {t("categories.noCategories", { defaultValue: "Brak kategorii" })}
            </p>
          )}

          {addingParentId && addingParentId !== "root" && renderAddForm()}

          {addingParentId === "root" ? (
            renderAddForm()
          ) : canCreate ? (
            <Button size="sm" color="link-color" iconLeading={Plus} onClick={() => setAddingParentId("root")}>
              {t("categories.addCategory", { defaultValue: "Dodaj kategorię" })}
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
