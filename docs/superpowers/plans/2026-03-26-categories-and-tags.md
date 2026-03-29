# Categories & Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add universal categorization (per-entity-type, 2-level hierarchy) and tagging (org-wide, flat with colors) across 12 entity types, with CRUD management UI, assignment pickers, filtering, and saved views integration.

**Architecture:** Two new Convex tables (`tagDefinitions`, `categoryDefinitions`) with embedded ID references (`tagIds`, `categoryId`) on each entity. Soft-delete pattern for removal. UTUI SlideoutMenu + TreeView for management, UTUI Badge/Checkbox/ComboBox for assignment. New `multiSelect` filter type for tag filtering.

**Tech Stack:** Convex (backend), React 19, TanStack Router/Query, Untitled UI components, react-aria-components (TreeView state), i18next, Tailwind CSS v4.

**Spec:** `docs/superpowers/specs/2026-03-26-categories-and-tags-design.md`

---

## File Map

### New files

| File | Responsibility |
|------|----------------|
| `convex/tagDefinitions.ts` | CRUD mutations/queries for org-wide tags |
| `convex/categoryDefinitions.ts` | CRUD mutations/queries for per-entity-type categories |
| `src/components/categories-tags/tags-manager-slideout.tsx` | SlideoutMenu for managing tags (create/edit/delete) |
| `src/components/categories-tags/categories-manager-slideout.tsx` | SlideoutMenu with TreeView for managing categories |
| `src/components/categories-tags/tags-picker.tsx` | Dropdown with checkboxes for assigning tags to entities |
| `src/components/categories-tags/category-picker.tsx` | Dropdown with tree for assigning a category to an entity |
| `src/components/categories-tags/color-palette.ts` | Shared color palette constant (10 hex colors) |
| `src/hooks/use-tag-definitions.ts` | Hook wrapping tag definitions query with loading state |
| `src/hooks/use-category-definitions.ts` | Hook wrapping category definitions query with loading state |

### Modified files

| File | Change |
|------|--------|
| `convex/schema.ts` | Add `tagDefinitions` and `categoryDefinitions` tables |
| `convex/schema/crm.ts` | Add `tagIds`, `categoryId` fields to contacts, companies, leads, documents, activities, products, calls |
| `convex/schema/gabinet.ts` | Add `tagIds`, `categoryId` fields to gabinetPatients, gabinetTreatments, gabinetAppointments, gabinetEmployees, gabinetDocuments (5 tables) |
| `convex/_helpers/permissionTypes.ts` | Add `"tagDefinitions"`, `"categoryDefinitions"` to `FEATURES` array |
| `convex/_helpers/permissions.ts` | Add per-role overrides for new features |
| `convex/contacts.ts` | Add `tagIds`, `categoryId` to create/update args |
| `convex/companies.ts` | Add `tagIds`, `categoryId` to create/update args |
| `convex/leads.ts` | Add `tagIds`, `categoryId` to create/update args |
| `convex/documents.ts` | Add `tagIds`, `categoryId` to create/update args |
| `convex/activities.ts` | Add `tagIds`, `categoryId` to create/update args |
| `convex/products.ts` | Add `tagIds`, `categoryId` to create/update args |
| `convex/calls.ts` | Add `tagIds`, `categoryId` to create/update args |
| `convex/gabinet/patients.ts` | Add `tagIds`, `categoryId` to create/update args |
| `convex/gabinet/treatments.ts` | Add `tagIds`, `categoryId` to create/update args |
| `convex/gabinet/appointments.ts` | Add `tagIds`, `categoryId` to create/update args |
| `convex/gabinet/employees.ts` | Add `tagIds`, `categoryId` to create/update args |
| `convex/gabinet/documents.ts` | Add `tagIds`, `categoryId` to create/update args |
| `src/components/crm/types.ts` | Add `"multiSelect"` to `FieldDef.type` union, add `"hasAnyOf"`, `"hasAllOf"` to `FilterCondition.operator` |
| `src/components/crm/data-list-filter-bar.tsx` | Add `multiSelect` to `OPERATORS_BY_TYPE`, add "Tagi"/"Kategorie" footer buttons |
| `src/hooks/use-saved-views.ts` | Add `hasAnyOf`, `hasAllOf` cases to `matchCondition` |
| 12 entity list page files | Add `tagIds`/`categoryId` to `filterableFields`, fetch tag/category definitions |

---

## Tasks

### Task 1: Schema — new tables + entity field additions

**Files:**
- Modify: `convex/schema.ts` — add `tagDefinitions` and `categoryDefinitions` table definitions
- Modify: `convex/schema/crm.ts` — add `tagIds`, `categoryId` to 7 entity tables
- Modify: `convex/schema/gabinet.ts` — add `tagIds`, `categoryId` to 5 entity tables

- [ ] **Step 1: Add tagDefinitions and categoryDefinitions tables to schema.ts**

In `convex/schema.ts`, after the existing validators (around line 100), the `entityTypeValidator` is already defined. Add the two new table definitions. They must be added in the `defineSchema({...})` call alongside the spread tables. Find where the schema is assembled and add:

```typescript
tagDefinitions: defineTable({
  organizationId: v.id("organizations"),
  name: v.string(),
  color: v.string(),
  sortOrder: v.number(),
  isDeleted: v.optional(v.boolean()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_org", ["organizationId"])
  .index("by_orgAndName", ["organizationId", "name"]),

categoryDefinitions: defineTable({
  organizationId: v.id("organizations"),
  entityType: entityTypeValidator,
  name: v.string(),
  parentId: v.optional(v.id("categoryDefinitions")),
  color: v.optional(v.string()),
  icon: v.optional(v.string()),
  sortOrder: v.number(),
  isDeleted: v.optional(v.boolean()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_orgAndEntityType", ["organizationId", "entityType"])
  .index("by_parent", ["parentId"]),
```

- [ ] **Step 2: Add tagIds and categoryId to CRM entity tables**

In `convex/schema/crm.ts`, add these two fields to each of the 7 entity table definitions (contacts, companies, leads, documents, activities, products, calls):

```typescript
tagIds: v.optional(v.array(v.id("tagDefinitions"))),
categoryId: v.optional(v.id("categoryDefinitions")),
```

Add them after the existing fields, before `createdBy`/`createdAt`.

Note: `activities` table might be defined differently — check if it has `scheduledActivities` vs `activities`. Search for the table name in `crm.ts` and add to the correct one.

- [ ] **Step 3: Add tagIds and categoryId to Gabinet entity tables**

In `convex/schema/gabinet.ts`, add the same two fields to: `gabinetPatients`, `gabinetTreatments`, `gabinetAppointments`, `gabinetEmployees`. Also check for `gabinetDocuments` table and add there too.

- [ ] **Step 4: Verify schema compiles**

Run: `npx convex dev --typecheck=disable --until-success` briefly or `npx tsc --noEmit`

Expected: No errors. Convex should accept the new schema.

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts convex/schema/crm.ts convex/schema/gabinet.ts
git commit -m "feat: add tagDefinitions and categoryDefinitions tables + entity fields"
```

---

### Task 2: RBAC — register new features and permission defaults

**Files:**
- Modify: `convex/_helpers/permissionTypes.ts`
- Modify: `convex/_helpers/permissions.ts`

- [ ] **Step 1: Add features to FEATURES array**

In `convex/_helpers/permissionTypes.ts`, add `"tagDefinitions"` and `"categoryDefinitions"` to the `FEATURES` array (before `] as const`):

```typescript
export const FEATURES = [
  // ... existing features ...
  "document_instances",
  "tagDefinitions",
  "categoryDefinitions",
] as const;
```

- [ ] **Step 2: Add per-role overrides in permissions.ts**

In `convex/_helpers/permissions.ts`, after the existing `document_instances` overrides (around line 59), add:

```typescript
// --- Per-feature overrides for tagDefinitions ---
// member: create only (no edit/delete)
DEFAULT_PERMISSIONS.member.tagDefinitions = {
  view: "all", create: "all", edit: "none", delete: "none", approve: "none", sign: "none",
};
// viewer: no CRUD
DEFAULT_PERMISSIONS.viewer.tagDefinitions = {
  view: "all", create: "none", edit: "none", delete: "none", approve: "none", sign: "none",
};

// --- Per-feature overrides for categoryDefinitions ---
// member: create only (no edit/delete)
DEFAULT_PERMISSIONS.member.categoryDefinitions = {
  view: "all", create: "all", edit: "none", delete: "none", approve: "none", sign: "none",
};
// viewer: no CRUD
DEFAULT_PERMISSIONS.viewer.categoryDefinitions = {
  view: "all", create: "none", edit: "none", delete: "none", approve: "none", sign: "none",
};
```

Note: `view: "all"` on all roles because reading is always allowed. The `buildDefaults` already gives owner/admin all actions, so no overrides needed for them.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: No errors. The new features are now recognized by the type system.

- [ ] **Step 4: Commit**

```bash
git add convex/_helpers/permissionTypes.ts convex/_helpers/permissions.ts
git commit -m "feat: register tagDefinitions and categoryDefinitions RBAC features"
```

---

### Task 3: Backend — tagDefinitions CRUD

**Files:**
- Create: `convex/tagDefinitions.ts`
- Create: `src/components/categories-tags/color-palette.ts`

- [ ] **Step 1: Create color palette constant**

Create `src/components/categories-tags/color-palette.ts`:

```typescript
export const TAG_COLOR_PALETTE = [
  "#EF4444", // red
  "#F97316", // orange
  "#EAB308", // yellow
  "#22C55E", // green
  "#06B6D4", // cyan
  "#3B82F6", // blue
  "#6366F1", // indigo
  "#A855F7", // purple
  "#EC4899", // pink
  "#6B7280", // gray
] as const;

export type TagColor = (typeof TAG_COLOR_PALETTE)[number];
```

- [ ] **Step 2: Create convex/tagDefinitions.ts with list and create**

```typescript
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { verifyOrgAccess } from "./_helpers/auth";
import { checkPermission } from "./_helpers/permissions";

export const list = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const tags = await ctx.db
      .query("tagDefinitions")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    return tags
      .filter((t) => !t.isDeleted)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    color: v.string(),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "tagDefinitions", "create");
    if (!perm.allowed) throw new Error("Permission denied");

    // Enforce unique name per org
    const existing = await ctx.db
      .query("tagDefinitions")
      .withIndex("by_orgAndName", (q) =>
        q.eq("organizationId", args.organizationId).eq("name", args.name)
      )
      .first();
    if (existing && !existing.isDeleted) {
      throw new Error(`Tag "${args.name}" already exists`);
    }

    // Get next sortOrder
    const allTags = await ctx.db
      .query("tagDefinitions")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    const maxOrder = allTags.reduce((max, t) => Math.max(max, t.sortOrder), -1);

    const now = Date.now();
    return await ctx.db.insert("tagDefinitions", {
      organizationId: args.organizationId,
      name: args.name.trim(),
      color: args.color,
      sortOrder: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    });
  },
});
```

- [ ] **Step 3: Add update, remove, and reorder mutations**

Append to `convex/tagDefinitions.ts`:

```typescript
export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    tagId: v.id("tagDefinitions"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "tagDefinitions", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const tag = await ctx.db.get(args.tagId);
    if (!tag || tag.organizationId !== args.organizationId) {
      throw new Error("Tag not found");
    }

    if (args.name && args.name !== tag.name) {
      const existing = await ctx.db
        .query("tagDefinitions")
        .withIndex("by_orgAndName", (q) =>
          q.eq("organizationId", args.organizationId).eq("name", args.name)
        )
        .first();
      if (existing && !existing.isDeleted && existing._id !== args.tagId) {
        throw new Error(`Tag "${args.name}" already exists`);
      }
    }

    await ctx.db.patch(args.tagId, {
      ...(args.name !== undefined && { name: args.name.trim() }),
      ...(args.color !== undefined && { color: args.color }),
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    tagId: v.id("tagDefinitions"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "tagDefinitions", "delete");
    if (!perm.allowed) throw new Error("Permission denied");

    const tag = await ctx.db.get(args.tagId);
    if (!tag || tag.organizationId !== args.organizationId) {
      throw new Error("Tag not found");
    }

    // Soft-delete
    await ctx.db.patch(args.tagId, { isDeleted: true, updatedAt: Date.now() });

    // Schedule background cleanup of entity references
    await ctx.scheduler.runAfter(0, api.tagDefinitions.cleanupTagReferences, {
      organizationId: args.organizationId,
      tagId: args.tagId,
    });
  },
});

export const reorder = mutation({
  args: {
    organizationId: v.id("organizations"),
    tagIds: v.array(v.id("tagDefinitions")),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "tagDefinitions", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const now = Date.now();
    for (let i = 0; i < args.tagIds.length; i++) {
      await ctx.db.patch(args.tagIds[i], { sortOrder: i, updatedAt: now });
    }
  },
});
```

- [ ] **Step 4: Add the cleanupTagReferences internal action**

Add the import at the top of the file:
```typescript
import { internalMutation } from "./_generated/server";
import { api } from "./_generated/api";
```

Then add the cleanup function:

```typescript
export const cleanupTagReferences = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    tagId: v.id("tagDefinitions"),
  },
  handler: async (ctx, args) => {
    // Clean up references from CRM entity tables
    const tables = [
      "contacts", "companies", "leads", "documents",
      "activities", "products", "calls",
    ] as const;

    for (const table of tables) {
      const entities = await ctx.db
        .query(table)
        .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
        .collect();
      for (const entity of entities) {
        if (entity.tagIds?.includes(args.tagId)) {
          await ctx.db.patch(entity._id, {
            tagIds: entity.tagIds.filter((id: any) => id !== args.tagId),
          });
        }
      }
    }

    // Clean up Gabinet tables
    const gabinetTables = [
      "gabinetPatients", "gabinetTreatments", "gabinetAppointments",
      "gabinetEmployees", "gabinetDocuments",
    ] as const;

    for (const table of gabinetTables) {
      const entities = await ctx.db
        .query(table)
        .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
        .collect();
      for (const entity of entities) {
        if (entity.tagIds?.includes(args.tagId)) {
          await ctx.db.patch(entity._id, {
            tagIds: entity.tagIds.filter((id: any) => id !== args.tagId),
          });
        }
      }
    }
  },
});
```

Note: The `internalMutation` import and `api` import are needed for the scheduler. Check the exact Convex pattern — `ctx.scheduler.runAfter` takes a reference from the `internal` api, not the public `api`. You may need to use `import { internal } from "./_generated/api"` and `ctx.scheduler.runAfter(0, internal.tagDefinitions.cleanupTagReferences, {...})`.

- [ ] **Step 5: Verify with tsc**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add convex/tagDefinitions.ts src/components/categories-tags/color-palette.ts
git commit -m "feat: add tagDefinitions CRUD with soft-delete and background cleanup"
```

---

### Task 4: Backend — categoryDefinitions CRUD

**Files:**
- Create: `convex/categoryDefinitions.ts`

- [ ] **Step 1: Create convex/categoryDefinitions.ts with list and create**

```typescript
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { entityTypeValidator } from "./schema";
import { verifyOrgAccess } from "./_helpers/auth";
import { checkPermission } from "./_helpers/permissions";

export const list = query({
  args: {
    organizationId: v.id("organizations"),
    entityType: entityTypeValidator,
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const categories = await ctx.db
      .query("categoryDefinitions")
      .withIndex("by_orgAndEntityType", (q) =>
        q.eq("organizationId", args.organizationId).eq("entityType", args.entityType)
      )
      .collect();
    return categories
      .filter((c) => !c.isDeleted)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    entityType: entityTypeValidator,
    name: v.string(),
    parentId: v.optional(v.id("categoryDefinitions")),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "categoryDefinitions", "create");
    if (!perm.allowed) throw new Error("Permission denied");

    // Validate 2-level constraint
    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent || parent.isDeleted) throw new Error("Parent category not found");
      if (parent.parentId) throw new Error("Cannot nest deeper than 2 levels");
      if (parent.entityType !== args.entityType) throw new Error("Parent category belongs to different entity type");
    }

    // Get next sortOrder within same parent
    const siblings = await ctx.db
      .query("categoryDefinitions")
      .withIndex("by_orgAndEntityType", (q) =>
        q.eq("organizationId", args.organizationId).eq("entityType", args.entityType)
      )
      .collect();
    const sameLevelSiblings = siblings.filter((c) =>
      !c.isDeleted && (args.parentId ? c.parentId === args.parentId : !c.parentId)
    );
    const maxOrder = sameLevelSiblings.reduce((max, c) => Math.max(max, c.sortOrder), -1);

    const now = Date.now();
    return await ctx.db.insert("categoryDefinitions", {
      organizationId: args.organizationId,
      entityType: args.entityType,
      name: args.name.trim(),
      parentId: args.parentId,
      color: args.color,
      sortOrder: maxOrder + 1,
      createdAt: now,
      updatedAt: now,
    });
  },
});
```

- [ ] **Step 2: Add update, remove, and reorder mutations**

Append to `convex/categoryDefinitions.ts`:

```typescript
export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    categoryId: v.id("categoryDefinitions"),
    name: v.optional(v.string()),
    color: v.optional(v.string()),
    parentId: v.optional(v.id("categoryDefinitions")),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "categoryDefinitions", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const category = await ctx.db.get(args.categoryId);
    if (!category || category.organizationId !== args.organizationId) {
      throw new Error("Category not found");
    }

    // Validate 2-level constraint on parentId change
    if (args.parentId !== undefined && args.parentId !== category.parentId) {
      if (args.parentId) {
        const parent = await ctx.db.get(args.parentId);
        if (!parent || parent.isDeleted) throw new Error("Parent category not found");
        if (parent.parentId) throw new Error("Cannot nest deeper than 2 levels");
      }
      // If this category has children, it cannot become a child itself
      const children = await ctx.db
        .query("categoryDefinitions")
        .withIndex("by_parent", (q) => q.eq("parentId", args.categoryId))
        .collect();
      if (children.some((c) => !c.isDeleted) && args.parentId) {
        throw new Error("Cannot move a parent category under another category");
      }
    }

    await ctx.db.patch(args.categoryId, {
      ...(args.name !== undefined && { name: args.name.trim() }),
      ...(args.color !== undefined && { color: args.color }),
      ...(args.parentId !== undefined && { parentId: args.parentId }),
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    categoryId: v.id("categoryDefinitions"),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "categoryDefinitions", "delete");
    if (!perm.allowed) throw new Error("Permission denied");

    const category = await ctx.db.get(args.categoryId);
    if (!category || category.organizationId !== args.organizationId) {
      throw new Error("Category not found");
    }

    const now = Date.now();

    // Soft-delete this category
    await ctx.db.patch(args.categoryId, { isDeleted: true, updatedAt: now });

    // Cascade soft-delete children
    const children = await ctx.db
      .query("categoryDefinitions")
      .withIndex("by_parent", (q) => q.eq("parentId", args.categoryId))
      .collect();
    for (const child of children) {
      if (!child.isDeleted) {
        await ctx.db.patch(child._id, { isDeleted: true, updatedAt: now });
      }
    }

    // Schedule background cleanup of entity references
    await ctx.scheduler.runAfter(0, internal.categoryDefinitions.cleanupCategoryReferences, {
      organizationId: args.organizationId,
      categoryId: args.categoryId,
      entityType: category.entityType,
      childIds: children.filter((c) => !c.isDeleted).map((c) => c._id),
    });
  },
});

export const reorder = mutation({
  args: {
    organizationId: v.id("organizations"),
    entityType: entityTypeValidator,
    categoryIds: v.array(v.id("categoryDefinitions")),
  },
  handler: async (ctx, args) => {
    await verifyOrgAccess(ctx, args.organizationId);
    const perm = await checkPermission(ctx, args.organizationId, "categoryDefinitions", "edit");
    if (!perm.allowed) throw new Error("Permission denied");

    const now = Date.now();
    for (let i = 0; i < args.categoryIds.length; i++) {
      await ctx.db.patch(args.categoryIds[i], { sortOrder: i, updatedAt: now });
    }
  },
});
```

- [ ] **Step 3: Add cleanupCategoryReferences internalMutation**

```typescript
export const cleanupCategoryReferences = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    categoryId: v.id("categoryDefinitions"),
    entityType: v.string(),
    childIds: v.array(v.id("categoryDefinitions")),
  },
  handler: async (ctx, args) => {
    const idsToClean = [args.categoryId, ...args.childIds];

    // Determine which table to clean based on entityType
    const tableMap: Record<string, string> = {
      contact: "contacts",
      company: "companies",
      lead: "leads",
      document: "documents",
      activity: "activities",
      product: "products",
      call: "calls",
      gabinetPatient: "gabinetPatients",
      gabinetTreatment: "gabinetTreatments",
      gabinetAppointment: "gabinetAppointments",
      gabinetEmployee: "gabinetEmployees",
      gabinetDocument: "gabinetDocuments",
    };

    const tableName = tableMap[args.entityType];
    if (!tableName) return;

    const entities = await ctx.db
      .query(tableName as any)
      .withIndex("by_org", (q: any) => q.eq("organizationId", args.organizationId))
      .collect();

    for (const entity of entities) {
      if (entity.categoryId && idsToClean.includes(entity.categoryId)) {
        await ctx.db.patch(entity._id, { categoryId: undefined });
      }
    }
  },
});
```

- [ ] **Step 4: Verify with tsc**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add convex/categoryDefinitions.ts
git commit -m "feat: add categoryDefinitions CRUD with 2-level hierarchy and soft-delete"
```

---

### Task 5: Entity mutations — add tagIds and categoryId params

**Files:**
- Modify: `convex/contacts.ts`, `convex/companies.ts`, `convex/leads.ts`, `convex/documents.ts`, `convex/activities.ts`, `convex/products.ts`, `convex/calls.ts`
- Modify: `convex/gabinet/patients.ts`, `convex/gabinet/treatments.ts`, `convex/gabinet/appointments.ts`, `convex/gabinet/employees.ts`, `convex/gabinet/documents.ts`

- [ ] **Step 1: Add tagIds and categoryId to CRM entity create/update mutations**

For each of the 7 CRM entity files, add these two args to both the `create` and `update` mutation `args` objects:

```typescript
tagIds: v.optional(v.array(v.id("tagDefinitions"))),
categoryId: v.optional(v.id("categoryDefinitions")),
```

These are already optional, so existing callers won't break. The args are automatically spread into the insert/patch calls since most mutations use `...args` or `...contactData` patterns. Verify for each file that the destructuring pattern includes these new fields.

Do this for: `convex/contacts.ts`, `convex/companies.ts`, `convex/leads.ts`, `convex/documents.ts`, `convex/activities.ts`, `convex/products.ts`, `convex/calls.ts`.

- [ ] **Step 2: Add tagIds and categoryId to Gabinet entity create/update mutations**

Same pattern for: `convex/gabinet/patients.ts`, `convex/gabinet/treatments.ts`, `convex/gabinet/appointments.ts`, `convex/gabinet/employees.ts`, `convex/gabinet/documents.ts`.

- [ ] **Step 3: Verify with tsc**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add convex/contacts.ts convex/companies.ts convex/leads.ts convex/documents.ts convex/activities.ts convex/products.ts convex/calls.ts convex/gabinet/patients.ts convex/gabinet/treatments.ts convex/gabinet/appointments.ts convex/gabinet/employees.ts convex/gabinet/documents.ts
git commit -m "feat: add tagIds and categoryId params to all 12 entity create/update mutations"
```

---

### Task 6: Filter infrastructure — multiSelect type and operators

**Files:**
- Modify: `src/components/crm/types.ts`
- Modify: `src/components/crm/data-list-filter-bar.tsx`
- Modify: `src/hooks/use-saved-views.ts`

- [ ] **Step 1: Add multiSelect to FieldDef.type and new operators to FilterCondition**

In `src/components/crm/types.ts`:

Change `FieldDef.type`:
```typescript
type: "text" | "number" | "date" | "select" | "boolean" | "multiSelect";
```

Add new operators to `FilterCondition.operator`:
```typescript
operator:
  | "equals"
  | "notEquals"
  | "contains"
  | "notContains"
  | "greaterThan"
  | "lessThan"
  | "between"
  | "isEmpty"
  | "isNotEmpty"
  | "before"
  | "after"
  | "hasAnyOf"
  | "hasAllOf";
```

- [ ] **Step 2: Add multiSelect to OPERATORS_BY_TYPE in data-list-filter-bar.tsx**

In `src/components/crm/data-list-filter-bar.tsx`, find the `OPERATORS_BY_TYPE` object (around line 40) and add:

```typescript
multiSelect: [
  { value: "hasAnyOf", label: "Has any of" },
  { value: "hasAllOf", label: "Has all of" },
  { value: "isEmpty", label: "Is empty" },
],
```

- [ ] **Step 3: Add hasAnyOf and hasAllOf to matchCondition in use-saved-views.ts**

In `src/hooks/use-saved-views.ts`, find the `matchCondition` function (around line 18) and add cases before the `default`:

```typescript
case "hasAnyOf": {
  const arr = Array.isArray(value) ? value : [];
  const targets = Array.isArray(target) ? target : [target];
  return targets.some((t: string) => arr.includes(t));
}
case "hasAllOf": {
  const arr = Array.isArray(value) ? value : [];
  const targets = Array.isArray(target) ? target : [target];
  return targets.every((t: string) => arr.includes(t));
}
```

- [ ] **Step 4: Verify with tsc**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/components/crm/types.ts src/components/crm/data-list-filter-bar.tsx src/hooks/use-saved-views.ts
git commit -m "feat: add multiSelect filter type with hasAnyOf/hasAllOf operators"
```

---

### Task 7: React hooks — useTagDefinitions and useCategoryDefinitions

**Files:**
- Create: `src/hooks/use-tag-definitions.ts`
- Create: `src/hooks/use-category-definitions.ts`

- [ ] **Step 1: Create useTagDefinitions hook**

Create `src/hooks/use-tag-definitions.ts`:

```typescript
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";

export function useTagDefinitions(organizationId: Id<"organizations">) {
  const { data, isLoading } = useQuery(
    convexQuery(api.tagDefinitions.list, { organizationId })
  );
  return { tags: data ?? [], isLoading };
}
```

- [ ] **Step 2: Create useCategoryDefinitions hook**

Create `src/hooks/use-category-definitions.ts`:

```typescript
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import type { EntityType } from "@cvx/schema";

export function useCategoryDefinitions(
  organizationId: Id<"organizations">,
  entityType: EntityType,
) {
  const { data, isLoading } = useQuery(
    convexQuery(api.categoryDefinitions.list, { organizationId, entityType })
  );
  return { categories: data ?? [], isLoading };
}
```

Note: Check the exact import path for `EntityType` — it may be exported from `convex/schema.ts` or from `@cvx/_generated/dataModel`. If `EntityType` is not directly importable, use `string` and let the Convex validator handle it.

- [ ] **Step 3: Verify with tsc**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-tag-definitions.ts src/hooks/use-category-definitions.ts
git commit -m "feat: add useTagDefinitions and useCategoryDefinitions hooks"
```

---

### Task 8: UI — TagsManagerSlideout component

**Files:**
- Create: `src/components/categories-tags/tags-manager-slideout.tsx`

- [ ] **Step 1: Create TagsManagerSlideout**

This component follows the UTUI LabelsMenu pattern from the spec. It opens a SlideoutMenu showing all org tags with checkboxes, search, and CRUD actions (permission-gated).

Create `src/components/categories-tags/tags-manager-slideout.tsx`:

The component receives props:
```typescript
interface TagsManagerSlideoutProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: Id<"organizations">;
}
```

It uses:
- `useTagDefinitions(organizationId)` to fetch tags
- `useMutation(api.tagDefinitions.create/update/remove)` for CRUD
- UTUI `SlideoutMenu`, `SlideoutMenu.Header`, `SlideoutMenu.Content`, `SlideoutMenu.Footer`
- UTUI `Badge` with `type="pill-color"`
- UTUI `Select.ComboBox` for search
- UTUI `CheckboxBase` with `react-aria-components` `Checkbox`
- UTUI `FeaturedIcon` with `Tag01` icon in header
- UTUI `Button` for add/cancel/apply
- `TAG_COLOR_PALETTE` from `./color-palette`

Key behaviors:
- List tags with colored badges and checkboxes
- "Add tag" button opens inline form (name input + color dots)
- Edit icon on each tag (if permitted) — inline rename
- Delete icon on each tag (if permitted) — confirm then call remove mutation
- ComboBox at top filters the visible tag list

Follow the exact JSX structure from the spec's "Reference: Tags SlideoutMenu pattern" section.

- [ ] **Step 2: Verify with tsc**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/categories-tags/tags-manager-slideout.tsx
git commit -m "feat: add TagsManagerSlideout with UTUI SlideoutMenu pattern"
```

---

### Task 9: UI — CategoriesManagerSlideout component

**Files:**
- Create: `src/components/categories-tags/categories-manager-slideout.tsx`

- [ ] **Step 1: Create CategoriesManagerSlideout**

This component uses the UTUI TreeView pattern from the spec. It opens a SlideoutMenu showing a 2-level tree of categories for a specific entity type, with drag-and-drop reorder and CRUD.

Props:
```typescript
interface CategoriesManagerSlideoutProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: Id<"organizations">;
  entityType: EntityType;
}
```

It uses:
- `useCategoryDefinitions(organizationId, entityType)` to fetch categories
- `useMutation(api.categoryDefinitions.create/update/remove/reorder)` for CRUD
- `useTreeData` from `react-aria-components` for tree state management
- UTUI `SlideoutMenu` for the container
- UTUI `TreeView`, `TreeView.Item`, `TreeView.ItemContent` for the hierarchy
- `Collection` from `react-aria-components` for nested items
- UTUI `FeaturedIcon` with `Folder` icon in header
- UTUI `Button` for add/edit/delete actions
- Icons from `@untitledui/icons`: `Folder`, `Plus`, `Pencil01`, `Trash01`

Key behaviors:
- Transform flat `categories` list (with `parentId`) into tree structure for `useTreeData`
- Root categories as top-level items, children nested one level deep
- Drag-and-drop reorder via `onReorder` callback (calls `reorder` mutation)
- "Add category" button at root level
- "Add subcategory" button on each root category
- Edit/Delete icons on each row (permission-gated)

Follow the exact JSX structure from the spec's "Reference: Categories TreeView pattern" section.

- [ ] **Step 2: Verify with tsc**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/categories-tags/categories-manager-slideout.tsx
git commit -m "feat: add CategoriesManagerSlideout with UTUI TreeView pattern"
```

---

### Task 10: UI — TagsPicker and CategoryPicker components

**Files:**
- Create: `src/components/categories-tags/tags-picker.tsx`
- Create: `src/components/categories-tags/category-picker.tsx`

- [ ] **Step 1: Create TagsPicker**

A dropdown component for assigning tags to an entity. Shows checkboxes with colored badges for each org tag.

Props:
```typescript
interface TagsPickerProps {
  organizationId: Id<"organizations">;
  value: Id<"tagDefinitions">[];
  onChange: (tagIds: Id<"tagDefinitions">[]) => void;
}
```

Uses UTUI Dropdown with `selectionMode="multiple"`, Badge pills, CheckboxBase.

- [ ] **Step 2: Create CategoryPicker**

A dropdown component for assigning a single category to an entity. Shows a 2-level list.

Props:
```typescript
interface CategoryPickerProps {
  organizationId: Id<"organizations">;
  entityType: EntityType;
  value: Id<"categoryDefinitions"> | undefined;
  onChange: (categoryId: Id<"categoryDefinitions"> | undefined) => void;
}
```

Uses UTUI Dropdown with `selectionMode="single"`, grouped items for parent/child.

- [ ] **Step 3: Verify with tsc**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/components/categories-tags/tags-picker.tsx src/components/categories-tags/category-picker.tsx
git commit -m "feat: add TagsPicker and CategoryPicker assignment components"
```

---

### Task 11: DataListFilterBar — add Tagi/Kategorie footer buttons

**Files:**
- Modify: `src/components/crm/data-list-filter-bar.tsx`

- [ ] **Step 1: Add new props to DataListFilterBarProps**

Add to the interface:
```typescript
entityType?: string;  // for categories (per entity type)
organizationId?: Id<"organizations">;  // needed for tag/category slideouts
```

- [ ] **Step 2: Add state and SlideoutMenu rendering**

Inside the `DataListFilterBar` component, add state for slideout visibility and render the two slideout components conditionally (only when `organizationId` is provided):

```typescript
const [tagsSlideoutOpen, setTagsSlideoutOpen] = useState(false);
const [categoriesSlideoutOpen, setCategoriesSlideoutOpen] = useState(false);
```

Add "Tagi" and "Kategorie" buttons in the bar's footer/action area. Import and render `TagsManagerSlideout` and `CategoriesManagerSlideout`.

- [ ] **Step 3: Verify with tsc**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/components/crm/data-list-filter-bar.tsx
git commit -m "feat: add Tagi/Kategorie management buttons to DataListFilterBar"
```

---

### Task 12: Wire up entity list pages — add tag/category filterableFields

**Files:**
- Modify all 12 entity list page files in `src/routes/_app/_auth/dashboard/`

The 12 files are:
- `_layout.contacts.index.tsx`
- `_layout.companies.index.tsx`
- `_layout.leads.index.tsx`
- `_layout.products.index.tsx`
- `_layout.calls.index.tsx`
- `_layout.activities.index.tsx`
- `_layout.gabinet.patients.index.tsx`
- `_layout.gabinet.employees.index.tsx`
- `_layout.gabinet.treatments.index.tsx`

Plus the remaining entity pages that have DataListFilterBar (check for: `_layout.gabinet.appointments`, document pages, etc.)

- [ ] **Step 1: Add tag/category filterable fields to each page**

In each entity list page:

1. Import the hooks:
```typescript
import { useTagDefinitions } from "@/hooks/use-tag-definitions";
import { useCategoryDefinitions } from "@/hooks/use-category-definitions";
```

2. Call the hooks inside the component:
```typescript
const { tags } = useTagDefinitions(organizationId);
const { categories } = useCategoryDefinitions(organizationId, "contact"); // use correct entityType
```

3. Add to `filterableFields` array:
```typescript
{
  id: "categoryId",
  label: t("common.category"),
  type: "select" as const,
  options: categories.map((c) => ({ label: c.name, value: c._id })),
},
{
  id: "tagIds",
  label: t("common.tags"),
  type: "multiSelect" as const,
  options: tags.map((t) => ({ label: t.name, value: t._id })),
},
```

4. Pass `organizationId` and `entityType` to DataListFilterBar:
```tsx
<DataListFilterBar
  // ... existing props
  organizationId={organizationId}
  entityType="contact"  // use correct entityType string
/>
```

The entityType strings per page:
- contacts → "contact"
- companies → "company"
- leads → "lead"
- products → "product"
- calls → "call"
- activities → "activity"
- gabinet.patients → "gabinetPatient"
- gabinet.employees → "gabinetEmployee"
- gabinet.treatments → "gabinetTreatment"

- [ ] **Step 2: Verify with tsc**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/routes/_app/_auth/dashboard/
git commit -m "feat: wire tag/category filterableFields on all entity list pages"
```

---

### Task 13: i18n — add translation keys

**Files:**
- Modify: PL and EN translation JSON files (find in `src/locales/` or `public/locales/`)

- [ ] **Step 1: Find translation files**

Search for existing translation files:
```bash
find src -name "*.json" -path "*/locales/*" -o -name "*.json" -path "*/i18n/*"
```

- [ ] **Step 2: Add keys to both PL and EN**

Add these keys under a `"tags"` and `"categories"` namespace:

```json
{
  "common": {
    "category": "Category / Kategoria",
    "tags": "Tags / Tagi"
  },
  "tags": {
    "title": "Tags / Tagi",
    "description": "Manage organization tags / Zarządzaj tagami organizacji",
    "addTag": "Add tag / Dodaj tag",
    "editTag": "Edit tag / Edytuj tag",
    "deleteTag": "Delete tag / Usuń tag",
    "confirmDelete": "Are you sure? / Czy na pewno?",
    "searchPlaceholder": "Search tags / Szukaj tagów",
    "nameRequired": "Tag name is required / Nazwa tagu jest wymagana",
    "duplicateName": "Tag already exists / Tag już istnieje"
  },
  "categories": {
    "title": "Categories / Kategorie",
    "description": "Manage categories / Zarządzaj kategoriami",
    "addCategory": "Add category / Dodaj kategorię",
    "addSubcategory": "Add subcategory / Dodaj podkategorię",
    "editCategory": "Edit category / Edytuj kategorię",
    "deleteCategory": "Delete category / Usuń kategorię",
    "confirmDelete": "Are you sure? / Czy na pewno?",
    "searchPlaceholder": "Search categories / Szukaj kategorii"
  }
}
```

(Use actual PL translations for the PL file, EN for the EN file. The `/` above is just showing both — put the correct language in each file.)

- [ ] **Step 3: Commit**

```bash
git add src/locales/ public/locales/
git commit -m "feat: add i18n keys for tags and categories"
```

---

### Task 14: Final verification

- [ ] **Step 1: TypeScript check**

Run: `npx tsc --noEmit`

Expected: Zero errors.

- [ ] **Step 2: Visual check in browser**

Navigate to `/dashboard/contacts` and verify:
- FilterBar shows "Tagi" and "Kategorie" buttons
- Clicking "Tagi" opens the TagsManagerSlideout
- Clicking "Kategorie" opens the CategoriesManagerSlideout
- Column picker includes "Tags" and "Category" columns
- Filter dropdown includes "Tags" (multiSelect) and "Category" (select) fields

- [ ] **Step 3: Test CRUD**

In the TagsManagerSlideout:
- Create a tag with name and color
- Edit the tag name
- Delete the tag

In the CategoriesManagerSlideout:
- Create a root category
- Create a subcategory under it
- Reorder via drag-and-drop
- Delete the parent (verify cascade)

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during final verification"
```
