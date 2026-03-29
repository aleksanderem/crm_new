import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { LayersTwo02, XClose, ChevronRight } from "@untitledui/icons";
import { Button } from "@untitled/base/buttons/button";
import { Input } from "@untitled/base/input/input";
import { Badge } from "@untitled/base/badges/badges";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Id } from "@cvx/_generated/dataModel";

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

export function CategoryPicker({ categories, selectedId, onChange, placeholder }: CategoryPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

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
          <Button size="sm" color="secondary" iconLeading={LayersTwo02}>
            {placeholder ?? t("categories.assign", { defaultValue: "Kategoria" })}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-60 p-0" align="start">
          <div className="p-2">
            <Input
              size="sm"
              placeholder={t("categories.search", { defaultValue: "Szukaj..." })}
              value={search}
              onChange={setSearch}
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-y-auto px-1 pb-1">
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
        </PopoverContent>
      </Popover>
    </div>
  );
}
