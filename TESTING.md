# Testing

## Canonical command

Run the full unit-test suite (Convex + frontend) via the npm script:

```sh
npm run test:unit
```

That script runs `test:unit:convex` then `test:unit:frontend` via `npm-run-all --serial --continue-on-error`, so a failure in one suite still surfaces failures in the other and the overall exit code is non-zero if either fails.

## Suite layout

The repo has two independent vitest suites with separate configs:

- **Convex** (`convex/vitest.config.ts`) — `convex/**/*.test.ts` plus `tests/convex/**/*.test.ts`. Loads `tests/convex/_setup.ts`, which installs the in-memory Supabase stubs and convex-test wiring.
- **Frontend** (`vitest.frontend.config.ts` at repo root) — `src/**/*.test.ts`. Plain node environment, no setup files, aliases `@`, `@cvx`, `~` mirror `vite.config.ts`. Added in #1034 — before that, `cd convex && vitest run` pinned the test root to `convex/` so the `src/**/*.test.ts` files were silently uncollected.

Run a single suite directly:

```sh
npm run test:unit:convex     # cd convex && vitest run
npm run test:unit:frontend   # vitest run --config ./vitest.frontend.config.ts
```

## Running vitest directly

If you need to run vitest yourself (e.g. with a `--filter`, `--reporter`, or `-t` flag), point `--config` at the suite you want:

```sh
# Convex suite — what `npm run test:unit:convex` does.
cd convex && npx vitest run
# Equivalent from repo root (loads ./vitest.config.ts, which re-exports the convex
# config with test.root pinned to ./convex; added in #578):
npx vitest run

# Frontend suite — what `npm run test:unit:frontend` does.
npx vitest run --config ./vitest.frontend.config.ts
```

The convex invocations all discover the same files and load `tests/convex/_setup.ts`. The frontend invocation only sees `src/**/*.test.ts` and does not load the Supabase stub setup.

## Diagnostic: `SUPABASE_URL not configured`

If you see this error in test output:

```
Error: SUPABASE_URL not configured
    at createServiceRoleClient (convex/supabase/client.ts:6)
```

…it almost always means vitest was invoked from the wrong cwd or with the wrong config, so `tests/convex/_setup.ts` never ran and the real `createServiceRoleClient` is being called instead of the in-memory stub. Re-run via `npm run test:unit` (or one of the alternatives above). It is not an environment problem — the test suite never needs a real `SUPABASE_URL`.

## Keeping `convex/_generated/api.d.ts` in sync

Convex codegen writes every module file under `convex/` into `convex/_generated/api.d.ts` as an `import type * as …` line. This file is checked into the repo and must be updated manually whenever you add or remove a Convex module — `npx convex dev` / `npx convex codegen` regenerates it automatically, but both commands require a live Convex deployment that is unavailable in CI.

### Detecting drift

The CI typecheck job runs `npm run check:convex-codegen`, which compares the module files on disk against the imports in `api.d.ts` and exits non-zero if anything is missing or orphaned. You can run the same check locally before pushing:

```sh
npm run check:convex-codegen
```

When it fails it prints a clear list:

```
convex/_generated/api.d.ts is out of sync with convex/.

Missing from api.d.ts (file exists under convex/, no import):
  - gabinet/myNewModule

Orphan in api.d.ts (imported but file is gone or excluded):
  - gabinet/deletedModule
```

### Manual update procedure

For each **missing** module printed above, add a line to `convex/_generated/api.d.ts` in the alphabetically correct position among the existing `import type * as …` lines:

```ts
import type * as <identifier> from "../<path>.js";
```

The `<identifier>` follows the same convention Convex codegen uses: take the relative path (without extension), replace every `/` with `_`, and keep any leading underscores from directory or file names. Examples:

| File added under `convex/` | Path key | Identifier |
|---|---|---|
| `gabinet/myNewModule.ts` | `gabinet/myNewModule` | `gabinet_myNewModule` |
| `_ai/newProvider.ts` | `_ai/newProvider` | `_ai_newProvider` |
| `crm/_registry.ts` | `crm/_registry` | `crm__registry` |
| `topLevel.ts` | `topLevel` | `topLevel` |

For each **orphan** (file deleted or renamed), remove the corresponding `import type * as …` line.

After editing, re-run `npm run check:convex-codegen` to confirm the file is in sync, then commit `convex/_generated/api.d.ts` alongside your new module file.

### What counts as a module file

The check script mirrors Convex's own filter rules. A file is a module if it:

- has extension `.ts`, `.tsx`, `.js`, or `.jsx`
- is not inside `_generated/`
- does not start with `.` or `#`
- is not `schema.ts` / `schema.js`
- has at most one `.` in its basename (so `*.config.ts`, `*.test.ts`, `*.d.ts` are all excluded)

## Fake timers + convex-test: restrict `toFake`

If your test uses `vi.useFakeTimers()` alongside convex-test scheduled functions (e.g. `t.finishAllScheduledFunctions(() => vi.runAllTimers())`), you MUST pass an explicit `toFake` list:

```ts
beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"],
  });
});
```

Why: vitest@4 broadened the default `toFake` list to also include `setImmediate`, `queueMicrotask`, `Date`, `performance`, and the rest of the timer surface. Convex-test fires each scheduled function from a captured `setTimeout(0, …)` whose internal continuations rely on the un-faked surface — when those APIs are also faked, jobs never transition out of `"pending"`, `finishAllScheduledFunctions` returns immediately with no work observed, and `afterEach` (or the call itself) times out with `Hook timed out in 10000ms`.

Symptoms:

- `Hook timed out in 10000ms` in `afterEach`.
- Scheduled jobs / workflow steps stuck on `"pending"` instead of advancing to `"inProgress"` / `"processed"`.
- The bare `vi.useFakeTimers()` form worked under vitest@3 and stopped working after the bump.

Fix: stick to the four-entry `toFake` list above. That preserves the timer surface convex-test needs while still letting `vi.runAllTimers()` drive the poller. See `tests/convex/automation.test.ts` for the canonical setup (#721).
