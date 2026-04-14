import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useOrganization } from "@/components/org-context";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Puzzle, FileText, Users, Stethoscope, PenTool, Table2, Scale, Blocks } from "lucide-react";
import type { Editor } from "@tiptap/core";

// ---------------------------------------------------------------------------
// Category icons & labels
// ---------------------------------------------------------------------------

const CATEGORY_META: Record<string, { icon: typeof Puzzle; label: string }> = {
  header: { icon: FileText, label: "Nagłówek" },
  footer: { icon: FileText, label: "Stopka" },
  patient_data: { icon: Users, label: "Dane pacjenta" },
  treatment_data: { icon: Stethoscope, label: "Dane zabiegu" },
  signature: { icon: PenTool, label: "Podpis" },
  table: { icon: Table2, label: "Tabela" },
  legal: { icon: Scale, label: "Prawne" },
  custom: { icon: Blocks, label: "Inne" },
};

const SCOPE_LABELS: Record<string, string> = {
  system: "Systemowe",
  org: "Organizacyjne",
  user: "Osobiste",
};

// ---------------------------------------------------------------------------
// ComponentPicker
// ---------------------------------------------------------------------------

interface ComponentPickerProps {
  editor: Editor;
}

export function ComponentPicker({ editor }: ComponentPickerProps) {
  const [open, setOpen] = useState(false);
  const { organizationId } = useOrganization();

  const components = useQuery(
    api.documents.components.list,
    { organizationId },
  );

  const handleInsert = (comp: {
    _id: string;
    version: number;
    protected: boolean;
    positionConstraint?: string | null;
  }) => {
    const state = comp.protected ? "protected" : "linked";
    editor
      .chain()
      .focus()
      .insertComponentBlock(
        comp._id,
        comp.version,
        state,
        comp.positionConstraint ?? null,
      )
      .run();
    setOpen(false);
  };

  // Group by scope, then by category
  const grouped = new Map<string, Map<string, typeof components>>();
  for (const comp of components ?? []) {
    const scope = (comp as any).scope as string;
    if (!grouped.has(scope)) grouped.set(scope, new Map());
    const scopeMap = grouped.get(scope)!;
    const cat = (comp as any).category as string;
    if (!scopeMap.has(cat)) scopeMap.set(cat, []);
    scopeMap.get(cat)!.push(comp);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-8 px-2 text-xs text-muted-foreground"
          title="Wstaw komponent"
        >
          <Puzzle className="mr-1 h-4 w-4" />
          Komponent
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="max-h-80 w-72 overflow-auto p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {!components || components.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">
            Brak dostępnych komponentów
          </div>
        ) : (
          Array.from(grouped.entries()).map(([scope, categories]) => (
            <div key={scope}>
              <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {SCOPE_LABELS[scope] ?? scope}
              </div>
              {Array.from(categories.entries()).map(([cat, comps]) => {
                const meta = CATEGORY_META[cat] ?? {
                  icon: Puzzle,
                  label: cat,
                };
                const Icon = meta.icon;
                return (
                  <div key={cat}>
                    {(comps as any[]).map((comp: any) => (
                      <button
                        key={comp._id}
                        type="button"
                        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent"
                        onClick={() => handleInsert(comp)}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                        <div className="min-w-0 flex-1">
                          <span className="truncate font-medium">
                            {comp.name}
                          </span>
                          {comp.description && (
                            <span className="ml-1 text-muted-foreground">
                              — {comp.description.slice(0, 40)}
                              {comp.description.length > 40 ? "..." : ""}
                            </span>
                          )}
                        </div>
                        {comp.protected && (
                          <span className="shrink-0 text-[10px] text-amber-500">
                            chroniony
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}
