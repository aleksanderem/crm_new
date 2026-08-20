# Testing

## E2E tests (Playwright)

E2E tests require a running app and a real Convex + Supabase backend. The fastest local workflow is to start the dev server with `npm start` (which runs Convex dev + Vite in parallel), then run Playwright against it.

### Required `.env.local` variables

Three `VITE_*` variables must be present in `.env.local` at the repo root before you can build or dev-serve the app for E2E:

| Variable | Where to find it |
|---|---|
| `VITE_CONVEX_URL` | Written automatically by `npx convex dev` (e.g. `https://your-project.convex.cloud`) |
| `VITE_SUPABASE_URL` | Your self-hosted or Supabase Cloud instance URL (same value as `SUPABASE_URL`) |
| `VITE_SUPABASE_ANON_KEY` | The `anon` key from your Supabase project's API settings (same value as `SUPABASE_ANON_KEY`) |

Copy `.env.example` to `.env.local` and fill in these three values. The other vars in `.env.example` are for Convex functions (set via `npx convex env set`) and for production deploys — they are not needed locally for E2E.

Two Playwright-specific environment variables control test credentials and target URL:

| Variable | Default | Description |
|---|---|---|
| `PLAYWRIGHT_TEST_EMAIL` | `amiesak@gmail.com` | Email of the test user account |
| `PLAYWRIGHT_TEST_PASSWORD` | (hardcoded fallback) | Password for the test user |
| `PLAYWRIGHT_BASE_URL` | `http://localhost:5173` | Override if your dev server runs on a different port |

### Running E2E locally

```sh
# 1. Start the app (Convex dev + Vite)
npm start

# 2. In a separate terminal, run all E2E tests
npx playwright test

# Run a single file
npx playwright test e2e/auth.spec.ts

# Run with headed browser (useful for debugging)
npx playwright test --headed
```

Some test specs (e.g. `e2e/gabinet/appointments.spec.ts`) construct a `ConvexHttpClient` and a Supabase client at module load time to seed or clean up test data. They read `VITE_CONVEX_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY` directly from the environment, falling back to `.env.local` when the env vars are not set. If any of those are missing you will see an error like `Missing VITE_CONVEX_URL — set the env var or add it to .env.local` before any test runs.

### CI

In CI the build step injects `VITE_CONVEX_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY` as environment variables (see `.github/workflows/e2e.yml`). `PLAYWRIGHT_TEST_EMAIL` and `PLAYWRIGHT_TEST_PASSWORD` are stored as GitHub Actions secrets (`E2E_USER_EMAIL` / `E2E_USER_PASSWORD`).

---

## Unit tests (Vitest)

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
