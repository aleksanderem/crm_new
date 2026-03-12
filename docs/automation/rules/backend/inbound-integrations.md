# Inbound Integrations

Any inbound provider callback must normalize external payloads early, derive or capture an idempotency key, verify signatures where supported, preserve raw metadata for debugging, and route into a domain mutation only after correlation is resolved.

Do not let the webhook layer patch business state directly.
