# Product Sense

Product documentation in this repo should start from operator and customer problems, not from implementation details.

Use `docs/product-specs/` for feature specs that explain who the workflow serves, what job it is meant to accomplish, what counts as success, and what is explicitly out of scope.

A good product spec in this repository makes the staff mental model visible, especially for flows that cross automation, backend state, and UI. The SMS appointment confirmation pilot is a good example: staff should be able to see what was sent, what reply arrived, what intent was parsed, and whether the appointment actually changed.
