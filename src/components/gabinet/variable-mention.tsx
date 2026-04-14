import Mention from "@tiptap/extension-mention";
import type { SuggestionOptions, SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import {
  VARIABLE_REGISTRY,
  CATEGORY_LABELS,
  getVariablesForEntityTypes,
} from "@/lib/document-variables";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TemplateVariableCategory = string;

export interface TemplateVariable {
  key: string;
  label: string;
  category: TemplateVariableCategory;
  aliases?: string[];
}

// ---------------------------------------------------------------------------
// Registry bridge — converts VARIABLE_REGISTRY to TemplateVariable[]
// ---------------------------------------------------------------------------

function registryToTemplateVariables(entityTypes: string[]): TemplateVariable[] {
  const fields = getVariablesForEntityTypes(entityTypes);
  return fields.map((f) => ({
    key: f.path,
    label: f.label,
    category: f.category,
    aliases: [],
  }));
}

/** Default full set — backward compat for existing TemplateEditor */
export const TEMPLATE_VARIABLES: TemplateVariable[] = registryToTemplateVariables(
  Object.keys(VARIABLE_REGISTRY),
);

// ---------------------------------------------------------------------------
// Ref-based dynamic variable list
//
// The suggestion `items` callback captures this ref at extension-creation time.
// Changing `variableListRef.current` updates what the popup shows without
// recreating the TipTap editor instance.
// ---------------------------------------------------------------------------

export const variableListRef: { current: TemplateVariable[] } = {
  current: TEMPLATE_VARIABLES,
};

/** Call from React useEffect when entityTypes change */
export function updateVariableList(entityTypes: string[]) {
  variableListRef.current = registryToTemplateVariables(entityTypes);
}

// ---------------------------------------------------------------------------
// Fuzzy search
// ---------------------------------------------------------------------------

function fuzzyScore(value: string, query: string) {
  if (!query) return 1;
  const v = value.toLowerCase();
  const q = query.toLowerCase();
  if (v.includes(q)) return 2;

  let i = 0;
  for (const ch of v) {
    if (ch === q[i]) i += 1;
    if (i === q.length) return 1;
  }
  return 0;
}

function findVariables(query: string, variables: TemplateVariable[] = variableListRef.current) {
  return variables
    .map((variable) => {
      const searchable = [variable.key, variable.label, ...(variable.aliases ?? [])].join(" ");
      return { variable, score: fuzzyScore(searchable, query) };
    })
    .filter((row) => row.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.variable.category.localeCompare(b.variable.category) ||
        a.variable.key.localeCompare(b.variable.key),
    )
    .map((row) => row.variable)
    .slice(0, 10);
}

// ---------------------------------------------------------------------------
// Category labels (expanded from CATEGORY_LABELS)
// ---------------------------------------------------------------------------

function groupedLabel(category: string): string {
  const entry = CATEGORY_LABELS[category];
  return entry?.pl ?? category;
}

export const TEMPLATE_VARIABLE_CATEGORIES = Object.entries(CATEGORY_LABELS).map(
  ([id, labels]) => ({ id, label: labels.pl }),
);

// ---------------------------------------------------------------------------
// Suggestion popup renderer (tippy.js)
// ---------------------------------------------------------------------------

type MentionSelected = { id: string; label: string };

function createSuggestionList(
  _getSearchQuery: (query: string) => string,
): NonNullable<SuggestionOptions<TemplateVariable, MentionSelected>["render"]> {
  return () => {
    let popup: TippyInstance[] = [];
    let container: HTMLDivElement | null = null;
    let selectedIndex = 0;
    // Closure-captured state for onKeyDown (which only receives view+event+range)
    let currentItems: TemplateVariable[] = [];
    let currentCommand: ((props: MentionSelected) => void) | null = null;

    const renderPopup = (items: TemplateVariable[], command: (props: MentionSelected) => void) => {
      if (!container) return;
      currentItems = items;
      currentCommand = command;

      const grouped = new Map<string, TemplateVariable[]>();
      for (const item of items) {
        const key = groupedLabel(item.category);
        const list = grouped.get(key) ?? [];
        list.push(item);
        grouped.set(key, list);
      }

      container.innerHTML = "";
      container.className =
        "z-50 max-h-72 min-w-[320px] overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md";

      let rowIndex = 0;
      grouped.forEach((values, group) => {
        const heading = document.createElement("div");
        heading.className =
          "px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground";
        heading.textContent = group;
        container!.appendChild(heading);

        values.forEach((item) => {
          const row = document.createElement("button");
          row.type = "button";
          row.className =
            "flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-accent";
          if (rowIndex === selectedIndex) row.classList.add("bg-accent");
          row.onclick = () => command({ id: item.key, label: item.label });
          row.innerHTML = `<span>${item.label}</span><code class="text-xs text-muted-foreground">{{${item.key}}}</code>`;
          container!.appendChild(row);
          rowIndex += 1;
        });
      });
    };

    return {
      onStart: (props: SuggestionProps<TemplateVariable, MentionSelected>) => {
        container = document.createElement("div");
        selectedIndex = 0;
        renderPopup(props.items, props.command);

        popup = tippy("body", {
          getReferenceClientRect: props.clientRect as () => DOMRect,
          appendTo: () => document.body,
          content: container,
          showOnCreate: true,
          interactive: true,
          trigger: "manual",
          placement: "bottom-start",
        });
      },
      onUpdate(props: SuggestionProps<TemplateVariable, MentionSelected>) {
        selectedIndex = 0;
        renderPopup(props.items, props.command);
        popup[0]?.setProps({
          getReferenceClientRect: props.clientRect as () => DOMRect,
        });
      },
      onKeyDown(props: SuggestionKeyDownProps) {
        if (props.event.key === "Escape") {
          popup[0]?.hide();
          return true;
        }

        const count = currentItems.length;
        if (!count) return false;

        if (props.event.key === "ArrowUp") {
          selectedIndex = (selectedIndex + count - 1) % count;
          if (currentCommand) renderPopup(currentItems, currentCommand);
          return true;
        }
        if (props.event.key === "ArrowDown") {
          selectedIndex = (selectedIndex + 1) % count;
          if (currentCommand) renderPopup(currentItems, currentCommand);
          return true;
        }
        if (props.event.key === "Enter") {
          const selected = currentItems[selectedIndex];
          if (selected && currentCommand) {
            currentCommand({ id: selected.key, label: selected.label });
          }
          return true;
        }

        return false;
      },
      onExit() {
        popup[0]?.destroy();
        popup = [];
        container = null;
        currentItems = [];
        currentCommand = null;
      },
    };
  };
}

// ---------------------------------------------------------------------------
// TipTap Mention extension config — shared rendering
// ---------------------------------------------------------------------------

const commonConfig = {
  renderHTML: ({ node }: { node: { attrs: { id: string } } }) => [
    "span",
    {
      class:
        "inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-700 border border-gray-200",
      "data-variable": node.attrs.id,
      contenteditable: "false",
    },
    `{{${node.attrs.id}}}`,
  ],
  renderText: ({ node }: { node: { attrs: { id: string } } }) => `{{${node.attrs.id}}}`,
  deleteTriggerWithBackspace: true,
};

// ---------------------------------------------------------------------------
// Extension instances
// ---------------------------------------------------------------------------

export const VariableMentionAt = Mention.extend({
  name: "variableMentionAt",
}).configure({
  ...commonConfig,
  HTMLAttributes: { class: "template-variable-chip inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-700 border border-gray-200" },
  suggestion: {
    char: "@",
    items: ({ query }: { query: string }) => findVariables(query, variableListRef.current),
    render: createSuggestionList((q) => q),
  },
} as any);

export const VariableMentionCurly = Mention.extend({
  name: "variableMentionCurly",
}).configure({
  ...commonConfig,
  HTMLAttributes: { class: "template-variable-chip inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-700 border border-gray-200" },
  suggestion: {
    char: "{{",
    items: ({ query }: { query: string }) => findVariables(query, variableListRef.current),
    command: ({ editor, range, props }: { editor: any; range: any; props: MentionSelected }) => {
      editor
        .chain()
        .focus()
        .insertContentAt({ from: range.from, to: range.to }, [
          {
            type: "variableMentionCurly",
            attrs: props,
          },
          { type: "text", text: " " },
        ])
        .run();
    },
    render: createSuggestionList((q) => q),
  },
} as any);
