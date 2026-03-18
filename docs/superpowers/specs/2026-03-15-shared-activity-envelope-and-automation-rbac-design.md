# Shared Activity Envelope and Automation RBAC — Design Spec

Date: 2026-03-15
Status: Draft
Module: Platform activity system with CRM, Gabinet, and automation touchpoints

## Overview

This design standardizes how modules publish activity records into the shared activity system without collapsing module boundaries into one central domain model. The goal is to make activity publication strongly opinionated, make activity rendering consistent across targeted activity surfaces, and keep module-specific semantics inside the module that owns them.

The approved direction is a shared required activity envelope plus a flexible module payload. The backend remains simple and modular. CRM, Gabinet, and future modules keep building their own activity events, but they all publish them through one shared contract. The frontend stops interpreting ad hoc `description` and `metadata` shapes route by route and instead renders a single view model built by a shared presenter layer.

The same effort also closes the automation RBAC gap found in the cross-module review. The `update_field` execution path must align with the same explicit permission model used elsewhere in the backend rather than keeping its own near-duplicate permission resolution path.

## Goals

The first goal is to make activity publication opinionated. A module should not be able to emit a vague activity record with only a free-form description and arbitrary metadata. It should have to provide a stable shared envelope.

The second goal is to make activity rendering consistent across the entity detail surfaces we migrate to the shared presenter in this fragment. Today the concrete inconsistency is visible in entity detail timelines. Broader feed and list-style activity surfaces may eventually consume the same presenter, but they are follow-up work rather than part of this fragment's done state.

The third goal is to preserve modularity. The shared layer validates the activity envelope and stores it durably, but it does not understand the meaning of package assignment, inbound email, lead ownership changes, or future module-specific actions.

The fourth goal is to align automation authorization with the existing permission model so that automation field updates are governed by the same explicit RBAC rules as user-facing mutations.

## Non-goals

This design does not attempt a big-bang migration of every historical activity record before rollout. It also does not move rendering semantics into backend business logic or create a single backend registry that interprets every module payload. It does not redesign the entire activity table for analytics use cases beyond what is needed to support consistent product surfaces.

## Approved architectural direction

The shared activity system gains one opinionated publishing contract. Each module publishes a shared envelope and keeps its domain-specific details in a flexible payload. The backend validates and stores the envelope, fans the activity out to one or more targets when needed, and remains agnostic about payload semantics. The frontend owns interpretation and presentation through one shared presenter layer with action-aware renderers and safe fallbacks.

This creates a clean split of responsibilities. Modules decide what happened and what payload belongs to that action. The shared backend layer decides whether the event is valid and where it should be stored. The shared frontend layer decides how the activity should be shown consistently to the user.

## Shared activity envelope

Every new or migrated activity publisher must provide the same required envelope. The exact TypeScript and Convex validators can be finalized during implementation, but the design assumes these fields are mandatory unless marked optional.

`organizationId` identifies the tenant. `module` identifies the originating module such as `crm`, `gabinet`, or `platform`. `entityType` and `entityId` identify the primary entity that the activity is about. `action` identifies the semantic event type such as `note_added`, `email_received`, or `package_assigned`. `occurredAt` records when the domain event happened. `actor` captures who or what caused the event, including user, system, and external actors. `summary` is a short user-facing line for simple feeds and fallback rendering. `payload` stores the flexible module-owned details that richer presenters use. `eventKey` identifies one logical event across any fan-out rows. `schemaVersion` identifies the activity-envelope contract version.

The envelope also supports optional fields. `attachments` carries normalized attachment references when an activity has files or documents. `targets` supports fan-out when one activity should appear on multiple related entities such as appointment, patient, and contact. `visibility` can be added if the product later needs per-surface or per-role filtering, but it is not required for the first rollout if current activity visibility rules already cover the touched cases.

The critical design point is that `summary` is always present and stable, but `payload` stays flexible and modular. For example, a package assignment activity can carry package-specific fields such as `packageName`, `remaining`, and `assignedBy`. An inbound email activity can carry `subject`, `snippet`, `from`, and attachment metadata. Both still obey the same shared envelope.

## Publishing API and backend flow

Modules should stop calling the low-level activity insert pattern directly. Instead, they should publish through one shared helper that accepts the validated envelope and handles fan-out. This helper should live in the shared activity layer and should become the standard path for new activity publication.

The publishing helper should validate that the required envelope fields exist, reject incomplete activity records early, normalize shared substructures such as `actor` and `attachments`, and then write one activity row per target entity. It should not inspect module payload meaning beyond structural validation. That keeps the shared layer opinionated about contract shape without making it domain-aware.

Fan-out should become a first-class publishing concern. A publisher should be able to declare one primary entity and zero or more related targets in a shared way. The shared layer writes the resulting rows consistently rather than each module implementing its own fan-out pattern. Every row created from the same logical event must carry the same `eventKey` so later cross-entity or aggregate surfaces can deduplicate when needed.

Permission-aware visibility must be enforced in the backend read and write contract, not only in the presenter. Publish-time fan-out decides which entity rows come into existence for an event. Query-time authorization decides whether the current viewer may load those rows on a given surface. The presenter is allowed to format only the rows that the backend query has already authorized. This prevents route-level rendering differences from becoming a data-leak path.

## Persistence contract and query compatibility

The first rollout should preserve the current flat activity row shape as the authoritative query surface, because current activity queries and indexes are built around top-level entity and user fields. That means `organizationId`, `entityType`, `entityId`, and `action` remain first-class stored fields and continue to drive the existing `by_entity`, `by_org`, and `by_user` access patterns.

To minimize blast radius, the first rollout should map the new envelope onto the existing storage model instead of immediately redesigning the table around many new top-level columns. `description` should mirror `summary`. `createdAt` should mirror `occurredAt`. `performedBy` should remain the compatibility attribution field required by the current schema and existing user-based queries, while the true presentation actor semantics live in the structured `actor` field inside the envelope. This is important because some activities may be caused by systems or external actors even though the current table still requires a user id for `performedBy`.

The structured envelope should live under a namespaced metadata sub-object such as `metadata.activityEnvelope` during the first rollout. That sub-object should carry fields such as `schemaVersion`, `module`, `summary`, `occurredAt`, `actor`, `payload`, `attachments`, `eventKey`, and any `targets` or visibility hints needed for rendering or deduplication.

If later work needs direct querying by `module`, `eventKey`, or other new envelope fields, that should be handled as a separate schema migration with explicit index additions. The first rollout should not implicitly widen the query surface without deciding the necessary indexes.

## Frontend presenter and rendering model

All major migrated activity surfaces should render through one shared presenter layer. The presenter accepts raw activity records and returns a common view model with stable fields such as `icon`, `tone`, `title`, `body`, `metaLines`, `attachments`, `actorLabel`, and `occurredAt`. Surfaces render that view model and stop manually unpacking route-local `metadata` shapes.

The presenter should be layered. The base layer always knows how to render the envelope generically using the shared fields. On top of that, action-aware renderers can enrich the output for specific actions such as `email_received`, `package_assigned`, `note_added`, and future actions. If an action does not yet have a custom renderer, the fallback presenter still renders a coherent card using the shared envelope.

This design removes the current inconsistency where one detail page only passes `_id`, `action`, `description`, and `createdAt`, while another page builds a much richer timeline entry locally. After rollout, the rendering path should be the same across the entity timelines and any broader feed or list surfaces migrated in this work or in follow-up rollout phases.

## Entity-centric feed contract

The completion target for this rollout fragment is entity-scoped activity across CRM and Gabinet, not a generic module-level event stream. Every supported entity detail surface should show the activity that meaningfully belongs to that entity, provided the current viewer has access to both the surface and the underlying activity semantics.

This makes fan-out and visibility part of the product contract, not an incidental implementation detail. A note, email, package assignment, appointment change, or similar domain event may need to appear on multiple related entity feeds, but each appearance must still respect module boundaries, assignment rules, and access restrictions. For example, CRM-originated activity should remain visible only to users allowed to see that CRM context unless the product explicitly defines a broader audience.

## Relation timing semantics

Related-entity visibility starts from the moment a relation becomes active. If a company is linked to a contact today, the company feed should show subsequent contact activity that is eligible to fan out through that relation, but it should not retroactively absorb the contact's older history. This keeps audit semantics predictable, reduces accidental overexposure, and matches the safer enterprise expectation for timeline behavior.

The same rule applies when relations end. Historical activity that was validly visible while the relation existed remains part of the feed history, but new events stop fanning out through that relation after it is removed.

The authoritative mechanism for this fragment is publish-time relation resolution, not dynamic graph recomputation on read. When an event is emitted, the publisher or shared activity helper must resolve the currently active related targets and write one row per allowed target using that moment's relation state. Read queries then load already-targeted rows and apply authorization filtering; they do not retroactively discover new targets by traversing the current entity graph. This is what enforces the approved "from the moment of relation" behavior without backfilling older history.

## Rollout strategy

The rollout should be incremental and safe. The first phase introduces the shared envelope types, validators, publishing helper, persistence mapping, and shared presenter without attempting a full historical rewrite. The second phase migrates touched or newly introduced publishers to the new contract, especially the flows explicitly called out in this discussion: package assignment, note activity, and client email activity. The third phase migrates entity detail feeds across the supported CRM and Gabinet surfaces to the shared presenter so they stop doing route-local interpretation and start honoring the same fan-out and visibility rules. Broader cross-entity or module-level aggregate feeds remain follow-up work unless explicitly selected during implementation planning. The fourth phase tightens remaining legacy paths and removes redundant render logic once confidence is high.

Legacy records must remain readable throughout rollout. The read path should therefore be tolerant. If a record predates the new contract or is missing richer fields, the presenter should degrade gracefully to summary-first rendering. The write path should be strict for new publishers so the system stops accruing new contract drift.

## Read-path fallback precedence

The presenter should use a deterministic precedence order so mixed records behave predictably during rollout. For summary and title-level rendering, envelope fields win first, then legacy `description`, then action-specific fallback strings. For body and richer details, action-aware renderers should read envelope `payload` first, then legacy `metadata`, then omit optional details if neither exists. For actor display, envelope `actor` wins first, then loaded `performedBy` user information, then no actor label. For timestamps, `occurredAt` wins first, then legacy `createdAt`. For attachments, normalized envelope `attachments` win first, then legacy action-specific metadata extraction, then an empty attachment list.

This gives the rollout a strict write path and a tolerant read path while making mixed old and new records predictable.

## Automation RBAC alignment

The automation `update_field` execution path currently uses its own permission resolution path instead of the same explicit RBAC enforcement pattern used elsewhere. This design treats that as part of the same cleanup wave.

The desired end state is that automation field updates pass through one shared authorization path that is visibly aligned with the rest of the codebase. `verifyOrgAccess` remains the membership gate. Permission enforcement for the actual edit must call the same canonical permission helper used by ordinary backend writes, namely the shared `checkPermission` path in combination with the existing org-membership gate, rather than a near-duplicate permission system embedded inside automation execution. Authorization failures must remain fail-closed and surface as ordinary permission-denied behavior rather than silently skipping writes.

This alignment does not broaden what `update_field` is allowed to do. The current descriptor-driven target model, target-entity restrictions, field-kind checks, field allowlists, custom-field support flags, and value coercion remain in scope unless explicitly redesigned later. The change here is about permission enforcement consistency, not about turning `update_field` into a more generic or less guarded mutation path.

The implementation can still keep helper extraction for shared logic if needed, but the contract should be obvious: automation writes do not get a special permission universe. They use the same RBAC model as ordinary writes, including scope-sensitive behavior where applicable.

## Safeguards and fallback behavior

The new publisher path should fail early if the shared envelope is incomplete. Missing actor information, missing summary, missing action, missing `eventKey`, or a missing target identity should be treated as contract errors rather than silently accepted partial records.

The read path should remain resilient. The presenter must support fallback rendering for legacy records and for new actions that do not yet have a dedicated renderer. This gives the system a strict write path and a tolerant read path, which is the safest combination for gradual migration.

To avoid a new form of central coupling, the shared layer must not own per-module payload semantics. That responsibility belongs to module publishers and frontend renderers. The shared layer should only validate the envelope shape and normalize the shared structures.

## Verification strategy

Backend verification should prove that the publishing helper rejects incomplete envelopes, stores valid activity rows consistently, preserves compatibility fields correctly, and fans out correctly to related entities. Focused tests should cover at least package assignment, notes, and client email activity. Relation-aware tests must prove the approved timing rule: an entity starts receiving related activity only from the moment the relation becomes active, with no retroactive history import. RBAC tests should prove that automation field updates fail when the shared authorization path denies the action and succeed when the same path allows it.

Frontend verification should prove that the same presenter view model powers migrated entity detail timelines across CRM and Gabinet. It should also prove that legacy records still render through fallback behavior and that richer activities such as client email expose the expected presentation fields including subject, body/snippet, and attachments when the envelope payload provides them. Since the presenter is the new shared seam, it should have its own focused tests for generic rendering, action-aware rendering, relation-aware entity feed behavior where relevant, and fallback behavior.

Cross-module verification should include TypeScript, import-boundary checks, translation completeness for any newly surfaced UI copy, RBAC review, and pattern checks on touched entity detail surfaces. If schema changes are needed to store the new envelope more explicitly, the related indexes must be verified as part of the rollout.

## Touched areas expected during implementation planning

The shared backend work is expected to touch the activity helper and activity query layer, plus the module publishers that emit the newly standardized events. The shared frontend work is expected to touch `ActivityTimeline`, shared activity presenter code, and the entity detail consumers currently doing local activity mapping. The automation fix is expected to touch the automation execution path and its permission enforcement helpers.

The currently evidenced shared-activity consumers in scope are entity timelines such as appointment history and the CRM and Gabinet detail pages that already read entity-scoped activities. For this fragment, entity detail feeds across supported CRM and Gabinet surfaces are the definition-of-done target. Broader cross-entity feed or list-style surfaces remain rollout targets to be selected explicitly in follow-up work rather than assumed to be required now.

## Risks and mitigations

The main risk is partial rollout leaving some surfaces on route-local formatting while others move to the shared presenter. The mitigation is to make presenter adoption part of the same tracked rollout, not an optional cleanup.

Another risk is letting the shared envelope become so detailed that it starts absorbing module semantics. The mitigation is to keep the shared contract intentionally small and stable, with the payload remaining module-owned.

A third risk is quietly preserving the old loose publisher patterns. The mitigation is to funnel all touched publishers through the shared helper and add tests that fail if required envelope fields are missing.

A fourth risk is duplicated logical events appearing multiple times on future aggregate surfaces after fan-out. The mitigation is to require stable `eventKey` values on publish and make aggregate readers or presenters dedupe on that key where appropriate.

## Final approved direction

The approved design is to introduce a required shared activity envelope, keep module-specific semantics in a flexible payload, centralize write-path validation and fan-out in the shared activity layer, preserve current query compatibility through a transitional persistence model, centralize rendering through a shared frontend presenter with action-aware renderers and safe fallback behavior, and align automation `update_field` authorization with the codebase’s standard RBAC path while preserving the existing descriptor and allowlist safety model.
