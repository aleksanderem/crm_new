# Security

This repository is multi-tenant and security-sensitive by default.

Organization access and RBAC rules are not optional. Backend code should continue to rely on the established access and permission helpers instead of inventing parallel authorization paths.

Do not move secrets into docs, evidence artifacts, screenshots, or generated references.

External callbacks should verify signatures where the provider supports them, preserve enough metadata for auditability, and treat idempotency as a security and correctness concern rather than a convenience.

Cross-module boundaries are also a security boundary in practice. Avoid importing module-private code across CRM and Gabinet unless the code has been intentionally moved into a neutral shared layer.
