// ---------------------------------------------------------------------------
// Email Builder — Merge Tags Plugin for GrapesJS
// ---------------------------------------------------------------------------
// Uses the built-in DataSources API (GrapesJS 0.22+) to register merge-tag
// groups, and adds an RTE toolbar dropdown so users can insert merge tags
// inline within text blocks (e.g. mj-text).
//
// Each group (e.g. "contact", "org") becomes a DataSource. Record values
// are the merge-tag strings themselves (e.g. "{{contact.firstName}}") so
// they pass through MJML compilation as literal text.
// ---------------------------------------------------------------------------

import type { Editor } from "grapesjs";
import type { MergeTagGroup } from "./types";

export interface MergeTagsPluginOptions {
  /** Merge-tag groups to register. */
  groups: MergeTagGroup[];
}

/**
 * GrapesJS plugin that adds merge-tag support via DataSources + RTE toolbar:
 * 1. Registers each group as a DataSource
 * 2. Adds a dropdown to the Rich Text Editor toolbar for inline insertion
 * 3. Injects canvas CSS to visually distinguish inserted merge tags
 */
export function mergeTagsPlugin(
  editor: Editor,
  options: MergeTagsPluginOptions,
): void {
  const { groups } = options;
  if (!groups.length) return;

  const dsm = editor.DataSources;

  // 1. Register each group as a DataSource
  for (const group of groups) {
    const record: { id: string; [key: string]: string } = { id: "data" };
    for (const field of group.fields) {
      record[field.key] = `{{${group.key}.${field.key}}}`;
    }

    if (dsm.get(group.key)) {
      dsm.remove(group.key);
    }

    dsm.add({
      id: group.key,
      skipFromStorage: true,
      records: [record],
    });
  }

  // 2. Build the <select> dropdown HTML for the RTE toolbar
  const selectHtml = buildSelectHtml(groups);

  // 3. Register the RTE toolbar action.
  //    `globalRte` is only available after the editor is rendered (postRender).
  //    We register on multiple events to catch the earliest opportunity.
  let rteRegistered = false;
  const registerRteAction = () => {
    if (rteRegistered) return;
    const rte = editor.RichTextEditor;
    // globalRte must exist for add() to work
    if (!(rte as unknown as { globalRte: unknown }).globalRte) return;
    rteRegistered = true;

    rte.add("merge-tags", {
      icon: selectHtml,
      event: "change",
      result: (
        rteInstance: { insertHTML: (html: string) => void },
        action: { btn: HTMLElement | undefined },
      ) => {
        if (!action.btn) return;
        const select = action.btn.querySelector(
          "select",
        ) as HTMLSelectElement | null;
        if (!select || !select.value) return;

        const tag = select.value;
        const html = `<span data-merge-tag="${tag}" style="background-color:rgba(123,105,229,0.15);border:1px dashed rgba(123,105,229,0.4);border-radius:4px;padding:1px 5px;white-space:nowrap;font-size:inherit;" contenteditable="false">${tag}</span>&nbsp;`;
        rteInstance.insertHTML(html);

        select.value = "";
      },
    });
  };

  // Try on load (editor rendered) and on first RTE activation as fallback
  editor.on("load", registerRteAction);
  editor.on("rte:enable", registerRteAction);

  // 4. Style merge-tag spans in the canvas iframe
  const injectCanvasStyles = () => {
    const frame = editor.Canvas?.getFrameEl?.();
    const doc = frame?.contentDocument;
    if (!doc) return;

    const STYLE_ID = "merge-tag-styles";
    if (doc.getElementById(STYLE_ID)) return;

    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      [data-merge-tag] {
        background-color: rgba(123, 105, 229, 0.15);
        border: 1px dashed rgba(123, 105, 229, 0.4);
        border-radius: 4px;
        padding: 1px 5px;
        white-space: nowrap;
        font-size: inherit;
        cursor: default;
      }
      [data-gjs-type="data-variable"] {
        background-color: rgba(123, 105, 229, 0.15);
        border: 1px dashed rgba(123, 105, 229, 0.4);
        border-radius: 4px;
        padding: 1px 5px;
        white-space: nowrap;
        display: inline-block;
        min-width: 20px;
        font-size: inherit;
      }
    `;
    doc.head.appendChild(style);
  };

  editor.on("canvas:frame:load", injectCanvasStyles);
  editor.once("load", () => setTimeout(injectCanvasStyles, 200));
}

/** Build a grouped <select> dropdown for the RTE toolbar. */
function buildSelectHtml(groups: MergeTagGroup[]): string {
  let html = `<select class="gjs-field" style="min-width:140px;font-size:12px;padding:2px 4px;">`;
  html += `<option value="">{{ Wstaw zmienną }}</option>`;
  for (const group of groups) {
    html += `<optgroup label="${escapeHtml(group.label)}">`;
    for (const field of group.fields) {
      const tag = `{{${group.key}.${field.key}}}`;
      html += `<option value="${escapeHtml(tag)}">${escapeHtml(field.label)}</option>`;
    }
    html += `</optgroup>`;
  }
  html += `</select>`;
  return html;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Build flat merge-tags config for external use (e.g. subject line pickers).
 * Returns a record like { "patient_firstName": { name, value } }.
 */
export function buildMergeTagsFlat(
  groups: MergeTagGroup[],
): Record<string, { name: string; value: string }> {
  const tags: Record<string, { name: string; value: string }> = {};
  for (const group of groups) {
    for (const field of group.fields) {
      const key = `${group.key}_${field.key}`;
      tags[key] = {
        name: `${group.label} › ${field.label}`,
        value: `{{${group.key}.${field.key}}}`,
      };
    }
  }
  return tags;
}
