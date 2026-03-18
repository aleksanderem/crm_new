import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Link2, Plus } from "@/lib/ez-icons";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RelationshipCardItem {
  _id: string;
  relationshipId: string;
  name: string;
  subtitle?: string;
}

export interface SearchResultItem {
  _id: string;
  name: string;
  subtitle?: string;
}

export interface EntityRelationshipCardProps {
  /** Card heading, e.g. "Companies" or "Leads" */
  title: string;
  /** Entity type key used to derive the navigation route */
  entityType:
    | "contact"
    | "company"
    | "lead"
    | "gabinetPatient"
    | "gabinetEmployee"
    | "gabinetTreatment";
  /** Icon rendered next to each item and search result */
  icon: LucideIcon;
  /** Currently linked items */
  items: RelationshipCardItem[];
  /** Placeholder text for the search input */
  searchPlaceholder: string;
  /** Message shown when there are no linked items */
  emptyMessage: string;
  /** Controlled search query value */
  searchQuery: string;
  /** Called when the user types in the search input */
  onSearchQueryChange: (query: string) => void;
  /** Results returned by the search query */
  searchResults: SearchResultItem[];
  /** Called when the user picks a search result to link */
  onLink: (targetId: string) => void;
  /** Called when the user wants to create a new entity and link it */
  onCreateNew?: () => void;
}

// ---------------------------------------------------------------------------
// Route helper
// ---------------------------------------------------------------------------

const ENTITY_ROUTE_MAP: Record<EntityRelationshipCardProps["entityType"], string> = {
  contact: "/dashboard/contacts",
  company: "/dashboard/companies",
  lead: "/dashboard/leads",
  gabinetPatient: "/dashboard/gabinet/patients",
  gabinetEmployee: "/dashboard/gabinet/employees",
  gabinetTreatment: "/dashboard/gabinet/treatments",
};

function getEntityRoute(entityType: EntityRelationshipCardProps["entityType"], id: string): string {
  const base = ENTITY_ROUTE_MAP[entityType];
  return `${base}/${id}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EntityRelationshipCard({
  title,
  entityType,
  icon: Icon,
  items,
  searchPlaceholder,
  emptyMessage,
  searchQuery,
  onSearchQueryChange,
  searchResults,
  onLink,
  onCreateNew,
}: EntityRelationshipCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [showSearch, setShowSearch] = useState(false);

  const filteredResults = searchResults.filter(
    (sr) => !items.some((item) => item._id === sr._id),
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs px-2"
              onClick={() => {
                setShowSearch(!showSearch);
                onSearchQueryChange("");
              }}
            >
              <Link2 className="h-4 w-4 mr-1" variant="stroke" />
              {t("detail.relationships.add")}
            </Button>
            {onCreateNew && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs px-2"
                onClick={onCreateNew}
              >
                <Plus className="h-4 w-4 mr-1" variant="stroke" />
                {t("detail.relationships.addNew")}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Search / link input */}
        {showSearch && (
          <div className="mb-3 relative">
            <div className="flex items-center w-full rounded-md border bg-transparent">
              <Search className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" variant="stroke" />
              <Input
                type="text"
                className="h-8 border-0 shadow-none focus-visible:ring-0 bg-transparent px-2"
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                autoFocus
              />
            </div>

            {searchQuery.length > 0 && (
              <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
                {filteredResults.length ? (
                  <ul className="max-h-[200px] overflow-y-auto p-1">
                    {filteredResults.map((sr) => (
                      <li key={sr._id}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                          onClick={() => {
                            onLink(sr._id);
                            onSearchQueryChange("");
                            setShowSearch(false);
                          }}
                        >
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <span>{sr.name}</span>
                          {sr.subtitle && (
                            <span className="text-xs text-muted-foreground">
                              {sr.subtitle}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="py-3 px-3 text-sm text-muted-foreground">
                    {t("detail.relationships.noResults")}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Linked items list */}
        {items.length > 0 ? (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item._id}>
                <button
                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                  onClick={() =>
                    navigate({
                      to: getEntityRoute(entityType, item._id),
                    })
                  }
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span>{item.name}</span>
                  {item.subtitle && (
                    <span className="text-xs text-muted-foreground">
                      {item.subtitle}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          !showSearch && (
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          )
        )}
      </CardContent>
    </Card>
  );
}
