# Core Beliefs

This repository is built around a horizontal platform with module-owned business workflows.

Business rules should live in the domain that owns them. Integrations, schedulers, and UI surfaces should route into that domain instead of recreating its logic elsewhere.

Shared capability should be truly shared. If logic is specific to CRM or Gabinet, keep it there. If it is generic, move it to a neutral platform layer rather than crossing module boundaries.

Durable state beats implicit coordination. If a workflow depends on a future callback, reply, retry, or review step, the state needed to continue that workflow should be written explicitly.

Human review is a product feature of the delivery system, not a failure of automation. Agents should reduce uncertainty and produce evidence, then hand off clearly.

Documentation should be progressive. Stable beliefs belong in durable docs, implementation lessons belong in retrospectives first, and execution detail belongs in plans rather than being mixed into architectural truth.
