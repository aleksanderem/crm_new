# SMS Backend Retrospective — 2026-03-11

This retrospective captures what the backend implementation of the 2-way SMS appointment confirmation slice taught us.

## What turned out to matter

The biggest architectural lesson was that inbound SMS processing cannot own appointment business logic. The webhook layer is good at parsing provider payloads, verifying signatures, normalizing data, and resolving correlation, but it becomes fragile if it starts patching appointment state directly. The stable path is: inbound handler resolves correlation and then delegates to the appointment domain, where side effects already belong.

The second key lesson was that outbound messaging needs durable correlation from the start. A confirmation request must leave behind an event record that contains organization context, normalized phone, correlation key, idempotency key, provider metadata, and processing status. Without that record, inbound replies are harder to attribute, harder to audit, and harder to replay safely.

The third lesson was that provider lookup for inbound messages must be indexed and provider-aware. Twilio inbound routing depends on matching the receiving number, while branded sender-based providers may match on sender id. The config layer therefore needs inbound-specific lookup helpers and indexes instead of a single org-only config query.

## Rules discovered from implementation

When a workflow depends on a future patient reply, do not send free-floating SMS directly from an unrelated mutation. Route it through a dedicated event-aware send path.

Do not keep the old "appointment created means confirmed by SMS copy" behavior when piloting reply-driven confirmation. It creates contradictory semantics. The confirmation request must be its own message with an explicit TAK/NIE contract.

Use `internalQuery` for pure reads. A read helper left as `internalMutation` is a smell and should be corrected early because autonomous agents will otherwise cargo-cult the wrong pattern.

Keep idempotency explicit in inbound processing. If the provider gives a message id, use it. If it does not, derive a deterministic fallback from provider plus sender, recipient, and normalized body.

## Current compromise we should keep visible

The codebase currently expects concrete user ids for activity and audit attribution. For SMS-driven transitions there is no first-class system actor model yet. The implemented workaround is to preserve the real trigger source in structured audit details, including `source: "sms_reply"` and the related SMS event id. This is acceptable for the pilot, but it is still a compromise and should stay visible in docs and review notes.

## What this means for upcoming UI work

The UI should not force staff to infer what happened from provider consoles or raw logs. It should expose the outbound request, the inbound reply, the parsed intent, the processing result, and the final appointment state transition in one staff-facing place.

## Follow-up documentation rule

As the UI slice proceeds, add a matching retrospective for operator-facing lessons and then promote stable findings into `docs/automation/rules/gabinet-ui.md`.
