# SMS Appointment Confirmation Pilot Plan

This is the repo-owned execution plan for the current Symphony pilot lane.

## Scope

Implement and verify the Gabinet 2-way SMS appointment confirmation flow with staff-facing visibility and a `Human Review` delivery stop.

## Slices

`SMS-01` correlation model for appointment SMS — passing.

`SMS-02` outbound confirmation SMS flow — passing.

`SMS-03` inbound SMS webhook and parser — passing.

`SMS-04` reply-driven appointment transitions — passing.

`SMS-05` staff UI for SMS confirmation state — next.

`SMS-06` pilot verification, observability, workflow docs, and evidence — in progress.

## Current focus

Finish the documentation information architecture and atomized rules so autonomous runs can load smaller, more targeted guidance. Then implement the staff UI and focused verification/evidence path.
