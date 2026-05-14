#!/usr/bin/env node

/**
 * typecheck-portable.mjs
 *
 * Runs `tsc` against the project's tsconfigs even when this checkout has no
 * local `node_modules`. Used for local PR validation in fresh git worktrees
 * where running `npm ci` would be wasteful or impossible. CI keeps using the
 * regular `npm run typecheck`.
 *
 * Resolution order for a usable `node_modules`:
 *   1. `./node_modules/.bin/tsc` (already installed — just runs `tsc`).
 *   2. `$TYPECHECK_NODE_MODULES` if set and points at a real `node_modules`.
 *   3. Sibling `node_modules` of the main repo, discovered from `.git`
 *      (works when this checkout is a `git worktree add`-ed sibling).
 *
 * When borrowing, a symlink `./node_modules` is created for the duration of
 * the run and removed on exit so subsequent `npm ci` is not surprised.
 */

import {
  existsSync,
  lstatSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const LOCAL_NODE_MODULES = join(PROJECT_ROOT, "node_modules");

const TSCONFIGS = [
  "tsconfig.app.json",
  "tsconfig.node.json",
  "convex/tsconfig.json",
];

function hasTsc(nodeModulesDir) {
  return existsSync(join(nodeModulesDir, ".bin", "tsc"));
}

function discoverWorktreeMainRepo() {
  const gitPath = join(PROJECT_ROOT, ".git");
  if (!existsSync(gitPath)) return null;
  if (!lstatSync(gitPath).isFile()) return null; // regular repo, not a worktree
  const match = readFileSync(gitPath, "utf-8").match(/^gitdir:\s*(.+)$/m);
  if (!match) return null;
  const gitdir = match[1].trim();
  const idx = gitdir.indexOf("/.git/worktrees/");
  if (idx === -1) return null;
  return gitdir.slice(0, idx);
}

function findDonorNodeModules() {
  if (process.env.TYPECHECK_NODE_MODULES) {
    const p = resolve(process.env.TYPECHECK_NODE_MODULES);
    if (hasTsc(p)) return p;
    console.error(
      `typecheck-portable: TYPECHECK_NODE_MODULES=${p} has no .bin/tsc; ignoring.`,
    );
  }
  const mainRepo = discoverWorktreeMainRepo();
  if (mainRepo) {
    const candidate = join(mainRepo, "node_modules");
    if (hasTsc(candidate)) return candidate;
  }
  return null;
}

let createdSymlink = false;
let exitCode = 0;

function cleanup() {
  if (!createdSymlink) return;
  try {
    unlinkSync(LOCAL_NODE_MODULES);
  } catch {
    // Best-effort cleanup; leaving a dangling symlink is not catastrophic.
  }
}

process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(143);
});

try {
  if (!hasTsc(LOCAL_NODE_MODULES)) {
    const donor = findDonorNodeModules();
    if (!donor) {
      console.error(
        "typecheck-portable: no local node_modules and no donor found.",
      );
      console.error(
        "  Either run `npm ci`, or set TYPECHECK_NODE_MODULES=/path/to/node_modules.",
      );
      process.exit(1);
    }
    if (existsSync(LOCAL_NODE_MODULES)) {
      console.error(
        `typecheck-portable: ${LOCAL_NODE_MODULES} exists but lacks .bin/tsc; aborting.`,
      );
      process.exit(1);
    }
    console.log(`typecheck-portable: borrowing node_modules from ${donor}`);
    symlinkSync(donor, LOCAL_NODE_MODULES, "dir");
    createdSymlink = true;
  }

  const tscBin = join(LOCAL_NODE_MODULES, ".bin", "tsc");
  for (const cfg of TSCONFIGS) {
    const r = spawnSync(tscBin, ["-p", cfg], {
      stdio: "inherit",
      cwd: PROJECT_ROOT,
    });
    if (r.status !== 0) {
      exitCode = r.status ?? 1;
      break;
    }
  }
} finally {
  cleanup();
}

process.exit(exitCode);
