# Modular SaaS Platform

A horizontal SaaS platform for Polish-market small businesses. Built around a shared platform core (organizations, auth, billing, RBAC, notifications, audit log) with independent vertical modules plugged in per subscription.

## Modules

**CRM** — sales pipeline, contacts, companies, leads and deals, email inbox with Gmail sync, documents, products, activities, calls, CSV import/export, global search, custom fields, Kanban board, and advanced filtering.

**Gabinet** — medical office / clinic / salon management: patients, appointments with calendar scheduling, treatments, employee HR and scheduling, treatment packages, loyalty points, document templates with e-signature, and a patient self-service portal.

## Tech stack

| Layer | Technologies |
|-------|-------------|
| Frontend | React 19, TanStack Router, TanStack Query, TanStack Table, TanStack Form + Zod, shadcn/ui, Recharts, @dnd-kit, Vite |
| Styling | Tailwind CSS v4, shadcn/ui (Radix primitives), next-themes (dark mode), i18next (PL/EN) |
| Backend | Convex (auth, mutations, scheduled jobs, file storage) + self-hosted Supabase Postgres (primary data store) |
| Payments | Stripe |
| Email | Resend + Gmail OAuth |
| Tests | convex-test + Vitest |

Read path: browser holds a Supabase JWT minted by Convex and queries Supabase directly. Write path: React calls Convex mutations, which write to Supabase via a service-role client. See `CLAUDE.md` for the full architecture overview.

## Development

### Prerequisites

- Node.js >= 20
- npm >= 10
- A Convex account and project
- A self-hosted or Supabase Cloud Postgres instance

### Setup

```bash
npm install

# Configure a Convex dev deployment
npx convex dev --configure=new --once
npx @convex-dev/auth

# Set required Convex environment variables
npx convex env set SUPABASE_URL https://...
npx convex env set SUPABASE_SERVICE_ROLE_KEY service_role_key_...
npx convex env set SUPABASE_JWT_SECRET jwt_secret_...
npx convex env set SUPABASE_ANON_KEY anon_key_...
npx convex env set AUTH_RESEND_KEY re_...
npx convex env set STRIPE_SECRET_KEY sk_test_...
npx convex env set STRIPE_WEBHOOK_SECRET whsec_...

# Apply database migrations
npm run migrations:apply
```

### Start

```bash
npm start      # runs Convex dev + Vite in parallel
```

The app is available at `http://localhost:5173`.

### Testing

```bash
npm run test:unit       # Convex unit tests + frontend unit tests
npm run typecheck       # TypeScript for frontend + Convex
```

> **Note:** Convex unit tests must run via `npm run test:unit`, not bare `vitest`. See `TESTING.md` for details.

## Deployment

Deployment follows a three-stage pipeline: Supabase migrations → Convex deploy → Netlify build. A push to `main` triggers the pipeline automatically via GitHub Actions.

See `docs/DEPLOYMENT.md` for the complete deployment guide, environment variable reference, and rollback procedures.

## Documentation

| Document | Contents |
|----------|----------|
| `CLAUDE.md` | Architecture overview, DB schema, component organization, coding rules |
| `docs/DEPLOYMENT.md` | Deployment pipeline, env vars, rollback |
| `docs/RUNBOOK.md` | Incident response, alerting |
| `docs/backup-restore.md` | Backup pipeline and restore procedures |
| `docs/modules/` | Module ownership, boundaries, and onboarding guide |
| `docs/SECURITY.md` | Security posture and controls |
