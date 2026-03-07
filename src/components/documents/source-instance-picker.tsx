import { useState } from "react";
import type { Id } from "@cvx/_generated/dataModel";
import { Input } from "@/components/ui/input";
import { Search } from "@/lib/ez-icons";

interface SourceInstancePickerProps {
  sourceKey: string;
  sourceLabel: string;
  organizationId: Id<"organizations">;
  onSelect: (instanceId: string) => void;
}

export function SourceInstancePicker({
  sourceKey,
  sourceLabel,
  organizationId: _organizationId,
  onSelect: _onSelect,
}: SourceInstancePickerProps) {
  const [search, setSearch] = useState("");

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={`Wyszukaj ${sourceLabel}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
        Wyszukiwanie encji typu &quot;{sourceKey}&quot; zostanie podlaczone w kolejnym etapie.
      </div>
    </div>
  );
}

export type { SourceInstancePickerProps };
