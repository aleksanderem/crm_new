// @ts-nocheck
import Mention from "@tiptap/extension-mention";
import suggestion, { SuggestionOptions } from "@tiptap/suggestion";
import tippy, { Instance as TippyInstance } from "tippy.js";

export type TemplateVariableCategory = "patient" | "appointment" | "organization" | "system";

export interface TemplateVariable {
  key: string;
  label: string;
  category: TemplateVariableCategory;
  aliases?: string[];
}

export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  { key: "patient.firstName", label: "Imię pacjenta", category: "patient", aliases: ["name", "first"] },
  { key: "patient.lastName", label: "Nazwisko pacjenta", category: "patient", aliases: ["surname", "last"] },
  { key: "patient.email", label: "E-mail pacjenta", category: "patient", aliases: ["mail"] },
  { key: "patient.phone", label: "Telefon pacjenta", category: "patient", aliases: ["phone", "tel"] },
  { key: "patient.pesel", label: "PESEL pacjenta", category: "patient", aliases: ["id"] },
  { key: "patient.dateOfBirth", label: "Data urodzenia", category: "patient", aliases: ["birth", "dob"] },
  { key: "date", label: "Dzisiejsza data", category: "system", aliases: ["today", "now"] },
];

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

function findVariables(query: string) {
  return TEMPLATE_VARIABLES
    .map((variable) => {
      const searchable = [variable.key, variable.label, ...(variable.aliases ?? [])].join(" ");
      return { variable, score: fuzzyScore(searchable, query) };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.variable.category.localeCompare(b.variable.category) || a.variable.key.localeCompare(b.variable.key))
    .map((row) => row.variable)
    .slice(0, 10);
}

function groupedLabel(category: TemplateVariableCategory) {
  switch (category) {
    case "patient":
      return "Pacjent";
    case "appointment":
      return "Wizyta";
    case "organization":
      return "Organizacja";
    case "system":
    default:
      return "System";
  }
}

function createSuggestionList(getSearchQuery: (query: string) => string): Partial<SuggestionOptions<any, TemplateVariable>>["render"] {
  return () => {
    let popup: TippyInstance[] = [];
    let container: HTMLDivElement | null = null;
    let selectedIndex = 0;

    const render = (props: any) => {
      if (!container) return;
      const items = props.items as TemplateVariable[];
      const grouped = new Map<string, TemplateVariable[]>();
      for (const item of items) {
        const key = groupedLabel(item.category);
        const list = grouped.get(key) ?? [];
        list.push(item);
        grouped.set(key, list);
      }

      container.innerHTML = "";
      container.className = "z-50 max-h-72 min-w-[320px] overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md";

      let rowIndex = 0;
      grouped.forEach((values, group) => {
        const heading = document.createElement("div");
        heading.className = "px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground";
        heading.textContent = group;
        container!.appendChild(heading);

        values.forEach((item) => {
          const row = document.createElement("button");
          row.type = "button";
          row.className = "flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-accent";
          if (rowIndex === selectedIndex) row.classList.add("bg-accent");
          row.onclick = () => props.command({ id: item.key, label: item.label });
          row.innerHTML = `<span>${item.label}</span><code class=\"text-xs text-muted-foreground\">{{${item.key}}}</code>`;
          container!.appendChild(row);
          rowIndex += 1;
        });
      });
    };

    return {
      onStart: (props: any) => {
        container = document.createElement("div");
        selectedIndex = 0;
        render(props);

        popup = tippy("body", {
          getReferenceClientRect: props.clientRect,
          appendTo: () => document.body,
          content: container,
          showOnCreate: true,
          interactive: true,
          trigger: "manual",
          placement: "bottom-start",
        });
      },
      onUpdate(props: any) {
        selectedIndex = 0;
        render({ ...props, query: getSearchQuery(props.query) });
        popup[0]?.setProps({ getReferenceClientRect: props.clientRect });
      },
      onKeyDown(props: any) {
        if (props.event.key === "Escape") {
          popup[0]?.hide();
          return true;
        }

        const count = (props.items as TemplateVariable[]).length;
        if (!count) return false;

        if (props.event.key === "ArrowUp") {
          selectedIndex = (selectedIndex + count - 1) % count;
          render(props);
          return true;
        }
        if (props.event.key === "ArrowDown") {
          selectedIndex = (selectedIndex + 1) % count;
          render(props);
          return true;
        }
        if (props.event.key === "Enter") {
          props.command({ id: props.items[selectedIndex].key, label: props.items[selectedIndex].label });
          return true;
        }

        return false;
      },
      onExit() {
        popup[0]?.destroy();
        popup = [];
        container = null;
      },
    };
  };
}

const commonConfig = {
  renderHTML: ({ node }: any) => [
    "span",
    {
      class: "inline-flex items-center rounded bg-accent px-1.5 py-0.5 font-mono text-xs text-accent-foreground",
      "data-variable": node.attrs.id,
      contenteditable: "false",
    },
    `{{${node.attrs.id}}}`,
  ],
  renderText: ({ node }: any) => `{{${node.attrs.id}}}`,
  deleteTriggerWithBackspace: true,
};

export const VariableMentionAt = Mention.extend({
  name: "variableMentionAt",
}).configure({
  ...commonConfig,
  HTMLAttributes: {
    class: "template-variable-chip",
  },
  suggestion: {
    char: "@",
    items: ({ query }: { query: string }) => findVariables(query),
    render: createSuggestionList((q) => q),
  },
});

export const VariableMentionCurly = Mention.extend({
  name: "variableMentionCurly",
}).configure({
  ...commonConfig,
  HTMLAttributes: {
    class: "template-variable-chip",
  },
  suggestion: {
    char: "{",
    allow: ({ state, range }: any) => {
      const before = state.doc.textBetween(Math.max(0, range.from - 1), range.from, "", "");
      return before === "{";
    },
    items: ({ query }: { query: string }) => findVariables(query),
    command: ({ editor, range, props }: any) => {
      const from = Math.max(0, range.from - 1);
      editor
        .chain()
        .focus()
        .insertContentAt({ from, to: range.to }, [
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
});

export const TEMPLATE_VARIABLE_CATEGORIES = [
  { id: "patient", label: "Pacjent" },
  { id: "appointment", label: "Wizyta" },
  { id: "organization", label: "Organizacja" },
  { id: "system", label: "System" },
] as const;
