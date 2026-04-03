/**
 * EntityLinkModal — universal modal for searching and linking any entity type.
 *
 * Opens as a dialog with:
 * - Search input (auto-focus)
 * - "Ostatnio oglądane" section when search is empty
 * - Search results grouped by entity type
 * - Option to create new entity inline
 *
 * Used from EntityAssociationPanel, relationship fields, quick actions, etc.
 */

import { useState, useCallback, useEffect, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Plus } from "@/lib/ez-icons";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EntityLinkResult {
  id: string;
  label: string;
  sublabel?: string;
  entityType: string;
  avatarFallback?: string;
}

export interface EntityLinkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Title shown in the modal header */
  title?: string;
  /** Entity types to search in. If single, no type tabs. */
  entityTypes: EntityTypeConfig[];
  /** Called when user selects an entity to link */
  onSelect: (result: EntityLinkResult) => void | Promise<void>;
  /** Called when search text changes — parent provides results */
  onSearchChange?: (query: string, entityType: string) => void;
  /** Search results from parent */
  searchResults?: EntityLinkResult[];
  /** Recently viewed items (shown when search is empty) */
  recentItems?: EntityLinkResult[];
  /** Whether to show "Create new" option */
  onCreateNew?: (entityType: string) => void;
  /** Loading state */
  isSearching?: boolean;
}

export interface EntityTypeConfig {
  type: string;
  label: string;
  icon?: ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EntityLinkModal({
  open,
  onOpenChange,
  title,
  entityTypes,
  onSelect,
  onSearchChange,
  searchResults = [],
  recentItems = [],
  onCreateNew,
  isSearching = false,
}: EntityLinkModalProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [activeType, setActiveType] = useState(entityTypes[0]?.type ?? "");

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setSearch("");
      setActiveType(entityTypes[0]?.type ?? "");
    }
  }, [open, entityTypes]);

  // Notify parent of search changes
  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed.length < 3) return;

    const timeout = window.setTimeout(() => {
      onSearchChange?.(trimmed, activeType);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [search, activeType, onSearchChange]);

  const handleSelect = useCallback(
    async (result: EntityLinkResult) => {
      await onSelect(result);
      onOpenChange(false);
    },
    [onSelect, onOpenChange],
  );

  const trimmedSearch = search.trim();
  const showRecent = trimmedSearch.length === 0;
  const showMinSearchHint = trimmedSearch.length > 0 && trimmedSearch.length < 3;
  const displayItems = showRecent ? recentItems : searchResults;

  // Group by entity type if multiple types
  const grouped = useMemo(() => {
    if (entityTypes.length <= 1) return null;
    const groups: Record<string, EntityLinkResult[]> = {};
    for (const item of displayItems) {
      if (!groups[item.entityType]) groups[item.entityType] = [];
      groups[item.entityType].push(item);
    }
    return groups;
  }, [displayItems, entityTypes]);

  const activeTypeConfig = entityTypes.find((t) => t.type === activeType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] p-0 gap-0">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="text-base">
            {title ?? t("entityLink.title", "Podepnij")}
          </DialogTitle>
        </DialogHeader>

        {/* Search input */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" variant="stroke" />
            <Input
              type="text"
              className="h-9 border-0 bg-transparent shadow-none focus-visible:ring-0 px-0"
              placeholder={t("entityLink.searchPlaceholder", "Szukaj po nazwie...")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        {/* Type tabs (if multiple entity types) */}
        {entityTypes.length > 1 && (
          <div className="flex gap-1 px-4 pb-2">
            {entityTypes.map((et) => (
              <Button
                key={et.type}
                variant={activeType === et.type ? "default" : "ghost"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setActiveType(et.type)}
              >
                {et.icon && <span className="mr-1">{et.icon}</span>}
                {et.label}
              </Button>
            ))}
          </div>
        )}

        {/* Section label */}
        <div className="px-4 pb-1">
          <p className="text-xs font-medium text-muted-foreground">
            {showRecent
              ? t("entityLink.recentlyViewed", "Ostatnio oglądane")
              : t("entityLink.searchResults", "Wyniki wyszukiwania")}
          </p>
        </div>

        {/* Results */}
        <ScrollArea className="max-h-[320px]">
          <div className="px-2 pb-2">
            {showMinSearchHint ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {t("entityLink.minSearchLength", "Wpisz co najmniej 3 znaki")}
              </div>
            ) : isSearching ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : displayItems.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {showRecent
                  ? t("entityLink.noRecent", "Brak ostatnio oglądanych")
                  : t("entityLink.noResults", "Brak wyników")}
              </div>
            ) : grouped ? (
              // Multi-type grouped display
              Object.entries(grouped).map(([type, items]) => {
                const typeConfig = entityTypes.find((t) => t.type === type);
                return (
                  <div key={type} className="mb-2">
                    <p className="px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {typeConfig?.label ?? type}
                    </p>
                    {items.map((item) => (
                      <ResultRow key={item.id} item={item} onSelect={handleSelect} />
                    ))}
                  </div>
                );
              })
            ) : (
              // Single-type flat list
              displayItems.map((item) => (
                <ResultRow key={item.id} item={item} onSelect={handleSelect} />
              ))
            )}
          </div>
        </ScrollArea>

        {/* Create new footer */}
        {onCreateNew && (
          <div className="border-t px-4 py-3">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-primary"
              onClick={() => {
                onCreateNew(activeType);
                onOpenChange(false);
              }}
            >
              <Plus className="mr-2 h-4 w-4" variant="stroke" />
              {t("entityLink.createNew", "Utwórz nowy")} {activeTypeConfig?.label ?? ""}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ResultRow({
  item,
  onSelect,
}: {
  item: EntityLinkResult;
  onSelect: (item: EntityLinkResult) => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted/60 transition-colors"
      onClick={() => onSelect(item)}
    >
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className="text-xs bg-primary/10 text-primary font-medium">
          {item.avatarFallback ?? item.label.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{item.label}</p>
        {item.sublabel && (
          <p className="text-xs text-muted-foreground truncate">{item.sublabel}</p>
        )}
      </div>
      <Badge variant="outline" className="text-[10px] shrink-0">
        {item.entityType}
      </Badge>
    </button>
  );
}
