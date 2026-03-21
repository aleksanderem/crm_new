# TipTap Document Template Editor — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a WYSIWYG document template editor using the existing TipTap setup, with inline variable chips and form field nodes, replacing the PDFme-only approach for rich-text document templates.

**Architecture:** Extend the existing TipTap `TemplateEditor` (`src/components/gabinet/template-editor.tsx`) and `VariableMention` extensions (`src/components/gabinet/variable-mention.tsx`) into a full document template editor. Add a `FormFieldNode` TipTap extension for inline form fields. Add a `templateType` discriminator to `formTemplates` schema so PDFme templates and TipTap document templates coexist. The TipTap editor stores content as TipTap JSON (via `editor.getJSON()`) in a new `contentJson` field on `formTemplates` — this avoids semantic overload of `formJson` (which holds PDFme template JSON) and enables robust programmatic manipulation. For rendering, use `generateHTML()` from `@tiptap/html`. Document generation resolves variables from the existing `scopeResolver.ts`, renders form fields into a dynamic form, merges values into the HTML, and exports via the existing `pdf-export.tsx` browser-print path.

**Key design decisions:**
- TipTap JSON storage instead of HTML: avoids fragile regex parsing, enables reliable variable/form-field extraction via JSON traversal, and round-trips losslessly through TipTap.
- Separate `contentJson` field instead of overloading `formJson`: prevents runtime crashes from code that calls `JSON.parse(formJson)` expecting PDFme structure.
- Ref-based variable list for TipTap mention extensions: allows changing entity types without destroying the editor instance.
- DOMParser-based HTML processing for final rendering (never regex on HTML).

**Tech Stack:** TipTap v3.20 (already installed: starter-kit, tables, mention, text-align, underline, horizontal-rule), Convex, React, TanStack Router, shadcn/ui, existing variable system (`src/lib/pdfme/variables.ts` + `convex/documents/scopeResolver.ts`)

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `convex/schema/documents.ts` | Add `templateType` + `contentJson` fields to `formTemplates` |
| Modify | `convex/documents/templates.ts` | Accept `templateType`/`contentJson` in create/update |
| Modify | `convex/documents/generate.ts` | Extend `previewDocumentData` to return template content for document types |
| Modify | `convex/documents/seed.ts` | Add sample document-type template for testing |
| Modify | `src/components/gabinet/variable-mention.tsx` | Expand to full `VARIABLE_REGISTRY`, ref-based dynamic entity types, remove `@ts-nocheck` |
| Create | `src/components/documents/document-template-editor.tsx` | Full TipTap document editor with toolbar, variable picker sidebar, form field insertion |
| Create | `src/components/documents/form-field-node.tsx` | TipTap `FormFieldNode` extension — inline form field with popover config |
| Create | `src/components/documents/document-renderer.tsx` | TipTap JSON → HTML conversion, variable resolution, form field extraction |
| Create | `src/components/documents/document-form-filler.tsx` | Dynamic form for filling extracted form fields before final render |
| Create | `src/components/documents/document-viewer.tsx` | Read-only HTML viewer for completed documents |
| Modify | `src/components/documents/generate-document-dialog.tsx` | Support `templateType: "document"` in template picker + generation flow |
| Modify | `src/components/documents/entity-documents-tab.tsx` | Support viewing document-type templates |
| Create | `src/routes/_app/_auth/dashboard/_layout.document-editor.new.tsx` | New document template editor route |
| Create | `src/routes/_app/_auth/dashboard/_layout.document-editor.$id.tsx` | Edit document template route |
| Modify | `src/routes/_app/_auth/dashboard/_layout.settings.form-templates.index.tsx` | Add "New document template" button linking to document editor |
| Modify | `public/locales/pl/translation.json` | Add Polish translations for new UI strings |
| Modify | `public/locales/en/translation.json` | Add English translations for new UI strings |

---

## Task 1: Schema — Add `templateType` discriminator

**Files:**
- Modify: `convex/schema/documents.ts:40-79`
- Modify: `convex/documents/templates.ts`

This task adds a `templateType` field to `formTemplates` so PDFme form templates and TipTap document templates can coexist in the same table and folder tree. Existing templates default to `"pdfme"`.

- [ ] **Step 1: Add `templateType` and `contentJson` to schema**

In `convex/schema/documents.ts`, add to `formTemplates` table definition after `folderPath`:

```typescript
// Template type: "pdfme" for PDF form templates, "document" for TipTap WYSIWYG templates
templateType: v.optional(v.union(v.literal("pdfme"), v.literal("document"))),
// TipTap JSON content for document-type templates (editor.getJSON() output)
contentJson: v.optional(v.string()),
```

Using `v.optional` so existing records without the field remain valid (treated as `"pdfme"`). The `contentJson` field stores TipTap editor JSON (not HTML) to enable robust programmatic manipulation. The existing `formJson` field continues to hold PDFme template JSON for pdfme-type templates.

- [ ] **Step 2: Update `templates.ts` create mutation**

In `convex/documents/templates.ts`, add these to the `create` mutation args:
```typescript
templateType: v.optional(v.union(v.literal("pdfme"), v.literal("document"))),
contentJson: v.optional(v.string()),
```
For document-type templates, `formJson` can be an empty string `""` since the content lives in `contentJson`. Pass both through to `ctx.db.insert`.

- [ ] **Step 3: Update `templates.ts` update mutation**

Add the same fields to the `update` mutation args. When `contentJson` changes, bump `version` (same logic as `formJson` changes).

- [ ] **Step 4: Add `listDocumentTemplates` query**

Add a new query that filters for document-type templates:

```typescript
export const listDocumentTemplates = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const all = await ctx.db
      .query("formTemplates")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    return all.filter((t) => t.templateType === "document" && t.isActive);
  },
});
```

- [ ] **Step 5: Commit**

```bash
git add convex/schema/documents.ts convex/documents/templates.ts
git commit -m "feat(schema): add templateType discriminator to formTemplates"
```

---

## Task 2: Expand variable mention system

**Files:**
- Modify: `src/components/gabinet/variable-mention.tsx`

The current `TEMPLATE_VARIABLES` array has only 7 variables (patient + system). Expand it to use the full `VARIABLE_REGISTRY` from `src/lib/pdfme/variables.ts` and make entity types configurable.

- [ ] **Step 0: Remove `@ts-nocheck` directive**

The file currently has `// @ts-nocheck` on line 1. Remove it and fix all resulting type errors during this refactor. This prevents the `@ts-nocheck` from masking errors introduced during the refactoring.

- [ ] **Step 1: Refactor variable-mention.tsx to use VARIABLE_REGISTRY**

Replace the hardcoded `TEMPLATE_VARIABLES` array with a function that pulls from `VARIABLE_REGISTRY`:

```typescript
import {
  VARIABLE_REGISTRY,
  CATEGORY_LABELS,
  getVariablesForEntityTypes,
  type VariableField,
} from "@/lib/pdfme/variables";

// Convert VariableField[] to TemplateVariable[] for backward compat
function registryToTemplateVariables(entityTypes: string[]): TemplateVariable[] {
  const fields = getVariablesForEntityTypes(entityTypes);
  return fields.map((f) => ({
    key: f.path,
    label: f.label,
    category: f.category as TemplateVariableCategory,
    aliases: [],
  }));
}
```

Keep `TEMPLATE_VARIABLES` as a default export using all entity types for backward compat.

- [ ] **Step 2: Create ref-based dynamic mention extensions**

Instead of a factory that creates new extensions per call (which would require re-creating the editor), use a mutable ref that the `items` callback reads from. This lets entity types change without destroying the TipTap editor instance:

```typescript
// Shared mutable ref that suggestion callbacks read from
export const variableListRef: { current: TemplateVariable[] } = {
  current: registryToTemplateVariables(Object.keys(VARIABLE_REGISTRY)),
};

// Update the ref when entity types change — call from React component via useEffect
export function updateVariableList(entityTypes: string[]) {
  variableListRef.current = registryToTemplateVariables(entityTypes);
}
```

Update `VariableMentionAt` and `VariableMentionCurly` to read from the ref:

```typescript
export const VariableMentionAt = Mention.extend({
  name: "variableMentionAt",
}).configure({
  ...commonConfig,
  HTMLAttributes: { class: "template-variable-chip" },
  suggestion: {
    char: "@",
    items: ({ query }: { query: string }) => findVariables(query, variableListRef.current),
    render: createSuggestionList((q) => q),
  },
});
```

Update `findVariables` to accept a `variables` parameter instead of using the global constant.

- [ ] **Step 3: Update TEMPLATE_VARIABLE_CATEGORIES**

Expand from 4 categories (patient/appointment/organization/system) to include all categories from `CATEGORY_LABELS`:

```typescript
export const TEMPLATE_VARIABLE_CATEGORIES = Object.entries(CATEGORY_LABELS).map(
  ([id, labels]) => ({ id, label: labels.pl })
);
```

- [ ] **Step 4: Verify existing TemplateEditor still works**

The existing `TemplateEditor` in `template-editor.tsx` imports `VariableMentionAt`, `VariableMentionCurly`, `TEMPLATE_VARIABLES`, and `TEMPLATE_VARIABLE_CATEGORIES` from `variable-mention.tsx`. Ensure these exports still exist and work with the default full variable set.

- [ ] **Step 5: Commit**

```bash
git add src/components/gabinet/variable-mention.tsx
git commit -m "feat(variables): expand variable mentions to full registry with configurable entity types"
```

---

## Task 3: FormFieldNode TipTap extension

**Files:**
- Create: `src/components/documents/form-field-node.tsx`

A custom TipTap Node extension that renders inline form field placeholders in the editor. Each field has a type (text/textarea/select/date/checkbox), label, and optional configuration.

- [ ] **Step 1: Create the TipTap Node extension**

Note: `@tiptap/core` is a transitive dependency — add it as a direct dependency in `package.json` if not already present.

```typescript
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";

// The TipTap node schema
export const FormFieldNode = Node.create({
  name: "formField",
  group: "inline",
  inline: true,
  atom: true, // non-editable, treated as single unit

  addAttributes() {
    return {
      fieldId: { default: "" },
      fieldType: { default: "text" }, // text | textarea | select | date | checkbox
      label: { default: "" },
      options: { default: "" }, // comma-separated for select type
      required: { default: false },
      placeholder: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-form-field]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, {
      "data-form-field": HTMLAttributes.fieldId,
      "data-field-type": HTMLAttributes.fieldType,
      class: "inline-flex items-center rounded border border-dashed border-orange-300 bg-orange-50 px-2 py-0.5 text-xs text-orange-700 dark:border-orange-600 dark:bg-orange-950 dark:text-orange-300",
      contenteditable: "false",
    }), `[${HTMLAttributes.label || HTMLAttributes.fieldId}]`];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FormFieldNodeView);
  },
});
```

- [ ] **Step 2: Create the React NodeView component**

```typescript
function FormFieldNodeView({ node, updateAttributes, selected }: ReactNodeViewProps) {
  const [configOpen, setConfigOpen] = useState(false);
  const { fieldId, fieldType, label, options, required } = node.attrs;

  return (
    <NodeViewWrapper as="span" className="inline">
      <Popover open={configOpen} onOpenChange={setConfigOpen}>
        <PopoverTrigger asChild>
          <span
            className={cn(
              "inline-flex cursor-pointer items-center gap-1 rounded border border-dashed px-2 py-0.5 text-xs transition-colors",
              "border-orange-300 bg-orange-50 text-orange-700",
              "dark:border-orange-600 dark:bg-orange-950 dark:text-orange-300",
              selected && "ring-2 ring-primary",
            )}
          >
            <FormFieldIcon type={fieldType} />
            {label || fieldId || "Field"}
            {required && <span className="text-red-500">*</span>}
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-72">
          <FormFieldConfig
            attrs={node.attrs}
            onChange={updateAttributes}
            onClose={() => setConfigOpen(false)}
          />
        </PopoverContent>
      </Popover>
    </NodeViewWrapper>
  );
}
```

- [ ] **Step 3: Create FormFieldConfig popover content**

A small form inside the popover with fields: Label (Input), Field ID (Input, auto-generated from label), Type (Select: text/textarea/select/date/checkbox), Options (Input, shown only for select type), Required (Switch), Placeholder (Input).

- [ ] **Step 4: Add toolbar command for inserting form fields**

Export a helper that inserts a form field into the editor:

```typescript
export function insertFormField(editor: Editor, attrs?: Partial<FormFieldAttrs>) {
  const fieldId = attrs?.fieldId || `field_${crypto.randomUUID().slice(0, 8)}`;
  editor.chain().focus().insertContent({
    type: "formField",
    attrs: { fieldId, fieldType: "text", label: "New field", ...attrs },
  }).run();
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/documents/form-field-node.tsx
git commit -m "feat: add FormFieldNode TipTap extension with inline config popover"
```

---

## Task 4: Document Template Editor component

**Files:**
- Create: `src/components/documents/document-template-editor.tsx`

The full-featured WYSIWYG editor combining TipTap with variable picker sidebar and form field insertion. This extends the pattern from `template-editor.tsx` but is a more complete, production-grade editor.

- [ ] **Step 1: Create the editor component shell**

```typescript
interface DocumentTemplateEditorProps {
  value: string; // HTML content
  onChange: (html: string) => void;
  entityTypes: string[];
  className?: string;
}

export interface DocumentTemplateEditorHandle {
  getHTML: () => string;
  insertVariable: (path: string) => void;
  insertFormField: (attrs?: Partial<FormFieldAttrs>) => void;
}
```

The component creates a TipTap editor with:
- `StarterKit` (headings, bold, italic, lists, blockquote, code, HR)
- `Underline`
- `TextAlign` (paragraph, heading)
- `Table`, `TableRow`, `TableHeader`, `TableCell`
- `HorizontalRule`
- `FormFieldNode` (from Task 3)
- Dynamic `VariableMentionAt` + `VariableMentionCurly` (from Task 2's factory, configured with `entityTypes`)

- [ ] **Step 2: Build the toolbar**

Toolbar sections:
1. Text formatting: Bold, Italic, Underline
2. Headings: H1, H2, H3
3. Lists: Bullet, Ordered
4. Alignment: Left, Center, Right
5. Insert: Table, HR, Variable (opens picker), Form Field (inserts blank form field node)

Use `Button` from `@/components/ui/button` with `variant="ghost"` and active state highlighting, matching the pattern in `template-editor.tsx`.

- [ ] **Step 3: Add variable picker integration**

Reuse `VariablePicker` from `src/components/documents/variable-picker.tsx` as a collapsible sidebar panel. Wire `onAddVariable` to `editor.insertVariable(variable.path)` via imperative handle. Track `usedPaths` by scanning the editor content for `variableMentionAt` and `variableMentionCurly` nodes.

- [ ] **Step 4: Add form field insertion UI**

Add a "Form field" button to the toolbar insert section. Clicking it calls `insertFormField(editor)` from the `FormFieldNode` extension, which inserts a default form field node at the cursor. User then clicks the chip to configure it via popover.

- [ ] **Step 5: Handle content serialization**

On every TipTap `onUpdate`, call `editor.getHTML()` and pass to `onChange`. The HTML includes variable chips as `<span data-variable="patient.firstName" ...>{{patient.firstName}}</span>` and form fields as `<span data-form-field="fieldId" data-field-type="text" ...>[Label]</span>`.

- [ ] **Step 6: Add CSS for editor content**

Add Tailwind-compatible prose styles for the editor content area, matching the existing pattern:
```
[&_.ProseMirror]:min-h-[400px] [&_.ProseMirror]:outline-none
[&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:bg-muted [&_th]:p-2
```

- [ ] **Step 7: Commit**

```bash
git add src/components/documents/document-template-editor.tsx
git commit -m "feat: add DocumentTemplateEditor with toolbar, variables, and form fields"
```

---

## Task 5: Document editor routes

**Files:**
- Create: `src/routes/_app/_auth/dashboard/_layout.document-editor.new.tsx`
- Create: `src/routes/_app/_auth/dashboard/_layout.document-editor.$id.tsx`
- Modify: `src/routes/_app/_auth/dashboard/_layout.settings.form-templates.index.tsx`

Follow the same layout pattern as `_layout.form-editor.new.tsx` (full viewport, topbar with save/settings, sidebar with variable picker, main area with editor).

- [ ] **Step 1: Create new template route**

Structure:
- Top bar: Back button, template name input, Settings button (opens `TemplateSettingsSheet`), Save button
- Left sidebar (collapsible): `VariablePicker` wired to `documentEditorRef.insertVariable`
- Main area: `DocumentTemplateEditor` (from Task 4)

On save, call `api.documents.templates.create` with `templateType: "document"`, `contentJson: JSON.stringify(editor.getJSON())`, and `formJson: ""` (empty string since PDFme content is not applicable).

- [ ] **Step 2: Create edit template route**

Same as new route but loads existing template via `api.documents.templates.getById`, initializes editor with `template.contentJson` (the stored TipTap JSON, parsed via `JSON.parse` and passed to `editor.setContent()`), shows version badge.

- [ ] **Step 3: Add "New document template" button to template list**

In `_layout.settings.form-templates.index.tsx`, add a second button or dropdown option "New document template" that navigates to `/dashboard/document-editor/new`.

- [ ] **Step 4: Verify routes generate correctly**

Run `npx tsr generate` (TanStack Router code generation) and verify no errors.

- [ ] **Step 5: Commit**

```bash
git add src/routes/_app/_auth/dashboard/_layout.document-editor.new.tsx \
        src/routes/_app/_auth/dashboard/_layout.document-editor.$id.tsx \
        src/routes/_app/_auth/dashboard/_layout.settings.form-templates.index.tsx \
        src/routeTree.gen.ts
git commit -m "feat: add document editor routes for TipTap-based templates"
```

---

## Task 6: Document renderer — variable resolution

**Files:**
- Create: `src/components/documents/document-renderer.tsx`

Utilities to process TipTap JSON and rendered HTML for document generation. Two-phase approach: extract data from TipTap JSON (reliable, structured), resolve values in rendered HTML via DOMParser (never regex on HTML).

- [ ] **Step 1: Create TipTap JSON extraction utilities**

Since content is stored as TipTap JSON (from `editor.getJSON()`), extraction operates on the structured JSON tree — much more reliable than parsing HTML with regex.

```typescript
import { generateHTML } from "@tiptap/html";
// Import the same extensions used by the editor to ensure correct HTML generation

interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
}

/** Extract all variable paths from TipTap JSON */
export function extractVariablePaths(json: TipTapNode): string[] {
  const paths: string[] = [];
  const walk = (node: TipTapNode) => {
    if ((node.type === "variableMentionAt" || node.type === "variableMentionCurly") && node.attrs?.id) {
      paths.push(node.attrs.id as string);
    }
    if (node.content) node.content.forEach(walk);
  };
  walk(json);
  return [...new Set(paths)];
}

/** Extract all form field definitions from TipTap JSON */
export interface ExtractedFormField {
  fieldId: string;
  fieldType: string;
  label: string;
  options: string;
  required: boolean;
  placeholder: string;
}

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
```

- [ ] **Step 2: Create HTML resolution functions using DOMParser**

After converting TipTap JSON to HTML via `generateHTML()`, resolve variables and form fields using proper DOM manipulation (never regex):

```typescript
/** Convert TipTap JSON to HTML, then replace variable/form-field nodes with resolved values */
export function renderDocument(
  contentJson: string,
  extensions: any[], // TipTap extensions for generateHTML
  scopeData: Record<string, string>,
  formFieldValues?: Record<string, string>,
): string {
  const json = JSON.parse(contentJson);
  const html = generateHTML(json, extensions);

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
```
```

- [ ] **Step 3: Commit**

```bash
git add src/components/documents/document-renderer.tsx
git commit -m "feat: add document renderer utilities for variable/form field resolution"
```

---

## Task 7: Document form filler component

**Files:**
- Create: `src/components/documents/document-form-filler.tsx`

When a document template contains form field nodes, the generation flow needs to show a form for the user to fill before generating the final document.

- [ ] **Step 1: Create the form filler component**

```typescript
interface DocumentFormFillerProps {
  formFields: ExtractedFormField[];
  prefilledData: Record<string, string>; // auto-resolved variable values
  templateHtml: string;
  onComplete: (fieldValues: Record<string, string>) => void;
  onCancel: () => void;
}
```

The component renders:
1. A summary of auto-filled variables (read-only, grouped by category)
2. A form with inputs for each extracted form field (text/textarea/select/date/checkbox)
3. Submit button that calls `onComplete` with the filled values

Use TanStack Form + Zod for validation (matching existing patterns in the codebase). Field types map to:
- `text` → `Input`
- `textarea` → `Textarea`
- `select` → `Select` with options from `field.options` (comma-separated)
- `date` → date picker (from `@/components/application/date-picker`)
- `checkbox` → `Switch`

- [ ] **Step 2: Commit**

```bash
git add src/components/documents/document-form-filler.tsx
git commit -m "feat: add DocumentFormFiller for form field completion during generation"
```

---

## Task 8: Document viewer component

**Files:**
- Create: `src/components/documents/document-viewer.tsx`

Read-only viewer for completed document-type templates. Renders the resolved HTML with signature data.

- [ ] **Step 1: Create document viewer**

```typescript
interface DocumentViewerProps {
  html: string; // resolved HTML with all variables and form fields filled
  signatureData?: string;
  signedAt?: number;
  className?: string;
}
```

Renders the resolved HTML in a styled `<div>` with A4-like proportions, prose typography, and optional signature image + timestamp at the bottom. Uses `dangerouslySetInnerHTML` with sanitization (DOMPurify or the existing pattern from the codebase).

- [ ] **Step 2: Add PDF export integration**

Reuse the existing `PdfExportButton` from `src/components/documents/pdf-export.tsx` which already accepts HTML content and triggers `window.print()` via an iframe. Wire it into the viewer header.

- [ ] **Step 3: Commit**

```bash
git add src/components/documents/document-viewer.tsx
git commit -m "feat: add DocumentViewer for rendered document-type templates"
```

---

## Task 9: Generation flow integration

**Files:**
- Modify: `convex/documents/generate.ts`
- Modify: `src/components/documents/generate-document-dialog.tsx`
- Modify: `src/components/documents/entity-documents-tab.tsx`

Integrate document-type templates into the existing generation dialog and entity documents tab.

- [ ] **Step 1: Extend existing `previewDocumentData` query**

Instead of adding a new query, extend the existing `previewDocumentData` in `convex/documents/generate.ts` to also return the template's `contentJson` and `templateType`. This avoids API surface duplication:

```typescript
// Add to the return value:
return {
  prefilledData,
  scopeData,
  templateType: template.templateType ?? "pdfme",
  contentJson: template.contentJson, // undefined for pdfme types
};
```

The `generateDocument` mutation needs no changes — `responseData` already accepts any JSON string. For document-type templates, the frontend will store `JSON.stringify({ html: resolvedHtml, formFieldValues })` in `responseData`.

- [ ] **Step 2: Update generate dialog for document templates**

In `generate-document-dialog.tsx`, the Step 2 component must branch BEFORE mounting `SurveyFormRenderer` (not inside it) — otherwise `SurveyFormRenderer` will try to parse HTML/TipTap JSON as PDFme JSON and crash.

When the selected template has `templateType === "document"`:

1. Step 2 uses the same `previewDocumentData` query (which now returns `templateType` and `contentJson`)
2. Uses `extractFormFields()` from `document-renderer.tsx` on the TipTap JSON to check if form fields exist
3. If form fields exist: renders `DocumentFormFiller` with pre-filled variables and form field inputs
4. If no form fields: renders a preview of the resolved HTML with auto-filled variables and a "Generate" button
5. On complete: resolves both variables and form field values into the HTML, calls `generateDocument` with `responseData: JSON.stringify({ html: resolvedHtml, formFieldValues })`.

The template picker in Step 1 already loads all templates (PDFme and document types share the same table). Add a visual indicator (icon/badge) to distinguish template types in the tree.

- [ ] **Step 3: Update entity documents tab for document viewing**

In `entity-documents-tab.tsx`, when viewing a document whose template has `templateType === "document"`:
- Parse `responseData` as `{ html, formFieldValues }`
- Render `DocumentViewer` with the resolved HTML instead of `SurveyFormViewer`
- Use `PdfExportButton` (from `pdf-export.tsx`, not the PDFme one) for PDF export

- [ ] **Step 4: Commit**

```bash
git add convex/documents/generate.ts \
        src/components/documents/generate-document-dialog.tsx \
        src/components/documents/entity-documents-tab.tsx
git commit -m "feat: integrate document-type templates into generation dialog and viewer"
```

---

## Task 10: Template list page integration

**Files:**
- Modify: `src/routes/_app/_auth/dashboard/_layout.settings.form-templates.index.tsx`

- [ ] **Step 1: Add document template indicator**

In the template tree, show a different icon for document-type templates (e.g. a document icon instead of a form icon). Add the `templateType` to the tree node data.

- [ ] **Step 2: Route edit action correctly**

When clicking "Edit" on a template in the tree:
- If `templateType === "document"`: navigate to `/dashboard/document-editor/{id}`
- If `templateType === "pdfme"` or undefined: navigate to `/dashboard/form-editor/{id}` (existing behavior)

- [ ] **Step 3: Add dropdown for template creation**

Replace or augment the "Nowy szablon" button with a dropdown:
- "Formularz PDF" → `/dashboard/form-editor/new` (existing)
- "Dokument" → `/dashboard/document-editor/new` (new)

- [ ] **Step 4: Commit**

```bash
git add src/routes/_app/_auth/dashboard/_layout.settings.form-templates.index.tsx
git commit -m "feat: distinguish document vs form templates in template list"
```

---

## Summary of data flow

### Template creation
1. User navigates to `/dashboard/document-editor/new`
2. Writes rich text with TipTap, inserts variables via `@`/`{{` triggers or variable picker sidebar
3. Optionally inserts form field nodes (configured via popover)
4. Saves: `contentJson` = `JSON.stringify(editor.getJSON())`, `templateType` = `"document"`, `formJson` = `""`

### Document generation
1. User opens generate dialog from an entity (patient, contact, etc.)
2. Picks a document-type template from the folder tree (shared with PDFme templates)
3. System fetches `previewDocumentData` which now returns `templateType` + `contentJson`
4. Frontend extracts form fields from TipTap JSON via `extractFormFields()`
5. If form fields exist: user fills them in `DocumentFormFiller`
6. If no form fields: shows preview with auto-resolved variables and a "Generate" button
7. System calls `renderDocument()` with TipTap JSON + scope data + form field values → final HTML
8. Calls `generateDocument` with `responseData: JSON.stringify({ html: resolvedHtml, formFieldValues })`
9. Document saved to `formDocuments` table

### Document viewing
1. User opens a completed document from entity documents tab
2. System checks template's `templateType`
3. If `"document"`: parses `responseData` → `{ html, formFieldValues }`, renders `DocumentViewer`
4. If `"pdfme"` or undefined: renders `SurveyFormViewer` (existing behavior, unchanged)
5. Export: document-type via `pdf-export.tsx` browser print, pdfme-type via `@pdfme/generator`

### Signing flow
Same as existing, with one addition: the signing page route needs the same `templateType` branching — render `DocumentViewer` for document-type templates instead of `SurveyFormViewer`. The signing mutations themselves need no changes.

### i18n
New translation keys needed (both `pl` and `en`):
- `settings.formTemplates.newDocument` — "Nowy dokument" / "New document"
- `settings.formTemplates.newPdfForm` — "Formularz PDF" / "PDF form"
- `settings.formTemplates.templateType.document` — "Dokument" / "Document"
- `settings.formTemplates.templateType.pdfme` — "Formularz PDF" / "PDF form"
- `documents.formField.*` — labels for form field types and configuration
