import { generateHTML } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import { FormFieldNode } from "@/components/documents/form-field-node";
import {
  VariableMentionAt,
  VariableMentionCurly,
} from "@/components/gabinet/variable-mention";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
}

export interface ExtractedFormField {
  fieldId: string;
  fieldType: string;
  label: string;
  options: string;
  required: boolean;
  placeholder: string;
}

// ---------------------------------------------------------------------------
// Extensions list (same as the editor, needed for generateHTML)
// ---------------------------------------------------------------------------

const renderExtensions = [
  StarterKit,
  Underline,
  HorizontalRule,
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  Table.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
  FormFieldNode,
  VariableMentionAt,
  VariableMentionCurly,
];

// ---------------------------------------------------------------------------
// TipTap JSON extraction utilities
// ---------------------------------------------------------------------------

/** Extract all variable paths from TipTap JSON */
export function extractVariablePaths(json: TipTapNode): string[] {
  const paths: string[] = [];
  const walk = (node: TipTapNode) => {
    if (
      (node.type === "variableMentionAt" ||
        node.type === "variableMentionCurly") &&
      node.attrs?.id
    ) {
      paths.push(node.attrs.id as string);
    }
    if (node.content) node.content.forEach(walk);
  };
  walk(json);
  return [...new Set(paths)];
}

/** Extract all form field definitions from TipTap JSON */
export function extractFormFields(json: TipTapNode): ExtractedFormField[] {
  const fields: ExtractedFormField[] = [];
  const walk = (node: TipTapNode) => {
    if (node.type === "formField" && node.attrs) {
      fields.push({
        fieldId: (node.attrs.fieldId as string) || "",
        fieldType: (node.attrs.fieldType as string) || "text",
        label: (node.attrs.label as string) || "",
        options: (node.attrs.options as string) || "",
        required: (node.attrs.required as boolean) || false,
        placeholder: (node.attrs.placeholder as string) || "",
      });
    }
    if (node.content) node.content.forEach(walk);
  };
  walk(json);
  return fields;
}

// ---------------------------------------------------------------------------
// HTML rendering with variable/form-field resolution (DOMParser-based)
// ---------------------------------------------------------------------------

/**
 * Convert TipTap JSON to HTML, then replace variable and form-field nodes
 * with resolved values using DOMParser (never regex on HTML).
 */
export function renderDocument(
  contentJson: string,
  scopeData: Record<string, string>,
  formFieldValues?: Record<string, string>,
): string {
  const json = JSON.parse(contentJson);
  const html = generateHTML(json, renderExtensions);

  // Use DOMParser for reliable HTML manipulation
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Resolve variable mentions
  doc.querySelectorAll("[data-variable]").forEach((el) => {
    const path = el.getAttribute("data-variable");
    if (path && scopeData[path] !== undefined) {
      el.replaceWith(document.createTextNode(scopeData[path]));
    } else if (path) {
      el.replaceWith(document.createTextNode(`[${path}]`));
    }
  });

  // Resolve form fields
  if (formFieldValues) {
    doc.querySelectorAll("[data-form-field]").forEach((el) => {
      const fieldId = el.getAttribute("data-form-field");
      if (fieldId && formFieldValues[fieldId] !== undefined) {
        el.replaceWith(document.createTextNode(formFieldValues[fieldId]));
      }
    });
  }

  return doc.body.innerHTML;
}
