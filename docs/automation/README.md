# Automation Docs

This directory is the repo-owned operating layer for Symphony and other autonomous agents. It sits between high-level project instructions in `CLAUDE.md` and the concrete code patterns discovered while implementing slices.

## Structure

- `rules/` — normative instructions agents must follow by work type or code area.
- `retrospectives/` — lessons learned from real implementation work, especially where the codebase revealed constraints not obvious from static docs.

The rules layer is now intentionally atomized. Instead of a few large mixed-purpose files, it is split into smaller packs that can be loaded progressively.

## Rule loading model

Agents should load documents in this order:
1. root workflow contract in `WORKFLOW.md`
2. module context, e.g. `docs/modules/gabinet.md`
3. the matching rule-pack index under `docs/automation/rules/`
4. only the smaller rule files relevant to the touched area
5. the latest relevant retrospective

## Current rule packs

- `rules/harness/` — loading order, selection, promotion, and human-review bias
- `rules/backend/` — domain ownership, side effects, inbound integrations, correlation, routing, and validation
- `rules/ui/` — Gabinet UI surface selection, status alignment, i18n, operator clarity, and evidence-first UI work
- `rules/testing/` — validation levels, evidence bundles, artifact placement, and review note quality
- `rules/architecture/` — module-boundary rules

The older top-level rule files are currently compatibility entry points and should be treated as transitional pointers while callers migrate to the smaller packs.

## Maintenance policy

When a real implementation uncovers a stable constraint, add it to the smallest relevant rule file. When a lesson is still fresh and specific to a slice, first capture it as a retrospective. If it proves reusable, promote it into rules.

For this pilot, backend lessons have already been captured retrospectively. UI lessons should keep being promoted gradually as the SMS confirmation UI slice progresses.
