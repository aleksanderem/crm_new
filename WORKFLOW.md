# Symphony Pilot Workflow

This repository uses a repo-owned workflow for autonomous delivery on the Symphony pilot lane. The pilot scope is intentionally narrow: one dedicated Linear project under team `CRM`, containing only the Gabinet 2-way SMS appointment confirmation feature and its follow-up slices.

## Source of truth

Linear is the operational source of truth. Symphony should only pick issues from the dedicated pilot project and only when they are in a runnable state with explicit acceptance criteria and no unresolved blockers.

Pilot states:
- `Todo`
- `In Progress`
- `Human Review`
- `Rework`
- `Merging`
- `Done`

State intent:
- `Todo`: well-scoped, not yet claimed.
- `In Progress`: actively executed by one agent in one isolated workspace.
- `Human Review`: implementation finished, validation run, evidence produced, waiting for a human.
- `Rework`: human requested follow-up.
- `Merging`: approved and being landed.
- `Done`: merged and verified.

## Concurrency and isolation

The pilot runs with `max_concurrent_agents = 1`. Each issue gets its own isolated workspace/worktree. An agent may not work on more than one Linear issue in the same workspace. Shared mutable state between issues is forbidden.

## Mandatory read order before implementation

Every autonomous run must read, in order:
1. `CLAUDE.md`
2. session tracking files in repo root
3. `docs/modules/gabinet.md` for Gabinet work
4. `docs/automation/README.md`
5. the relevant rules files under `docs/automation/rules/`
6. the latest relevant retrospective under `docs/automation/retrospectives/`

## Rule selection by work type

If touching `convex/**`, load backend rules.
If touching `src/components/**` or `src/routes/**`, load UI rules.
If touching `e2e/**`, tests, screenshots, or demo evidence, load testing/evidence rules.
If touching multiple areas, load all matching rules and obey the most restrictive instruction.

## Delivery contract

For each issue, Symphony must:
1. read existing code first;
2. update only the requested vertical slice;
3. reuse existing patterns before creating new abstractions;
4. run the smallest correct validation loop during implementation;
5. run the required pre-review checks before state transition;
6. generate proof-of-work artifacts;
7. stop at `Human Review`.

Symphony must not auto-merge this pilot lane.

## Required validation

Minimum validation depends on blast radius.

Backend-only changes:
- `npx tsc -p convex/tsconfig.json --pretty false`
- focused Convex/Vitest coverage for touched flow when available

Frontend changes:
- `npm run typecheck`
- focused route/component verification
- focused browser evidence

Pre-`Human Review` full lane target:
- `npm run lint`
- `npm run typecheck`
- `npm run test:unit`
- focused Playwright smoke for changed UX path

If repo-wide pre-existing failures block a clean pass, the agent must clearly separate new failures from baseline failures.

## Evidence requirements

Every issue moving to `Human Review` must produce:
- changed files list;
- commands run and results;
- concise acceptance-criteria mapping;
- screenshot evidence for UI-affecting work;
- preferred: short video/demo capture of the happy path;
- fallback when video is unavailable: screenshot storyboard plus step manifest and explicit reason.

Evidence should live under repo-owned paths, preferably `docs/runtime-e2e/` or a dedicated subfolder for the pilot.

## Completion criteria for `Human Review`

An issue may move to `Human Review` only if:
- code compiles for the touched area;
- required tests/checks were run;
- rule-specific constraints were followed;
- progress tracking files were updated;
- evidence artifacts were produced;
- the handoff note names risks, known gaps, and exact review steps.

## Pilot-specific guardrails

For the 2-way SMS feature:
- outbound confirmation must use durable correlation records;
- inbound replies must be idempotent;
- appointment transitions must remain centralized in domain logic;
- provider-specific webhook handling must verify signatures where supported;
- staff UI must expose enough state to debug the flow without provider dashboards.
