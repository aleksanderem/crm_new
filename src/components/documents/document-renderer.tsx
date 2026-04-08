import { generateHTML } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { TableRow } from "@tiptap/extension-table-row";
import {
  TableWithBorders as Table,
  TableHeaderBg as TableHeader,
  TableCellBg as TableCell,
} from "@/components/documents/table-cell-bg";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import Image from "@tiptap/extension-image";
import { PageBreakNode } from "@/components/documents/page-break-node";
import { FormFieldNode } from "@/components/documents/form-field-node";
import { HtmlBlockNode } from "@/components/documents/html-block-node";
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
  filledBy: string; // "employee" | "client"
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
  Image.configure({ inline: false, allowBase64: true }),
  PageBreakNode,
  FormFieldNode,
  HtmlBlockNode,
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
        filledBy: (node.attrs.filledBy as string) || "employee",
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

  // Resolve HTML blocks — inject raw HTML content
  doc.querySelectorAll("[data-html-block]").forEach((el) => {
    const content = el.getAttribute("data-content");
    if (content) {
      el.innerHTML = content;
      el.removeAttribute("data-content");
    }
  });

  // Resolve form fields
  if (formFieldValues) {
    doc.querySelectorAll("[data-form-field]").forEach((el) => {
      const fieldId = el.getAttribute("data-form-field");
      if (fieldId && formFieldValues[fieldId] !== undefined) {
        const fieldType = el.getAttribute("data-field-type") || "text";
        const value = formFieldValues[fieldId];

        if (fieldType === "checkbox") {
          const checked = value === "true";
          const label = el.getAttribute("label") || "";
          const wrapper = doc.createElement("span");
          wrapper.style.cssText =
            "display:inline-flex;align-items:center;gap:6px;";
          const box = doc.createElement("span");
          box.style.cssText = checked
            ? "display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border:1.5px solid #7C6AE8;border-radius:3px;background:#7C6AE8;color:#fff;font-size:11px;line-height:1;flex-shrink:0;"
            : "display:inline-block;width:16px;height:16px;border:1.5px solid #d1d5db;border-radius:3px;flex-shrink:0;";
          if (checked) box.textContent = "✓";
          wrapper.appendChild(box);
          if (label) {
            const labelEl = doc.createElement("span");
            labelEl.textContent = label;
            wrapper.appendChild(labelEl);
          }
          el.replaceWith(wrapper);
        } else {
          el.replaceWith(doc.createTextNode(value));
        }
      }
    });
  }

  return doc.body.innerHTML;
}
