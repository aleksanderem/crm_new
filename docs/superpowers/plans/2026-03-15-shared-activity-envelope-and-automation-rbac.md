# Shared Activity Envelope and Automation RBAC Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize entity-centric activity publication and rendering across CRM and Gabinet detail feeds, and align automation `update_field` authorization with the canonical RBAC path.

**Architecture:** Keep the current `activities` table and indexes as the compatibility-safe persistence contract. Add a strict shared activity-envelope write helper that writes flat compatibility fields plus `metadata.activityEnvelope`, resolve related targets at publish time, keep backend authorization authoritative for feed reads, and move route-local activity formatting into a shared presenter seam. Align `automation.update_field` with `verifyOrgAccess` + `checkPermission` without weakening descriptor, allowlist, or coercion safeguards.

**Tech Stack:** Convex mutations/queries, existing Convex test helpers, Vitest, React 19, TanStack Router, Playwright, i18next, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-15-shared-activity-envelope-and-automation-rbac-design.md`

---

This plan assumes work happens in `/Users/alfred/projects/crm_new`, not the older `.openclaw` path. The fragment scope is limited to CRM and Gabinet entity detail feeds. Broader aggregate/module-level feeds are intentionally out of scope.

## File Structure

`convex/_helpers/activityEnvelope.ts` should become the strict write-path contract for new activity publication. It owns required-envelope validation, compatibility-field mapping, publish-time target resolution, target deduplication, attachment normalization, and `eventKey` persistence.

`convex/_helpers/activities.ts` should remain the compatibility import surface for existing publishers. It should delegate to the new helper so untouched call sites keep working while migrated publishers adopt richer envelopes incrementally.

`convex/activities.ts` should remain the entity-feed query surface, but it needs one focused upgrade: backend authorization must stay authoritative, and migrated feed rows should be returned in a way that still supports current route consumers while enabling shared presenter usage.

`convex/notes.ts`, `convex/emails.ts`, `convex/emails_internal.ts`, `convex/gabinet/packages.ts`, and `convex/gabinet/appointmentSms.ts` are the initial publisher migration files. They should define domain-specific payloads and stable `eventKey` values, and use publish-time target resolution rather than read-time graph traversal for relation fan-out.

`convex/automation.ts` is the only automation runtime file that should change for RBAC alignment. Keep descriptor tables, standard-field allowlists, custom-field gates, and value coercion. Only replace the duplicated permission path.

`src/components/activity-timeline/activity-timeline.tsx` and `src/components/activity-timeline/activity-item.tsx` should become presenter-driven renderers. Add a new pure presenter seam under `src/components/activity-timeline/presenter/` for raw-row-to-view-model transformation and action-aware formatting.

The current route consumers in scope are:
- `src/routes/_app/_auth/dashboard/_layout.contacts.$contactId.lazy.tsx`
- `src/routes/_app/_auth/dashboard/_layout.companies.$companyId.tsx`
- `src/routes/_app/_auth/dashboard/_layout.leads.$leadId.lazy.tsx`
- `src/routes/_app/_auth/dashboard/_layout.gabinet.appointments.$appointmentId.lazy.tsx`
- `src/routes/_app/_auth/dashboard/_layout.gabinet.patients.$patientId.tsx`
- `src/routes/_app/_auth/dashboard/_layout.gabinet.employees.$employeeId.tsx`

Tests should live in focused existing seams where possible:
- `convex/tests/activityEnvelope.test.ts` (new)
- `convex/tests/emailActivities.test.ts` (new or extended from current email coverage)
- `convex/tests/packageActivities.test.ts` (new)
- `convex/tests/appointmentSms.test.ts`
- `convex/tests/automation.test.ts`
- `src/components/activity-timeline/presenter/activity-presenter.test.ts` (new)
- existing entity e2e specs plus `e2e/gabinet/employees.spec.ts` if it does not exist yet

---

## Chunk 1: Shared backend envelope contract

### Task 1: Add the strict shared activity-envelope helper

**Files:**
- Create: `convex/_helpers/activityEnvelope.ts`
- Modify: `convex/_helpers/activities.ts`
- Create: `convex/tests/activityEnvelope.test.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `convex/tests/activityEnvelope.test.ts` with focused tests for required-field rejection, compatibility mapping, target deduplication, and envelope persistence under `metadata.activityEnvelope`.

```ts
test("publishActivityEnvelope rejects missing summary and eventKey", async () => {
  const t = createTestCtx();
  const { organizationId, userId } = await seedTestUser(t);

  await expect(
    t.run(async (ctx) =>
      publishActivityEnvelope(ctx, {
        organizationId,
        module: "crm",
        entityType: "contact",
        entityId: "contact-1",
        action: "note_added",
        occurredAt: 123,
        performedBy: userId,
        actor: { type: "user", userId },
        summary: "",
        payload: {},
        eventKey: "",
        schemaVersion: 1,
      }),
    ),
  ).rejects.toThrow("Activity envelope requires summary");
});

test("publishActivityEnvelope mirrors envelope values into legacy activity fields", async () => {
  const t = createTestCtx();
  const { organizationId, userId } = await seedTestUser(t);

  await t.run(async (ctx) => {
    await publishActivityEnvelope(ctx, {
      organizationId,
      module: "crm",
      entityType: "contact",
      entityId: "contact-1",
      action: "note_added",
      occurredAt: 123,
      performedBy: userId,
      actor: { type: "user", userId, label: "Test User" },
      summary: "Added a note",
      payload: { noteId: "note-1" },
      eventKey: "note:note-1",
      schemaVersion: 1,
    });
  });

  const rows = await t.run(async (ctx) => ctx.db.query("activities").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0]?.description).toBe("Added a note");
  expect(rows[0]?.createdAt).toBe(123);
  expect(rows[0]?.metadata?.activityEnvelope?.eventKey).toBe("note:note-1");
});
```

- [ ] **Step 2: Run the helper test and verify it fails**

Run: `cd /Users/alfred/projects/crm_new/convex && npx vitest run tests/activityEnvelope.test.ts --reporter=verbose`

Expected: FAIL because `publishActivityEnvelope` does not exist yet.

- [ ] **Step 3: Implement the minimal helper and keep `logActivity` as the compatibility wrapper**

Add `convex/_helpers/activityEnvelope.ts` with a strict publish function. Keep `logActivity(...)` available in `convex/_helpers/activities.ts`, but make it delegate to the new helper with a compatibility envelope.

```ts
export async function publishActivityEnvelope(ctx: MutationCtx, args: PublishActivityEnvelopeArgs) {
  if (!args.summary.trim()) throw new Error("Activity envelope requires summary");
  if (!args.eventKey.trim()) throw new Error("Activity envelope requires eventKey");

  const targets = dedupeTargets([
    { entityType: args.entityType, entityId: args.entityId },
    ...(args.targets ?? []),
  ]);

  for (const target of targets) {
    await ctx.db.insert("activities", {
      organizationId: args.organizationId,
      entityType: target.entityType,
      entityId: target.entityId,
      action: args.action,
      description: args.summary,
      createdAt: args.occurredAt,
      performedBy: args.performedBy,
      metadata: {
        ...(args.legacyMetadata ?? {}),
        activityEnvelope: {
          schemaVersion: args.schemaVersion,
          module: args.module,
          summary: args.summary,
          occurredAt: args.occurredAt,
          actor: args.actor,
          payload: args.payload,
          attachments: args.attachments ?? [],
          eventKey: args.eventKey,
          targets,
        },
      },
    });
  }
}
```

- [ ] **Step 4: Re-run the helper test and verify it passes**

Run: `cd /Users/alfred/projects/crm_new/convex && npx vitest run tests/activityEnvelope.test.ts --reporter=verbose`

Expected: PASS.

- [ ] **Step 5: Run the Convex typecheck**

Run: `cd /Users/alfred/projects/crm_new && npx tsc -p convex/tsconfig.json --pretty false`

Expected: PASS with 0 errors.

- [ ] **Step 6: Commit the helper seam**

```bash
git add convex/_helpers/activityEnvelope.ts convex/_helpers/activities.ts convex/tests/activityEnvelope.test.ts
git commit -m "feat: add shared activity envelope helper"
```

---

### Task 2: Make relation timing explicit in publisher fan-out

**Files:**
- Continue after Task 1 creates it: `convex/_helpers/activityEnvelope.ts`
- Modify: publisher files that currently know relation targets inline
- Continue after Task 1 creates it: `convex/tests/activityEnvelope.test.ts`

- [ ] **Step 1: Add a failing test for publish-time target semantics**

Add a test proving that the target list is resolved at publish time and stored per row, rather than discovered dynamically later.

```ts
test("publishActivityEnvelope stores resolved targets at write time", async () => {
  const t = createTestCtx();
  const { organizationId, userId } = await seedTestUser(t);

  await t.run(async (ctx) => {
    await publishActivityEnvelope(ctx, {
      organizationId,
      module: "crm",
      entityType: "contact",
      entityId: "contact-1",
      action: "note_added",
      occurredAt: 200,
      performedBy: userId,
      actor: { type: "user", userId },
      summary: "Added a note",
      payload: {},
      eventKey: "note:1",
      schemaVersion: 1,
      targets: [{ entityType: "company", entityId: "company-1" }],
    });
  });

  const rows = await t.run(async (ctx) => ctx.db.query("activities").collect());
  expect(rows).toHaveLength(2);
  expect(rows.every((row) => row.metadata?.activityEnvelope?.targets?.length === 2)).toBe(true);
});
```

- [ ] **Step 2: Run the test and verify it fails if target persistence is incomplete**

Run: `cd /Users/alfred/projects/crm_new/convex && npx vitest run tests/activityEnvelope.test.ts --reporter=verbose`

Expected: FAIL until targets are persisted consistently.

- [ ] **Step 3: Finalize target persistence and dedupe rules**

Ensure the helper persists the resolved target set for each logical event and dedupes duplicate targets before writing rows.

- [ ] **Step 4: Re-run the helper suite**

Run: `cd /Users/alfred/projects/crm_new/convex && npx vitest run tests/activityEnvelope.test.ts --reporter=verbose`

Expected: PASS.

- [ ] **Step 5: Commit the target-timing contract**

```bash
git add convex/_helpers/activityEnvelope.ts convex/tests/activityEnvelope.test.ts
git commit -m "test: lock publish-time activity target resolution"
```

---

## Chunk 2: Publisher migrations

### Task 3: Migrate notes and outbound email publication to the envelope helper

**Files:**
- Modify: `convex/notes.ts`
- Modify: `convex/emails.ts`
- Continue after Task 1 creates it: `convex/tests/activityEnvelope.test.ts`
- Create: `convex/tests/emailActivities.test.ts`

- [ ] **Step 1: Write failing publisher tests**

Add one note test and one outbound email test that assert envelope presence, stable `eventKey`, and semantic payload fields.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `cd /Users/alfred/projects/crm_new/convex && npx vitest run tests/activityEnvelope.test.ts tests/emailActivities.test.ts --reporter=verbose`

Expected: FAIL because the publishers still write flat activity rows.

- [ ] **Step 3: Migrate only the activity publication calls**

Use `publishActivityEnvelope(...)` in `convex/notes.ts` and `convex/emails.ts`. Keep domain behavior unchanged.

```ts
await publishActivityEnvelope(ctx, {
  organizationId: args.organizationId,
  module: "crm",
  entityType: args.entityType,
  entityId: args.entityId,
  action: "note_added",
  occurredAt: Date.now(),
  performedBy: user._id,
  actor: { type: "user", userId: user._id, label: user.name ?? user.email ?? "User" },
  summary: "Added a note",
  payload: { noteId, entityType: args.entityType, entityId: args.entityId },
  eventKey: `note:${noteId}`,
  schemaVersion: 1,
});
```

- [ ] **Step 4: Re-run the focused tests**

Run: `cd /Users/alfred/projects/crm_new/convex && npx vitest run tests/activityEnvelope.test.ts tests/emailActivities.test.ts --reporter=verbose`

Expected: PASS.

- [ ] **Step 5: Run the Convex typecheck**

Run: `cd /Users/alfred/projects/crm_new && npx tsc -p convex/tsconfig.json --pretty false`

Expected: PASS.

- [ ] **Step 6: Commit the first publisher batch**

```bash
git add convex/notes.ts convex/emails.ts convex/tests/activityEnvelope.test.ts convex/tests/emailActivities.test.ts
git commit -m "feat: migrate notes and outbound email activities"
```

---

### Task 4: Migrate inbound email, packages, and SMS fan-out

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/emails_internal.ts`
- Modify: `convex/gabinet/packages.ts`
- Modify: `convex/gabinet/appointmentSms.ts`
- Continue after Task 3 creates it: `convex/tests/emailActivities.test.ts`
- Create: `convex/tests/packageActivities.test.ts`
- Modify: `convex/tests/appointmentSms.test.ts`

- [ ] **Step 1: Write the failing tests for inbound email, packages, and SMS fan-out**

Cover: `email_received`, semantic `package_assigned`, and shared `eventKey` across appointment/patient/contact fan-out rows.

- [ ] **Step 2: Run the focused test suite and verify it fails**

Run: `cd /Users/alfred/projects/crm_new/convex && npx vitest run tests/emailActivities.test.ts tests/packageActivities.test.ts tests/appointmentSms.test.ts --reporter=verbose`

Expected: FAIL before migration.

- [ ] **Step 3: Migrate the three publishers with publish-time targets**

Use `publishActivityEnvelope(...)`, keep `performedBy` as the flat compatibility field, and pass resolved related targets at publish time.

```ts
await publishActivityEnvelope(ctx, {
  organizationId,
  module: "gabinet",
  entityType: "gabinetAppointment",
  entityId: String(appointmentId),
  action: "sms_received",
  occurredAt: inbound.receivedAt,
  performedBy: creatorUserId,
  actor: { type: "external", label: inbound.phoneNumber, address: inbound.phoneNumber },
  summary: `Received SMS reply ${inbound.normalizedReply}`,
  payload: {
    appointmentId,
    phoneNumber: inbound.phoneNumber,
    reply: inbound.normalizedReply,
    providerMessageId: inbound.providerMessageId,
  },
  eventKey: `sms:${inbound.correlationKey}:received`,
  schemaVersion: 1,
  targets: [
    { entityType: "gabinetPatient", entityId: String(patientId) },
    ...(contactId ? [{ entityType: "contact", entityId: String(contactId) }] : []),
  ],
});
```

- [ ] **Step 4: Re-run the focused publisher suite**

Run: `cd /Users/alfred/projects/crm_new/convex && npx vitest run tests/emailActivities.test.ts tests/packageActivities.test.ts tests/appointmentSms.test.ts --reporter=verbose`

Expected: PASS.

- [ ] **Step 5: Re-run the Convex typecheck**

Run: `cd /Users/alfred/projects/crm_new && npx tsc -p convex/tsconfig.json --pretty false`

Expected: PASS.

- [ ] **Step 6: Commit the second publisher batch**

```bash
git add convex/schema.ts convex/emails_internal.ts convex/gabinet/packages.ts convex/gabinet/appointmentSms.ts convex/tests/emailActivities.test.ts convex/tests/packageActivities.test.ts convex/tests/appointmentSms.test.ts
git commit -m "feat: migrate inbound and gabinet activities to envelopes"
```

---

## Chunk 3: Automation RBAC alignment

### Task 5: Align `automation.update_field` with canonical RBAC

**Files:**
- Modify: `convex/automation.ts`
- Modify: `convex/tests/automation.test.ts`

- [ ] **Step 1: Add failing RBAC tests**

Add one explicit deny case, one own-scope case, and one allow case for `update_field` using current org-permission mutation helpers.

- [ ] **Step 2: Run the focused automation suite and verify it fails**

Run: `cd /Users/alfred/projects/crm_new/convex && npx vitest run tests/automation.test.ts --reporter=verbose`

Expected: FAIL in the new deny / own-scope assertions.

- [ ] **Step 3: Replace the duplicated permission path**

Use `verifyOrgAccess(...)` as the membership gate and `checkPermission(...)` as the canonical authorization path. Keep descriptor / allowlist / coercion behavior intact.

```ts
const permission = await checkPermission(
  ctx,
  args.organizationId,
  descriptor.permissionFeature,
  "edit",
);

if (!permission.allowed) {
  throw new Error("Permission denied");
}

if (permission.scope === "own" && !descriptor.canEditOwn(entity, args.actorUserId)) {
  throw new Error("Permission denied: you can only edit your own records");
}
```

- [ ] **Step 4: Re-run the focused automation suite**

Run: `cd /Users/alfred/projects/crm_new/convex && npx vitest run tests/automation.test.ts --reporter=verbose`

Expected: PASS.

- [ ] **Step 5: Run the Convex typecheck**

Run: `cd /Users/alfred/projects/crm_new && npx tsc -p convex/tsconfig.json --pretty false`

Expected: PASS.

- [ ] **Step 6: Commit the RBAC alignment**

```bash
git add convex/automation.ts convex/tests/automation.test.ts
git commit -m "fix: align automation update_field with shared rbac"
```

---

## Chunk 4: Shared presenter seam

### Task 6: Add the pure shared activity presenter

**Files:**
- Create: `vitest.config.ts`
- Create: `src/components/activity-timeline/presenter/activity-presenter.ts`
- Create: `src/components/activity-timeline/presenter/activity-renderers.ts`
- Create: `src/components/activity-timeline/presenter/activity-presenter.test.ts`

- [ ] **Step 1: Write the failing presenter tests**

Cover generic envelope rendering, action-aware email rendering, and fallback precedence from envelope to legacy fields.

- [ ] **Step 2: Run the presenter test and verify it fails**

Run: `cd /Users/alfred/projects/crm_new && npx vitest run src/components/activity-timeline/presenter/activity-presenter.test.ts`

Expected: FAIL because the presenter seam does not exist yet.

- [ ] **Step 3: Implement the pure presenter seam**

Add a root `vitest.config.ts` for `src/**/*.test.ts` if the repo does not already support that path, then implement a pure presenter that returns a stable `PresentedActivity` view model.

- [ ] **Step 4: Re-run the presenter test**

Run: `cd /Users/alfred/projects/crm_new && npx vitest run src/components/activity-timeline/presenter/activity-presenter.test.ts`

Expected: PASS.

- [ ] **Step 5: Run the app typecheck**

Run: `cd /Users/alfred/projects/crm_new && npx tsc -p tsconfig.app.json --pretty false`

Expected: PASS.

- [ ] **Step 6: Commit the presenter seam**

```bash
git add vitest.config.ts src/components/activity-timeline/presenter/activity-presenter.ts src/components/activity-timeline/presenter/activity-renderers.ts src/components/activity-timeline/presenter/activity-presenter.test.ts
git commit -m "feat: add shared activity presenter"
```

---

### Task 7: Migrate the entity detail routes to the presenter-driven timeline

**Files:**
- Modify: `src/components/activity-timeline/activity-timeline.tsx`
- Modify: `src/components/activity-timeline/activity-item.tsx`
- Modify: `src/routes/_app/_auth/dashboard/_layout.gabinet.appointments.$appointmentId.lazy.tsx`
- Modify: `src/routes/_app/_auth/dashboard/_layout.contacts.$contactId.lazy.tsx`
- Modify: `src/routes/_app/_auth/dashboard/_layout.companies.$companyId.tsx`
- Modify: `src/routes/_app/_auth/dashboard/_layout.leads.$leadId.lazy.tsx`
- Modify: `src/routes/_app/_auth/dashboard/_layout.gabinet.patients.$patientId.tsx`
- Modify: `src/routes/_app/_auth/dashboard/_layout.gabinet.employees.$employeeId.tsx`
- Modify: `public/locales/en/translation.json`
- Modify: `public/locales/pl/translation.json`
- Modify: entity e2e specs already present in `e2e/crm/` and `e2e/gabinet/`
- Create if missing: `e2e/gabinet/employees.spec.ts`

- [ ] **Step 1: Add failing browser assertions for each touched detail surface**

Extend the existing CRM and Gabinet specs so each one asserts shared presenter output, not route-local formatting, on the entity history tab.

- [ ] **Step 2: Run the route-focused browser suite and verify it fails**

Run: `cd /Users/alfred/projects/crm_new && npx playwright test e2e/gabinet/appointments.spec.ts e2e/gabinet/patients.spec.ts e2e/gabinet/employees.spec.ts e2e/crm/contacts.spec.ts e2e/crm/companies.spec.ts e2e/crm/leads.spec.ts`

Expected: FAIL before route migration is complete.

- [ ] **Step 3: Integrate the presenter into the shared timeline and route consumers**

Delete route-local mapping of `_id`, `action`, `description`, and `createdAt` into custom timeline shapes. Pass raw rows through the shared timeline seam instead. Keep appointment-only workflow/automation composition local if it is not actually part of the `activities` query.

- [ ] **Step 4: Re-run the route-focused browser suite**

Run: `cd /Users/alfred/projects/crm_new && npx playwright test e2e/gabinet/appointments.spec.ts e2e/gabinet/patients.spec.ts e2e/gabinet/employees.spec.ts e2e/crm/contacts.spec.ts e2e/crm/companies.spec.ts e2e/crm/leads.spec.ts`

Expected: PASS.

- [ ] **Step 5: Run the app typecheck**

Run: `cd /Users/alfred/projects/crm_new && npx tsc -p tsconfig.app.json --pretty false`

Expected: PASS.

- [ ] **Step 6: Commit the route migration**

```bash
git add src/components/activity-timeline/activity-timeline.tsx src/components/activity-timeline/activity-item.tsx src/routes/_app/_auth/dashboard/_layout.gabinet.appointments.$appointmentId.lazy.tsx src/routes/_app/_auth/dashboard/_layout.contacts.$contactId.lazy.tsx src/routes/_app/_auth/dashboard/_layout.companies.$companyId.tsx src/routes/_app/_auth/dashboard/_layout.leads.$leadId.lazy.tsx src/routes/_app/_auth/dashboard/_layout.gabinet.patients.$patientId.tsx src/routes/_app/_auth/dashboard/_layout.gabinet.employees.$employeeId.tsx public/locales/en/translation.json public/locales/pl/translation.json e2e/gabinet/appointments.spec.ts e2e/gabinet/patients.spec.ts e2e/gabinet/employees.spec.ts e2e/crm/contacts.spec.ts e2e/crm/companies.spec.ts e2e/crm/leads.spec.ts
git commit -m "feat: migrate entity timelines to shared activity presenter"
```

---

## Chunk 5: Final verification and handoff

### Task 8: Run the focused verification suite and final review loop

**Files:**
- Verify: `convex/tests/activityEnvelope.test.ts`
- Verify: `convex/tests/emailActivities.test.ts`
- Verify: `convex/tests/packageActivities.test.ts`
- Verify: `convex/tests/appointmentSms.test.ts`
- Verify: `convex/tests/automation.test.ts`
- Verify: `src/components/activity-timeline/presenter/activity-presenter.test.ts`
- Verify: CRM and Gabinet entity e2e specs

- [ ] **Step 1: Run the exact focused verification commands**

```bash
cd /Users/alfred/projects/crm_new && npx tsc --noEmit
cd /Users/alfred/projects/crm_new && npx tsc -p tsconfig.app.json --pretty false
cd /Users/alfred/projects/crm_new && npx tsc -p convex/tsconfig.json --pretty false
cd /Users/alfred/projects/crm_new && npx vitest run src/components/activity-timeline/presenter/activity-presenter.test.ts
cd /Users/alfred/projects/crm_new/convex && npx vitest run tests/activityEnvelope.test.ts tests/emailActivities.test.ts tests/packageActivities.test.ts tests/appointmentSms.test.ts tests/automation.test.ts --reporter=verbose
cd /Users/alfred/projects/crm_new && npx playwright test e2e/gabinet/appointments.spec.ts e2e/gabinet/patients.spec.ts e2e/gabinet/employees.spec.ts e2e/crm/contacts.spec.ts e2e/crm/companies.spec.ts e2e/crm/leads.spec.ts
```

Expected: every command exits 0.

- [ ] **Step 2: Run required review passes before the final claim**

Use `@superpowers:requesting-code-review`, then `@superpowers:verification-before-completion`. Fix any blocker and re-run the exact failing verification command first.

- [ ] **Step 3: Create the final feature commit**

```bash
git add convex/_helpers/activityEnvelope.ts convex/_helpers/activities.ts convex/activities.ts convex/notes.ts convex/emails.ts convex/emails_internal.ts convex/gabinet/packages.ts convex/gabinet/appointmentSms.ts convex/automation.ts convex/schema.ts convex/tests/activityEnvelope.test.ts convex/tests/emailActivities.test.ts convex/tests/packageActivities.test.ts convex/tests/appointmentSms.test.ts convex/tests/automation.test.ts vitest.config.ts src/components/activity-timeline/presenter/activity-presenter.ts src/components/activity-timeline/presenter/activity-renderers.ts src/components/activity-timeline/presenter/activity-presenter.test.ts src/components/activity-timeline/activity-timeline.tsx src/components/activity-timeline/activity-item.tsx src/routes/_app/_auth/dashboard/_layout.gabinet.appointments.$appointmentId.lazy.tsx src/routes/_app/_auth/dashboard/_layout.contacts.$contactId.lazy.tsx src/routes/_app/_auth/dashboard/_layout.companies.$companyId.tsx src/routes/_app/_auth/dashboard/_layout.leads.$leadId.lazy.tsx src/routes/_app/_auth/dashboard/_layout.gabinet.patients.$patientId.tsx src/routes/_app/_auth/dashboard/_layout.gabinet.employees.$employeeId.tsx public/locales/en/translation.json public/locales/pl/translation.json e2e/gabinet/appointments.spec.ts e2e/gabinet/patients.spec.ts e2e/gabinet/employees.spec.ts e2e/crm/contacts.spec.ts e2e/crm/companies.spec.ts e2e/crm/leads.spec.ts
git commit -m "feat: standardize entity activity feeds and automation rbac"
```

- [ ] **Step 4: Capture final evidence for handoff**

Record the exact green commands, touched entity routes, migrated publishers, and any explicitly deferred follow-up work.

---

Execution notes for the implementing agent: keep write-path validation strict, keep read-path rendering tolerant, keep publish-time relation resolution authoritative, keep backend query authorization authoritative, and avoid broad table/index redesign in this slice.

## Verification Summary

This plan was aligned to the current repo state before handoff. It references the current project path (`/Users/alfred/projects/crm_new`), the currently existing activity timeline components, the current entity detail routes, and distinguishes clearly between files that already exist and files that must be created during implementation.