# Read vs Write

Use `internalQuery` for read-only helpers and `internalMutation` only when persistent state changes.

Avoid write-capable wrappers for pure reads because they hide intent and make autonomous cargo-culting more likely.
