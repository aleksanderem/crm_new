import { useState, useRef, useEffect } from "react";
import { Search, X } from "@/lib/ez-icons";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export interface RelationshipItem {
  id: string;
  label: string;
  sublabel?: string;
  avatarUrl?: string;
}

interface RelationshipFieldProps {
  label: string;
  placeholder?: string;
  items: RelationshipItem[];
  selectedItems: RelationshipItem[];
  onSearch: (query: string) => void;
  onSelect: (item: RelationshipItem) => void;
  onRemove: (itemId: string) => void;
  allowCreate?: boolean;
  onCreateNew?: () => void;
  createLabel?: string;
  isLoading?: boolean;
  multiple?: boolean;
}

export function RelationshipField({
  label,
  placeholder = "Search...",
  items,
  selectedItems,
  onSearch,
  onSelect,
  onRemove,
  allowCreate = false,
  onCreateNew,
  createLabel = "+ Create New",
  isLoading = false,
  multiple = true,
}: RelationshipFieldProps) {
  const [query, setQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedIds = new Set(selectedItems.map((i) => i.id));
  const filteredItems = items.filter((item) => !selectedIds.has(item.id));

  function handleInputChange(value: string) {
    setQuery(value);
    onSearch(value);
    setShowDropdown(true);
  }

  function handleSelect(item: RelationshipItem) {
    onSelect(item);
    if (!multiple) {
      setShowDropdown(false);
      setQuery("");
      onSearch("");
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="space-y-2 w-full" ref={containerRef}>
      <Label>{label}</Label>

      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedItems.map((item) => (
            <Badge key={item.id} variant="secondary" className="gap-1 pr-1">
              {item.label}
              <button
                type="button"
                className="ml-0.5 rounded-sm hover:bg-muted-foreground/20"
                onClick={() => onRemove(item.id)}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Inline search input — full width, no popover */}
      <div className="relative w-full">
        <div className="flex items-center w-full rounded-md border bg-transparent">
          <Search className="ml-3 h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            className="h-9 w-full bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
            placeholder={placeholder}
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={() => {
              if (query.length > 0) setShowDropdown(true);
            }}
          />
        </div>

        {/* Dropdown results */}
        {showDropdown && query.length > 0 && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
            {isLoading ? (
              <div className="space-y-2 p-3">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : filteredItems.length > 0 ? (
              <ul className="max-h-[200px] overflow-y-auto p-1">
                {filteredItems.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                      onClick={() => handleSelect(item)}
                    >
                      {item.avatarUrl !== undefined && (
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={item.avatarUrl} />
                          <AvatarFallback className="text-[10px]">
                            {item.label[0]}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div className="flex flex-col items-start">
                        <span>{item.label}</span>
                        {item.sublabel && (
                          <span className="text-xs text-muted-foreground">
                            {item.sublabel}
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Brak wyników
              </p>
            )}

            {allowCreate && onCreateNew && (
              <>
                <div className="mx-1 h-px bg-border" />
                <button
                  type="button"
                  className="flex w-full items-center px-3 py-2 text-sm text-primary hover:bg-accent"
                  onClick={onCreateNew}
                >
                  {createLabel}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
