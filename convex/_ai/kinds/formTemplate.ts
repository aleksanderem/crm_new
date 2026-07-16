import type { AnalysisKind } from "../documentAnalyzer";

export type ParsedSegment =
  | { type: "text"; text: string }
  | { type: "field"; label: string;
      fieldType: "text"|"textarea"|"select"|"button_select"|"date"|"checkbox";
      options?: string[]; required?: boolean; patientFieldHint?: string | null };

export type ParsedBlock =
  | { type: "heading"; level: 1|2|3; text: string }
  | { type: "paragraph"; segments: ParsedSegment[] }
  | { type: "bulletList" | "orderedList"; items: ParsedSegment[][] };

export interface ParsedFormTemplate {
  title: string | null;
  blocks: ParsedBlock[];
  confidence: number | null;
}

const FIELD_TYPES = new Set(["text", "textarea", "select", "button_select", "date", "checkbox"]);
const BLOCK_TYPES = new Set(["heading", "paragraph", "bulletList", "orderedList"]);

function buildPrompt(context?: Record<string, unknown>): string {
  const patientFields = Array.isArray((context as { patientFields?: unknown })?.patientFields)
    ? ((context as { patientFields: Array<{ key: string; label: string }> }).patientFields)
    : [];
  const targets = patientFields.map((f) => `- "builtin:${f.key}" — ${f.label}`).join("\n");
  return `You are reconstructing a scanned paper form (typically Polish: consent forms, medical intake, GDPR) into a structured template. Return ONE JSON object:

{
  "title": string | null,
  "blocks": [
    { "type": "heading", "level": 1|2|3, "text": string }
    | { "type": "paragraph", "segments": Segment[] }
    | { "type": "bulletList" | "orderedList", "items": Segment[][] }
  ],
  "confidence": number
}

Segment = { "type": "text", "text": string }
        | { "type": "field", "label": string,
            "fieldType": "text"|"textarea"|"select"|"button_select"|"date"|"checkbox",
            "options"?: string[], "required"?: boolean, "patientFieldHint"?: string | null }

Rules:
- Reproduce ALL static text of the document verbatim (Polish stays Polish).
- Blank lines, dotted lines, underscores, empty boxes to be filled in → a "field" segment (NOT text).
- A group of mutually exclusive checkboxes/options → one "select" field with "options".
- A single yes/no checkbox → "checkbox". Larger empty areas for free writing → "textarea". Date slots (e.g. next to signature) → "date".
- "label" = the caption printed next to the blank (e.g. "Imię i nazwisko").
- patientFieldHint: ONLY when the blank clearly corresponds to one of these client-record targets, use EXACTLY one of the values below; otherwise null. Never invent other values.
${targets || "- (no targets available — always use null)"}
- Do NOT guess content that is not on the document. "confidence" is a 0-1 overall score.`;
}

function isSegment(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  if (s.type === "text") return typeof s.text === "string";
  if (s.type === "field") return typeof s.label === "string" && s.label.length > 0;
  return false;
}

function validate(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.blocks)) return false;
  for (const b of o.blocks as unknown[]) {
    if (!b || typeof b !== "object") return false;
    const blk = b as Record<string, unknown>;
    if (!BLOCK_TYPES.has(String(blk.type))) return false;
    if (blk.type === "heading" && typeof blk.text !== "string") return false;
    if (blk.type === "paragraph") {
      if (!Array.isArray(blk.segments) || !(blk.segments as unknown[]).every(isSegment)) return false;
    }
    if (blk.type === "bulletList" || blk.type === "orderedList") {
      if (!Array.isArray(blk.items)) return false;
      for (const item of blk.items as unknown[]) {
        if (!Array.isArray(item) || !(item as unknown[]).every(isSegment)) return false;
      }
    }
  }
  return true;
}

function mapSegment(s: Record<string, unknown>, allowed: Set<string>): ParsedSegment {
  if (s.type === "text") return { type: "text", text: String(s.text ?? "") };
  const rawHint = typeof s.patientFieldHint === "string" ? s.patientFieldHint : null;
  return {
    type: "field",
    label: String(s.label ?? ""),
    fieldType: FIELD_TYPES.has(String(s.fieldType)) ? (String(s.fieldType) as never) : "text",
    options: Array.isArray(s.options) ? (s.options as unknown[]).map(String) : undefined,
    required: s.required === true ? true : undefined,
    patientFieldHint: rawHint && allowed.has(rawHint) ? rawHint : null,
  };
}

function map(raw: unknown, opts: { rawJson: string; context?: Record<string, unknown> }): ParsedFormTemplate {
  const o = raw as Record<string, unknown>;
  const patientFields = Array.isArray((opts.context as { patientFields?: unknown })?.patientFields)
    ? ((opts.context as { patientFields: Array<{ key: string }> }).patientFields)
    : [];
  const allowed = new Set(patientFields.map((f) => `builtin:${f.key}`));
  const blocks: ParsedBlock[] = [];
  for (const b of (o.blocks as Array<Record<string, unknown>>)) {
    if (b.type === "heading") {
      const lvl = Number(b.level);
      blocks.push({ type: "heading", level: (lvl === 2 || lvl === 3 ? lvl : 1) as 1|2|3, text: String(b.text ?? "") });
    } else if (b.type === "paragraph") {
      blocks.push({ type: "paragraph", segments: (b.segments as Array<Record<string, unknown>>).map((s) => mapSegment(s, allowed)) });
    } else {
      blocks.push({
        type: b.type as "bulletList" | "orderedList",
        items: (b.items as Array<Array<Record<string, unknown>>>).map((item) => item.map((s) => mapSegment(s, allowed))),
      });
    }
  }
  const conf = Number(o.confidence);
  return {
    title: typeof o.title === "string" && o.title ? o.title : null,
    blocks,
    confidence: Number.isFinite(conf) ? conf : null,
  };
}

export const formTemplateKind: AnalysisKind<ParsedFormTemplate> = {
  id: "form_template",
  maxTokens: 8192,
  buildPrompt,
  validate,
  map,
};
