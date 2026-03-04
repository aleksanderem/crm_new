# R3 Runtime Audit Report

Worker: R3 (runtime-audit)
Date: 2026-03-04
Scope: Cross-check runtime changes at data layer, auth/session integrity, write anomalies, residual risks.


## 1. Table Inventory (Snapshot)

The Convex schema defines 42 tables across three domains. No tables have been added or removed relative to the schema documented in CLAUDE.md. All tables include `organizationId` for tenant isolation, with the exception of platform-level tables (`users`, `plans`, `platformProducts`) which are global.

CRM core (14 tables): users, plans, subscriptions, platformProducts, productSubscriptions, organizations, teamMemberships, contacts, companies, leads, documents, pipelines, pipelineStages, products.

CRM features (16 tables): dealProducts, activities, scheduledActivities, calls, payments, savedViews, lostReasons, orgSettings, orgPermissions, resourceInvites, notifications, auditLog, sources, emails, emailAccounts, invitations, oauthConnections, notes, customFieldDefinitions, customFieldValues, objectRelationships, activityTypeDefinitions.

Gabinet (12 tables): gabinetPatients, gabinetTreatments, gabinetWorkingHours, gabinetEmployeeSchedules, gabinetLeaves, gabinetOvertime, gabinetEmployees, gabinetLeaveTypes, gabinetLeaveBalances, gabinetAppointments, gabinetTreatmentPackages, gabinetPackageUsage, gabinetLoyaltyPoints, gabinetLoyaltyTransactions, gabinetDocumentTemplates, gabinetDocuments, gabinetPortalSessions.


## 2. Auth and Session Integrity

Status: SOLID with caveats.

All 40+ backend files containing mutations or queries use at least one auth guard. The `verifyOrgAccess(ctx, orgId)` function is called 377 times across 40 files, verifying both authentication and org membership before any data access. This is the primary access-control gate.

The RBAC layer (`checkPermission`) enforces feature+action+scope (none/own/all) for CRM and gabinet operations. Owner/admin roles get short-circuited to `scope: "all"`. Member and viewer roles go through per-org override lookup in `orgPermissions` table, falling back to defaults. The scope filtering is applied at the query result level (e.g. filtering by `createdBy === user._id` when scope is "own").

No unauthenticated mutations were found. The only public-facing mutations without org-level auth are in `convex/gabinet/patientAuth.ts` (patient portal OTP flow), which is expected.


## 3. Write Safety Analysis

Total write operations (insert/patch/delete/replace): 239 across 40 files.

Every mutation that performs writes is preceded by either `verifyOrgAccess`, `requireUser`, or `requireOrgAdmin`. No unguarded write path was found. Organization-scoped data always validates `organizationId` matches before mutation.

Delete operations use hard-delete (`ctx.db.delete`) throughout the codebase. Some modules (contacts, leads, companies, documents, products, calls) cascade-delete related records (custom field values, object relationships) before deleting the primary record. No soft-delete pattern is used anywhere.


## 4. Anomalies Found

### 4.1 MEDIUM: Missing `verifyProductAccess` in 5 gabinet modules

Only `appointments.ts` (5 calls) and `scheduling.ts` (7 calls) guard mutations behind `verifyProductAccess(ctx, orgId, "gabinet")`. The following modules skip the product subscription check entirely:

- `gabinet/patients.ts` (8 verifyOrgAccess calls, 0 verifyProductAccess)
- `gabinet/treatments.ts` (8 verifyOrgAccess calls, 0 verifyProductAccess)
- `gabinet/employees.ts` (6 verifyOrgAccess calls, 0 verifyProductAccess)
- `gabinet/packages.ts` (0 verifyProductAccess)
- `gabinet/loyalty.ts` (0 verifyProductAccess)
- `gabinet/documents.ts` (0 verifyProductAccess)
- `gabinet/documentTemplates.ts` (0 verifyProductAccess)

Impact: An organization without a gabinet subscription could create/modify patients, treatments, employees, packages, loyalty entries, and documents if the product subscription enforcement is active (i.e., at least one `productSubscriptions` row exists globally). During MVP grace period (no `productSubscriptions` rows), this is moot since access is universally granted.

Risk: LOW during MVP, MEDIUM post-launch when subscription enforcement begins.

### 4.2 MEDIUM: Incomplete audit logging in gabinet module

`logAudit()` is called only in `gabinet/appointments.ts` (status transitions and cancellations). No audit trail exists for:

- Patient creation, update, or deletion
- Treatment catalog changes
- Employee record modifications
- Package creation, purchase, or usage tracking
- Loyalty point adjustments
- Document creation or signing

For a medical-context module, this is a compliance gap. Patient data modifications should be auditable.

### 4.3 HIGH: Patient portal OTP security weaknesses

File: `convex/gabinet/patientAuth.ts`

Issues identified:

1. Hash function uses bit-shift arithmetic (lines 4-13), not a cryptographic hash. Comment acknowledges "in production, use crypto.subtle" but the TODO remains unresolved.

2. `sendPortalOtp` returns `_devOtp` and `_devToken` in the response (line 77). This is a dev convenience that must be stripped before production deployment. Any client can read the OTP without checking email.

3. No rate limiting on `sendPortalOtp` or `verifyPortalOtp`. An attacker can brute-force the 6-digit OTP (1M combinations) without throttling.

4. No attempt counter or lockout mechanism. Failed OTP verification does not track or limit retries.

5. `verifyPortalOtp` returns `sessionToken: session.tokenHash` (line 118) — the stored hash IS the token, not a derived value. If the database is leaked, all active sessions are compromised.

### 4.4 LOW: Email inbox full-table scan

File: `convex/emails.ts` lines 44-76.

When filtering by `direction` or `isRead`, the query collects ALL emails for the org, then filters in memory with `.filter()` and `.slice()`. With growing email volumes, this becomes an O(N) scan. The pagination cursor is set to empty string, breaking cursor-based pagination for subsequent pages.

### 4.5 LOW: Dashboard queries collect full tables

File: `convex/dashboard.ts`

Multiple dashboard queries (getStats, getLeadsByStage, getWonDealsByDay, etc.) use `.collect()` to load entire tables into memory before filtering by time range. For organizations with thousands of leads, contacts, or companies, this will hit Convex query size limits and degrade performance.

### 4.6 INFO: Hard deletes without recovery

All delete operations across the codebase use `ctx.db.delete()` (hard delete). Combined with incomplete audit logging, deleted records in gabinet module are unrecoverable and their deletion is untracked.


## 5. Residual Risks

### Production readiness risks

1. Patient portal auth (4.3) is the highest-priority fix. The OTP system is not production-safe. At minimum: remove `_devOtp`/`_devToken` from response, implement rate limiting, use `crypto.subtle` for hashing, and separate the session token from the stored hash.

2. Product subscription enforcement (4.1) creates a window where unpaid orgs can access gabinet features. Must add `verifyProductAccess` to all gabinet mutation files before enabling billing enforcement.

3. Audit logging gaps (4.2) are a compliance concern for medical data (PESEL, allergies, blood type stored in `gabinetPatients`). Polish data protection (RODO/GDPR) may require full audit trails on personal data modifications.

### Scalability risks

4. Full-table `.collect()` in dashboard queries and email inbox will fail under load. Needs index-based time-range queries or count-based aggregations.

5. No database-level cascade constraints. Deleting an org member doesn't clean up their assigned leads, created contacts, etc. Orphaned references may cause UI errors.

### Data integrity risks

6. Appointment state machine (`VALID_TRANSITIONS`) is enforced in application code only. A direct Convex dashboard edit or internal mutation could bypass state validation.

7. Custom field values reference `definitionId` but no referential integrity check prevents deletion of a definition while values exist (checked: `customFields.ts` deletes values before definition, which is correct, but no guard exists on the definition side against external deletion).


## 6. Rollback Notes

If a runtime issue is discovered and rollback is needed:

Since Convex handles deployment as atomic function pushes, rolling back the backend is done via `npx convex deploy --cmd 'git stash'` or redeploying from the previous commit. Frontend is a Vite build — redeploy from last known-good commit.

Data rollback considerations:
- Convex does not natively support point-in-time database restore. Document export/backup must be done manually via the Convex dashboard.
- All mutations write `createdAt`/`updatedAt` timestamps, so time-based identification of affected records is possible.
- For the patient portal, deactivate all sessions by patching `isActive: false` on `gabinetPortalSessions` if a session compromise is suspected.
- The `auditLog` table can be queried to identify which records were modified by which users during any incident window.

Safe rollback sequence:
1. Pause the Convex deployment (disable scheduled functions via dashboard)
2. Identify affected time window from audit logs and `_creationTime` fields
3. Redeploy backend functions from the last known-good git commit
4. Rebuild and redeploy frontend from same commit
5. Communicate to users if data loss occurred (hard deletes are irreversible)


## 7. Test Infrastructure

Four test files exist under `convex/tests/`:
- `appointmentStateMachine.test.ts` — state transition validation
- `conflictChecking.test.ts` — scheduling conflict detection
- `payments.test.ts` — payment workflow
- `productAccess.test.ts` — subscription gating

Coverage is narrow — no tests exist for auth guards, RBAC permission checks, patient portal OTP flow, or delete cascades. Adding integration tests for the anomalies identified above is recommended before production deployment.


## 8. Summary Matrix

| Area | Status | Priority |
|---|---|---|
| Auth on all mutations | PASS | -- |
| Org isolation (tenancy) | PASS | -- |
| RBAC enforcement | PASS | -- |
| Product subscription gating | PARTIAL (2/7 gabinet modules) | MEDIUM |
| Audit logging (gabinet) | PARTIAL (1/7 gabinet modules) | MEDIUM |
| Patient portal OTP security | FAIL (5 issues) | HIGH |
| Email query performance | CONCERN | LOW |
| Dashboard query performance | CONCERN | LOW |
| Delete safety (soft delete) | ABSENT | LOW |
| Test coverage | MINIMAL (4 test files) | MEDIUM |
