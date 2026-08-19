# Reliability

Reliability in this codebase depends on durable state, explicit ownership, and observable outcomes.

For async workflows, prefer durable records over implicit assumptions. If a later callback, reply, or retry matters, write correlation state explicitly.

Keep domain transitions centralized. Inbound webhooks, schedulers, and integration handlers should route work into the owning domain rather than patching business state ad hoc.

Idempotency must be explicit for externally retried flows.

Human review remains part of the pilot reliability model. Automation may prepare evidence and move work to `Human Review`, but landing still requires a human decision.

---

## Service Level Objectives (SLOs)

These targets apply to the production environment across all modules (CRM, Gabinet, platform core). Each SLO is measured over a rolling 30-day window unless noted otherwise.

### Availability

| Component | Target | Monthly error budget |
|-----------|--------|----------------------|
| Frontend (Netlify CDN) | 99.5% | 3 h 39 min |
| Convex backend (`/health` endpoint) | 99.5% | 3 h 39 min |
| Supabase read path | 99.5% | 3 h 39 min |

**Definition:** A component is "available" when the uptime monitor (`.github/workflows/uptime.yml`, polling every 10 min) receives a 2xx response. An outage window begins at the first failed poll and ends at the first successful poll after recovery. Partial-minute windows are counted as full minutes.

The 99.5% target was chosen deliberately over 99.9% for the pilot phase. A 99.9% target leaves only 43 minutes of monthly error budget — less than the time required to detect, triage, and roll back a broken deploy. 99.5% gives teams enough runway to act without cutting corners.

### Latency

| Operation | P95 target | P99 target |
|-----------|------------|------------|
| Convex query (read) | 500 ms | 1 500 ms |
| Convex mutation (write) | 800 ms | 2 500 ms |
| Page load (Netlify CDN, cached) | 1 500 ms | 3 000 ms |

Latency is measured from request initiation to first meaningful response at the browser. P99 targets are informational — a sustained P99 breach warrants investigation but does not burn error budget on its own.

### Error rate

| Scope | Target | Alert threshold |
|-------|--------|-----------------|
| Convex function 5xx rate (5-min window) | < 1% | > 0.5% for 5 consecutive minutes |
| Supabase query error rate (5-min window) | < 1% | > 0.5% for 5 consecutive minutes |

**Definition:** Error rate = (requests returning 5xx or throwing an unhandled exception) / (total requests) in a given window. Client errors (4xx) do not count against this SLO.

---

## Error Budget Policy

The monthly error budget is the complement of the availability SLO: 0.5% of minutes in a 30-day month = **216 minutes** per component.

| Budget consumed | Action |
|-----------------|--------|
| > 50% in the first 15 days | Review deploy cadence; postpone non-critical changes |
| > 75% at any point | Freeze all deployments except P1 hotfixes |
| Budget exhausted | Full deployment freeze; post-incident review required before any release |

A deployment freeze means no merges to `main` until the next calendar month begins or the component has been stable for 48 consecutive hours, whichever comes later.

Error budget is reset on the 1st of each calendar month.

---

## Alert Reference

The uptime monitor opens a GitHub issue with the `uptime-monitoring-alert` label on failure and closes it manually on resolution. When triaging:

- An issue open for < 10 minutes may be a transient network blip — verify with a second manual check before escalating.
- An issue open for ≥ 10 minutes (two failed polls) triggers the P1 checklist in `docs/RUNBOOK.md`.
- A latency or error-rate alert that does not accompany an availability alert is treated as P2.

Severity levels and response/resolution time targets are defined in `docs/RUNBOOK.md`.
