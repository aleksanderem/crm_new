# Domain Ownership

Appointment state changes must stay centralized in the appointment domain.

Webhooks, schedulers, and integration handlers may parse input, normalize payloads, and resolve correlation, but they must not reimplement appointment lifecycle logic or its side effects inline.

For Gabinet appointment workflows, `convex/gabinet/appointments.ts` is the preferred ownership point for lifecycle orchestration.
