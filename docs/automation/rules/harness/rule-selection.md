# Rule Selection

Load only the rule packs that match the area being changed.

Touching `convex/**` requires backend rules.

Touching `src/components/gabinet/**`, Gabinet routes, or related i18n files requires UI rules.

Touching tests, screenshots, demo captures, or review artifacts requires testing rules.

Touching multiple areas requires loading all matching rule packs and following the most restrictive instruction.
