import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/*
 * Audit test for module manifest dispatches.
 *
 * Every `dispatch: "<id>"` in `src/modules/<module>/manifest.ts` must be
 * handled by a `useSidebarDispatch("<id>", ...)` call on at least one of the
 * route files that match the page context's `to` paths. Otherwise the sidebar
 * action menu will render the entry, fire the dispatch on click, and silently
 * do nothing (regression behind #88).
 *
 * The audit reads manifests and route files as text (no module imports), so it
 * has no runtime dependencies on icons/widgets/Convex.
 *
 * KNOWN_ORPHANS holds dispatches that are declared in a manifest but not yet
 * wired up on the target page. Adding a new manifest dispatch without a
 * matching `useSidebarDispatch` will fail this test. Wiring up an orphan
 * without removing it from this list will also fail (so the list stays tidy).
 */

const REPO_ROOT = resolve(__dirname, "../..");
const ROUTES_DIR = join(REPO_ROOT, "src/routes/_app/_auth/dashboard");

const MANIFEST_FILES = [
  "src/modules/crm/manifest.ts",
  "src/modules/gabinet/manifest.ts",
] as const;

type Orphan = `${string}::${string}::${string}`;

// Manifests in this repo currently declare these dispatches without a matching
// `useSidebarDispatch` on the target route. They are tracked here so the test
// passes today and starts failing the moment a NEW orphan is introduced — or
// an existing orphan is wired up (in which case remove the entry).
const KNOWN_ORPHANS: ReadonlySet<Orphan> = new Set<Orphan>([
  "src/modules/gabinet/manifest.ts::reports::exportReport",
  "src/modules/gabinet/manifest.ts::reports::filterByDate",
  "src/modules/gabinet/manifest.ts::reports::viewTreatmentStats",
  "src/modules/gabinet/manifest.ts::reports::viewRevenueReport",
]);

interface PageContextEntry {
  manifestFile: string;
  key: string;
  routes: string[];
  dispatches: string[];
}

function extractTopLevelObjects(text: string, arrayStart: number): string[] {
  const objects: string[] = [];
  let i = arrayStart;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "]") return objects;
    if (ch !== "{") {
      i++;
      continue;
    }
    let depth = 0;
    let inString = false;
    let stringChar = "";
    let escape = false;
    const start = i;
    while (i < text.length) {
      const c = text[i];
      if (escape) {
        escape = false;
        i++;
        continue;
      }
      if (inString) {
        if (c === "\\") {
          escape = true;
        } else if (c === stringChar) {
          inString = false;
        }
        i++;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        inString = true;
        stringChar = c;
      } else if (c === "{") {
        depth++;
      } else if (c === "}") {
        depth--;
        if (depth === 0) {
          i++;
          objects.push(text.slice(start, i));
          break;
        }
      }
      i++;
    }
  }
  return objects;
}

function parseManifest(filePathRel: string): PageContextEntry[] {
  const filePath = join(REPO_ROOT, filePathRel);
  const text = readFileSync(filePath, "utf8");
  const marker = text.indexOf("pageContexts:");
  if (marker < 0) return [];
  const arrayStart = text.indexOf("[", marker);
  if (arrayStart < 0) return [];
  const blocks = extractTopLevelObjects(text, arrayStart + 1);

  return blocks
    .map((block): PageContextEntry | null => {
      const keyMatch = /\bkey:\s*"([^"]+)"/.exec(block);
      if (!keyMatch) return null;
      const routes = Array.from(block.matchAll(/\bto:\s*"([^"]+)"/g)).map(
        (m) => m[1]
      );
      const dispatches = Array.from(
        block.matchAll(/\bdispatch:\s*"([^"]+)"/g)
      ).map((m) => m[1]);
      return {
        manifestFile: filePathRel,
        key: keyMatch[1],
        routes,
        dispatches,
      };
    })
    .filter((c): c is PageContextEntry => c !== null);
}

function routePathToCandidateFiles(routePath: string): string[] {
  const trimmed = routePath.replace(/^\/+|\/+$/g, "");
  const segments = trimmed.split("/").filter(Boolean);
  if (segments[0] !== "dashboard") return [];
  const rest = segments.slice(1);
  const prefix = rest.length === 0 ? "_layout" : `_layout.${rest.join(".")}`;
  // TanStack Router conventions: index, lazy, and base files all map to the
  // same route path. Either the page file itself or its lazy companion may
  // host the dispatch handler.
  return [
    `${prefix}.tsx`,
    `${prefix}.index.tsx`,
    `${prefix}.lazy.tsx`,
    `${prefix}.index.lazy.tsx`,
    `${prefix}.index.lazy.ts`,
  ];
}

function findExistingFiles(routePath: string): string[] {
  const candidates = routePathToCandidateFiles(routePath);
  return candidates
    .map((name) => join(ROUTES_DIR, name))
    .filter((p) => existsSync(p));
}

function fileMentionsDispatch(filePath: string, dispatchId: string): boolean {
  const text = readFileSync(filePath, "utf8");
  // Match `useSidebarDispatch("id", ...)` or `useSidebarDispatch('id', ...)`.
  const re = new RegExp(
    `useSidebarDispatch\\(\\s*["'\`]${escapeRegExp(dispatchId)}["'\`]`,
    "m"
  );
  return re.test(text);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("module manifest dispatches", () => {
  const allContexts = MANIFEST_FILES.flatMap((f) => parseManifest(f));

  it("ROUTES_DIR exists", () => {
    expect(existsSync(ROUTES_DIR)).toBe(true);
  });

  it("at least one manifest page context was discovered", () => {
    expect(allContexts.length).toBeGreaterThan(0);
  });

  const flagged: { entry: Orphan; reason: string }[] = [];
  const wired: Orphan[] = [];

  for (const ctx of allContexts) {
    for (const dispatchId of ctx.dispatches) {
      const orphanKey: Orphan = `${ctx.manifestFile}::${ctx.key}::${dispatchId}`;
      const candidateFiles = ctx.routes.flatMap(findExistingFiles);
      let matched = false;
      let candidatesMissing = candidateFiles.length === 0;
      for (const file of candidateFiles) {
        if (fileMentionsDispatch(file, dispatchId)) {
          matched = true;
          break;
        }
      }
      if (matched) {
        wired.push(orphanKey);
      } else {
        flagged.push({
          entry: orphanKey,
          reason: candidatesMissing
            ? `no route file found for ${ctx.routes.join(", ")}`
            : `useSidebarDispatch("${dispatchId}") missing from: ${candidateFiles
                .map((p) => p.replace(`${REPO_ROOT}/`, ""))
                .join(", ")}`,
        });
      }
    }
  }

  it("no NEW orphan dispatches (every manifest dispatch is wired up or in KNOWN_ORPHANS)", () => {
    const newOrphans = flagged.filter((f) => !KNOWN_ORPHANS.has(f.entry));
    if (newOrphans.length > 0) {
      const detail = newOrphans
        .map((o) => `  - ${o.entry}: ${o.reason}`)
        .join("\n");
      expect.fail(
        `Found ${newOrphans.length} new orphaned manifest dispatch(es):\n${detail}\n\n` +
          `Either add a useSidebarDispatch handler on the target page, or add the entry to KNOWN_ORPHANS in this test file.`
      );
    }
  });

  it("KNOWN_ORPHANS contains no resolved entries (clean up the list as orphans get wired)", () => {
    const flaggedSet = new Set(flagged.map((f) => f.entry));
    const stale: string[] = [];
    for (const orphan of KNOWN_ORPHANS) {
      if (!flaggedSet.has(orphan)) {
        stale.push(orphan);
      }
    }
    if (stale.length > 0) {
      expect.fail(
        `KNOWN_ORPHANS contains entries that are no longer orphaned. Remove them:\n` +
          stale.map((s) => `  - ${s}`).join("\n")
      );
    }
  });
});
