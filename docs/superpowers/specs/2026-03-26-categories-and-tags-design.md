# Categories & Tags for All Entities

## Context

The CRM/Gabinet platform needs universal categorization and tagging across all 14 entity types. Categories provide per-entity-type hierarchical classification (max 2 levels). Tags provide org-wide flat labels with colors. Both integrate into the existing saved views and filtering system.

Currently contacts, companies, leads, and documents have a plain `tags: v.array(v.string())` field with no centralized definitions, no colors, and no management UI. Documents have a hardcoded `category` enum; treatments have a free-text `category` string. These old fields remain untouched — new `tagIds` and `categoryId` fields are added alongside them with no migration.

## Scope

12 entity types (excluding `pipeline` which is a configuration entity, and `gabinetPackage` which maps to `gabinetTreatmentPackages` and is a bundle definition, not a user-facing data entity):

contact, company, lead, document, activity, gabinetPatient, gabinetTreatment, gabinetAppointment, gabinetDocument, gabinetEmployee, product, call.

## Data Model

### tagDefinitions (new table)

Org-wide tag definitions with colors. One pool per organization, shared across all entity types.

```typescript
tagDefinitions: defineTable({
  organizationId: v.id("organizations"),
  name: v.string(),
  color: v.string(),        // hex color, e.g. "#EF4444"
  sortOrder: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_org", ["organizationId"])
  .index("by_orgAndName", ["organizationId", "name"])
```

### categoryDefinitions (new table)

Per-entity-type hierarchical categories. Max 2 levels: root categories and one level of children.

```typescript
categoryDefinitions: defineTable({
  organizationId: v.id("organizations"),
  entityType: entityTypeValidator,
  name: v.string(),
  parentId: v.optional(v.id("categoryDefinitions")),  // null = root, set = child
  color: v.optional(v.string()),
  icon: v.optional(v.string()),
  sortOrder: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_orgAndEntityType", ["organizationId", "entityType"])
  .index("by_parent", ["parentId"])
```

### Entity field changes

Every entity table gets two new optional fields:

```typescript
tagIds: v.optional(v.array(v.id("tagDefinitions"))),
categoryId: v.optional(v.id("categoryDefinitions")),
```

Old `tags: v.array(v.string())` fields on contacts, companies, leads, documents remain untouched. Old `category` fields on documents and treatments remain untouched. No migration.

## Backend

### New files

`convex/tagDefinitions.ts` — CRUD for org-wide tags:

- `list({ organizationId })` — verifyOrgAccess only (always readable by all members)
- `create({ organizationId, name, color })` — checkPermission("tagDefinitions", "create"), enforce unique name per org
- `update({ tagId, name?, color?, sortOrder? })` — checkPermission("tagDefinitions", "edit")
- `remove({ tagId })` — checkPermission("tagDefinitions", "delete"), soft-delete: set `isDeleted: true` on the tagDefinition. UI excludes deleted tags from pickers and lists. A scheduled background job (`ctx.scheduler`) lazily scans entity tables to remove the tagId from `tagIds` arrays in batches, avoiding Convex mutation read-set limits.
- `reorder({ organizationId, tagIds[] })` — checkPermission("tagDefinitions", "edit"), bulk update sortOrder

`convex/categoryDefinitions.ts` — CRUD for per-entity-type categories:

- `list({ organizationId, entityType })` — verifyOrgAccess only (always readable)
- `create({ organizationId, entityType, name, parentId?, color? })` — checkPermission("categoryDefinitions", "create"), validate 2-level constraint (if parentId set, parent must be a root)
- `update({ categoryId, name?, color?, parentId?, sortOrder? })` — checkPermission("categoryDefinitions", "edit"), validate 2-level constraint on parentId change
- `remove({ categoryId })` — checkPermission("categoryDefinitions", "delete"), soft-delete: set `isDeleted: true`. Cascade soft-delete children. A scheduled background job lazily nulls out `categoryId` on entities of that type in batches.
- `reorder({ organizationId, entityType, categoryIds[] })` — checkPermission("categoryDefinitions", "edit")

### Permissions

New RBAC feature entries in `orgPermissions`:

New RBAC feature entries. Must be added to the `FEATURES` array in `convex/_helpers/permissionTypes.ts`. Actions use existing `ACTIONS` values (create, edit, delete — not "update").

| Feature | Actions | Owner/Admin | Member | Viewer |
|---------|---------|-------------|--------|--------|
| tagDefinitions | create, edit, delete | all | create only | none |
| categoryDefinitions | create, edit, delete | all | create only | none |

Custom per-role defaults must be applied as overrides on `DEFAULT_PERMISSIONS` in `convex/_helpers/permissions.ts`, following the existing `document_templates` override pattern.

Reading (list) requires no permission check beyond org membership — it is always allowed. Without read access, entity data would be incomplete since tags and categories are embedded references.

Assigning tags/categories to entities (setting tagIds/categoryId) follows existing entity permissions — if you can update a contact, you can assign tags to it.

### Soft-delete fields

Both `tagDefinitions` and `categoryDefinitions` get an additional field:

```typescript
isDeleted: v.optional(v.boolean()),  // soft-delete flag, default undefined (not deleted)
```

All list queries filter out `isDeleted === true` records. Pickers and UI never show deleted items.

### Entity mutation changes

All 12 entity create/update mutations gain optional `tagIds` and `categoryId` parameters. On update, validate that referenced tagIds exist in tagDefinitions (and are not soft-deleted) and categoryId exists in categoryDefinitions with matching entityType (and is not soft-deleted).

## UI Components

### Management UI (SlideoutMenu in FilterBar footer)

Each entity list page's DataListFilterBar gets two optional buttons in the footer: "Kategorie" and "Tagi". Buttons only appear if the entity type supports categories/tags (all 14 do). Clicking opens a SlideoutMenu.

**TagsManagerSlideout** (`src/components/categories-tags/tags-manager-slideout.tsx`):

- UTUI SlideoutMenu
- List of org tags as colored Badge pills
- ComboBox search at top
- Each tag row: colored dot + name + edit/delete icons (permission-gated)
- "Add tag" button at bottom with inline form (name + color picker)
- Color picker: predefined palette of 10 hex colors (backend validates against this palette)

**CategoriesManagerSlideout** (`src/components/categories-tags/categories-manager-slideout.tsx`):

- UTUI SlideoutMenu with TreeView inside
- Two-level tree: parent categories as expandable folders, children inside
- Drag-and-drop reorder within same level
- Each row: name + colored dot + edit/delete icons (permission-gated)
- "Add category" / "Add subcategory" buttons
- Inline rename on double-click or edit icon
- Filtered to current entityType

### Assignment UI (pickers for forms and detail panels)

**TagsPicker** (`src/components/categories-tags/tags-picker.tsx`):

- Dropdown with checkboxes listing all org tags
- Selected tags shown as colored Badge pills
- ComboBox search built-in
- Used in entity create/edit forms and entity detail sidebars

**CategoryPicker** (`src/components/categories-tags/category-picker.tsx`):

- Dropdown with two-level tree, single-select
- Selected category shown as a Badge
- Used in entity forms and detail sidebars

### Display

Entity detail sidebars (especially contacts, but all entities) show:
- Tags as colored pills (clickable to open TagsPicker for reassignment)
- Category as a labeled badge (clickable to open CategoryPicker)

Table columns auto-generated by useAllColumns from filterableFields:
- "Tags" column: row of small colored dots/pills
- "Category" column: category name text

## Filtering & Saved Views

Tags and categories are added as filterableFields on all 14 entity pages:

```typescript
{ id: "categoryId", label: t("common.category"), type: "select",
  options: categories.map(c => ({ label: c.name, value: c._id })) }
{ id: "tagIds", label: t("common.tags"), type: "multiSelect",
  options: tags.map(t => ({ label: t.name, value: t._id })) }
```

Filter logic in applyFilters:
- `categoryId` — exact match: `entity.categoryId === filterValue`
- `tagIds` — "has any of" semantics: `filterValues.some(id => entity.tagIds?.includes(id))`

### FieldDef and filter infrastructure changes

The `FieldDef.type` union in `src/components/crm/types.ts` currently supports `"text" | "number" | "date" | "select" | "boolean"`. Add `"multiSelect"`.

In `src/components/crm/data-list-filter-bar.tsx`, add `multiSelect` to `OPERATORS_BY_TYPE`:

```typescript
multiSelect: [
  { value: "hasAnyOf", label: "has any of" },
  { value: "hasAllOf", label: "has all of" },
  { value: "isEmpty", label: "is empty" },
]
```

In `src/hooks/use-saved-views.ts`, add a case in `matchCondition` for `multiSelect`:
- `hasAnyOf`: `filterValues.some(id => entityValue?.includes(id))`
- `hasAllOf`: `filterValues.every(id => entityValue?.includes(id))`
- `isEmpty`: `!entityValue || entityValue.length === 0`

Filters are persistable in saved views using the existing savedViews system.

## UTUI Components Used

ALL UI components MUST come from Untitled UI. No custom-built alternatives.

- SlideoutMenu (`src/components/application/slideout-menus/slideout-menu.tsx`)
- TreeView (`src/components/application/tree-view/tree-view.tsx`) — UTUI ships TreeView with drag-and-drop, connectors, and nested Collection support via `react-aria-components`. Use `useTreeData` from react-aria-components for state management.
- Badge with pill-color variant (`src/components/base/badges/badges.tsx`) — use `type="pill-color"` with `BadgeColors`
- Select.ComboBox (`src/components/base/select/select.tsx`) — for search within slideouts
- CheckboxBase (`src/components/base/checkbox/checkbox.tsx`) — with `react-aria-components` Checkbox wrapper
- FeaturedIcon (`src/components/foundations/featured-icon/featured-icon.tsx`) — for slideout headers
- Button (`src/components/base/buttons/button.tsx`)
- Label (`src/components/base/input/label.tsx`)
- Icons from `@untitledui/icons` (LayersTwo02, Tag01, Folder, Plus, etc.)

### Reference: Tags SlideoutMenu pattern

Follow the UTUI LabelsMenu pattern exactly:

```tsx
<SlideoutMenu isOpen={isOpen} onOpenChange={setIsOpen} isDismissable>
  <SlideoutMenu.Header onClose={() => setIsOpen(false)}>
    <FeaturedIcon size="md" color="gray" theme="modern" icon={Tag01} />
    <section className="flex flex-col gap-0.5">
      <h1 className="text-md font-semibold text-primary">Tagi</h1>
      <p className="text-sm text-tertiary">Zarządzaj tagami organizacji</p>
    </section>
  </SlideoutMenu.Header>
  <SlideoutMenu.Content>
    <Select.ComboBox aria-label="Tags" size="md" placeholder="Szukaj tagu">
      {/* tag items */}
    </Select.ComboBox>
    <AriaCheckboxGroup value={selectedTagIds} onChange={setSelectedTagIds}>
      {tags.map((tag) => (
        <AriaCheckbox key={tag._id} value={tag._id}>
          {({ isSelected, isDisabled, isFocusVisible }) => (
            <>
              <CheckboxBase isSelected={isSelected} isDisabled={isDisabled} isFocusVisible={isFocusVisible} />
              <Badge size="md" type="pill-color" color={tag.color}>{tag.name}</Badge>
            </>
          )}
        </AriaCheckbox>
      ))}
      <Button size="md" color="link-color" iconLeading={Plus}>Dodaj tag</Button>
    </AriaCheckboxGroup>
  </SlideoutMenu.Content>
  <SlideoutMenu.Footer>
    <Button size="sm" color="secondary" onClick={onClose}>Anuluj</Button>
    <Button size="sm" onClick={onApply}>Zastosuj</Button>
  </SlideoutMenu.Footer>
</SlideoutMenu>
```

### Reference: Categories TreeView pattern

Follow the UTUI AdvancedTree pattern with `useTreeData` from react-aria-components:

```tsx
const tree = useTreeData<CategoryNode>({
  initialItems: categoryTree,
  getChildren: (item) => item.children,
});

<TreeView
  size="md"
  selectionMode="multiple"
  showConnectors
  draggable
  aria-label="Categories"
  items={tree.items}
  onReorder={(e) => {
    if (e.target.dropPosition === "before") {
      tree.moveBefore(e.target.key as string, e.keys as Set<string>);
    } else if (e.target.dropPosition === "after") {
      tree.moveAfter(e.target.key as string, e.keys as Set<string>);
    }
  }}
>
  {(item) => (
    <TreeView.Item id={item.key} textValue={item.value.name}>
      <TreeView.ItemContent icon={Folder}>{item.value.name}</TreeView.ItemContent>
      <Collection items={item.children ?? []}>
        {(child) => (
          <TreeView.Item id={child.key} textValue={child.value.name}>
            <TreeView.ItemContent icon={child.value.icon}>{child.value.name}</TreeView.ItemContent>
          </TreeView.Item>
        )}
      </Collection>
    </TreeView.Item>
  )}
</TreeView>
```

## Non-goals

- No migration of existing string tags or category enum/text fields
- No tag/category analytics or usage statistics
- No tag merging or bulk reassignment UI (can be added later)
- No per-tag/per-category permissions (CRUD is feature-level, not per-instance)
- No audit logging for tag/category CRUD (can be added later)
- No notifications on tag/category changes
