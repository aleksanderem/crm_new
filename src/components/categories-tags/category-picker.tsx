import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAction } from "convex/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LayersTwo02, XClose, ChevronRight, Plus } from "@untitledui/icons";
import { Button, styles as buttonStyles } from "@untitled/base/buttons/button";
import { Input } from "@untitled/base/input/input";
import { Badge } from "@untitled/base/badges/badges";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cx } from "@/lib/utils/cx";
import { formatActionError } from "@/lib/format-action-error";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import type { EntityType } from "@cvx/schema";
import { TAG_COLOR_PALETTE } from "./color-palette";

interface CategoryDef {
  _id: Id<"categoryDefinitions">;
  name: string;
  parentId?: Id<"categoryDefinitions">;
  color?: string;
}

interface CategoryPickerProps {
  categories: CategoryDef[];
  selectedId: Id<"categoryDefinitions"> | undefined;
  onChange: (categoryId: Id<"categoryDefinitions"> | undefined) => void;
  placeholder?: string;
  // When provided, the picker shows an inline "Add new category" affordance
  // that creates a category via categoryDefinitions.create and auto-selects it.
  organizationId?: Id<"organizations">;
  entityType?: EntityType;
}

interface CategoryNode extends CategoryDef {
  children: CategoryNode[];
}

function buildTree(categories: CategoryDef[]): CategoryNode[] {
  const roots: CategoryNode[] = [];
  const childMap = new Map<string, CategoryNode[]>();

  for (const cat of categories) {
    const node: CategoryNode = { ...cat, children: [] };
    if (!cat.parentId) {
      roots.push(node);
    } else {
      const siblings = childMap.get(cat.parentId) ?? [];
      siblings.push(node);
      childMap.set(cat.parentId, siblings);
    }
  }

  for (const root of roots) {
    root.children = childMap.get(root._id) ?? [];
  }

  return roots;
}

export function CategoryPicker({
  categories,
  selectedId,
  onChange,
  placeholder,
  organizationId,
  entityType,
}: CategoryPickerProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const createCategory = useAction(api.categoryDefinitions.create);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(TAG_COLOR_PALETTE[0]);
  const [isCreating, setIsCreating] = useState(false);

  const canCreate = !!organizationId && !!entityType;

  const tree = useMemo(() => buildTree(categories), [categories]);

  const selectedCategory = useMemo(
    () => categories.find((c) => c._id === selectedId),
    [categories, selectedId],
  );

  // For search, flatten and match
  const filteredFlat = useMemo(() => {
    if (!search.trim()) return null; // null = show tree
    const q = search.toLowerCase();
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, search]);

  const handleSelect = (categoryId: Id<"categoryDefinitions">) => {
    onChange(selectedId === categoryId ? undefined : categoryId);
    setOpen(false);
  };

  const resetAddForm = () => {
    setAddingNew(false);
    setNewName("");
    setNewColor(TAG_COLOR_PALETTE[0]);
  };

  const handleCreate = async () => {
    if (!canCreate || !newName.trim() || isCreating) return;
    setIsCreating(true);
    try {
      const newId = (await createCategory({
        organizationId: organizationId!,
        entityType: entityType!,
        name: newName.trim(),
        color: newColor,
      })) as Id<"categoryDefinitions">;
      await queryClient.invalidateQueries({
        queryKey: ["categoryDefinitions.list", organizationId, entityType],
      });
      onChange(newId);
      resetAddForm();
      setOpen(false);
    } catch (e) {
      // Without this, action failures (missing permission, missing
      // entity_type_enum value, network error) leave the user staring at
      // a "Dodaj" button that appears to do nothing — issue #1653.
      toast.error(
        formatActionError(e, t, {
          key: "categories.errors.createFailed",
          defaultValue: "Nie udało się dodać kategorii.",
        }),
      );
    } finally {
      setIsCreating(false);
    }
  };

  const renderNode = (node: CategoryNode) => (
    <div key={node._id}>
      <button
        type="button"
        onClick={() => handleSelect(node._id)}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-bg-secondary ${
          selectedId === node._id ? "bg-bg-secondary" : ""
        }`}
      >
        {node.color && (
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: node.color }} />
        )}
        <span className="flex-1 truncate text-sm text-fg-primary">{node.name}</span>
        {node.children.length > 0 && <ChevronRight className="h-3.5 w-3.5 text-fg-quaternary" />}
      </button>
      {node.children.length > 0 && (
        <div className="pl-3">
          {node.children.map(renderNode)}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-1.5">
      {selectedCategory && (
        <div className="flex items-center gap-1">
          <Badge size="sm" type="pill-color" color="gray">
            <span className="flex items-center gap-1">
              {selectedCategory.color && (
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: selectedCategory.color }}
                />
              )}
              {selectedCategory.name}
              <button
                type="button"
                onClick={() => onChange(undefined)}
                className="ml-0.5 text-fg-quaternary hover:text-fg-secondary"
              >
                <XClose className="h-3 w-3" />
              </button>
            </span>
          </Badge>
        </div>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cx(
              buttonStyles.common.root,
              buttonStyles.sizes.sm.root,
              buttonStyles.colors.secondary.root,
            )}
          >
            <LayersTwo02 data-icon="leading" className={buttonStyles.common.icon} />
            <span data-text className="transition-inherit-all px-0.5">
              {placeholder ?? t("categories.assign", { defaultValue: "Kategoria" })}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="flex w-60 flex-col p-0"
          align="start"
          style={{
            maxHeight: "var(--radix-popover-content-available-height)",
          }}
        >
          <div className="p-2">
            <Input
              size="sm"
              placeholder={t("categories.search", { defaultValue: "Szukaj..." })}
              value={search}
              onChange={setSearch}
              autoFocus
            />
          </div>
          <div className="max-h-48 min-h-0 overflow-y-auto px-1 pb-1">
            {filteredFlat
              ? filteredFlat.map((cat) => (
                  <button
                    key={cat._id}
                    type="button"
                    onClick={() => handleSelect(cat._id)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-bg-secondary ${
                      selectedId === cat._id ? "bg-bg-secondary" : ""
                    }`}
                  >
                    {cat.color && (
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: cat.color }} />
                    )}
                    <span className="flex-1 truncate text-sm text-fg-primary">{cat.name}</span>
                  </button>
                ))
              : tree.map(renderNode)}
            {(filteredFlat?.length === 0 || (!filteredFlat && tree.length === 0)) && (
              <p className="px-2 py-1.5 text-sm text-fg-tertiary">
                {t("categories.noResults", { defaultValue: "Brak wyników" })}
              </p>
            )}
          </div>
          {canCreate && (
            <div className="border-t border-border-secondary p-2">
              {addingNew ? (
                <div className="flex flex-col gap-2">
                  <Input
                    size="sm"
                    placeholder={t("categories.newName", { defaultValue: "Nazwa kategorii" })}
                    value={newName}
                    onChange={setNewName}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleCreate();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        resetAddForm();
                      }
                    }}
                    autoFocus
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {TAG_COLOR_PALETTE.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setNewColor(color)}
                        className={`h-5 w-5 rounded-full border-2 transition-all ${
                          newColor === color ? "border-fg-primary scale-110" : "border-transparent"
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      color="primary"
                      onClick={handleCreate}
                      isDisabled={!newName.trim() || isCreating}
                    >
                      {isCreating
                        ? t("common.saving", { defaultValue: "Zapisywanie..." })
                        : t("common.add", { defaultValue: "Dodaj" })}
                    </Button>
                    <Button size="sm" color="secondary" onClick={resetAddForm}>
                      {t("common.cancel", { defaultValue: "Anuluj" })}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  color="link-color"
                  iconLeading={Plus}
                  onClick={() => setAddingNew(true)}
                >
                  {t("categories.addCategory", { defaultValue: "Dodaj kategorię" })}
                </Button>
              )}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
