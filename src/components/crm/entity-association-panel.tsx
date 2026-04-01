/**
 * EntityAssociationPanel — reusable sidebar component for linking/creating related entities.
 *
 * Shows: list of linked items, search-to-link popover, "+" to create new or link existing.
 * Used in entity detail sidebars for Deals, Contacts, Products, etc.
 */

import { useState, useCallback, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, Plus } from "@/lib/ez-icons";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AssociationItem {
  id: string;
  label: string;
  sublabel?: string;
  avatarFallback?: string;
  href?: string;
}

export interface SearchResultItem {
  id: string;
  label: string;
  sublabel?: string;
}

export interface EntityAssociationPanelProps {
  /** Section title, e.g. "Leady", "Kontakty" */
  title: string;
  /** Currently linked items */
  items: AssociationItem[];
  /** Placeholder for the search input */
  searchPlaceholder?: string;
  /** Empty state text */
  emptyText?: string;
  /** Called when user clicks a linked item — typically navigates */
  onItemClick?: (id: string) => void;
  /** Called when user selects a search result to link */
  onLink?: (item: SearchResultItem) => void | Promise<void>;
  /** Called when user clicks "Create new" */
  onCreateNew?: () => void;
  /** Search results to show in the dropdown. Parent controls the query. */
  searchResults?: SearchResultItem[];
  /** Called when the search input changes — parent fetches results */
  onSearchChange?: (query: string) => void;
  /** Icon to show next to each item. Defaults to first letter avatar. */
  icon?: ReactNode;
  /** Whether to allow unlinking (shows x button) */
  onUnlink?: (id: string) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EntityAssociationPanel({
  title,
  items,
  searchPlaceholder,
  emptyText,
  onItemClick,
  onLink,
  onCreateNew,
  searchResults,
  onSearchChange,
  onUnlink,
}: EntityAssociationPanelProps) {
  const { t } = useTranslation();
  const [showSearch, setShowSearch] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchValue(value);
      onSearchChange?.(value);
    },
    [onSearchChange],
  );

  const handleLink = useCallback(
    async (item: SearchResultItem) => {
      await onLink?.(item);
      setSearchValue("");
      setShowSearch(false);
    },
    [onLink],
  );

  const filteredResults = (searchResults ?? []).filter(
    (r) => !items.some((i) => i.id === r.id),
  );

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {title}{" "}
          <span className="text-muted-foreground font-normal">({items.length})</span>
        </h3>
        <div className="flex items-center gap-1">
          {onLink && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setShowSearch(!showSearch)}
              title={t("detail.relationships.link", "Podepnij")}
            >
              <Search className="h-[15px] w-[15px]" variant="stroke" />
            </Button>
          )}
          {onCreateNew && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onCreateNew}
              title={t("detail.relationships.createNew", "Utwórz nowy")}
            >
              <Plus className="h-[17px] w-[17px]" variant="stroke" />
            </Button>
          )}
        </div>
      </div>

      {/* Search-to-link */}
      {showSearch && (
        <div className="relative">
          <div className="flex items-center w-full rounded-md border bg-transparent">
            <Search className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" variant="stroke" />
            <Input
              type="text"
              className="h-8 border-0 shadow-none focus-visible:ring-0 bg-transparent px-2"
              placeholder={searchPlaceholder ?? t("detail.relationships.search", "Szukaj...")}
              value={searchValue}
              onChange={(e) => handleSearchChange(e.target.value)}
              autoFocus
            />
          </div>
          {searchValue.length > 0 && (
            <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
              {filteredResults.length > 0 ? (
                <ul className="max-h-[200px] overflow-y-auto p-1">
                  {filteredResults.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                        onClick={() => handleLink(r)}
                      >
                        <Avatar className="h-7 w-7 shrink-0">
                          <AvatarFallback className="text-[10px] bg-muted font-medium">
                            {r.label.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1 text-left">
                          <p className="truncate font-medium">{r.label}</p>
                          {r.sublabel && (
                            <p className="text-xs text-muted-foreground truncate">{r.sublabel}</p>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="py-3 px-3 text-sm text-muted-foreground">
                  {t("detail.relationships.noResults", "Brak wyników")}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Linked items list */}
      {items.length > 0 ? (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li
              key={item.id}
              className="group flex items-center gap-2.5 rounded-lg border border-transparent px-2 py-2 hover:border-border hover:bg-muted/40 transition-colors -mx-1 cursor-pointer"
              onClick={() => onItemClick?.(item.id)}
            >
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="text-xs bg-primary/10 text-primary font-medium">
                  {item.avatarFallback ?? item.label.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                  {item.label}
                </p>
                {item.sublabel && (
                  <p className="text-xs text-muted-foreground truncate">
                    {item.sublabel}
                  </p>
                )}
              </div>
              {onUnlink && (
                <button
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all h-6 w-6 flex items-center justify-center rounded-md hover:bg-destructive/10 shrink-0"
                  onClick={(e) => { e.stopPropagation(); onUnlink(item.id); }}
                  title={t("detail.relationships.unlink", "Odepnij")}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        !showSearch && (
          <p className="text-sm text-muted-foreground py-1">
            {emptyText ?? t("detail.relationships.empty", "Brak powiązanych.")}
          </p>
        )
      )}
    </div>
  );
}
