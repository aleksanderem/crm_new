# Document Template Folder Tree Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace flat category-based grouping of document templates with a user-defined folder/directory tree structure, visible as a collapsible tree in the template selection dialog.

**Architecture:** Add a `folderPath` string field (e.g. `"Gabinet/Zgody"`) to the `formTemplates` table. The folder tree is derived from all unique path segments across templates. No separate folders table — keeps it simple and avoids extra queries. The `category` field is kept for backward compatibility but is no longer the primary grouping mechanism in the UI. Templates without a `folderPath` appear at the tree root.

**Tech Stack:** Convex (schema + mutations), React, TanStack Query, shadcn/ui, i18next (PL/EN), ez-icons

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `convex/schema/documents.ts` | Add `folderPath` field to `formTemplates` |
| Modify | `convex/documents/templates.ts` | Accept `folderPath` in create/update |
| Modify | `src/lib/ez-icons/icon-map.ts` | Add Folder/FolderOpen/FolderPlus icon mappings |
| Modify | `src/lib/ez-icons/index.ts` | Export new folder icon components |
| Modify | `src/components/documents/generate-document-dialog.tsx` | Replace category grouping with collapsible folder tree |
| Modify | `src/components/documents/template-settings-sheet.tsx` | Add folder path input |
| Modify | `src/routes/_app/_auth/dashboard/_layout.form-editor.$id.tsx` | Wire folderPath in edit page settings state + save |
| Modify | `src/routes/_app/_auth/dashboard/_layout.form-editor.new.tsx` | Wire folderPath in create page settings state + save |
| Modify | `src/routes/_app/_auth/dashboard/_layout.settings.form-templates.index.tsx` | Add folder column + folder filter |
| Modify | `public/locales/pl/translation.json` | Add folder-related i18n keys |
| Modify | `public/locales/en/translation.json` | Add folder-related i18n keys |

---

### Task 1: Schema — Add `folderPath` to `formTemplates`

**Files:**
- Modify: `convex/schema/documents.ts:40-78`

- [ ] **Step 1: Add `folderPath` field to `formTemplates` table definition**

In `convex/schema/documents.ts`, inside the `formTemplates` defineTable call, add after `category` (line 44):

```typescript
folderPath: v.optional(v.string()),
```

This is an optional string like `"Gabinet/Zgody"` or `"CRM/Umowy/Klienci"`. Segments are separated by `/`. `undefined` means root level.

- [ ] **Step 2: Verify schema pushes**

Run: `cd /Users/alfred/projects/crm_new && npx convex dev --typecheck=disable --once`
Expected: Schema push succeeds, no errors.

- [ ] **Step 3: Commit**

```bash
git add convex/schema/documents.ts
git commit -m "feat: add folderPath field to formTemplates schema"
```

---

### Task 2: Backend — Update mutations to accept `folderPath`

**Files:**
- Modify: `convex/documents/templates.ts:66-110` (create mutation args)
- Modify: `convex/documents/templates.ts:112-166` (update mutation args)

- [ ] **Step 1: Add `folderPath` to `create` mutation args**

In `convex/documents/templates.ts`, in the `create` mutation args object (around line 71), add:

```typescript
folderPath: v.optional(v.string()),
```

The handler already spreads `...args` into the insert, so no handler changes needed.

- [ ] **Step 2: Add `folderPath` to `update` mutation args**

In the `update` mutation args (around line 118), add:

```typescript
folderPath: v.optional(v.string()),
```

The handler already spreads `...updates` into the patch, so no handler changes needed.

- [ ] **Step 3: Verify backend compiles**

Run: `cd /Users/alfred/projects/crm_new && npx convex dev --typecheck=disable --once`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add convex/documents/templates.ts
git commit -m "feat: accept folderPath in template create/update mutations"
```

---

### Task 3: Icons — Add Folder icons to ez-icons

**Files:**
- Modify: `src/lib/ez-icons/icon-map.ts`
- Modify: `src/lib/ez-icons/index.ts`

- [ ] **Step 1: Add Folder icon mappings to icon-map.ts**

Add these entries to the `ICON_MAP` object in `src/lib/ez-icons/icon-map.ts` (alphabetical order, near the F section):

```typescript
Folder: "folder-01",
FolderOpen: "folder-open",
FolderPlus: "folder-add",
```

Note: These are best-guess ezicons names. If the icons don't render, the component falls back to the name string — it's cosmetic only. Check https://ezicons.com for exact names if needed.

- [ ] **Step 2: Export Folder icon components in index.ts**

Add to `src/lib/ez-icons/index.ts` (alphabetical order, near other F exports):

```typescript
export const Folder = createIcon("Folder");
export const FolderOpen = createIcon("FolderOpen");
export const FolderPlus = createIcon("FolderPlus");
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/ez-icons/icon-map.ts src/lib/ez-icons/index.ts
git commit -m "feat: add Folder/FolderOpen/FolderPlus to ez-icons"
```

---

### Task 4: i18n — Add folder-related translation keys

**Files:**
- Modify: `public/locales/pl/translation.json`
- Modify: `public/locales/en/translation.json`

- [ ] **Step 1: Add Polish translations**

Inside `settings.formTemplates` object (after `"descriptionPlaceholder"` around line 1131), add:

```json
"folderPathLabel": "Katalog",
"folderPathPlaceholder": "np. Gabinet/Zgody",
"folderPathHint": "Ścieżka katalogowa (segmenty oddzielone /)",
"allFolders": "Wszystkie katalogi",
"rootFolder": "Główny",
"colFolder": "Katalog",
"noFolder": "Bez katalogu",
"createFolder": "Utwórz nowy katalog"
```

Also add inside the `documents` section (near the template picker translations):

```json
"folderEmpty": "Pusty katalog"
```

- [ ] **Step 2: Add English translations**

Inside `settings.formTemplates` object, add:

```json
"folderPathLabel": "Folder",
"folderPathPlaceholder": "e.g. Gabinet/Consents",
"folderPathHint": "Folder path (segments separated by /)",
"allFolders": "All folders",
"rootFolder": "Root",
"colFolder": "Folder",
"noFolder": "No folder",
"createFolder": "Create new folder"
```

Also add inside the `documents` section:

```json
"folderEmpty": "Empty folder"
```

- [ ] **Step 3: Commit**

```bash
git add public/locales/pl/translation.json public/locales/en/translation.json
git commit -m "feat: add folder-related i18n keys for document templates"
```

---

### Task 5: Generate Document Dialog — Folder tree UI

**Files:**
- Modify: `src/components/documents/generate-document-dialog.tsx`

This is the primary user-facing change. Replace the category-based grouping with a collapsible folder tree. Templates are grouped by their `folderPath`. Templates with no path appear at the root level. Each folder node is collapsible (starts collapsed). Category icons remain as secondary badges on each template row.

- [ ] **Step 1: Add folder icon imports**

At the top of `generate-document-dialog.tsx`, add to the ez-icons import:

```typescript
import {
  // ... existing imports ...
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
} from "@/lib/ez-icons";
```

- [ ] **Step 2: Add `buildFolderTree` helper function**

Add before the component, after the `countFormFields` function:

```typescript
/** Build a tree structure from templates' folderPath values. */
function buildFolderTree<T extends { folderPath?: string }>(
  templates: T[],
): { root: T[]; folders: FolderNode<T>[] } {
  const root: T[] = [];
  const folderMap = new Map<string, { templates: T[]; children: Map<string, any> }>();

  for (const tpl of templates) {
    if (!tpl.folderPath) {
      root.push(tpl);
      continue;
    }

    const segments = tpl.folderPath.split("/");
    // Ensure all ancestor paths exist
    for (let i = 1; i <= segments.length; i++) {
      const path = segments.slice(0, i).join("/");
      if (!folderMap.has(path)) {
        folderMap.set(path, { templates: [], children: new Map() });
      }
    }
    // Add template to its leaf folder
    folderMap.get(tpl.folderPath)!.templates.push(tpl);

    // Wire parent→child relationships
    for (let i = 2; i <= segments.length; i++) {
      const parentPath = segments.slice(0, i - 1).join("/");
      const childPath = segments.slice(0, i).join("/");
      folderMap.get(parentPath)!.children.set(childPath, true);
    }
  }

  // Convert to a sorted array of top-level folder nodes
  interface FolderNodeInternal {
    name: string;
    fullPath: string;
    templates: T[];
    children: FolderNodeInternal[];
  }

  function buildNode(path: string): FolderNodeInternal {
    const entry = folderMap.get(path)!;
    const childPaths = Array.from(entry.children.keys()).sort();
    return {
      name: path.split("/").pop()!,
      fullPath: path,
      templates: entry.templates,
      children: childPaths.map(buildNode),
    };
  }

  // Top-level folders are those whose path has no "/"
  const topPaths = Array.from(folderMap.keys())
    .filter((p) => !p.includes("/"))
    .sort();

  return {
    root,
    folders: topPaths.map(buildNode),
  };
}

type FolderNode<T> = {
  name: string;
  fullPath: string;
  templates: T[];
  children: FolderNode<T>[];
};
```

- [ ] **Step 3: Replace category grouping with folder tree in component**

Inside the `GenerateDocumentDialog` component:

1. Remove the `groupedTemplates` and `sortedCategories` computed values (lines ~158-169).

2. Replace with:

```typescript
const folderTree = buildFolderTree(filteredTemplates);
```

3. Add collapsed state. When a search term is active, auto-expand all folders so matching templates are visible without manual expansion:

```typescript
const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

const toggleFolder = useCallback((path: string) => {
  setExpandedFolders((prev) => {
    const next = new Set(prev);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    return next;
  });
}, []);

// Auto-expand all folders when searching
const effectiveExpanded = search.trim()
  ? new Set(folderTree.folders.flatMap(function collectPaths(node: FolderNode<any>): string[] {
      return [node.fullPath, ...node.children.flatMap(collectPaths)];
    }))
  : expandedFolders;
```

Then use `effectiveExpanded` instead of `expandedFolders` when passing to `FolderTreeBranch`.

- [ ] **Step 4: Create `FolderTreeItem` and `TemplateItem` sub-components**

Add these as inline components inside the file, or as local function components:

```tsx
function TemplateItem({
  tpl,
  onSelect,
  t,
}: {
  tpl: any;
  onSelect: (id: Id<"formTemplates">) => void;
  t: (key: string, defaultValue?: string, options?: any) => string;
}) {
  const CategoryIcon = CATEGORY_ICONS[tpl.category] ?? FileText;
  const fieldCount = countFormFields(tpl.formJson);
  return (
    <button
      type="button"
      onClick={() => onSelect(tpl._id)}
      className="w-full text-left rounded-lg border p-3 transition-colors hover:bg-accent hover:border-accent-foreground/20 cursor-pointer group"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted group-hover:bg-background transition-colors">
          <CategoryIcon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium truncate">
              {tpl.name}
            </span>
            {tpl.requiresSignature && (
              <Badge variant="outline" className="text-[10px] shrink-0 gap-1 border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400">
                <FileSignature className="h-3 w-3" />
                {t("documents.requiresSignature", "Wymaga podpisu")}
              </Badge>
            )}
          </div>
          {tpl.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mb-1.5">
              {tpl.description}
            </p>
          )}
          {fieldCount > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {t("documents.fieldCount", "{{count}} pol do wypelnienia", { count: fieldCount })}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function FolderTreeBranch({
  node,
  expanded,
  onToggle,
  onSelect,
  t,
  depth = 0,
}: {
  node: FolderNode<any>;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (id: Id<"formTemplates">) => void;
  t: (key: string, defaultValue?: string, options?: any) => string;
  depth?: number;
}) {
  const isExpanded = expanded.has(node.fullPath);
  const hasContent = node.templates.length > 0 || node.children.length > 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => onToggle(node.fullPath)}
        className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        {isExpanded ? (
          <FolderOpen className="h-4 w-4 text-amber-500 shrink-0" />
        ) : (
          <Folder className="h-4 w-4 text-amber-500 shrink-0" />
        )}
        <span className="font-medium truncate">{node.name}</span>
        <span className="text-xs text-muted-foreground ml-auto shrink-0">
          {countTemplatesInNode(node)}
        </span>
      </button>

      {isExpanded && hasContent && (
        <div>
          {node.children.map((child) => (
            <FolderTreeBranch
              key={child.fullPath}
              node={child}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              t={t}
              depth={depth + 1}
            />
          ))}
          <div className="space-y-2 mt-1" style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}>
            {node.templates.map((tpl) => (
              <TemplateItem key={tpl._id} tpl={tpl} onSelect={onSelect} t={t} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function countTemplatesInNode(node: FolderNode<any>): number {
  return (
    node.templates.length +
    node.children.reduce((sum, child) => sum + countTemplatesInNode(child), 0)
  );
}
```

- [ ] **Step 5: Replace the template list JSX**

Replace the `<div className="space-y-6">` block (lines ~329-381) that renders `sortedCategories.map(...)` with:

```tsx
<div className="space-y-1">
  {/* Folder tree */}
  {folderTree.folders.map((folder) => (
    <FolderTreeBranch
      key={folder.fullPath}
      node={folder}
      expanded={effectiveExpanded}
      onToggle={toggleFolder}
      onSelect={handleTemplateSelect}
      t={t}
    />
  ))}

  {/* Root-level templates (no folder) */}
  {folderTree.root.length > 0 && (
    <div className="space-y-2 mt-3">
      {folderTree.folders.length > 0 && (
        <div className="mb-2">
          <Badge variant="secondary" className="text-xs">
            {t("settings.formTemplates.noFolder", "Bez katalogu")}
          </Badge>
        </div>
      )}
      {folderTree.root.map((tpl) => (
        <TemplateItem
          key={tpl._id}
          tpl={tpl}
          onSelect={handleTemplateSelect}
          t={t}
        />
      ))}
    </div>
  )}
</div>
```

- [ ] **Step 6: Clean up unused imports/constants**

The `CATEGORY_LABELS` constant and `sortedCategories` / `groupedTemplates` variables are no longer used in the template list. However, `CATEGORY_ICONS` is still used by `TemplateItem`. Remove only `CATEGORY_LABELS` and the old grouping logic. Keep `CATEGORY_ICONS`.

- [ ] **Step 7: Verify the dialog renders**

Run the dev server, navigate to an entity detail page, open the "Generuj dokument" dialog. Verify:
- Templates without `folderPath` appear at root level (current behavior, since no templates have folders yet)
- No console errors
- Search still works

- [ ] **Step 8: Commit**

```bash
git add src/components/documents/generate-document-dialog.tsx
git commit -m "feat: replace category grouping with folder tree in template selection dialog"
```

---

### Task 6: Template Settings Sheet — Add folder path input

**Files:**
- Modify: `src/components/documents/template-settings-sheet.tsx`

- [ ] **Step 1: Add `folderPath` to `TemplateSettings` interface and component**

In `template-settings-sheet.tsx`:

1. Add to `TemplateSettings` interface (line ~54):

```typescript
folderPath: string;
```

2. Add a folder path input section in the JSX, after the Category `<Select>` block and before the `<Separator>` (around line 206). Add:

```tsx
{/* Folder Path */}
<div className="space-y-2">
  <Label htmlFor="tpl-folder-path">
    {t("settings.formTemplates.folderPathLabel")}
  </Label>
  <Input
    id="tpl-folder-path"
    value={settings.folderPath}
    onChange={(e) => update("folderPath", e.target.value)}
    placeholder={t("settings.formTemplates.folderPathPlaceholder")}
  />
  <p className="text-xs text-muted-foreground">
    {t("settings.formTemplates.folderPathHint")}
  </p>
</div>
```

- [ ] **Step 2: Verify the sheet renders**

Open the form editor for any template, open the settings sheet. Verify the new "Katalog" / "Folder" input appears below the Category selector. Enter a path like "Gabinet/Zgody", save, verify the field persists.

- [ ] **Step 3: Commit**

```bash
git add src/components/documents/template-settings-sheet.tsx
git commit -m "feat: add folder path input to template settings sheet"
```

---

### Task 7: Wire `folderPath` through both form editor pages

**Files:**
- Modify: `src/routes/_app/_auth/dashboard/_layout.form-editor.$id.tsx:74-83` (initial state), `:88-97` (template load effect), `:131-148` (save handler)
- Modify: `src/routes/_app/_auth/dashboard/_layout.form-editor.new.tsx:61-70` (initial state), `:87-103` (save handler)

Both files import `TemplateSettings` from `template-settings-sheet.tsx`. When `folderPath: string` was added to that interface in Task 6, both files will fail TypeScript compilation because their `useState<TemplateSettings>` initializers don't include `folderPath`.

- [ ] **Step 1: Fix the edit page initial state (`_layout.form-editor.$id.tsx` line 74)**

Add `folderPath: ""` to the initial `useState<TemplateSettings>` object at line 74:

```typescript
const [settings, setSettings] = useState<TemplateSettings>({
  name: "",
  description: "",
  category: "custom" as FormCategory,
  modules: [] as Module[],
  entityTypes: [] as EntityType[],
  requiresSignature: false,
  signatureMethod: "click" as SignatureMethod,
  signerRole: "client" as SignerRole,
  folderPath: "",
});
```

- [ ] **Step 2: Fix the edit page template-load effect (`_layout.form-editor.$id.tsx` line 88)**

Add `folderPath` to the `setSettings` call in the `useEffect` that initializes from the loaded template:

```typescript
setSettings({
  name: template.name,
  description: template.description ?? "",
  category: template.category as FormCategory,
  modules: (template.modules ?? []) as Module[],
  entityTypes: (template.entityTypes ?? []) as EntityType[],
  requiresSignature: template.requiresSignature,
  signatureMethod: (template.signatureConfig?.method ?? "click") as SignatureMethod,
  signerRole: (template.signatureConfig?.signerRole ?? "client") as SignerRole,
  folderPath: template.folderPath ?? "",
});
```

- [ ] **Step 3: Fix the edit page save handler (`_layout.form-editor.$id.tsx` line 131)**

Add `folderPath` to the `updateTemplate` call:

```typescript
await updateTemplate({
  organizationId,
  templateId,
  name: settings.name.trim(),
  description: settings.description.trim() || undefined,
  category: settings.category,
  formJson: latestJson,
  modules: settings.modules,
  entityTypes: settings.entityTypes,
  requiresSignature: settings.requiresSignature,
  folderPath: settings.folderPath || undefined,
  ...(settings.requiresSignature
    ? {
        signatureConfig: {
          method: settings.signatureMethod,
          signerRole: settings.signerRole,
        },
      }
    : {}),
});
```

- [ ] **Step 4: Fix the create page initial state (`_layout.form-editor.new.tsx` line 61)**

Add `folderPath: ""` to the initial `useState<TemplateSettings>` object:

```typescript
const [settings, setSettings] = useState<TemplateSettings>({
  name: "",
  description: "",
  category: "custom" as FormCategory,
  modules: ["platform"] as Module[],
  entityTypes: [] as EntityType[],
  requiresSignature: false,
  signatureMethod: "click" as SignatureMethod,
  signerRole: "client" as SignerRole,
  folderPath: "",
});
```

- [ ] **Step 5: Fix the create page save handler (`_layout.form-editor.new.tsx` line 87)**

Add `folderPath` to the `createTemplate` call:

```typescript
const templateId = await createTemplate({
  organizationId,
  name: settings.name.trim(),
  description: settings.description.trim() || undefined,
  category: settings.category,
  formJson: latestJson,
  modules: settings.modules,
  entityTypes: settings.entityTypes,
  requiresSignature: settings.requiresSignature,
  folderPath: settings.folderPath || undefined,
  ...(settings.requiresSignature
    ? {
        signatureConfig: {
          method: settings.signatureMethod,
          signerRole: settings.signerRole,
        },
      }
    : {}),
});
```

- [ ] **Step 6: Verify end-to-end**

1. Open a template in the form editor → settings sheet → set folder path to "Gabinet/Zgody" → save
2. Reload the page → folder path persists
3. Create a new template → set folder path → save → verify it persists
4. Open the Generate Document dialog → template appears under "Gabinet" → "Zgody"

- [ ] **Step 7: Commit**

```bash
git add src/routes/_app/_auth/dashboard/_layout.form-editor.$id.tsx src/routes/_app/_auth/dashboard/_layout.form-editor.new.tsx
git commit -m "feat: wire folderPath through both form editor pages"
```

---

### Task 8: Settings List Page — Add folder column and filter

**Files:**
- Modify: `src/routes/_app/_auth/dashboard/_layout.settings.form-templates.index.tsx`

- [ ] **Step 1: Add `folderPath` to `FormTemplateRecord` interface**

Add to the interface (around line 91):

```typescript
folderPath?: string;
```

- [ ] **Step 2: Add folder filter state and logic**

After the `categoryFilter` state (line 107), add:

```typescript
const [folderFilter, setFolderFilter] = useState<string>("all");
```

In the `filtered` computation, add folder filtering:

```typescript
const filtered = (templates ?? []).filter((tpl) => {
  const t = tpl as FormTemplateRecord;
  if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
  if (folderFilter !== "all") {
    if (folderFilter === "__none__" && t.folderPath) return false;
    if (folderFilter !== "__none__" && t.folderPath !== folderFilter) return false;
  }
  if (search && !t.name.toLowerCase().includes(search.toLowerCase()))
    return false;
  return true;
});
```

Compute unique folder paths for the filter dropdown:

```typescript
const uniqueFolders = Array.from(
  new Set(
    (templates ?? [])
      .map((tpl) => (tpl as FormTemplateRecord).folderPath)
      .filter(Boolean) as string[],
  ),
).sort();
```

- [ ] **Step 3: Add folder filter dropdown to the filters bar**

After the category `<Select>` (around line 241), add:

```tsx
<Select value={folderFilter} onValueChange={setFolderFilter}>
  <SelectTrigger className="w-[200px]">
    <SelectValue
      placeholder={t("settings.formTemplates.allFolders")}
    />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">
      {t("settings.formTemplates.allFolders")}
    </SelectItem>
    <SelectItem value="__none__">
      {t("settings.formTemplates.noFolder")}
    </SelectItem>
    {uniqueFolders.map((folder) => (
      <SelectItem key={folder} value={folder}>
        {folder}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

- [ ] **Step 4: Add folder column to the table**

Add a new `<TableHead>` after `colCategory` (around line 265):

```tsx
<TableHead>{t("settings.formTemplates.colFolder")}</TableHead>
```

Add the corresponding `<TableCell>` in the row (after the category badge cell):

```tsx
<TableCell>
  {template.folderPath ? (
    <Badge variant="outline" className="text-xs font-normal">
      {template.folderPath}
    </Badge>
  ) : (
    <span className="text-xs text-muted-foreground">—</span>
  )}
</TableCell>
```

- [ ] **Step 5: Fix `handleDuplicate` to include `folderPath`**

In the `handleDuplicate` function (around line 149), add `folderPath` to the `createTemplate` call so duplicated templates keep their folder assignment:

```typescript
const handleDuplicate = async (template: FormTemplateRecord) => {
  try {
    await createTemplate({
      organizationId,
      name: `${template.name} (${t("common.copy")})`,
      description: template.description,
      category: template.category as FormCategory,
      formJson: "{}",
      modules: template.modules,
      entityTypes: template.entityTypes,
      requiresSignature: template.requiresSignature,
      folderPath: template.folderPath || undefined,
    });
    toast.success(t("settings.formTemplates.duplicated"));
  } catch {
    toast.error(t("settings.formTemplates.duplicateError"));
  }
};
```

- [ ] **Step 6: Verify the list page**

1. Navigate to Settings → Form Templates
2. Verify the new "Katalog" / "Folder" column appears
3. Verify the folder filter dropdown appears and works
4. Templates with folder paths show the path badge; others show "—"
5. Duplicate a template with a folder path → duplicate keeps the folder assignment

- [ ] **Step 7: Commit**

```bash
git add src/routes/_app/_auth/dashboard/_layout.settings.form-templates.index.tsx
git commit -m "feat: add folder column and filter to template settings list"
```

---

### Task 9: Final verification

- [ ] **Step 1: End-to-end test**

1. Go to Settings → Form Templates
2. Edit a template → set folder path to "Gabinet/Zgody" → save
3. Edit another template → set folder path to "Gabinet/Recepty" → save
4. Edit a third template → set folder path to "CRM/Umowy" → save
5. Return to template list → verify folder column shows paths
6. Use folder filter → verify filtering works
7. Go to an appointment or patient detail page
8. Click "Generuj dokument" → verify folder tree appears:
   - "Gabinet" folder (collapsed) → expand → "Zgody" and "Recepty" subfolders
   - "CRM" folder → "Umowy" subfolder
   - Root-level templates (without folders) below
9. Search in the dialog → verify search still works across all templates
10. Select a template from within a folder → verify form fill step works normally

- [ ] **Step 2: Final commit**

```bash
git add -A
git commit -m "feat: document template folder tree - final touches"
```

---

## Backward Compatibility

- `folderPath` is `v.optional(v.string())` — existing templates have `undefined`, which means root level
- The `category` field is untouched — still stored, still shown as a badge on each template card
- The `listByCategory` and `listByEntityType` queries are untouched
- `CATEGORY_ICONS` are still used per-template to show the right icon
- No migration needed — templates without `folderPath` simply appear at root

## Notes

- The folder structure is implicit (derived from `folderPath` strings). There's no separate "create folder" UI — folders appear automatically when a template is assigned a path.
- Renaming a folder path on one template doesn't rename it on others. This is a deliberate simplification. If folder rename is needed later, a batch-update mutation can be added.
- The `category` field remains as a secondary taxonomy. It could be phased out in the future, but for now it provides useful visual differentiation via icons and badges.
