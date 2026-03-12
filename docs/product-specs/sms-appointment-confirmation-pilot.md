# SMS Appointment Confirmation Pilot

This pilot covers one real workflow in Gabinet: the clinic sends a confirmation SMS, the patient replies `TAK` or `NIE`, and staff can see what happened without opening provider dashboards.

The staff job to be done is operational clarity. A receptionist or clinic operator should know whether a confirmation request was sent, whether the patient replied, how the system interpreted the reply, and whether the appointment actually changed status.

Success means the workflow is reliable end to end. Outbound requests must leave durable correlation state, inbound replies must be idempotent, appointment transitions must still go through the domain logic, and the UI must expose enough evidence for staff review.

The pilot is intentionally narrow. It is not a generalized messaging platform, not a full autonomous rollout, and not a replacement for human review. It is one vertical slice designed to prove the repo-owned workflow and evidence model.
