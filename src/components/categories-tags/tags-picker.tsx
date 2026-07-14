import { useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Tag01, XClose } from "@untitledui/icons";
import { styles as buttonStyles } from "@untitled/base/buttons/button";
import { Input } from "@untitled/base/input/input";
import { CheckboxBase } from "@untitled/base/checkbox/checkbox";
import { Badge } from "@untitled/base/badges/badges";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cx } from "@/lib/utils/cx";
import { Id } from "@cvx/_generated/dataModel";

const isTouchDevice = typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0);

interface TagDef {
  _id: Id<"tagDefinitions">;
  name: string;
  color: string;
}

interface TagsPickerProps {
  tags: TagDef[];
  selectedIds: Id<"tagDefinitions">[];
  onChange: (tagIds: Id<"tagDefinitions">[]) => void;
  placeholder?: string;
  selectedTagsBelow?: boolean;
  direction?: "vertical" | "horizontal";
  size?: "sm" | "md";
}

export function TagsPicker({
  tags,
  selectedIds,
  onChange,
  placeholder,
  selectedTagsBelow = false,
  direction = "vertical",
  size = "sm",
}: TagsPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const filtered = useMemo(() => {
    if (!search.trim()) return tags;
    const q = search.toLowerCase();
    return tags.filter((tag) => tag.name.toLowerCase().includes(q));
  }, [tags, search]);

  const toggle = useCallback(
    (tagId: Id<"tagDefinitions">) => {
      if (selectedSet.has(tagId)) {
        onChange(selectedIds.filter((id) => id !== tagId));
      } else {
        onChange([...selectedIds, tagId]);
      }
    },
    [selectedIds, selectedSet, onChange],
  );

  const removeTag = useCallback(
    (tagId: Id<"tagDefinitions">) => {
      onChange(selectedIds.filter((id) => id !== tagId));
    },
    [selectedIds, onChange],
  );

  const selectedTags = useMemo(
    () => tags.filter((tag) => selectedSet.has(tag._id)),
    [tags, selectedSet],
  );

  const selectedBadges = selectedTags.length > 0 && (
    <div className="flex flex-wrap gap-1">
      {selectedTags.map((tag) => (
        <Badge
          key={tag._id}
          size={size}
          type="pill-color"
          color="gray"
        >
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: tag.color }}
            />
            {tag.name}
            <button
              type="button"
              onClick={() => removeTag(tag._id)}
              className="ml-0.5 text-fg-quaternary hover:text-fg-secondary"
            >
              <XClose className="h-3 w-3" />
            </button>
          </span>
        </Badge>
      ))}
    </div>
  );

  return (
    <div
      className={cx(
        "gap-1.5",
        direction === "horizontal"
          ? "flex flex-wrap items-center"
          : "flex flex-col",
      )}
    >
      {!selectedTagsBelow && selectedBadges}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cx(
              buttonStyles.common.root,
              buttonStyles.sizes[size].root,
              buttonStyles.colors.secondary.root,
            )}
          >
            <Tag01 data-icon="leading" className={buttonStyles.common.icon} />
            <span data-text className="transition-inherit-all px-0.5">
              {placeholder ?? t("tags.assign", { defaultValue: "Tagi" })}
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
              placeholder={t("tags.search", { defaultValue: "Szukaj..." })}
              value={search}
              onChange={setSearch}
              autoFocus={!isTouchDevice}
            />
          </div>
          <div className="max-h-48 min-h-0 overflow-y-auto px-1 pb-1">
            {filtered.map((tag) => (
              <button
                key={tag._id}
                type="button"
                onClick={() => toggle(tag._id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-bg-secondary"
              >
                <CheckboxBase size="sm" isSelected={selectedSet.has(tag._id)} />
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="flex-1 truncate text-sm text-fg-primary">{tag.name}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-2 py-1.5 text-sm text-fg-tertiary">
                {t("tags.noResults", { defaultValue: "Brak wyników" })}
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {selectedTagsBelow && selectedBadges}
    </div>
  );
}
