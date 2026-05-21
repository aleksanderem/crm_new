# Testing

## Canonical command

Run the Convex unit-test suite via the npm script:

```sh
npm run test:unit
```

That script is `cd convex && vitest run` (see `package.json`). The `cd convex` matters — `convex/vitest.config.ts` resolves `include`, `setupFiles`, and the `@cvx` / `~` aliases relative to the `convex/` directory.

## Running vitest directly

If you need to run vitest yourself (e.g. with a `--filter`, `--reporter`, or `-t` flag), pick ONE of:

```sh
# From the repo root — uses ./vitest.config.ts, which re-exports the convex
# config with test.root pinned to ./convex (added in #578).
npx vitest run

# From the repo root — explicit config flag, identical effect.
npx vitest run --config convex/vitest.config.ts

# From convex/ — what `npm run test:unit` does.
cd convex && npx vitest run
```

All three discover the same files and load `tests/convex/_setup.ts`, which installs the in-memory Supabase stubs.

## Diagnostic: `SUPABASE_URL not configured`

If you see this error in test output:

```
Error: SUPABASE_URL not configured
    at createServiceRoleClient (convex/supabase/client.ts:6)
```

…it almost always means vitest was invoked from the wrong cwd or with the wrong config, so `tests/convex/_setup.ts` never ran and the real `createServiceRoleClient` is being called instead of the in-memory stub. Re-run via `npm run test:unit` (or one of the alternatives above). It is not an environment problem — the test suite never needs a real `SUPABASE_URL`.

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
