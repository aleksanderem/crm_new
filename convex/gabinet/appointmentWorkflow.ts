// appointmentWorkflowConfig was removed in issue #3678 — the per-org JSON blob
// approach for appointment notifications was never wired up to appointment
// creation (dispatchAppointmentCreated was never called). Notification dispatch
// is handled entirely by the automation engine (convex/automation.ts).
// The appointmentWorkflowHistory table remains in use by automation.ts,
// emailEvents.ts, and appointments.ts for history display.
