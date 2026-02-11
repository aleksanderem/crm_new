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

interface GlobalSearchProps {
  onSearch: (
    query: string
  ) => Promise<SearchResultGroup[]> | SearchResultGroup[];
  onSelect: (result: SearchResult) => void;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function GlobalSearch({
  onSearch,
  onSelect,
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
        ) : (
          <>
            <CommandEmpty>
              {t("globalSearch.noResults")}
            </CommandEmpty>
            {results.map((group) => (
              <CommandGroup
                key={group.type}
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
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
