# Reliability

Reliability in this codebase depends on durable state, explicit ownership, and observable outcomes.

For async workflows, prefer durable records over implicit assumptions. If a later callback, reply, or retry matters, write correlation state explicitly.

Keep domain transitions centralized. Inbound webhooks, schedulers, and integration handlers should route work into the owning domain rather than patching business state ad hoc.

Idempotency must be explicit for externally retried flows.

Human review remains part of the pilot reliability model. Automation may prepare evidence and move work to `Human Review`, but landing still requires a human decision.
