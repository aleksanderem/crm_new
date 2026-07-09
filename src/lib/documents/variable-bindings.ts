/**
 * Derive the `variableBindings` map for a form template from its TipTap
 * content JSON. Walks all `formField` nodes and collects, for every
 * client-filled field that has a patient mapping, `{ fieldId: target }`.
 *
 * `target` is the value stored on the node's `patientField` attribute:
 *   "builtin:<column>" | "custom:<fieldKey>".
 *
 * This is the single source of truth: the mapping lives on the field node in
 * the document, and is denormalised into `variableBindings` at save time so the
 * server-side write-back doesn't have to parse TipTap JSON.
 */
export function buildPatientVariableBindings(
  contentJson: string,
): string | undefined {
  let doc: unknown;
  try {
    doc = JSON.parse(contentJson);
  } catch {
    return undefined;
  }

  const bindings: Record<string, string> = {};

  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const n = node as { type?: string; attrs?: Record<string, unknown>; content?: unknown[] };
    if (n.type === "formField" && n.attrs) {
      const attrs = n.attrs;
      const fieldId = typeof attrs.fieldId === "string" ? attrs.fieldId : "";
      const patientField =
        typeof attrs.patientField === "string" ? attrs.patientField : "";
      const filledBy = attrs.filledBy ?? "client";
      if (fieldId && patientField && filledBy === "client") {
        bindings[fieldId] = patientField;
      }
    }
    if (Array.isArray(n.content)) {
      for (const child of n.content) walk(child);
    }
  };

  walk(doc);

  if (Object.keys(bindings).length === 0) return undefined;
  return JSON.stringify(bindings);
}
