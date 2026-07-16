/**
 * Maps a ParsedFormTemplate (AI analysis result, kind "form_template") to a
 * TipTap content_json string using the existing formField inline nodes.
 *
 * Input types are declared locally (structurally identical to
 * convex/_ai/kinds/formTemplate.ts) so the frontend bundle does not import
 * backend modules; the shape is validated server-side by the kind anyway.
 */
import { slugifyFieldKey } from "./patient-mappable-fields";

export interface ParsedTemplateFieldSegment {
  type: "field";
  label: string;
  fieldType: "text" | "textarea" | "select" | "button_select" | "date" | "checkbox";
  options?: string[];
  required?: boolean;
  patientFieldHint?: string | null;
}
export type ParsedTemplateSegment = { type: "text"; text: string } | ParsedTemplateFieldSegment;
export type ParsedTemplateBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; segments: ParsedTemplateSegment[] }
  | { type: "bulletList" | "orderedList"; items: ParsedTemplateSegment[][] };
export interface ParsedFormTemplateInput {
  title: string | null;
  blocks: ParsedTemplateBlock[];
  confidence: number | null;
}

type TipTapNode = { type: string; attrs?: Record<string, unknown>; content?: TipTapNode[]; text?: string };

function segmentsToInline(segments: ParsedTemplateSegment[], usedIds: Set<string>): TipTapNode[] {
  const out: TipTapNode[] = [];
  for (const seg of segments) {
    if (seg.type === "text") {
      if (seg.text) out.push({ type: "text", text: seg.text });
      continue;
    }
    let fieldId = slugifyFieldKey(seg.label) || "pole";
    let n = 2;
    while (usedIds.has(fieldId)) fieldId = `${slugifyFieldKey(seg.label) || "pole"}_${n++}`;
    usedIds.add(fieldId);
    out.push({
      type: "formField",
      attrs: {
        fieldId,
        fieldType: seg.fieldType,
        label: seg.label,
        options: (seg.options ?? []).join(", "),
        required: seg.required === true,
        placeholder: "",
        filledBy: "client",
        patientField: seg.patientFieldHint ?? "",
      },
    });
  }
  return out;
}

export function parsedTemplateToTipTap(parsed: ParsedFormTemplateInput): string {
  const usedIds = new Set<string>();
  const content: TipTapNode[] = [];
  for (const block of parsed.blocks) {
    if (block.type === "heading") {
      content.push({
        type: "heading",
        attrs: { level: block.level },
        content: block.text ? [{ type: "text", text: block.text }] : [],
      });
    } else if (block.type === "paragraph") {
      content.push({ type: "paragraph", content: segmentsToInline(block.segments, usedIds) });
    } else {
      content.push({
        type: block.type,
        content: block.items.map((item) => ({
          type: "listItem",
          content: [{ type: "paragraph", content: segmentsToInline(item, usedIds) }],
        })),
      });
    }
  }
  return JSON.stringify({ type: "doc", content });
}
