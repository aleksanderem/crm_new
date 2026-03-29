# F3: Account Settings Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix avatar inconsistency across the app, extract shared avatar utilities, wire NavAccountCard to real data, and audit all settings pages for correctness.

**Architecture:** Fix the `updateUserImage` mutation to cache the URL (matching `updateProfile` behavior), create a shared `src/lib/avatar.ts` utility for fallback gradient and initials, update all avatar rendering sites, and wire the NavAccountCard component to real user data.

**Tech Stack:** Convex mutations, React, TailwindCSS, Vitest (backend tests)

**Spec:** `docs/superpowers/specs/2026-03-26-email-system-overhaul-design.md` (section F3)

---

### Task 1: Fix updateUserImage mutation to cache URL

**Files:**
- Modify: `convex/app.ts:129-140`
- Test: `tests/convex/avatarConsistency.test.ts` (create)

- [ ] **Step 1: Write failing test for URL caching**

Create `tests/convex/avatarConsistency.test.ts`:

```typescript
import { expect, test, describe } from "vitest";
import { api } from "../_generated/api";
import { createTestCtx, seedTestUser } from "../_test_helpers";

describe("updateUserImage", () => {
  test("caches storage URL in image field when imageId is set", async () => {
    const t = createTestCtx();
    const { userId, identity } = await seedTestUser(t);

    // Upload a fake file to storage
    const storageId = await t.run(async (ctx) => {
      return await ctx.storage.store(new Blob(["fake-image"]));
    });

    // Call updateUserImage
    await t.withIdentity(identity).mutation(api.app.updateUserImage, {
      imageId: storageId,
    });

    // Verify both imageId AND image (cached URL) are set
    const user = await t.run(async (ctx) => ctx.db.get(userId));
    expect(user!.imageId).toBe(storageId);
    expect(user!.image).toBeDefined();
    expect(user!.image).toMatch(/^https?:\/\//);
  });

  test("removeUserImage clears both imageId and image", async () => {
    const t = createTestCtx();
    const { userId, identity } = await seedTestUser(t);

    // Set an image first
    const storageId = await t.run(async (ctx) => {
      return await ctx.storage.store(new Blob(["fake-image"]));
    });
    await t.withIdentity(identity).mutation(api.app.updateUserImage, {
      imageId: storageId,
    });

    // Remove it
    await t.withIdentity(identity).mutation(api.app.removeUserImage, {});

    const user = await t.run(async (ctx) => ctx.db.get(userId));
    expect(user!.imageId).toBeUndefined();
    expect(user!.image).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/alfred/projects/crm_new && npx vitest run tests/convex/avatarConsistency.test.ts --reporter=verbose`
Expected: FAIL — `user!.image` is undefined because `updateUserImage` does not cache URL.

- [ ] **Step 3: Fix updateUserImage mutation**

In `convex/app.ts`, replace the `updateUserImage` handler (lines 129-140):

```typescript
export const updateUserImage = mutation({
  args: {
    imageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return;
    }
    const url = await ctx.storage.getUrl(args.imageId);
    await ctx.db.patch(userId, {
      imageId: args.imageId,
      image: url ?? undefined,
    });
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/alfred/projects/crm_new && npx vitest run tests/convex/avatarConsistency.test.ts --reporter=verbose`
Expected: PASS (2/2)

- [ ] **Step 5: Run full typecheck to verify no regressions**

Run: `npx tsc -p convex/tsconfig.json --noEmit && npx tsc -p tsconfig.app.json --noEmit`
Expected: Both pass with no errors.

- [ ] **Step 6: Commit**

```bash
git add convex/app.ts tests/convex/avatarConsistency.test.ts
git commit -m "fix: updateUserImage now caches storage URL in image field"
```

---

### Task 2: Create shared avatar utility

**Files:**
- Create: `src/lib/avatar.ts`

- [ ] **Step 1: Create avatar utility file**

Create `src/lib/avatar.ts`:

```typescript
/**
 * Shared avatar utilities — single source of truth for avatar fallbacks.
 */

/** Default gradient used when no avatar image is available. */
export const AVATAR_FALLBACK_GRADIENT = "from-lime-400 via-cyan-300 to-blue-500";

/** Extract initials from a display name (up to 2 characters). */
export function getAvatarInitials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Generate a deterministic Tailwind gradient class from a name.
 * Returns a gradient string like "from-blue-400 via-purple-300 to-pink-500".
 * Falls back to AVATAR_FALLBACK_GRADIENT if no name provided.
 */
export function getAvatarGradient(name?: string | null): string {
  if (!name) return AVATAR_FALLBACK_GRADIENT;

  // Simple hash from name
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  hash = Math.abs(hash);

  const fromColors = ["from-red-400", "from-orange-400", "from-amber-400", "from-lime-400", "from-emerald-400", "from-cyan-400", "from-blue-400", "from-violet-400", "from-purple-400", "from-pink-400"];
  const toColors = ["to-orange-500", "to-amber-500", "to-yellow-500", "to-green-500", "to-teal-500", "to-sky-500", "to-indigo-500", "to-purple-500", "to-fuchsia-500", "to-rose-500"];

  const from = fromColors[hash % fromColors.length];
  const to = toColors[(hash >> 4) % toColors.length];

  return `${from} ${to}`;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/avatar.ts
git commit -m "feat: add shared avatar utility with initials and gradient helpers"
```

---

### Task 3: Update avatar rendering locations to use shared utility

**Files:**
- Modify: `src/routes/_app/_auth/dashboard/-ui.navigation.tsx`
- Modify: `src/routes/_app/_auth/dashboard/_layout.settings.profile.tsx`
- Reference: `src/lib/avatar.ts`

- [ ] **Step 1: Find all hardcoded avatar gradient occurrences**

Run: `grep -rn "from-lime-400\|via-cyan-300\|to-blue-500" src/ --include="*.tsx" --include="*.ts"`

This reveals all locations with hardcoded avatar gradient. Update each one.

- [ ] **Step 2: Update navigation component**

In `src/routes/_app/_auth/dashboard/-ui.navigation.tsx`, replace hardcoded gradient imports/usage with:

```typescript
import { AVATAR_FALLBACK_GRADIENT, getAvatarInitials } from "@/lib/avatar";
```

Replace all instances of the inline gradient string `"from-lime-400 via-cyan-300 to-blue-500"` with `AVATAR_FALLBACK_GRADIENT`.

Replace any inline initials logic with `getAvatarInitials(user.name)`.

- [ ] **Step 3: Update profile settings**

In `src/routes/_app/_auth/dashboard/_layout.settings.profile.tsx`, apply the same pattern:

```typescript
import { AVATAR_FALLBACK_GRADIENT, getAvatarInitials } from "@/lib/avatar";
```

Replace the hardcoded gradient with `AVATAR_FALLBACK_GRADIENT`.

- [ ] **Step 4: Update any other locations found in Step 1**

For each file found in Step 1, apply the same import + replacement pattern.

- [ ] **Step 5: Verify typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/routes/_app/_auth/dashboard/-ui.navigation.tsx src/routes/_app/_auth/dashboard/_layout.settings.profile.tsx [any other files]
git commit -m "refactor: use shared avatar utility for gradient fallback across app"
```

---

### Task 4: Wire NavAccountCard to real user data

**Files:**
- Modify: `src/components/application/app-navigation/base-components/nav-account-card.tsx`
- Reference: `src/components/application/app-navigation/sidebar-navigation/sidebar-sections-subheadings.tsx` (imports NavAccountCard)

- [ ] **Step 1: Read NavAccountCard current implementation**

Read the file to understand its current props and hardcoded data structure.

- [ ] **Step 2: Update NavAccountCard to accept user props**

The component should accept real user data via props (name, email, avatarUrl) instead of using hardcoded placeholder data. Keep the component's visual structure, just replace the data source.

If the component currently hardcodes accounts array, replace with a single-account display using the passed-in user data. Use `getAvatarInitials` and `AVATAR_FALLBACK_GRADIENT` from `@/lib/avatar` for the fallback.

- [ ] **Step 3: Update sidebar-sections-subheadings.tsx to pass real data**

In `sidebar-sections-subheadings.tsx`, pass the current user's data to NavAccountCard. If the component doesn't have access to user context, it either needs to receive it via props from a parent, or use the `useCurrentUser()` hook (check which pattern is used in the closest parent with user context).

- [ ] **Step 4: Verify typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/application/app-navigation/base-components/nav-account-card.tsx src/components/application/app-navigation/sidebar-navigation/sidebar-sections-subheadings.tsx
git commit -m "fix: wire NavAccountCard to real user data instead of hardcoded placeholders"
```

---

### Task 5: Systematic settings audit

**Files:**
- All `src/routes/_app/_auth/dashboard/_layout.settings*.tsx` files

This task is an audit — load each settings page, verify it works, document issues. The agent should use the dev browser or typecheck to verify.

- [ ] **Step 1: Run app typecheck as baseline**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: PASS — confirms no pre-existing type errors in settings pages.

- [ ] **Step 2: Audit each settings route file for obvious issues**

For each settings file, read it and check:
- Does it use `useOrganization()` correctly?
- Are Convex queries/mutations called with correct arguments?
- Are forms using proper validation?
- Are there console.log statements left in?
- Are there unused imports?
- Any TypeScript `any` casts that should be typed?

Files to audit (read each one):
- `_layout.settings.index.tsx`
- `_layout.settings.profile.tsx`
- `_layout.settings.organization.tsx`
- `_layout.settings.team.tsx`
- `_layout.settings.permissions.tsx`
- `_layout.settings.billing.tsx`
- `_layout.settings.audit-log.tsx`
- `_layout.settings.pipelines.tsx`
- `_layout.settings.sources.tsx`
- `_layout.settings.lost-reasons.tsx`
- `_layout.settings.activity-types.tsx`
- `_layout.settings.custom-fields.tsx`
- `_layout.settings.email.tsx`
- `_layout.settings.email-templates*.tsx`
- `_layout.settings.email-events.tsx`
- `_layout.settings.email-sequences.tsx`
- `_layout.settings.sms.tsx`
- `_layout.settings.integrations.tsx`
- `_layout.settings.automations*.tsx`
- `_layout.settings.form-templates*.tsx`

- [ ] **Step 3: Log issues found**

Document all issues found in `tasks_progress_verbose.txt` with file path, line number, and description.

- [ ] **Step 4: Fix issues**

Fix each issue found. Common patterns:
- Remove unused imports
- Remove console.log
- Fix TypeScript types
- Fix form validation gaps

- [ ] **Step 5: Run typecheck after fixes**

Run: `npx tsc -p tsconfig.app.json --noEmit && npx tsc -p convex/tsconfig.json --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add [all modified files]
git commit -m "fix: settings pages audit — cleanup and corrections"
```
