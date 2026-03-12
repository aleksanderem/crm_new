# Correlation and Idempotency

If a workflow depends on a later callback or user reply, write a durable correlation or event record before or during the outbound send path.

Do not rely on best-effort matching alone.

For externally retried flows, idempotency is required, not optional.
