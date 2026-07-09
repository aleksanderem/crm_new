/**
 * Lightweight TipTap JSON node type — only the fields we need here.
 */
interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
}

export interface IntakeFieldDefinition {
  fieldId: string;
  /** "text" | "textarea" | "select" | "button_select" | "date" | "checkbox" */
  fieldType: string;
  label: string;
}

/** Walk TipTap JSON and collect every formField node's key metadata. */
export function extractFieldDefinitions(contentJson: unknown): IntakeFieldDefinition[] {
  const fields: IntakeFieldDefinition[] = [];
  const walk = (node: TipTapNode) => {
    if (node.type === "formField" && node.attrs) {
      fields.push({
        fieldId: (node.attrs.fieldId as string) || "",
        fieldType: (node.attrs.fieldType as string) || "text",
        label: (node.attrs.label as string) || "",
      });
    }
    if (node.content) node.content.forEach(walk);
  };
  if (contentJson && typeof contentJson === "object") {
    walk(contentJson as TipTapNode);
  }
  return fields;
}

const BOOLEAN_TRUE = new Set(["true", "tak", "yes", "1"]);
const BOOLEAN_FALSE = new Set(["false", "nie", "no", "0"]);

/**
 * Build an ordered list of display strings from a signed Wywiad's field values.
 *
 * Rules:
 * - Checkbox fields where the patient answered true/TAK → just the label, e.g. "Cukrzyca"
 * - Non-empty text/textarea/select/button_select/date fields → "Label: value",
 *   e.g. "Alergie: penicylina". Explicit false/NIE answers are skipped.
 * - Empty values and unchecked checkboxes are always omitted.
 *
 * Field order matches the template's field order.
 */
export function extractIntakeSummary(
  fieldDefinitions: IntakeFieldDefinition[],
  formFieldValues: Record<string, string>,
): string[] {
  const result: string[] = [];

  for (const field of fieldDefinitions) {
    const raw = formFieldValues[field.fieldId];
    if (raw === undefined || raw === null || raw === "") continue;

    const trimmed = raw.trim();
    if (trimmed === "") continue;

    const normalized = trimmed.toLowerCase();
    const displayLabel = field.label || field.fieldId;

    if (field.fieldType === "checkbox") {
      if (BOOLEAN_TRUE.has(normalized)) {
        result.push(displayLabel);
      }
      // false / unchecked → skip
    } else {
      // text, textarea, select, button_select, date
      if (BOOLEAN_FALSE.has(normalized)) continue;
      result.push(`${displayLabel}: ${trimmed}`);
    }
  }

  return result;
}
