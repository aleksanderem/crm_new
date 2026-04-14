# Document Component Library — Design Spec

Date: 2026-04-10
Status: Draft
Author: Alfred + Claude (brainstorming session)

## Problem

Document templates currently contain inline header/footer fragments and repeated sections (patient data, treatment data, signature blocks) that are copy-pasted across templates. When the organization wants to change its header or footer, every template must be edited individually. There is no reusability, no versioning of shared sections, and no way to enforce a mandatory branded footer.

## Solution

A Document Component Library that provides reusable, composable building blocks for document templates. Components are inserted into templates as linked references that can auto-update from source, be detached for customization, or be protected (non-removable, zero UI chrome).

## Component Scope Model

Three-level scope hierarchy:

1. system — Platform-provided, immutable. Available to all orgs. Cannot be edited or deleted. Examples: QUERA branded footer, standard signature blocks.
2. org — Organization-level. Created by admins, shared across all users in the org. Editable by admins.
3. user — Personal components. Created by any user, visible only to them. Editable by the creator.

Resolution order when names collide: user > org > system (most specific wins).

## Component Behavior in Templates

### Linked (default)

When a component is inserted into a template, it is linked to the source component by ID. If the source component is updated, all templates containing that linked component reflect the change automatically. The template stores a reference (`componentId` + `version`) rather than duplicating content.

At document generation time, the component's current content is resolved and inlined into the final document. The generated `formDocument.responseData` contains the fully-resolved HTML — no component references remain in generated documents.

### Detached

A user can detach a linked component, which copies the component's current content into the template as regular TipTap nodes. The link to the source is severed. Future source updates do not affect this template. This is a one-way operation.

### Protected

System-level components can be marked as `protected: true`. Protected components:

- Cannot be removed from the template by the user
- Cannot be detached
- Show zero UI chrome in the editor (no border, no toolbar, no drag handle)
- Render as seamless, read-only content that looks like part of the document
- Are always at a fixed position (e.g., footer is always last)

The QUERA branded footer is the primary protected component.

## Data Model

### New table: `documentComponents`

```
documentComponents: defineTable({
  organizationId: v.optional(v.id("organizations")),  // null for system scope
  scope: v.union(v.literal("system"), v.literal("org"), v.literal("user")),
  createdBy: v.id("users"),
  name: v.string(),
  description: v.optional(v.string()),
  category: v.union(
    v.literal("header"),
    v.literal("footer"),
    v.literal("patient_data"),
    v.literal("treatment_data"),
    v.literal("signature"),
    v.literal("table"),
    v.literal("legal"),
    v.literal("custom"),
  ),
  // TipTap JSON content (editor.getJSON() output)
  contentJson: v.string(),
  // Whether this component is protected (cannot be removed/detached)
  protected: v.boolean(),
  // Position constraint: "start" | "end" | null (free placement)
  positionConstraint: v.optional(v.union(v.literal("start"), v.literal("end"))),
  // Version tracking
  version: v.number(),
  isActive: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_org", ["organizationId"])
  .index("by_scope", ["scope"])
  .index("by_orgAndCategory", ["organizationId", "category"])
  .searchIndex("search_components", {
    searchField: "name",
    filterFields: ["organizationId", "scope"],
  })
```

System-scope components have `organizationId: undefined` (null). The `by_org` index can still query them by filtering on `scope === "system"` separately.

### ComponentBlock TipTap Node

A new TipTap node type `componentBlock` that represents a linked component reference in the template editor:

```typescript
attrs: {
  componentId: string,      // ID of the source documentComponent
  componentVersion: number,  // version at time of insertion (for staleness detection)
  state: "linked" | "detached" | "protected",
  positionConstraint: "start" | "end" | null,
}
```

When `state === "linked"`, the node renders the component's live content (fetched via query) with a colored border indicating it is a component. A small toolbar shows: component name, "Detach" button, and version indicator (stale if source version > local version).

When `state === "detached"`, the node is replaced with the component's content as regular TipTap nodes. The componentBlock node itself is removed.

When `state === "protected"`, the node renders content with zero chrome — no border, no toolbar, no selection highlight. It behaves as read-only content that cannot be deleted.

### Editor Visual Treatment

Linked components in the editor show:

- A subtle colored border (e.g., indigo-200) around the component content
- A small header bar with the component name and category icon
- A "Detach" action to convert to inline content
- A version badge if the component is stale (source has been updated)

Protected components show none of this — they are visually indistinguishable from regular content, except they cannot be selected or deleted.

## Component CRUD

### Backend: `convex/documents/components.ts`

Mutations:
- `create` — creates a new component (org admin for org scope, any user for user scope, internal-only for system)
- `update` — updates component content, bumps version
- `remove` — soft-delete (isActive = false)
- `duplicate` — copies a component

Queries:
- `list` — returns all components available to the current user (system + org + user scope)
- `getById` — returns a single component
- `getContent` — returns just the contentJson for a component (used by ComponentBlock for live rendering)

### Frontend: Component Management Page

Route: `_layout.settings.document-components.tsx` (list) and `_layout.settings.document-components.$id.tsx` (edit)

The list page shows all available components grouped by scope (system/org/user) and category. Admins can create org-level components. Any user can create personal components. System components are read-only.

The edit page uses the same `DocumentTemplateEditor` (TipTap) for editing component content, with the same variable mentions, form fields, and HTML blocks available.

### Frontend: Component Picker in Template Editor

A new toolbar button "Components" in `DocumentTemplateEditor` opens a picker popover/dialog showing available components grouped by category. Clicking a component inserts a `componentBlock` node at the cursor position.

## Default System Components

Six system-scope components seeded on first deployment:

1. Header — Organization name, subtitle, separator line. Uses `organization.name` variable.

2. Patient Data Block — Standard patient information section: name, PESEL, DOB, phone, address. Uses `patient.*` variables.

3. Treatment Data Block — Treatment + appointment info: name, description, duration, price, date, specialist. Uses `treatment.*`, `appointment.*`, `employee.*` variables.

4. Dual Signature Block — Two signature lines: client + specialist, with date/city.

5. Client Signature Block — Single client signature line with date/city.

6. QUERA Footer — Branded platform footer. Protected, position-constrained to "end". Shows "Dokument wygenerowany w systemie QUERA" with subtle branding. This component is `protected: true` and `positionConstraint: "end"`.

Additionally, two table-category components:

7. Form-style Data Table — Key-value pairs layout (label + value columns) for structured data presentation.

8. Report-style Data Table — Multi-column table with headers, suitable for listing items/services/products.

## Template Migration Strategy

Per user request: delete all existing seed templates and create new ones that use the component system.

The new seed templates will:

- Reference system components by ID for header, patient data, treatment data, and signature blocks
- Include the protected QUERA footer automatically
- Have cleaner, more maintainable contentJson that uses componentBlock nodes instead of duplicated inline content

The `buildTemplates()` function in `convex/documents/seed.ts` will be rewritten to produce templates with componentBlock references. The shared fragment functions (`docHeader`, `patientDataSection`, `treatmentDataSection`, `signatureFooter`) will be removed since they are replaced by components.

Existing templates in production orgs are not affected — they continue to work with their inline content. New orgs get the component-based templates. Existing orgs can re-seed to get the new templates.

## Document Generation Resolution

When generating a document from a template:

1. Parse the template's `contentJson`
2. For each `componentBlock` node with `state === "linked"`:
   - Fetch the source component's current `contentJson`
   - Replace the componentBlock node with the component's content nodes
3. For protected components: include them at their constrained position
4. For detached components: they are already inline content, no resolution needed
5. Proceed with variable resolution and form field handling as before

This resolution happens in the `generateDocument` mutation, before variable substitution.

## Rendering in External Pages

The signing pages (`sign.$token.tsx`, `sign.form.$token.tsx`) receive fully-resolved HTML — all components are already inlined during generation. No component resolution is needed on the client side.

## i18n

New translation keys under `settings.documentComponents`:

```json
{
  "settings.documentComponents.title": "Biblioteka komponentow",
  "settings.documentComponents.description": "Zarzadzaj komponentami dokumentow",
  "settings.documentComponents.create": "Nowy komponent",
  "settings.documentComponents.scope.system": "Systemowy",
  "settings.documentComponents.scope.org": "Organizacyjny",
  "settings.documentComponents.scope.user": "Osobisty",
  "settings.documentComponents.category.header": "Naglowek",
  "settings.documentComponents.category.footer": "Stopka",
  "settings.documentComponents.category.patient_data": "Dane pacjenta",
  "settings.documentComponents.category.treatment_data": "Dane zabiegu",
  "settings.documentComponents.category.signature": "Podpis",
  "settings.documentComponents.category.table": "Tabela",
  "settings.documentComponents.category.legal": "Prawne",
  "settings.documentComponents.category.custom": "Inne",
  "settings.documentComponents.state.linked": "Polaczony",
  "settings.documentComponents.state.detached": "Odlaczony",
  "settings.documentComponents.state.protected": "Chroniony",
  "settings.documentComponents.detach": "Odlacz",
  "settings.documentComponents.staleWarning": "Komponent zostal zaktualizowany. Kliknij aby odswiezyc.",
  "settings.documentComponents.protectedFooter": "Dokument wygenerowany w systemie QUERA"
}
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `convex/schema/documents.ts` | Modify | Add `documentComponents` table definition |
| `convex/documents/components.ts` | Create | CRUD backend for components |
| `convex/documents/seed.ts` | Modify | Remove old templates, add component seeds + new component-based templates |
| `convex/documents/generate.ts` | Modify | Add component resolution step before variable substitution |
| `src/components/documents/component-block-node.tsx` | Create | TipTap ComponentBlock node extension |
| `src/components/documents/component-picker.tsx` | Create | Component picker popover for editor toolbar |
| `src/components/documents/document-template-editor.tsx` | Modify | Register ComponentBlock extension, add picker button to toolbar |
| `src/routes/_app/_auth/dashboard/_layout.settings.document-components.tsx` | Create | Outlet wrapper |
| `src/routes/_app/_auth/dashboard/_layout.settings.document-components.index.tsx` | Create | Component list page |
| `src/routes/_app/_auth/dashboard/_layout.settings.document-components.$id.tsx` | Create | Component edit page |
| `src/routes/_app/_auth/dashboard/_layout.settings.document-components.new.tsx` | Create | Component create page |
| `src/components/layout/app-sidebar.tsx` | Modify | Add "Biblioteka komponentow" to settings nav |
| `public/locales/pl/translation.json` | Modify | Add documentComponents keys |
| `public/locales/en/translation.json` | Modify | Add documentComponents keys |

## What Does NOT Change

- `formDocuments` table — generated documents store fully-resolved content, no component references
- `sign.$token.tsx` / `sign.form.$token.tsx` — receive resolved HTML, unaffected
- `document-renderer.tsx` — renders resolved HTML, unaffected
- `document-viewer.tsx` — renders resolved HTML, unaffected
- `form-field-node.tsx` — form fields work the same inside components
- `variable-mention.tsx` — variables work the same inside components
- `html-block-node.tsx` — HTML blocks work the same inside components

## Open Questions

None — all design decisions resolved during brainstorming session.
