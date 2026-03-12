# Loading Order

Agents should load instructions progressively instead of reading the whole repository guidance bundle every time.

Apply instructions in this order when they conflict:

1. repository safety and developer instructions
2. `CLAUDE.md`
3. `WORKFLOW.md`
4. module context docs such as `docs/modules/gabinet.md`
5. matching rule files under `docs/automation/rules/`
6. latest relevant retrospective under `docs/automation/retrospectives/`

Retrospectives explain implementation lessons. They do not override explicit rules.
