# Quality Score

Use this rubric when judging whether a change is ready for `Human Review`.

Score each dimension from 1 to 5.

Correctness asks whether the requested behavior actually works.

Architecture asks whether the change stays within module boundaries, reuses existing patterns, and keeps business rules in the right layer.

Verification asks whether the author ran the right commands and gathered enough evidence.

Operator clarity asks whether staff can understand the resulting state without digging through logs or provider dashboards.

Documentation freshness asks whether durable lessons were written down in the right place.

A change should not be treated as truly review-ready if any critical dimension is effectively a 1 or 2, even if the happy path appears to work.
