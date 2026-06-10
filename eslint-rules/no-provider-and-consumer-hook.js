/**
 * no-provider-and-consumer-hook
 *
 * Disallow rendering a React context Provider in the JSX returned by a
 * component that also calls one of that Provider's consumer hooks in its
 * body.
 *
 * Why this exists: context lookup walks ancestors, not descendants. A hook
 * called above its Provider will throw at render time. This exact mistake
 * has shipped on `_layout.tsx` twice (c6a5a95, #1478 / #1496). The fix is
 * always to split the component into an outer (mounts Providers) + inner
 * (calls hooks rendered inside the Provider stack) pair. See #1498.
 *
 * Configurable via `pairs`: a map from Provider component name to a list of
 * consumer hook patterns. Patterns wrapped in slashes (`/^useFoo/`) are
 * treated as regexes; plain strings are exact matches.
 */

const DEFAULT_PAIRS = {
  // SupabaseProvider has ~50 domain hooks (use-supabase-*.ts) plus the three
  // primitive ones (useSupabase, useSupabaseSafe, useSupabaseClient). Match
  // any identifier starting with `useSupabase` — every such hook in this
  // codebase ultimately calls useSupabase() and needs the Provider above it.
  SupabaseProvider: ["/^useSupabase/"],
  OrgProvider: ["useOrganization"],
  DateRangeProvider: ["useDateRange"],
  NudgesProvider: ["useNudges"],
  MiniCalendarProvider: ["useMiniCalendar"],
  SidebarSlotProvider: ["useSidebarSlot"],
  HeaderSlotProvider: ["useHeaderSlot"],
};

function compilePatterns(patterns) {
  return patterns.map((p) => {
    const match = /^\/(.+)\/([a-z]*)$/.exec(p);
    if (match) return new RegExp(match[1], match[2]);
    return new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
  });
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow rendering a context Provider in the same component that calls one of its consumer hooks (context lookup walks ancestors, not descendants).",
    },
    schema: [
      {
        type: "object",
        properties: {
          pairs: {
            type: "object",
            additionalProperties: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      providerSelfConsumed:
        "`{{hook}}` is called in the same component that renders `<{{provider}}>`. The hook walks ancestors for its context — it will not find a Provider mounted in this component's own return value. Split into outer (mounts Provider) + inner (calls hook) components. See #1498.",
    },
  },
  create(context) {
    const options = context.options[0] || {};
    const pairs = options.pairs || DEFAULT_PAIRS;
    const compiled = Object.entries(pairs).map(([provider, patterns]) => ({
      provider,
      regexes: compilePatterns(patterns),
    }));

    const stack = [];

    function pushFrame() {
      stack.push({ jsxNames: new Set(), hookCalls: [] });
    }

    function popFrame() {
      const frame = stack.pop();
      if (!frame) return;
      for (const { provider, regexes } of compiled) {
        if (!frame.jsxNames.has(provider)) continue;
        for (const { name, node } of frame.hookCalls) {
          if (regexes.some((r) => r.test(name))) {
            context.report({
              node,
              messageId: "providerSelfConsumed",
              data: { hook: name, provider },
            });
          }
        }
      }
    }

    return {
      FunctionDeclaration: pushFrame,
      "FunctionDeclaration:exit": popFrame,
      FunctionExpression: pushFrame,
      "FunctionExpression:exit": popFrame,
      ArrowFunctionExpression: pushFrame,
      "ArrowFunctionExpression:exit": popFrame,

      JSXOpeningElement(node) {
        if (stack.length === 0) return;
        // Only flag bare identifiers (`<Foo>`), not member expressions
        // (`<Foo.Provider>`) — the latter is used inside Provider definitions
        // themselves and is not the bug pattern.
        if (node.name.type !== "JSXIdentifier") return;
        stack[stack.length - 1].jsxNames.add(node.name.name);
      },

      CallExpression(node) {
        if (stack.length === 0) return;
        if (node.callee.type !== "Identifier") return;
        const name = node.callee.name;
        if (!/^use[A-Z0-9]/.test(name)) return;
        stack[stack.length - 1].hookCalls.push({ name, node });
      },
    };
  },
};

export default rule;
