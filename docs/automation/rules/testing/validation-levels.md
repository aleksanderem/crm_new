# Validation Levels

Validation should scale with blast radius, but every run must leave explicit evidence of what was checked.

Backend-only changes should compile the touched backend area and run focused unit or integration coverage when present.

Frontend changes should typecheck the touched UI area, verify the changed route or component path, and capture screenshots of the changed states.

Cross-cutting or pre-review work should target `npm run lint`, `npm run typecheck`, `npm run test:unit`, and focused Playwright smoke where the user-visible flow changed.
