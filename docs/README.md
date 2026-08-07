# Documentation index

Start with `../CLAUDE.md` at the repo root for the full architecture overview, tech stack, DB schema map, and coding rules. That file is loaded automatically in every Claude Code session.

## Core references

| Document | Contents |
|----------|----------|
| `DEPLOYMENT.md` | Deployment pipeline (Supabase → Convex → Netlify), env vars per surface, rollback |
| `RUNBOOK.md` | Incident severity levels, first-response checklist, downtime communication templates |
| `SECURITY.md` | Security controls, secrets management, audit log |
| `backup-restore.md` | Automated backup pipeline and restore procedure |
| `QUALITY_SCORE.md` | Quality gates and scoring rubric |

## Module docs

See `modules/index.md` for the reading guide. Key files:

- `modules/platform-core.md` — shared platform responsibilities and boundaries
- `modules/crm.md` — CRM ownership and integration context
- `modules/gabinet.md` — Gabinet ownership and integration context
- `modules/module-onboarding.md` — how to add a new module safely

## Architecture and design

- `plans/` — historical implementation plans (see banners for superseded content)
- `design-docs/` — core beliefs and design decisions
- `superpowers/specs/` — feature design documents
- `superpowers/plans/` — feature implementation plans
- `generated/db-schema.md` — generated database schema reference

## Automation rules

`automation/rules/` — rules loaded by the Claude Code harness for backend, frontend, testing, and architecture conventions.
