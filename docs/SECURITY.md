# Security

This repository is multi-tenant and security-sensitive by default.

Organization access and RBAC rules are not optional. Backend code should continue to rely on the established access and permission helpers instead of inventing parallel authorization paths.

Do not move secrets into docs, evidence artifacts, screenshots, or generated references.

External callbacks should verify signatures where the provider supports them, preserve enough metadata for auditability, and treat idempotency as a security and correctness concern rather than a convenience.

Cross-module boundaries are also a security boundary in practice. Avoid importing module-private code across CRM and Gabinet unless the code has been intentionally moved into a neutral shared layer.

## Read path vs write path — where RLS applies

RLS (Row Level Security) and the service-role key enforce tenant isolation on different paths and must not be confused:

**Read path** — the browser holds a Supabase JWT minted by Convex (`convex/supabase/jwt.ts → mintSupabaseToken`). Every direct Supabase query from the `src/hooks/use-supabase-*.ts` family runs under this JWT. Supabase RLS policies evaluate the JWT's `organizationId` claim and filter rows accordingly. Database-level isolation is active here.

**Write path** — Convex mutations call `convex/_helpers/supabaseDb.ts → createSupabaseDb()`, which creates a Supabase client authenticated with `SUPABASE_SERVICE_ROLE_KEY` (see `convex/supabase/client.ts` line 31). The service-role key bypasses all RLS policies by design. For writes, the only tenant isolation is the Convex authorization layer:

- `verifyOrgAccess(ctx, orgId)` — mandatory in every mutation; throws if the caller is not a member of the target org.
- `checkPermission(ctx, orgId, feature, action)` — required for permission-sensitive operations.

Do not add new write paths that skip these checks and assume RLS will protect the data — it will not.
