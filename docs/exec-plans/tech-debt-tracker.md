# Tech Debt Tracker

Track durable follow-up work here when it should survive beyond a single implementation plan.

## Open items

### System actor model for automated transitions

SMS-driven appointment transitions currently preserve the true trigger source in structured audit details, but the codebase still expects a concrete user id for activity and audit attribution. A first-class system actor model would remove this compromise.

### Atomized rules migration follow-through

The automation rules are now moving from coarse files to smaller packs. Keep consolidating stable lessons into the smaller rule files and reduce duplicated guidance over time.
