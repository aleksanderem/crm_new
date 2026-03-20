import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";

export interface SearchResult {
  id: string;
  type:
    | "contact"
    | "company"
    | "lead"
    | "document"
    | "product"
    | "call"
    | "activity";
  title: string;
  subtitle?: string;
  href: string;
}

export interface SearchResultGroup {
  type: string;
  label: string;
  icon: React.ReactNode;
  results: SearchResult[];
  totalCount: number;
}

export interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
}

export interface QuickActionGroup {
  heading: string;
  actions: QuickAction[];
}

interface GlobalSearchProps {
  onSearch: (
    query: string
  ) => Promise<SearchResultGroup[]> | SearchResultGroup[];
  onSelect: (result: SearchResult) => void;
  quickActions?: QuickActionGroup[];
  onQuickAction?: (actionId: string) => void;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function GlobalSearch({
  onSearch,
  onSelect,
  quickActions,
  onQuickAction,
  isOpen: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: GlobalSearchProps) {
  const { t } = useTranslation();
  const [internalOpen, setInternalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultGroup[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;

  // Ctrl+K keyboard shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, setOpen]);

  const handleSearch = useCallback(
    async (value: string) => {
      setQuery(value);
      if (!value.trim()) {
        setResults([]);
        return;
      }
      setIsLoading(true);
      try {
        const searchResults = await onSearch(value);
        setResults(searchResults);
      } finally {
        setIsLoading(false);
      }
    },
    [onSearch]
  );

  function handleSelect(result: SearchResult) {
    onSelect(result);
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  function handleQuickActionSelect(actionId: string) {
    onQuickAction?.(actionId);
    setOpen(false);
    setQuery("");
  }

  const showQuickActions = !query.trim() && quickActions && quickActions.length > 0;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder={t("globalSearch.placeholder")}
        value={query}
        onValueChange={handleSearch}
      />
      <CommandList>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : showQuickActions ? (
          <>
            {quickActions.map((group, groupIndex) => (
              <div key={group.heading}>
                {groupIndex > 0 && <CommandSeparator />}
                <CommandGroup heading={group.heading}>
                  {group.actions.map((action) => (
                    <CommandItem
                      key={action.id}
                      value={action.id}
                      onSelect={() => handleQuickActionSelect(action.id)}
                    >
                      {action.icon}
                      <span>{action.label}</span>
                      {action.shortcut && (
                        <CommandShortcut>{action.shortcut}</CommandShortcut>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </div>
            ))}
          </>
        ) : (
          <>
            <CommandEmpty>
              {t("globalSearch.noResults")}
            </CommandEmpty>
            {results.map((group, index) => (
              <div key={group.type}>
                {index > 0 && <CommandSeparator />}
                <CommandGroup
                  heading={
                    <span className="flex items-center gap-2">
                      {group.icon}
                      {group.label}
                      <span className="text-xs text-muted-foreground">
                        ({group.totalCount})
                      </span>
                    </span>
                  }
                >
                  {group.results.map((result) => (
                    <CommandItem
                      key={result.id}
                      value={`${result.type}-${result.id}`}
                      onSelect={() => handleSelect(result)}
                    >
                      <div className="flex flex-col">
                        <span>{result.title}</span>
                        {result.subtitle && (
                          <span className="text-xs text-muted-foreground">
                            {result.subtitle}
                          </span>
                        )}
                      </div>
                      <CommandShortcut className="uppercase">
                        {group.type.slice(0, 3)}
                      </CommandShortcut>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </div>
            ))}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
