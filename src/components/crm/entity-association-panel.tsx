/**
 * EntityAssociationPanel — reusable sidebar component for linking/creating related entities.
 *
 * Shows: list of linked items, EntityLinkModal for search-to-link, "+" to create new or link existing.
 * Used in entity detail sidebars for Deals, Contacts, Products, etc.
 */

import { useState, useCallback, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, Plus } from "@/lib/ez-icons";
import {
  EntityLinkModal,
  type EntityLinkResult,
  type EntityTypeConfig,
} from "@/components/crm/entity-link-modal";
import { formatActionError } from "@/lib/format-action-error";

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
  hideHeader?: boolean;
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
  /** Search results to show in the modal. Parent controls the query. */
  searchResults?: SearchResultItem[];
  /** Whether the parent is currently searching */
  isSearching?: boolean;
  /** Called when the search input changes — parent fetches results */
  onSearchChange?: (query: string) => void;
  /** Icon to show next to each item. Defaults to first letter avatar. */
  icon?: ReactNode;
  /** Whether to allow unlinking (shows x button) */
  onUnlink?: (id: string) => void | Promise<void>;
  /** Entity type config for the modal header/tabs */
  entityTypeConfig?: EntityTypeConfig;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EntityAssociationPanel({
  title,
  hideHeader = false,
  items,
  searchPlaceholder,
  emptyText,
  onItemClick,
  onLink,
  onCreateNew,
  searchResults,
  isSearching = false,
  onSearchChange,
  onUnlink,
  entityTypeConfig,
}: EntityAssociationPanelProps) {
  const { t } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);
  const [isLinking, setIsLinking] = useState(false);

  const handleSearchChange = useCallback(
    (query: string) => {
      onSearchChange?.(query);
    },
    [onSearchChange],
  );

  const handleSelect = useCallback(
    async (result: EntityLinkResult) => {
      setIsLinking(true);
      try {
        await onLink?.({ id: result.id, label: result.label, sublabel: result.sublabel });
      } catch (e) {
        toast.error(
          formatActionError(e, t, {
            key: "associations.errors.linkFailed",
            defaultValue: "Nie udało się powiązać rekordów.",
          }),
        );
      } finally {
        setIsLinking(false);
      }
    },
    [onLink, t],
  );

  // Convert search results to EntityLinkResult format
  const modalResults: EntityLinkResult[] = (searchResults ?? [])
    .filter((r) => !items.some((i) => i.id === r.id))
    .map((r) => ({
      id: r.id,
      label: r.label,
      sublabel: r.sublabel,
      entityType: entityTypeConfig?.type ?? "entity",
      avatarFallback: r.label.slice(0, 2).toUpperCase(),
    }));

  const entityTypes: EntityTypeConfig[] = useMemo(
    () =>
      entityTypeConfig
        ? [entityTypeConfig]
        : [{ type: "entity", label: title }],
    [entityTypeConfig, title],
  );

  return (
    <div className="space-y-2">
      {/* Header */}
      {!hideHeader && (
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
                onClick={() => setModalOpen(true)}
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
      )}

      {/* EntityLinkModal */}
      <EntityLinkModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={searchPlaceholder ?? t("detail.relationships.search", "Szukaj...")}
        entityTypes={entityTypes}
        onSelect={handleSelect}
        onSearchChange={handleSearchChange}
        searchResults={modalResults}
        isSearching={isSearching || isLinking}
        onCreateNew={onCreateNew ? () => { setModalOpen(false); onCreateNew(); } : undefined}
      />

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
        <p className="text-sm text-muted-foreground py-1">
          {emptyText ?? t("detail.relationships.empty", "Brak powiązanych.")}
        </p>
      )}
    </div>
  );
}
