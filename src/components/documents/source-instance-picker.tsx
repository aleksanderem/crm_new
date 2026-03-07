import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Search, Check } from "@/lib/ez-icons";
import { cn } from "@/lib/utils";

interface SourceInstancePickerProps {
  sourceKey: string;
  sourceLabel: string;
  organizationId: Id<"organizations">;
  selectedId?: string;
  onSelect: (instanceId: string) => void;
}

export function SourceInstancePicker({
  sourceKey,
  sourceLabel,
  organizationId,
  selectedId,
  onSelect,
}: SourceInstancePickerProps) {
  const [search, setSearch] = useState("");

  // Load entities based on source key
  const { data: contacts } = useQuery({
    ...convexQuery(api.contacts.list, {
      organizationId,
      paginationOpts: { numItems: 50, cursor: null },
    }),
    enabled: sourceKey === "contact",
  });

  const { data: teamMembers } = useQuery({
    ...convexQuery(api.organizations.getMembers, { organizationId }),
    enabled: sourceKey === "current_user" || sourceKey === "employee",
  });

  // Build items list based on source type
  const items = useMemo(() => {
    const result: Array<{ id: string; label: string; sublabel?: string }> = [];

    if (sourceKey === "contact" && contacts?.page) {
      for (const c of contacts.page) {
        const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "Bez nazwy";
        result.push({ id: c._id, label: name, sublabel: c.email });
      }
    }

    if ((sourceKey === "current_user" || sourceKey === "employee") && teamMembers) {
      for (const m of teamMembers) {
        const user = (m as any).user;
        if (!user) continue;
        result.push({
          id: user._id,
          label: user.name || user.email || "Użytkownik",
          sublabel: user.email,
        });
      }
    }

    // Filter by search
    if (search) {
      const q = search.toLowerCase();
      return result.filter(
        (item) =>
          item.label.toLowerCase().includes(q) ||
          item.sublabel?.toLowerCase().includes(q),
      );
    }

    return result;
  }, [sourceKey, contacts, teamMembers, search]);

  // For platform sources that auto-resolve, show a simple badge
  if (sourceKey === "system" || sourceKey === "org") {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-xs">
          Auto
        </Badge>
        <span className="text-sm text-muted-foreground">
          {sourceLabel} — rozwiązywane automatycznie
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{sourceLabel}</Label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={`Wyszukaj ${sourceLabel.toLowerCase()}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      <div className="max-h-40 overflow-auto rounded-md border">
        {items.length === 0 ? (
          <div className="p-3 text-center text-xs text-muted-foreground">
            {search ? "Brak wyników" : "Brak dostępnych elementów"}
          </div>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent",
                selectedId === item.id && "bg-accent",
              )}
              onClick={() => onSelect(item.id)}
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-sm">{item.label}</p>
                {item.sublabel && (
                  <p className="truncate text-xs text-muted-foreground">{item.sublabel}</p>
                )}
              </div>
              {selectedId === item.id && (
                <Check className="h-4 w-4 shrink-0 text-primary" />
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export type { SourceInstancePickerProps };
