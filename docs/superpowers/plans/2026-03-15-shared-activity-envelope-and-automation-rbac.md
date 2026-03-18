# Shared Activity Envelope and Automation RBAC Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize shared activity publication across CRM and Gabinet, render activity timelines through one presenter layer, and align automation `update_field` authorization with the standard RBAC path without breaking current storage/query compatibility.

**Architecture:** Keep the current `activities` table shape and indexes as the phase-1 persistence contract. Add a strict shared envelope write helper that stores structured activity data under `metadata.activityEnvelope`, preserve flat compatibility fields (`description`, `createdAt`, `performedBy`), then move read-path formatting into a shared frontend presenter with action-aware renderers and safe fallbacks. Keep automation `update_field` fail-closed by preserving descriptors, field allowlists, coercion, and own-scope checks while replacing the duplicated permission resolution logic with the same `verifyOrgAccess` + `checkPermission` flow used elsewhere.

**Tech Stack:** Convex mutations/queries, Vitest with `convex-test`, the existing `convex/vitest.config.ts`, an added root Vitest config if pure presenter tests are introduced outside `convex/`, React 19, TanStack Router, i18next, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-15-shared-activity-envelope-and-automation-rbac-design.md`

---

This plan stays in one document because the backend contract, publisher migrations, frontend presenter, and RBAC fix all depend on the same shared activity-envelope design. Splitting them into separate plans would create sequencing ambiguity and make it easier to drift away from the approved compatibility strategy.

Before touching code, keep these boundaries in mind. Do not redesign the `activities` table indexes in this slice. Do not introduce a backend registry that interprets module payload semantics. Do not broaden what `automation.update_field` can edit. Do not rewrite the appointment history stack wholesale; only extract the shared activity-record presentation seam and leave appointment-only workflow/automation composition intact.

## File Structure

The work should be organized around a few tight seams instead of broad refactors.

`convex/_helpers/activityEnvelope.ts` should become the new shared write-path contract. It owns envelope validation, compatibility mapping into the existing `activities` row shape, target fan-out, attachment normalization, and `eventKey` persistence. `convex/_helpers/activities.ts` should remain the public helper surface used by publishers, but it should delegate to the new helper so old call sites can migrate incrementally.

`convex/notes.ts`, `convex/emails.ts`, `convex/emails_internal.ts`, `convex/gabinet/packages.ts`, and `convex/gabinet/appointmentSms.ts` are the publisher migration files. Each should become a thin caller of the shared helper and remain responsible only for domain-specific envelope payloads and compatibility `performedBy` choices.

`convex/automation.ts` is the only automation runtime file that should change for RBAC alignment. Keep descriptor tables, standard-field allowlists, custom-field gates, and value coercion in place. Only the permission path should change.

`src/components/activity-timeline/presenter/activity-presenter.ts` should hold the shared raw-record-to-view-model transformation. `src/components/activity-timeline/presenter/activity-renderers.ts` should hold action-aware enrichers for actions like `note_added`, `email_received`, and `package_assigned`. `src/components/activity-timeline/activity-timeline.tsx` and `src/components/activity-timeline/activity-item.tsx` should stay presentational and render the output of the presenter.

The current route consumers that must migrate away from route-local shaping are `src/routes/_app/_auth/dashboard/_layout.gabinet.appointments.$appointmentId.lazy.tsx`, `src/routes/_app/_auth/dashboard/_layout.contacts.$contactId.lazy.tsx`, `src/routes/_app/_auth/dashboard/_layout.companies.$companyId.tsx`, `src/routes/_app/_auth/dashboard/_layout.leads.$leadId.lazy.tsx`, `src/routes/_app/_auth/dashboard/_layout.gabinet.patients.$patientId.tsx`, and `src/routes/_app/_auth/dashboard/_layout.gabinet.employees.$employeeId.tsx`.

Backend verification should live in `convex/tests/activityEnvelope.test.ts`, `convex/tests/emailActivities.test.ts`, `convex/tests/packageActivities.test.ts`, `convex/tests/appointmentSms.test.ts`, and `convex/tests/automation.test.ts`. Frontend presenter verification should live in `src/components/activity-timeline/presenter/activity-presenter.test.ts`. Browser verification should extend the existing CRM contact/company/lead specs, the existing Gabinet appointment/patient specs, and add a new employee spec because none exists yet.

---

## Chunk 1: Backend contract and compatibility seam

### Task 1: Add the shared activity envelope helper without breaking the flat row contract

**Files:**
- Create: `convex/_helpers/activityEnvelope.ts`
- Modify: `convex/_helpers/activities.ts`
- Test: `convex/tests/activityEnvelope.test.ts`

- [ ] **Step 1: Write the failing helper tests first**

Create `convex/tests/activityEnvelope.test.ts` with focused tests for the write contract. Use the real `createTestCtx` and `seedTestUser` helpers from `convex/_test_helpers.ts`, and seed any extra entities inline with `t.run(...)`. Cover required-field rejection, compatibility mapping, and fan-out persistence. The first test should fail because the helper does not exist yet.

```ts
import { expect, test } from "vitest";
import { createTestCtx, seedTestUser } from "../_test_helpers";

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
        occurredAt: 1,
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

test("publishActivityEnvelope mirrors summary and occurredAt into legacy fields", async () => {
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
  expect(rows[0]?.description).toBe("Added a note");
  expect(rows[0]?.createdAt).toBe(123);
  expect(rows[0]?.performedBy).toBe(userId);
  expect(rows[0]?.metadata?.activityEnvelope?.payload).toEqual({ noteId: "note-1" });
});
```

- [ ] **Step 2: Run the helper test to verify it fails for the expected reason**

Run: `cd /Users/alfred/.openclaw/workspace/projects/crm_new/convex && npx vitest run tests/activityEnvelope.test.ts --reporter=verbose`

Expected: FAIL because `publishActivityEnvelope` does not exist yet.

- [ ] **Step 3: Implement the new helper and keep `logActivity` as the compatibility wrapper**

Add `convex/_helpers/activityEnvelope.ts` and move the strict envelope logic there. Keep `convex/_helpers/activities.ts` as the single import target for the rest of the codebase, but make it call the new helper internally.

```ts
export type ActivityEnvelopeActor =
  | { type: "user"; userId: Id<"users">; label?: string }
  | { type: "system"; label: string }
  | { type: "external"; label: string; address?: string };

export interface PublishActivityEnvelopeArgs {
  organizationId: Id<"organizations">;
  module: "crm" | "gabinet" | "platform";
  entityType: string;
  entityId: string;
  action: ActivityAction;
  occurredAt: number;
  performedBy: Id<"users">;
  actor: ActivityEnvelopeActor;
  summary: string;
  payload: Record<string, unknown>;
  eventKey: string;
  schemaVersion: 1;
  attachments?: Array<{ name: string; storageId?: Id<"_storage">; url?: string }>;
  targets?: Array<{ entityType: string; entityId: string }>;
}

export async function publishActivityEnvelope(
  ctx: MutationCtx,
  args: PublishActivityEnvelopeArgs,
) {
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
        activityEnvelope: {
          schemaVersion: args.schemaVersion,
          module: args.module,
          summary: args.summary,
          occurredAt: args.occurredAt,
          actor: args.actor,
          payload: args.payload,
          attachments: args.attachments ?? [],
          eventKey: args.eventKey,
          targets: targets,
        },
      },
    });
  }
}
```

`logActivity(...)` should remain available for untouched publishers. Implement it as a thin adapter that fills `module`, `summary`, `occurredAt`, `eventKey`, and a minimal actor from the old argument shape instead of leaving two competing write paths in the codebase.

- [ ] **Step 4: Re-run the helper test to verify it passes**

Run: `cd /Users/alfred/.openclaw/workspace/projects/crm_new/convex && npx vitest run tests/activityEnvelope.test.ts --reporter=verbose`

Expected: PASS with coverage for required-field rejection, compatibility mapping, and fan-out persistence.

- [ ] **Step 5: Run the Convex typecheck before moving on**

Run: `cd /Users/alfred/.openclaw/workspace/projects/crm_new && npx tsc -p convex/tsconfig.json --pretty false`

Expected: PASS with 0 errors.

- [ ] **Step 6: Commit the contract seam**

```bash
git add convex/_helpers/activityEnvelope.ts convex/_helpers/activities.ts convex/tests/activityEnvelope.test.ts
git commit -m "feat: add shared activity envelope helper"
```

---

### Task 2: Migrate notes and outbound email publication onto the new helper

**Files:**
- Modify: `convex/notes.ts`
- Modify: `convex/emails.ts`
- Modify: `convex/tests/activityEnvelope.test.ts`
- Create: `convex/tests/emailActivities.test.ts`

- [ ] **Step 1: Extend the failing tests for the first two migrated publishers**

Update the helper test file so one note mutation proves `note_added` stores a structured envelope, and add `convex/tests/emailActivities.test.ts` so outbound email activity proves `email_sent` uses a stable `eventKey` and a payload with the message subject and recipients.

```ts
test("creating a note publishes note_added through the envelope helper", async () => {
  await t.withIdentity(identity).mutation(api.notes.create, {
    organizationId,
    entityType: "contact",
    entityId: String(contactId),
    content: "Follow up tomorrow",
  });

  const rows = await t.run(async (ctx) => ctx.db.query("activities").collect());
  expect(rows.at(-1)?.action).toBe("note_added");
  expect(rows.at(-1)?.metadata?.activityEnvelope?.module).toBe("crm");
  expect(rows.at(-1)?.metadata?.activityEnvelope?.payload).toMatchObject({
    entityType: "contact",
    entityId: String(contactId),
  });
});

test("sending an email publishes email_sent with subject and recipients payload", async () => {
  // existing email flow setup...
  const rows = await t.run(async (ctx) => ctx.db.query("activities").collect());
  expect(rows.at(-1)?.action).toBe("email_sent");
  expect(rows.at(-1)?.metadata?.activityEnvelope?.eventKey).toBe(`email:${emailId}:sent`);
  expect(rows.at(-1)?.metadata?.activityEnvelope?.payload).toMatchObject({
    subject: "Welcome",
    to: ["jan@example.com"],
  });
});
```

- [ ] **Step 2: Run the two focused tests and watch them fail**

Run: `cd /Users/alfred/.openclaw/workspace/projects/crm_new/convex && npx vitest run tests/activityEnvelope.test.ts tests/emailActivities.test.ts --reporter=verbose`

Expected: FAIL because `notes.ts` and `emails.ts` still write only the flat shape.

- [ ] **Step 3: Update the two publishers with minimal domain-specific envelopes**

Change only the activity publication calls in `convex/notes.ts` and `convex/emails.ts`. Keep the mutation/query behavior unchanged. Each publisher should supply a domain-owned payload and a stable `eventKey`.

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
  payload: {
    noteId,
    entityType: args.entityType,
    entityId: args.entityId,
  },
  eventKey: `note:${noteId}`,
  schemaVersion: 1,
});

await publishActivityEnvelope(ctx, {
  organizationId: args.organizationId,
  module: "crm",
  entityType: "email",
  entityId: emailId,
  action: "email_sent",
  occurredAt: Date.now(),
  performedBy: user._id,
  actor: { type: "user", userId: user._id, label: user.name ?? user.email ?? "User" },
  summary: `Sent email "${args.subject}" to ${args.to.join(", ")}`,
  payload: {
    emailId,
    subject: args.subject,
    to: args.to,
    cc: args.cc ?? [],
    bcc: args.bcc ?? [],
  },
  eventKey: `email:${emailId}:sent`,
  schemaVersion: 1,
});
```

- [ ] **Step 4: Re-run the focused publisher tests and verify they pass**

Run: `cd /Users/alfred/.openclaw/workspace/projects/crm_new/convex && npx vitest run tests/activityEnvelope.test.ts tests/emailActivities.test.ts --reporter=verbose`

Expected: PASS.

- [ ] **Step 5: Re-run the Convex typecheck before the next publisher batch**

Run: `cd /Users/alfred/.openclaw/workspace/projects/crm_new && npx tsc -p convex/tsconfig.json --pretty false`

Expected: PASS with 0 errors.

- [ ] **Step 6: Commit the first publisher migration batch**

```bash
git add convex/notes.ts convex/emails.ts convex/tests/activityEnvelope.test.ts convex/tests/emailActivities.test.ts
git commit -m "feat: migrate notes and outbound email activities"
```

---

## Chunk 2: Remaining publishers and RBAC alignment

### Task 3: Migrate inbound email, packages, and SMS fan-out to structured activity envelopes

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/emails_internal.ts`
- Modify: `convex/gabinet/packages.ts`
- Modify: `convex/gabinet/appointmentSms.ts`
- Create: `convex/tests/emailActivities.test.ts`
- Create: `convex/tests/packageActivities.test.ts`
- Modify: `convex/tests/appointmentSms.test.ts`

- [ ] **Step 1: Write the failing tests for the remaining migrated publishers**

Extend the existing email and SMS tests, then add a new package test file. Cover three things: inbound email gets `email_received`, package purchase emits a semantic `package_assigned` envelope, and SMS fan-out rows share one `eventKey` across appointment/patient/contact rows.

```ts
test("inbound email writes email_received envelope with external actor payload", async () => {
  // existing inbound email fixture...
  const rows = await t.run(async (ctx) => ctx.db.query("activities").collect());
  const activity = rows.find((row) => row.action === "email_received");
  expect(activity?.metadata?.activityEnvelope?.actor).toMatchObject({
    type: "external",
    label: "jan@example.com",
  });
  expect(activity?.metadata?.activityEnvelope?.payload).toMatchObject({
    subject: "Question about treatment",
    from: ["jan@example.com"],
  });
});

test("purchasePackage emits package_assigned envelope", async () => {
  // existing package setup...
  const rows = await t.run(async (ctx) => ctx.db.query("activities").collect());
  const activity = rows.find((row) => row.action === "package_assigned");
  expect(activity?.metadata?.activityEnvelope?.payload).toMatchObject({
    packageName: "Starter Package",
    remaining: 6,
  });
});

test("sms fan-out rows share one eventKey across all targets", async () => {
  const appointmentActivities = await listActivitiesForEntity(
    t,
    "gabinetAppointment",
    String(appointmentId),
  );
  const patientActivities = await listActivitiesForEntity(
    t,
    "gabinetPatient",
    String(patientId),
  );
  const contactActivities = await listActivitiesForEntity(
    t,
    "contact",
    String(contactId),
  );
  const keys = [
    ...appointmentActivities,
    ...patientActivities,
    ...contactActivities,
  ]
    .filter((row) => row.action === "sms_received")
    .map((row) => row.metadata?.activityEnvelope?.eventKey);
  expect(new Set(keys).size).toBe(1);
});
```

- [ ] **Step 2: Run the failing publisher suite**

Run: `cd /Users/alfred/.openclaw/workspace/projects/crm_new/convex && npx vitest run tests/emailActivities.test.ts tests/packageActivities.test.ts tests/appointmentSms.test.ts --reporter=verbose`

Expected: FAIL because inbound email has no activity, package purchase is not semantic yet, and SMS rows do not guarantee shared `eventKey` semantics.

- [ ] **Step 3: Add the missing semantic action and implement the remaining publisher migrations**

If `package_assigned` is not already part of the shared activity action validator, add it in `convex/schema.ts` first. Then migrate the three publisher files to the shared helper. Keep `performedBy` as a required compatibility field even when the structured actor is external or system-owned.

```ts
// inbound email
await publishActivityEnvelope(ctx, {
  organizationId,
  module: "crm",
  entityType: "email",
  entityId: emailId,
  action: "email_received",
  occurredAt: receivedAt,
  performedBy: account.ownerUserId,
  actor: { type: "external", label: normalizedFromAddress, address: normalizedFromAddress },
  summary: `Received email "${subject}" from ${normalizedFromAddress}`,
  payload: {
    emailId,
    subject,
    from: [normalizedFromAddress],
    snippet,
  },
  eventKey: `email:${providerMessageId ?? emailId}:received`,
  schemaVersion: 1,
});

// package purchase
await publishActivityEnvelope(ctx, {
  organizationId: args.organizationId,
  module: "gabinet",
  entityType: "gabinetPackage",
  entityId: packageId,
  action: "package_assigned",
  occurredAt: Date.now(),
  performedBy: user._id,
  actor: { type: "user", userId: user._id, label: user.name ?? user.email ?? "User" },
  summary: `Assigned package ${packageName}`,
  payload: {
    packageId,
    packageName,
    patientId,
    remaining,
  },
  eventKey: `package:${packageId}:assigned`,
  schemaVersion: 1,
});

// SMS fan-out
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

- [ ] **Step 4: Re-run the focused publisher suite and verify it passes**

Run: `cd /Users/alfred/.openclaw/workspace/projects/crm_new/convex && npx vitest run tests/emailActivities.test.ts tests/packageActivities.test.ts tests/appointmentSms.test.ts --reporter=verbose`

Expected: PASS with stable `eventKey` assertions and no duplicate inbound activity rows per logical SMS event.

- [ ] **Step 5: Re-run the Convex typecheck after the semantic-action change**

Run: `cd /Users/alfred/.openclaw/workspace/projects/crm_new && npx tsc -p convex/tsconfig.json --pretty false`

Expected: PASS with 0 errors.

- [ ] **Step 6: Commit the remaining publisher migrations**

```bash
git add convex/schema.ts convex/emails_internal.ts convex/gabinet/packages.ts convex/gabinet/appointmentSms.ts convex/tests/emailActivities.test.ts convex/tests/packageActivities.test.ts convex/tests/appointmentSms.test.ts
git commit -m "feat: migrate package and inbound activities to envelopes"
```

---

### Task 4: Align automation `update_field` with the standard RBAC path

**Files:**
- Modify: `convex/automation.ts`
- Modify: `convex/tests/automation.test.ts`

- [ ] **Step 1: Add failing RBAC tests that prove the current custom path must go away**

Extend `convex/tests/automation.test.ts` with one explicit deny case, one own-scope case, and one existing allow case so the test file documents the desired contract before the implementation changes.

```ts
test("lead status changed update_field fails when org RBAC override removes edit access", async () => {
  const t = createManagedTestCtx();
  const owner = await seedTestUser(t);
  const actor = await seedSecondUser(t, owner.organizationId, { role: "member" });

  await t.withIdentity(owner.identity).mutation(api.permissions.updateOrgPermissions, {
    organizationId: owner.organizationId,
    role: "member",
    permissions: {
      leads: {
        view: "all",
        create: "all",
        edit: "none",
        delete: "none",
        approve: "none",
        sign: "none",
      },
    },
  });

  // actor owns the automation rule, a lead status change triggers it, flushScheduled...
  expect(run?.status).toBe("failed");
  expect(steps[0]?.errorMessage).toContain("Permission denied");
});

test("lead status changed update_field still enforces own-scope restrictions after RBAC alignment", async () => {
  const t = createManagedTestCtx();
  const owner = await seedTestUser(t);
  const actor = await seedSecondUser(t, owner.organizationId, { role: "member" });

  await t.withIdentity(owner.identity).mutation(api.permissions.updateOrgPermissions, {
    organizationId: owner.organizationId,
    role: "member",
    permissions: {
      leads: {
        view: "all",
        create: "all",
        edit: "own",
        delete: "own",
        approve: "none",
        sign: "none",
      },
    },
  });

  // owner creates the lead, actor owns the automation rule, owner updates lead status...
  expect(run?.status).toBe("failed");
  expect(steps[0]?.errorMessage).toContain("you can only edit your own records");
});

test("lead status changed update_field still succeeds for supported standard fields when RBAC allows edit", async () => {
  // extend the existing supported lead-field test as the explicit allow-case anchor
  expect(run?.status).toBe("processed");
  expect(steps[0]?.status).toBe("processed");
});
```

- [ ] **Step 2: Run the focused automation tests and verify the new expectations fail**

Run: `cd /Users/alfred/.openclaw/workspace/projects/crm_new/convex && npx vitest run tests/automation.test.ts --reporter=verbose`

Expected: FAIL in the new deny/own-scope assertions because `getAutomationEditPermission` still uses custom permission resolution.

- [ ] **Step 3: Replace the duplicated permission path but keep the descriptor safety model intact**

In `convex/automation.ts`, remove the near-duplicate permission lookup and reuse the standard path. Do not weaken `AUTOMATION_UPDATE_FIELD_DESCRIPTORS`, `STANDARD_FIELD_ALLOWLIST`, `supportsCustom`, or `coerceAutomationFieldValue`.

```ts
if (!args.actorUserId) {
  throw new Error("Missing automation actor");
}

await verifyOrgAccess(ctx, args.organizationId);
const permission = await checkPermission(
  ctx,
  args.organizationId,
  descriptor.permissionFeature,
  "edit",
);

if (descriptor.requireAdmin && permission.scope !== "all") {
  throw new Error("Admin access required");
}

if (!permission.allowed) {
  throw new Error("Permission denied");
}

if (permission.scope === "own" && !descriptor.canEditOwn(entity, args.actorUserId)) {
  throw new Error("Permission denied: you can only edit your own records");
}
```


The implementation should stop using `getAutomationEditPermission(...)` entirely unless that function becomes a thin wrapper over `checkPermission(...)`. Do not leave two divergent authorization paths behind.

- [ ] **Step 4: Re-run the focused automation tests and verify they pass**

Run: `cd /Users/alfred/.openclaw/workspace/projects/crm_new/convex && npx vitest run tests/automation.test.ts --reporter=verbose`

Expected: PASS with the existing allow cases still green and the new deny/own-scope assertions green.

- [ ] **Step 5: Re-run the Convex typecheck**

Run: `cd /Users/alfred/.openclaw/workspace/projects/crm_new && npx tsc -p convex/tsconfig.json --pretty false`

Expected: PASS with 0 errors.

- [ ] **Step 6: Commit the RBAC alignment**

```bash
git add convex/automation.ts convex/tests/automation.test.ts
git commit -m "fix: align automation update_field with shared rbac"
```

---

## Chunk 3: Frontend presenter seam and route migration

### Task 5: Add a root presenter test harness and implement the shared activity presenter

**Files:**
- Create: `vitest.config.ts`
- Create: `src/components/activity-timeline/presenter/activity-presenter.ts`
- Create: `src/components/activity-timeline/presenter/activity-renderers.ts`
- Create: `src/components/activity-timeline/presenter/activity-presenter.test.ts`

- [ ] **Step 1: Write the failing presenter tests before adding the presenter**

Create `src/components/activity-timeline/presenter/activity-presenter.test.ts` as a pure TypeScript test file. The presenter should be tested without React rendering. Cover generic envelope rendering, action-aware overrides, and fallback precedence.

```ts
import { describe, expect, it } from "vitest";
import { presentActivity } from "./activity-presenter";

const t = (key: string, values?: Record<string, unknown>) => `${key}:${JSON.stringify(values ?? {})}`;

it("prefers envelope summary over legacy description", () => {
  const view = presentActivity(
    {
      _id: "a1",
      action: "note_added",
      description: "legacy",
      createdAt: 10,
      metadata: {
        activityEnvelope: {
          module: "crm",
          summary: "Added a note",
          occurredAt: 11,
          actor: { type: "user", label: "Jan" },
          payload: { noteId: "n1" },
          eventKey: "note:n1",
          schemaVersion: 1,
        },
      },
    },
    { t },
  );

  expect(view.title).toBe("Added a note");
  expect(view.occurredAt).toBe(11);
  expect(view.actorLabel).toBe("Jan");
});

it("uses action-aware renderer for email_received", () => {
  const view = presentActivity(emailReceivedFixture, { t });
  expect(view.metaLines).toContain('activityTimeline.email.from:{"from":"jan@example.com"}');
});
```

- [ ] **Step 2: Run the presenter test and verify it fails because the presenter does not exist yet**

Run: `cd /Users/alfred/.openclaw/workspace/projects/crm_new && npx vitest run src/components/activity-timeline/presenter/activity-presenter.test.ts`

Expected: FAIL because there is no root Vitest config or presenter implementation yet.

- [ ] **Step 3: Add the minimal root Vitest config and implement the presenter files**

Add a root `vitest.config.ts` for pure TypeScript tests under `src/**`. Then implement the presenter and renderer map.

```ts
// vitest.config.ts
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

```ts
export interface PresentedActivity {
  id: string;
  action: string;
  icon: string;
  tone: "default" | "success" | "warning" | "danger";
  title: string;
  body?: string;
  metaLines: string[];
  attachments: Array<{ name: string; url?: string }>;
  actorLabel?: string;
  occurredAt: number;
}

export function presentActivity(raw: RawActivityLike, deps: { t: TFunction }): PresentedActivity {
  const envelope = raw.metadata?.activityEnvelope;
  const renderer = activityRenderers[raw.action];
  const base = buildBasePresentation(raw, envelope, deps.t);
  return renderer ? renderer({ raw, envelope, base, t: deps.t }) : base;
}
```

Keep this layer pure. It should not fetch data, mutate anything, or know about route components.

- [ ] **Step 4: Re-run the presenter test and verify it passes**

Run: `cd /Users/alfred/.openclaw/workspace/projects/crm_new && npx vitest run src/components/activity-timeline/presenter/activity-presenter.test.ts`

Expected: PASS.

- [ ] **Step 5: Run the app typecheck after adding the new frontend seam**

Run: `cd /Users/alfred/.openclaw/workspace/projects/crm_new && npx tsc -p tsconfig.app.json --pretty false`

Expected: PASS with 0 errors.

- [ ] **Step 6: Commit the presenter seam**

```bash
git add vitest.config.ts src/components/activity-timeline/presenter/activity-presenter.ts src/components/activity-timeline/presenter/activity-renderers.ts src/components/activity-timeline/presenter/activity-presenter.test.ts
git commit -m "feat: add shared activity presenter"
```

---

### Task 6: Integrate the presenter into the shared timeline components and the appointment route

**Files:**
- Modify: `src/components/activity-timeline/activity-timeline.tsx`
- Modify: `src/components/activity-timeline/activity-item.tsx`
- Modify: `src/routes/_app/_auth/dashboard/_layout.gabinet.appointments.$appointmentId.lazy.tsx`
- Modify: `public/locales/en/translation.json`
- Modify: `public/locales/pl/translation.json`
- Modify: `src/components/activity-timeline/presenter/activity-presenter.test.ts`
- Modify: `e2e/gabinet/appointments.spec.ts`

- [ ] **Step 1: Add one failing presenter case and one failing appointment browser assertion**

Extend the presenter test with the appointment-specific legacy metadata shape that currently produces `contentSnapshot` and `metaLines`, and extend `e2e/gabinet/appointments.spec.ts` so it asserts the history card renders presenter-owned title/body/meta strings instead of route-local formatting.

```ts
it("falls back to legacy metadata when no envelope renderer exists yet", () => {
  const view = presentActivity(legacyAppointmentSmsFixture, { t });
  expect(view.body).toContain("TAK");
  expect(view.metaLines).toContain("activityTimeline.sms.replyState");
});
```

```ts
test("appointment history renders shared presenter output", async ({ page }) => {
  // existing appointment setup...
  await expect(page.getByText("Received SMS reply TAK")).toBeVisible();
  await expect(page.getByText(/reply state/i)).toBeVisible();
});
```

- [ ] **Step 2: Run the focused frontend tests and watch them fail**

Run: `cd /Users/alfred/.openclaw/workspace/projects/crm_new && npx vitest run src/components/activity-timeline/presenter/activity-presenter.test.ts && npx playwright test e2e/gabinet/appointments.spec.ts -g "appointment history renders shared presenter output"`

Expected: FAIL because `ActivityTimeline` and the appointment route still own the formatting logic.

- [ ] **Step 3: Integrate the presenter but do not rewrite appointment-only workflow history**

Change `ActivityTimeline` and `ActivityItem` so they render a presenter-owned view model. In the appointment route, only move the shared activity-record formatting into the presenter. Keep appointment-only automation/workflow composition local.

```ts
const timelineRows = activities.map((activity) => ({
  ...activity,
  performedByName: activity.user?.name,
}));

<ActivityTimeline activities={timelineRows} />
```

If the appointment route still needs local merge logic for automation runs or workflow transitions, convert those non-activity entries into the same `PresentedActivity` view model shape there instead of forcing them through the shared raw-activity presenter.

- [ ] **Step 4: Re-run the focused frontend tests and verify they pass**

Run: `cd /Users/alfred/.openclaw/workspace/projects/crm_new && npx vitest run src/components/activity-timeline/presenter/activity-presenter.test.ts && npx playwright test e2e/gabinet/appointments.spec.ts -g "appointment history renders shared presenter output"`

Expected: PASS.

- [ ] **Step 5: Run the app typecheck after the first route migration**

Run: `cd /Users/alfred/.openclaw/workspace/projects/crm_new && npx tsc -p tsconfig.app.json --pretty false`

Expected: PASS with 0 errors.

- [ ] **Step 6: Commit the shared timeline integration**

```bash
git add src/components/activity-timeline/activity-timeline.tsx src/components/activity-timeline/activity-item.tsx src/routes/_app/_auth/dashboard/_layout.gabinet.appointments.$appointmentId.lazy.tsx public/locales/en/translation.json public/locales/pl/translation.json src/components/activity-timeline/presenter/activity-presenter.test.ts e2e/gabinet/appointments.spec.ts
git commit -m "feat: render appointment history through shared presenter"
```

---

### Task 7: Migrate the remaining CRM and Gabinet detail timelines to the presenter

**Files:**
- Modify: `src/routes/_app/_auth/dashboard/_layout.contacts.$contactId.lazy.tsx`
- Modify: `src/routes/_app/_auth/dashboard/_layout.companies.$companyId.tsx`
- Modify: `src/routes/_app/_auth/dashboard/_layout.leads.$leadId.lazy.tsx`
- Modify: `src/routes/_app/_auth/dashboard/_layout.gabinet.patients.$patientId.tsx`
- Modify: `src/routes/_app/_auth/dashboard/_layout.gabinet.employees.$employeeId.tsx`
- Modify: `public/locales/en/translation.json`
- Modify: `public/locales/pl/translation.json`
- Modify: `e2e/crm/contacts.spec.ts`
- Modify: `e2e/crm/companies.spec.ts`
- Modify: `e2e/crm/leads.spec.ts`
- Modify: `e2e/gabinet/patients.spec.ts`
- Create: `e2e/gabinet/employees.spec.ts`

- [ ] **Step 1: Add failing browser coverage for every touched detail surface**

Update the existing CRM and patient specs, and add a new employee spec if none exists. Each spec should create or load one entity with known activity rows and assert the shared presenter output is visible on the page.

```ts
test("contact detail history renders presenter title and actor", async ({ page }) => {
  // existing contact setup...
  await expect(page.getByText("Added a note")).toBeVisible();
  await expect(page.getByText("Jan Kowalski")).toBeVisible();
});

test("employee detail history renders presenter fallback copy", async ({ page }) => {
  // new employee setup...
  await expect(page.getByText("Updated employee record")).toBeVisible();
});
```

- [ ] **Step 2: Run the route-level browser coverage and verify it fails before implementation**

Run: `cd /Users/alfred/.openclaw/workspace/projects/crm_new && npx playwright test e2e/crm/contacts.spec.ts e2e/crm/companies.spec.ts e2e/crm/leads.spec.ts e2e/gabinet/patients.spec.ts e2e/gabinet/employees.spec.ts`

Expected: FAIL because the routes still shape the history cards locally or the employee coverage does not exist yet.

- [ ] **Step 3: Remove the route-local activity shaping and let the presenter own it**

Each route should stop mapping only `_id`, `action`, `description`, and `createdAt` into an ad hoc `ActivityTimeline` prop. Pass raw rows into the shared timeline seam instead.

```ts
const timelineRows = activities?.map((row) => ({
  ...row,
  performedByName: row.user?.name,
})) ?? [];

<ActivityTimeline activities={timelineRows} />
```

Do not add route-specific presenter logic unless the route truly owns non-activity records. The point of this step is to delete repeated route-local formatting code, not move it around.

- [ ] **Step 4: Re-run the browser coverage and verify it passes**

Run: `cd /Users/alfred/.openclaw/workspace/projects/crm_new && npx playwright test e2e/crm/contacts.spec.ts e2e/crm/companies.spec.ts e2e/crm/leads.spec.ts e2e/gabinet/patients.spec.ts e2e/gabinet/employees.spec.ts`

Expected: PASS.

- [ ] **Step 5: Re-run the app typecheck**

Run: `cd /Users/alfred/.openclaw/workspace/projects/crm_new && npx tsc -p tsconfig.app.json --pretty false`

Expected: PASS with 0 errors.

- [ ] **Step 6: Commit the remaining route migrations**

```bash
git add src/routes/_app/_auth/dashboard/_layout.contacts.$contactId.lazy.tsx src/routes/_app/_auth/dashboard/_layout.companies.$companyId.tsx src/routes/_app/_auth/dashboard/_layout.leads.$leadId.lazy.tsx src/routes/_app/_auth/dashboard/_layout.gabinet.patients.$patientId.tsx src/routes/_app/_auth/dashboard/_layout.gabinet.employees.$employeeId.tsx public/locales/en/translation.json public/locales/pl/translation.json e2e/crm/contacts.spec.ts e2e/crm/companies.spec.ts e2e/crm/leads.spec.ts e2e/gabinet/patients.spec.ts e2e/gabinet/employees.spec.ts
git commit -m "feat: migrate detail timelines to shared activity presenter"
```

---

## Chunk 4: Final verification and completion

### Task 8: Run the full focused verification, review, and final commit flow

**Files:**
- Modify: any files touched by the earlier tasks if the review loop finds issues
- Verify: `convex/tests/activityEnvelope.test.ts`
- Verify: `convex/tests/emailActivities.test.ts`
- Verify: `convex/tests/packageActivities.test.ts`
- Verify: `convex/tests/appointmentSms.test.ts`
- Verify: `convex/tests/automation.test.ts`
- Verify: `src/components/activity-timeline/presenter/activity-presenter.test.ts`
- Verify: `e2e/gabinet/appointments.spec.ts`
- Verify: `e2e/gabinet/patients.spec.ts`
- Verify: `e2e/gabinet/employees.spec.ts`
- Verify: `e2e/crm/contacts.spec.ts`
- Verify: `e2e/crm/companies.spec.ts`
- Verify: `e2e/crm/leads.spec.ts`

- [ ] **Step 1: Run the exact focused verification suite before claiming success**

Run these commands in order:

```bash
cd /Users/alfred/.openclaw/workspace/projects/crm_new && npx tsc --noEmit
cd /Users/alfred/.openclaw/workspace/projects/crm_new && npx tsc -p tsconfig.app.json --pretty false
cd /Users/alfred/.openclaw/workspace/projects/crm_new && npx tsc -p convex/tsconfig.json --pretty false
cd /Users/alfred/.openclaw/workspace/projects/crm_new && npx vitest run src/components/activity-timeline/presenter/activity-presenter.test.ts
cd /Users/alfred/.openclaw/workspace/projects/crm_new/convex && npx vitest run tests/activityEnvelope.test.ts tests/emailActivities.test.ts tests/packageActivities.test.ts tests/appointmentSms.test.ts tests/automation.test.ts --reporter=verbose
cd /Users/alfred/.openclaw/workspace/projects/crm_new && npx playwright test e2e/gabinet/appointments.spec.ts e2e/gabinet/patients.spec.ts e2e/gabinet/employees.spec.ts e2e/crm/contacts.spec.ts e2e/crm/companies.spec.ts e2e/crm/leads.spec.ts
```

Expected: every command exits 0.

- [ ] **Step 2: Run the required review skills before the final commit**

Use `@superpowers:requesting-code-review`, then run `@cross-module-check`, then use `@superpowers:verification-before-completion`. Do not skip this ordering.

Expected: no unresolved high-priority review issues remain, import boundaries stay clean, translation files stay complete, and the touched automation/activity slices remain pattern-consistent.

- [ ] **Step 3: Fix anything the review or verification loop finds, then re-run the exact failing command**

Do not jump straight to a full rerun if only one command failed. Reproduce the specific failure, fix it, and rerun that exact command first. Only go back to the full verification block once the targeted failure is green.

- [ ] **Step 4: Create the final feature commit once everything is green**

```bash
git add convex/_helpers/activityEnvelope.ts convex/_helpers/activities.ts convex/notes.ts convex/emails.ts convex/emails_internal.ts convex/gabinet/packages.ts convex/gabinet/appointmentSms.ts convex/automation.ts convex/schema.ts convex/tests/activityEnvelope.test.ts convex/tests/emailActivities.test.ts convex/tests/packageActivities.test.ts convex/tests/appointmentSms.test.ts convex/tests/automation.test.ts vitest.config.ts src/components/activity-timeline/presenter/activity-presenter.ts src/components/activity-timeline/presenter/activity-renderers.ts src/components/activity-timeline/presenter/activity-presenter.test.ts src/components/activity-timeline/activity-timeline.tsx src/components/activity-timeline/activity-item.tsx src/routes/_app/_auth/dashboard/_layout.gabinet.appointments.$appointmentId.lazy.tsx src/routes/_app/_auth/dashboard/_layout.contacts.$contactId.lazy.tsx src/routes/_app/_auth/dashboard/_layout.companies.$companyId.tsx src/routes/_app/_auth/dashboard/_layout.leads.$leadId.lazy.tsx src/routes/_app/_auth/dashboard/_layout.gabinet.patients.$patientId.tsx src/routes/_app/_auth/dashboard/_layout.gabinet.employees.$employeeId.tsx public/locales/en/translation.json public/locales/pl/translation.json e2e/gabinet/appointments.spec.ts e2e/gabinet/patients.spec.ts e2e/gabinet/employees.spec.ts e2e/crm/contacts.spec.ts e2e/crm/companies.spec.ts e2e/crm/leads.spec.ts
git commit -m "feat: standardize shared activities and automation rbac"
```

- [ ] **Step 5: Capture final evidence for handoff**

Record the exact commands run, the final green outputs, which routes received full-cycle browser coverage, and any intentionally deferred follow-up work. This slice should end with evidence, not just a claim.

---

Execution notes for the implementing agent: keep the write path strict, keep the read path tolerant, and prefer deleting route-local formatting over adding more adapter layers. If a step seems to require a broad rewrite, stop and re-check the spec, because the approved direction is compatibility-safe incremental migration, not a big-bang replacement.

## Verification Summary

This plan was fact-checked against the current codebase on 2026-03-15.

Total claims checked: 24. Confirmed: 15. Corrected: 9. Unverifiable: 0.

Corrections made: Task 1 and Task 2 test examples now use real Convex test helpers from `convex/_test_helpers.ts` and real activity reads via `t.run(async (ctx) => ctx.db.query("activities").collect())`. Task 3 now uses `convex/tests/emailActivities.test.ts` as the inbound email anchor, no longer treats `convex/tests/appointmentStateMachine.test.ts` as an activity-publication test, and uses the existing `listActivitiesForEntity(...)` helper shape for the SMS fan-out assertion. Task 4 now references realistic RBAC tests built on `api.permissions.updateOrgPermissions`, `seedSecondUser(...)`, current `verifyOrgAccess(...)` and `checkPermission(...)` behavior, and the real `descriptor.permissionFeature` field. Task 6 now uses the actual `ActivityTimeline activities={...}` API instead of a nonexistent `items` prop. Task 8 now references the currently relevant focused verification files and final staging list.