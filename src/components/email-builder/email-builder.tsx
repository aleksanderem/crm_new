// ---------------------------------------------------------------------------
// Email Builder — Main Component (GrapesJS Studio SDK)
// ---------------------------------------------------------------------------
// Uses @grapesjs/studio-sdk which provides the full editor UI out of the box:
// canvas, blocks, styles, traits, layers, MJML support, and DataSources.
//
// Usage:
//   const ref = useRef<EmailBuilderHandle>(null);
//   <EmailBuilder ref={ref} mergeTags={tags} onReady={() => {}} />
//   const { projectData, html } = await ref.current.getOutput();
// ---------------------------------------------------------------------------

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import StudioEditor from "@grapesjs/studio-sdk/react";
import "@grapesjs/studio-sdk/style";
import type { Editor, ProjectData } from "grapesjs";
import type { IDataSourceExporter } from "@grapesjs/studio-sdk";

import type {
  EmailBuilderProps,
  EmailBuilderHandle,
  EmailBuilderOutput,
  MergeTagGroup,
} from "./types";

// Default MJML content for new templates
const DEFAULT_MJML = `<mjml>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-text>Start building your email</mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

// ---------------------------------------------------------------------------
// Predefined collections — arrays of sample objects for data-collection blocks.
// Each collection appears in globalData as an array, enabling {{#each}} loops.
// ---------------------------------------------------------------------------
interface CollectionDef {
  key: string;
  label: string;
  module: "crm" | "gabinet" | "platform";
  sampleItem: Record<string, string>;
}

const COLLECTIONS: CollectionDef[] = [
  {
    key: "deal_products",
    label: "Produkty deala",
    module: "crm",
    sampleItem: {
      name: "Nazwa produktu",
      quantity: "1",
      unitPrice: "100,00 zł",
      total: "100,00 zł",
    },
  },
  {
    key: "upcoming_appointments",
    label: "Nadchodzące wizyty",
    module: "gabinet",
    sampleItem: {
      date: "2026-03-15",
      time: "10:00",
      treatment: "Konsultacja",
      doctor: "Dr. Kowalski",
    },
  },
  {
    key: "treatment_list",
    label: "Lista zabiegów",
    module: "gabinet",
    sampleItem: {
      name: "Nazwa zabiegu",
      duration: "30 min",
      price: "150,00 zł",
    },
  },
];

// ---------------------------------------------------------------------------
// Predefined conditions — "show section if field has value" blocks.
// ---------------------------------------------------------------------------
interface ConditionDef {
  key: string;
  label: string;
  module: "crm" | "gabinet" | "platform";
  /** Path to the field being checked (globalData.X.data.Y) */
  fieldPath: string;
  /** Label prefix shown before the variable in the "true" branch */
  trueLabel: string;
  /** Default value shown in the variable pill */
  defaultValue: string;
}

const CONDITIONS: ConditionDef[] = [
  // CRM
  {
    key: "if_contact_phone",
    label: "Jeśli kontakt ma telefon",
    module: "crm",
    fieldPath: "globalData.contact.data.phone",
    trueLabel: "Telefon:",
    defaultValue: "Telefon",
  },
  {
    key: "if_contact_email",
    label: "Jeśli kontakt ma e-mail",
    module: "crm",
    fieldPath: "globalData.contact.data.email",
    trueLabel: "E-mail:",
    defaultValue: "E-mail",
  },
  {
    key: "if_company_website",
    label: "Jeśli firma ma stronę www",
    module: "crm",
    fieldPath: "globalData.company.data.website",
    trueLabel: "Strona:",
    defaultValue: "Strona www",
  },
  {
    key: "if_deal_value",
    label: "Jeśli deal ma wartość",
    module: "crm",
    fieldPath: "globalData.lead.data.value",
    trueLabel: "Wartość:",
    defaultValue: "Wartość",
  },
  // Gabinet
  {
    key: "if_patient_allergies",
    label: "Jeśli pacjent ma alergie",
    module: "gabinet",
    fieldPath: "globalData.patient.data.allergies",
    trueLabel: "Alergie:",
    defaultValue: "Alergie",
  },
  {
    key: "if_patient_emergency",
    label: "Jeśli pacjent ma kontakt awaryjny",
    module: "gabinet",
    fieldPath: "globalData.patient.data.emergencyContact",
    trueLabel: "Kontakt awaryjny:",
    defaultValue: "Kontakt awaryjny",
  },
  {
    key: "if_appointment_notes",
    label: "Jeśli wizyta ma notatki",
    module: "gabinet",
    fieldPath: "globalData.appointment.data.notes",
    trueLabel: "Notatki:",
    defaultValue: "Notatki",
  },
];

// ---------------------------------------------------------------------------
// Build globalData from merge tag groups + collections for Studio SDK.
// ---------------------------------------------------------------------------
function buildGlobalData(
  groups: MergeTagGroup[],
  module?: string,
): Record<string, Record<string, string> | Record<string, string>[]> {
  const data: Record<
    string,
    Record<string, string> | Record<string, string>[]
  > = {};

  // Single-record sources (variables)
  for (const group of groups) {
    const record: Record<string, string> = {};
    for (const field of group.fields) {
      record[field.key] = `${group.label} › ${field.label}`;
    }
    data[group.key] = record;
  }

  // Array sources (collections)
  for (const col of COLLECTIONS) {
    if (!module || col.module === module || col.module === "platform") {
      data[col.key] = [col.sampleItem, col.sampleItem];
    }
  }

  return data;
}

// ---------------------------------------------------------------------------
// Handlebars-style exporter
// ---------------------------------------------------------------------------
const handlebarExporter: IDataSourceExporter = {
  getVariableSyntax({ dataResolver }) {
    const path = dataResolver?.path;
    if (!path) return "";
    const clean = path.replace(/^globalData\./, "").replace(/\.data\./, ".");
    return `{{${clean}}}`;
  },
  getConditionalStartSyntax({ dataResolver }) {
    const cond = dataResolver?.condition;
    if (!cond || typeof cond === "boolean") return "";

    // LogicGroupProps: { logicalOperator, statements: [...] }
    // ExpressionProps: { left, operator, right }
    let leftPath: string | undefined;
    if ("statements" in cond) {
      const first = (
        cond as { statements?: { left?: { path?: string } | string }[] }
      ).statements?.[0];
      const left = first?.left;
      leftPath = typeof left === "object" && left ? left.path : undefined;
    } else if ("left" in cond) {
      const left = (cond as { left?: { path?: string } | string }).left;
      leftPath = typeof left === "object" && left ? left.path : undefined;
    }
    if (!leftPath) return "";
    const clean = leftPath
      .replace(/^globalData\./, "")
      .replace(/\.data\./, ".");
    return `{{#if ${clean}}}`;
  },
  getConditionElseSyntax() {
    return "{{else}}";
  },
  getConditionalEndSyntax() {
    return "{{/if}}";
  },
  getCollectionStartSyntax({ dataResolver }) {
    const path = dataResolver?.dataSource?.path;
    if (!path) return "";
    const clean = path.replace(/^globalData\./, "").replace(/\.data\./, ".");
    return `{{#each ${clean}}}`;
  },
  getCollectionEndSyntax() {
    return "{{/each}}";
  },
};

// ---------------------------------------------------------------------------
// Canvas CSS — injected via gjsOptions.canvasCss
// ---------------------------------------------------------------------------
const CANVAS_CSS = `
/* ======================================================================
   DATA VARIABLES — inline pill badges (fixed px sizes for MJML canvas)
   ====================================================================== */
[data-gjs-type="data-variable"] {
  display: inline-flex !important;
  align-items: center;
  gap: 2px;
  background: linear-gradient(135deg, #ede9fe, #ddd6fe) !important;
  border: 1px solid rgba(139,92,246,0.35) !important;
  border-radius: 10px !important;
  padding: 1px 8px !important;
  line-height: 1.7 !important;
  white-space: nowrap !important;
  min-width: 20px;
  font-size: 13px !important;
  color: #6d28d9 !important;
  font-weight: 600 !important;
  letter-spacing: -0.01em;
  transition: background 0.15s, box-shadow 0.15s;
  cursor: default;
}
[data-gjs-type="data-variable"]:hover {
  background: linear-gradient(135deg, #ddd6fe, #c4b5fd) !important;
  box-shadow: 0 0 0 2px rgba(139,92,246,0.15) !important;
}
[data-gjs-type="data-variable"]::before {
  content: "⟨" !important;
  font-size: 10px !important;
  opacity: 0.55;
  margin-right: 1px;
}
[data-gjs-type="data-variable"]::after {
  content: "⟩" !important;
  font-size: 10px !important;
  opacity: 0.55;
  margin-left: 1px;
}

/* ======================================================================
   DATA CONDITION — subtle enhancement of SDK's built-in labels.
   The SDK already renders its own ::before labels for condition/true/false,
   so we only add background tinting and borders — no competing ::before.
   ====================================================================== */
[data-gjs-type="data-condition"] {
  display: block !important;
  border: 1.5px solid rgba(245,158,11,0.35) !important;
  border-radius: 8px !important;
  padding: 8px !important;
  margin: 12px 0 !important;
  background: rgba(255,251,235,0.45) !important;
}

/* Force all direct children of condition to stack vertically */
[data-gjs-type="data-condition"] > * {
  display: block !important;
  width: 100% !important;
}

/* True branch — light green tint, stacks as block */
[data-gjs-type="data-condition-true-content"] {
  display: block !important;
  border-left: 3px solid rgba(34,197,94,0.5) !important;
  border-radius: 4px !important;
  padding: 8px 10px !important;
  padding-top: 24px !important;
  margin: 6px 0 !important;
  background: rgba(240,253,244,0.5) !important;
  min-height: 40px;
  position: relative !important;
  font-size: 13px !important;
}
/* Condition label — positioned as a header line above content.
   content: var(--before-content) is set by the SDK's renderDataResolver,
   which now uses our patched getConditionString() for Polish labels. */
[data-gjs-type="data-condition-true-content"]::before {
  content: var(--before-content) !important;
  display: block !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  color: #16a34a !important;
  letter-spacing: -0.01em !important;
  margin-bottom: 4px !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  position: absolute !important;
  top: 6px !important;
  left: 10px !important;
  right: 10px !important;
}

/* False branch — light red tint, stacks as block */
[data-gjs-type="data-condition-false-content"] {
  display: block !important;
  border-left: 3px solid rgba(239,68,68,0.4) !important;
  border-radius: 4px !important;
  padding: 8px 10px !important;
  padding-top: 28px !important;
  margin: 6px 0 !important;
  background: rgba(254,242,242,0.5) !important;
  min-height: 28px;
  position: relative !important;
}
/* Else label — positioned as header. Force content from --before-content
   to override GrapesJS empty-state label ("False condition"). */
[data-gjs-type="data-condition-false-content"]::before {
  content: var(--before-content, " W przeciwnym razie: ") !important;
  display: block !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  color: #dc2626 !important;
  letter-spacing: -0.01em !important;
  margin-bottom: 4px !important;
  white-space: nowrap !important;
  position: absolute !important;
  top: 6px !important;
  left: 10px !important;
}

/* Empty false branch — subtle dashed hint */
[data-gjs-type="data-condition-false-content"]:not(:has(> *)) {
  min-height: 36px !important;
  opacity: 0.55;
  border-left-style: dashed !important;
}

/* ======================================================================
   DATA COLLECTION — subtle blue tint. SDK provides its own labels.
   ====================================================================== */
[data-gjs-type="data-collection"] {
  border: 1.5px solid rgba(59,130,246,0.3) !important;
  border-radius: 8px !important;
  padding: 6px !important;
  margin: 8px 0 !important;
  background: rgba(239,246,255,0.4) !important;
}

/* Collection item — subtle separator between repeated items */
[data-gjs-type="data-collection-item"] {
  border: 1px dashed rgba(59,130,246,0.2) !important;
  border-radius: 4px !important;
  padding: 6px !important;
  margin: 3px 0 !important;
  background: rgba(255,255,255,0.6) !important;
}

/* ======================================================================
   Hover states — gentle highlight on hover
   ====================================================================== */
[data-gjs-type="data-condition"]:hover {
  border-color: rgba(245,158,11,0.55) !important;
}
[data-gjs-type="data-collection"]:hover {
  border-color: rgba(59,130,246,0.5) !important;
}
`;

// ---------------------------------------------------------------------------
// Plugin factory: registers exporter, per-field blocks, and preview mode
// ---------------------------------------------------------------------------
function createEmailBuilderPlugin(mergeTags: MergeTagGroup[]) {
  return (editor: Editor) => {
    // 1. Register Handlebars exporter
    editor.runCommand("studio:dataSourceSetExporter", handlebarExporter as unknown as Record<string, unknown>);

    // 2. Register one block per merge-tag field, grouped by source.
    //    Single drag = variable inserted with correct path. No clicking through.
    //    Uses component definition format (same as SDK's own data-variable block).
    const CATEGORY_PREFIX = "Zmienne";
    for (const group of mergeTags) {
      const categoryName =
        mergeTags.length > 1
          ? `${CATEGORY_PREFIX} › ${group.label}`
          : CATEGORY_PREFIX;

      for (const field of group.fields) {
        editor.Blocks.add(`var-${group.key}-${field.key}`, {
          label: field.label,
          category: categoryName,
          content: {
            type: "data-variable",
            dataResolver: {
              path: `globalData.${group.key}.data.${field.key}`,
              defaultValue: field.label,
            },
          },
          media: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 4a3 3 0 0 0-3 3v2c0 1.1-.4 1.7-1 2 .6.3 1 .9 1 2v2a3 3 0 0 0 3 3"/><path d="M17 4a3 3 0 0 1 3 3v2c0 1.1.4 1.7 1 2-.6.3-1 .9-1 2v2a3 3 0 0 1-3 3"/></svg>`,
        });
      }
    }

    // 3. Register collection blocks — one per predefined collection.
    //    Each creates a data-collection with nested data-variable items.
    const COL_CATEGORY = "Kolekcje";
    for (const col of COLLECTIONS) {
      // Build inner template: one data-variable per field in sampleItem
      const innerVars = Object.entries(col.sampleItem).map(
        ([fieldKey, fieldLabel]) => ({
          type: "data-variable",
          dataResolver: {
            path: `globalData.${col.key}.data.${fieldKey}`,
            defaultValue: fieldLabel,
          },
        }),
      );

      editor.Blocks.add(`col-${col.key}`, {
        label: col.label,
        category: COL_CATEGORY,
        content: {
          type: "data-collection",
          dataResolver: {
            dataSource: { path: `globalData.${col.key}.data` },
          },
          components: [
            {
              type: "data-collection-item",
              components: innerVars,
            },
          ],
        },
        media: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
      });
    }

    // 4. Register condition blocks — "show if field exists" presets.
    //    True content uses a data-variable component so the value renders
    //    as a colored pill instead of plain {{handlebars}} text.
    const COND_CATEGORY = "Warunki";
    for (const cond of CONDITIONS) {
      editor.Blocks.add(`cond-${cond.key}`, {
        label: cond.label,
        category: COND_CATEGORY,
        content: {
          type: "data-condition",
          dataResolver: {
            condition: {
              logicalOperator: "and",
              statements: [
                {
                  left: {
                    type: "data-variable",
                    path: cond.fieldPath,
                    defaultValue: "",
                  },
                  operator: "isDefined",
                },
              ],
            },
          },
          components: [
            {
              type: "data-condition-true-content",
              components: [
                { tagName: "span", content: `${cond.trueLabel} ` },
                {
                  type: "data-variable",
                  dataResolver: {
                    path: cond.fieldPath,
                    defaultValue: cond.defaultValue,
                  },
                },
              ],
            },
            { type: "data-condition-false-content" },
          ],
        },
        media: `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3v6m0 6v6m-6-9h6m6 0h-6m-6-3 3 3-3 3m12-6-3 3 3 3"/></svg>`,
      });
    }

    // 5. Override condition label rendering to show human-readable Polish text
    //    instead of raw paths like "globalData.contact.data.phone isDefined".
    //
    //    Strategy: override `getConditionString()` on the condition view prototype.
    //    The SDK calls this method inside its own `renderDataResolver` to build
    //    the condition label, then sets it as `--before-content` CSS var on the
    //    true-content element.  For the false-content "Else" label, we also patch
    //    `renderDataResolver` to replace it with "W przeciwnym razie".
    const OPERATOR_LABELS: Record<string, string> = {
      isDefined: "jest ustawione",
      isTruthy: "ma wartość",
      isFalsy: "jest puste",
      equals: "=",
      notEquals: "≠",
      greaterThan: ">",
      lessThan: "<",
    };

    function cleanPath(raw: string): string {
      const stripped = raw
        .replace(/^globalData\./, "")
        .replace(/\.data\./, ".");
      const [groupKey, fieldKey] = stripped.split(".");
      const group = mergeTags.find((g) => g.key === groupKey);
      if (group) {
        const field = group.fields.find((f) => f.key === fieldKey);
        if (field) return `${group.label} › ${field.label}`;
      }
      return stripped;
    }

    function formatValue(val: unknown): string {
      if (typeof val === "object" && val !== null) {
        const obj = val as { type?: string; path?: string };
        if (obj.type === "data-variable" && obj.path) {
          return cleanPath(obj.path);
        }
        return obj.path ? cleanPath(obj.path) : JSON.stringify(val);
      }
      return String(val ?? "");
    }

    editor.once("load", () => {
      const condType = editor.Components.getType("data-condition");
      if (!condType?.view) return;

      // Override getConditionString to produce Polish labels
      condType.view.prototype.getConditionString = function () {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const model = this.model as any;
        const { logicalOperator: op, statements = [] } =
          model.getCondition?.() ?? {};
        const join = op === "AND" ? " ORAZ " : " LUB ";

        const parts = statements.map(
          (s: { left?: unknown; operator?: string; right?: unknown }) => {
            const leftLabel = formatValue(s.left);
            const opLabel = OPERATOR_LABELS[s.operator ?? ""] ?? s.operator;

            // Unary operators (isDefined, isTruthy, isFalsy) — no right side
            if (s.right === undefined || s.right === null || s.right === "") {
              return `Jeśli ${leftLabel} ${opLabel}`;
            }

            const rightLabel = formatValue(s.right);
            return `Jeśli ${leftLabel} ${opLabel} ${rightLabel}`;
          },
        );
        return parts.join(join);
      };

      // Override renderDataResolver to replace "Else" with Polish text
      const origRender = condType.view.prototype.renderDataResolver;
      condType.view.prototype.renderDataResolver = function () {
        origRender?.call(this);

        // Replace "Else" label on false-content with Polish text
        try {
          if (!editor.runCommand("studio:getStateDataSource")?.showPlaceholder)
            return;
        } catch {
          return;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const model = this.model as any;
        const falseEl = model.getIfFalseContent?.()?.getEl?.();
        if (falseEl) {
          falseEl.style.setProperty(
            "--before-content",
            `" W przeciwnym razie: "`,
          );
        }
      };

      // Force re-render of all existing condition components with patched methods
      const wrapper = editor.getWrapper();
      if (wrapper) {
        const conditions = wrapper.findType("data-condition");
        for (const comp of conditions) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (comp as any).view?.renderDataResolver?.();
        }
      }

      // Enable data sources preview mode so placeholders are visible
      try {
        const state = editor.runCommand("studio:getStateDataSource");
        if (state && !state.showPlaceholder) {
          editor.runCommand("studio:toggleStateDataSource");
        }
      } catch {
        // ignore
      }
    });
  };
}

// ---------------------------------------------------------------------------
// EmailBuilder
// ---------------------------------------------------------------------------

export const EmailBuilder = forwardRef<EmailBuilderHandle, EmailBuilderProps>(
  function EmailBuilder(
    {
      initialProjectData,
      mergeTags = [],
      className,
      onReady,
      onChange,
      sidebarHeader,
      sidebarPortalTarget,
    },
    ref,
  ) {
    const editorRef = useRef<Editor | null>(null);

    // Build Studio SDK options
    const studioOptions = useMemo(
      () => ({
        licenseKey: "", // empty = free for localhost development
        project: {
          type: "email" as const,
          default: initialProjectData
            ? undefined
            : {
                pages: [{ component: DEFAULT_MJML }],
              },
        },
        gjsOptions: {
          canvasCss: CANVAS_CSS,
        },
        dataSources: {
          blocks: true,
          traitManager: true,
          styleManager: true,
          globalData: buildGlobalData(mergeTags),
          exportConfig: {
            skipTags: true,
            wrapTemplateContent: ({ content }: { content: string }) =>
              `<mj-raw>${content}</mj-raw>`,
          },
        },
        plugins: [createEmailBuilderPlugin(mergeTags)],
      }),
      [initialProjectData, mergeTags],
    );

    // Imperative handle
    useImperativeHandle(
      ref,
      () => ({
        getOutput: async (): Promise<EmailBuilderOutput> => {
          const editor = editorRef.current;
          if (!editor) {
            return { projectData: {} as ProjectData, html: "" };
          }
          const projectData = editor.getProjectData();
          let html = "";
          try {
            const result = editor.runCommand("mjml-code-to-html");
            html = typeof result === "string" ? result : (result?.html ?? "");
          } catch {
            html = editor.getHtml() + `<style>${editor.getCss()}</style>`;
          }
          return { projectData, html };
        },
        loadProject: (data: ProjectData) => {
          editorRef.current?.loadProjectData(data);
        },
      }),
      [],
    );

    const handleEditor = useCallback(
      (editor: Editor) => {
        editorRef.current = editor;

        if (initialProjectData) {
          editor.loadProjectData(initialProjectData);
        }

        if (onChange) {
          let debounceTimer: ReturnType<typeof setTimeout>;
          editor.on("update", () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              const projectData = editor.getProjectData();
              let html = "";
              try {
                const result = editor.runCommand("mjml-code-to-html");
                html =
                  typeof result === "string" ? result : (result?.html ?? "");
              } catch {
                html = editor.getHtml() + `<style>${editor.getCss()}</style>`;
              }
              onChange({ projectData, html });
            }, 500);
          });
        }
      },
      [initialProjectData, onChange],
    );

    const handleReady = useCallback(() => {
      onReady?.();
    }, [onReady]);

    const portalContent =
      sidebarPortalTarget && sidebarHeader ? <>{sidebarHeader}</> : null;

    return (
      <div
        className={`email-builder-root ${className ?? ""}`}
        style={{ display: "flex", height: "100%", flexDirection: "column" }}
      >
        {sidebarPortalTarget && portalContent
          ? createPortal(portalContent, sidebarPortalTarget)
          : sidebarHeader}

        <StudioEditor
          style={{ flex: 1, minHeight: 0 }}
          options={studioOptions}
          onEditor={handleEditor}
          onReady={handleReady}
        />
      </div>
    );
  },
);
