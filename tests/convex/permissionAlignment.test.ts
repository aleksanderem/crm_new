/**
 * Permission alignment test — CI gate (closes #3743)
 *
 * For every (feature, action) pair that a Convex mutation/action/query gates via
 * checkPermission(), there must be at least one UI call site that checks the same
 * pair via usePermission(), PermissionGate, or a typed config object consumed by
 * either of those hooks.  A missing UI gate means the backend enforces a rule that
 * the UI silently ignores, making the feature effectively hidden for restricted
 * roles without any feedback.
 *
 * ## How it works
 * 1. Walk convex/**‌/*.ts, find every checkPermission call, extract (feature, action).
 * 2. Walk src/**‌/*.tsx|ts, extract (feature, action) from:
 *    - usePermission("feature", "action")
 *    - <PermissionGate feature="…" action="…">
 *    - typed config objects: { feature: "…", action: "…" }
 *    - permissionFeature: "…" entries used with usePermissions("view"|"create")
 * 3. Assert backend_pairs ⊆ ui_pairs ∪ KNOWN_GAPS.
 * 4. Assert KNOWN_GAPS ⊆ backend_pairs (remove stale entries promptly).
 *
 * ## Adding a new feature
 * If you add a checkPermission() call and CI fails here, you have two options:
 *   a) Add the matching usePermission() / PermissionGate to the UI (preferred).
 *   b) Add the pair to KNOWN_GAPS with a comment explaining why no UI gate is needed.
 *
 * ## Shrinking KNOWN_GAPS
 * Whenever you add a UI gate for an existing gap, remove it from KNOWN_GAPS.
 * If you leave a stale entry the test will fail (assertion 4 above).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { describe, test, expect } from "vitest";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(TEST_DIR, "../../");
const CONVEX_DIR = path.join(PROJECT_ROOT, "convex");
const SRC_DIR = path.join(PROJECT_ROOT, "src");

// ─── Known gaps ──────────────────────────────────────────────────────────────
//
// These backend pairs currently have no static UI gate.  Each is tolerated today
// for one of two reasons:
//
//   (dynamic) — the UI gates the feature via usePermissions("action") + can("feature")
//               where "feature" is a runtime value in a config array, so the static
//               scanner cannot see it.  The pair IS effectively gated in the UI.
//
//   (backend-only) — the backend enforces the rule but the UI shows the route to
//                    everyone (the API returns empty/forbidden responses for low-privilege
//                    users).  These are candidates for proper UI gating in follow-up work.
//
// Format: "feature:action"
const KNOWN_GAPS = new Set<string>([
  // CRM core — create/delete/view gated dynamically via usePermissions("create")
  // + can("leads"|"contacts"|"companies") in quick-create-menu / app-sidebar.
  "leads:create", // dynamic
  "leads:delete", // backend-only: delete button guard is role-controlled server-side
  "leads:view", // dynamic: sidebar visibility via canView("leads")
  "contacts:create", // dynamic
  "contacts:delete", // backend-only
  "contacts:view", // dynamic
  "companies:create", // dynamic
  "companies:delete", // backend-only
  "companies:view", // dynamic

  // Calls — the calls log has no explicit usePermission gate in the UI yet.
  "calls:view", // backend-only
  "calls:edit", // backend-only
  "calls:delete", // backend-only

  // Activities — delete is enforced server-side; no UI delete button with a perm check.
  "activities:delete", // backend-only

  // Documents — delete action is enforced server-side only.
  "documents:delete", // backend-only

  // Pipelines — pipeline CRUD is settings-only; no usePermission call in the editor yet.
  "pipelines:create", // backend-only
  "pipelines:delete", // backend-only
  "pipelines:edit", // backend-only
  "pipelines:view", // backend-only

  // Products — products list/create/edit/delete lack per-action UI gates.
  "products:create", // backend-only
  "products:delete", // backend-only
  "products:edit", // backend-only
  "products:view", // backend-only

  // Settings — email-sequence / onboarding mutations check settings:edit server-side.
  "settings:edit", // backend-only

  // Admin-only definition tables — no UI per-action gate; owners/admins always see them.
  "categoryDefinitions:create", // backend-only
  "categoryDefinitions:delete", // backend-only
  "categoryDefinitions:edit", // backend-only
  "tagDefinitions:create", // backend-only
  "tagDefinitions:delete", // backend-only
  "tagDefinitions:edit", // backend-only

  // Gabinet — appointment delete checked server-side; no delete-button perm gate in UI.
  "gabinet_appointments:delete", // backend-only
]);

// ─── File walker ─────────────────────────────────────────────────────────────

function walkFiles(
  dir: string,
  extRe: RegExp,
  skipNameRe: RegExp,
): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipNameRe.test(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full, extRe, skipNameRe));
    } else if (extRe.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

// ─── Backend extraction ───────────────────────────────────────────────────────

const BACKEND_SKIP_DIRS = /^(_generated|node_modules)$/;
const BACKEND_SKIP_FILES =
  /^(vitest\.config\.ts|permissionTypes\.ts|gabinetRolePermissions\.ts)$/;
// Files that define checkPermission itself (not call sites)
const BACKEND_DEFINITION_FILES = new Set([
  path.join(CONVEX_DIR, "_helpers", "permissions.ts"),
  path.join(CONVEX_DIR, "_helpers", "authAction.ts"),
]);

function extractBackendPairs(files: string[]): Set<string> {
  const pairs = new Set<string>();
  for (const fpath of files) {
    if (BACKEND_DEFINITION_FILES.has(fpath)) continue;
    const content = fs.readFileSync(fpath, "utf8");
    if (!content.includes("checkPermission")) continue;

    let pos = 0;
    while (true) {
      const idx = content.indexOf("checkPermission", pos);
      if (idx === -1) break;
      // Inspect the 400-character window following the call site
      const window = content.slice(idx, idx + 400);

      // Object-arg pattern: { ..., feature: "X", ..., action: "Y", ... }
      const featM = window.match(/feature:\s*["']([\w]+)["']/);
      const actM = window.match(/action:\s*["']([\w]+)["']/);
      if (featM && actM) {
        pairs.add(`${featM[1]}:${actM[1]}`);
      }

      // Positional pattern: checkPermission(ctx, orgId, "feature", "action")
      const directM = window.match(
        /checkPermission\s*\([^,]+,\s*[^,]+,\s*["']([\w]+)["']\s*,\s*["']([\w]+)["']/,
      );
      if (directM) {
        pairs.add(`${directM[1]}:${directM[2]}`);
      }

      pos = idx + 1;
    }
  }
  return pairs;
}

// ─── UI extraction ────────────────────────────────────────────────────────────

const UI_SKIP_DIRS = /^(node_modules|\.next|dist)$/;
const UI_SKIP_FILES = /\.(test|spec)\.(tsx?|jsx?)$/;

function extractUIPairs(files: string[]): Set<string> {
  const pairs = new Set<string>();

  for (const fpath of files) {
    const content = fs.readFileSync(fpath, "utf8");

    // 1. usePermission("feature", "action")
    for (const m of content.matchAll(
      /usePermission\s*\(\s*["']([\w]+)["']\s*,\s*["']([\w]+)["']/g,
    )) {
      pairs.add(`${m[1]}:${m[2]}`);
    }

    // 2. <PermissionGate feature="X" action="Y"> (either attribute order)
    for (const m of content.matchAll(
      /PermissionGate[^>]*?feature=["']([\w]+)["'][^>]*?action=["']([\w]+)["']/gs,
    )) {
      pairs.add(`${m[1]}:${m[2]}`);
    }
    for (const m of content.matchAll(
      /PermissionGate[^>]*?action=["']([\w]+)["'][^>]*?feature=["']([\w]+)["']/gs,
    )) {
      pairs.add(`${m[2]}:${m[1]}`);
    }

    // 3. Config-object pattern: { ..., feature: "X", ..., action: "Y", ... }
    //    Used by entity-quick-actions and similar typed config arrays that are
    //    then passed to usePermission(config.feature, config.action).
    //    Scan 200-char windows starting from each "feature:" occurrence.
    let pos = 0;
    while (true) {
      const idx = content.indexOf('feature: "', pos);
      if (idx === -1) break;
      const window = content.slice(idx, idx + 200);
      const f = window.match(/feature:\s*["']([\w]+)["']/);
      const a = window.match(/action:\s*["']([\w]+)["']/);
      if (f && a) pairs.add(`${f[1]}:${a[1]}`);
      pos = idx + 1;
    }
    // Also scan starting from "action:" for reversed declaration order
    pos = 0;
    while (true) {
      const idx = content.indexOf('action: "', pos);
      if (idx === -1) break;
      const window = content.slice(Math.max(0, idx - 100), idx + 200);
      const f = window.match(/feature:\s*["']([\w]+)["']/);
      const a = window.match(/action:\s*["']([\w]+)["']/);
      if (f && a) pairs.add(`${f[1]}:${a[1]}`);
      pos = idx + 1;
    }

    // 4. permissionFeature: "X" in sidebar/navigation config arrays.
    //    These are consumed by usePermissions("view") / usePermissions("create").
    const configFeatures = [
      ...content.matchAll(/permissionFeature:\s*["']([\w]+)["']/g),
    ].map((m) => m[1]);
    if (configFeatures.length > 0) {
      const bulkActions = [
        ...content.matchAll(/usePermissions\s*\(\s*["']([\w]+)["']/g),
      ].map((m) => m[1]);
      // Infer actions from the hook aliases present in the file
      if (!bulkActions.length) {
        if (/canView\b/.test(content)) bulkActions.push("view");
        if (/canCreate\b/.test(content)) bulkActions.push("create");
      }
      for (const feat of configFeatures) {
        for (const act of bulkActions) {
          pairs.add(`${feat}:${act}`);
        }
      }
    }
  }

  return pairs;
}

// ─── Test ─────────────────────────────────────────────────────────────────────

describe("Permission alignment: backend ↔ UI", () => {
  const backendFiles = walkFiles(
    CONVEX_DIR,
    /\.ts$/,
    BACKEND_SKIP_DIRS,
  ).filter((f) => !BACKEND_SKIP_FILES.test(path.basename(f)) && !/test/i.test(path.basename(f)));

  const uiFiles = walkFiles(SRC_DIR, /\.(tsx?|jsx?)$/, UI_SKIP_DIRS).filter(
    (f) => !UI_SKIP_FILES.test(f),
  );

  const backendPairs = extractBackendPairs(backendFiles);
  const uiPairs = extractUIPairs(uiFiles);

  test("every backend checkPermission pair has a UI gate or is listed in KNOWN_GAPS", () => {
    const ungated: string[] = [];
    for (const pair of backendPairs) {
      if (!uiPairs.has(pair) && !KNOWN_GAPS.has(pair)) {
        ungated.push(pair);
      }
    }

    if (ungated.length > 0) {
      const msg = [
        `${ungated.length} backend permission pair(s) have no UI gate and are not listed in KNOWN_GAPS.`,
        `Add a usePermission() / PermissionGate call in the UI, or add the pair to KNOWN_GAPS`,
        `in tests/convex/permissionAlignment.test.ts with a comment explaining the exemption.`,
        ``,
        `Missing pairs:`,
        ...ungated.sort().map((p) => `  ${p}`),
      ].join("\n");
      expect.fail(msg);
    }
  });

  test("KNOWN_GAPS contains no stale entries (all pairs still exist in backend)", () => {
    const stale: string[] = [];
    for (const pair of KNOWN_GAPS) {
      if (!backendPairs.has(pair)) {
        stale.push(pair);
      }
    }

    if (stale.length > 0) {
      const msg = [
        `${stale.length} KNOWN_GAPS entry/entries no longer appear in the backend.`,
        `Remove them from KNOWN_GAPS in tests/convex/permissionAlignment.test.ts.`,
        ``,
        `Stale entries:`,
        ...stale.sort().map((p) => `  ${p}`),
      ].join("\n");
      expect.fail(msg);
    }
  });
});
