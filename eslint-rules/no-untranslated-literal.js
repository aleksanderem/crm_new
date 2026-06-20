/**
 * no-untranslated-literal
 *
 * Disallow bare English string literals in user-facing positions:
 *
 *   1. JSX text content       — `<span>Save</span>`
 *   2. User-facing JSX attrs  — `<Button title="Close">`
 *   3. Prop defaults in       — `function Foo({ submitLabel = "Create" }: Props)`
 *      function/component
 *      destructuring
 *
 * Catches the SidePanel/CommandInput regression class (issue #1975 / #1982),
 * where shared UI primitives shipped hardcoded English defaults and bypassed
 * `useTranslation()`, surfacing on every screen that consumed them.
 *
 * The heuristic for "English-looking" is conservative:
 *   - has at least 2 ASCII letters
 *   - has no Polish diacritics (ą/ę/ć/ł/ń/ó/ś/ź/ż etc.)
 *   - is not a code-like identifier (camelCase, kebab, snake_case)
 *   - is not a bare lowercase token (likely a variant value: "outline", "sm"…)
 *   - is not a URL, file path, MIME type, or hex/numeric literal
 *
 * The attribute names that count as "user-facing" are configurable via the
 * `userFacingAttrs` option. Specific strings can be allowlisted via `ignore`.
 *
 * Severity is intentionally `warn` in the project config so the rule surfaces
 * regressions in PR review without blocking the existing accumulated debt.
 */

const POLISH_DIACRITICS = /[ąęćłńóśźżĄĘĆŁŃÓŚŹŻ]/;
const ASCII_LETTER = /[A-Za-z]/g;

const DEFAULT_USER_FACING_ATTRS = [
  "placeholder",
  "title",
  "alt",
  "label",
  "aria-label",
  "aria-description",
  "aria-roledescription",
  "aria-placeholder",
  "description",
  "tooltip",
  "submitLabel",
  "cancelLabel",
  "closeLabel",
  "confirmLabel",
  "saveLabel",
  "deleteLabel",
  "editLabel",
  "addLabel",
  "searchPlaceholder",
  "emptyMessage",
  "emptyLabel",
  "emptyText",
  "helperText",
  "helpText",
  "errorMessage",
  "noResultsMessage",
  "submitText",
  "confirmText",
  "cancelText",
];

const DEFAULT_IGNORE = [
  "...",
  "…",
  "OK",
  "API",
  "URL",
  "ID",
  "PDF",
  "CSV",
  "JSON",
  "XML",
  "PESEL",
  "NIP",
  "REGON",
  "iOS",
  "macOS",
];

function looksEnglish(rawValue, ignore) {
  if (typeof rawValue !== "string") return false;
  const value = rawValue.trim();
  if (!value) return false;
  if (ignore.has(value)) return false;
  if (POLISH_DIACRITICS.test(value)) return false;

  const letters = value.match(ASCII_LETTER);
  if (!letters || letters.length < 2) return false;

  // URLs, mailto:, tel:, file paths
  if (/^[a-z]+:\/\//i.test(value)) return false;
  if (/^(mailto|tel):/i.test(value)) return false;
  if (/^\/[A-Za-z0-9/_.-]+$/.test(value)) return false;

  // MIME types: "image/png", "application/json"
  if (/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(value)) return false;

  // Hex colors, CSS lengths, numeric-looking values
  if (/^#[0-9a-f]{3,8}$/i.test(value)) return false;
  if (/^-?\d+(\.\d+)?(px|em|rem|%|vh|vw|fr)?$/.test(value)) return false;

  // Code-like identifiers (camelCase, snake_case, kebab-case, dotted paths)
  if (!/\s/.test(value) && /^[a-z][a-zA-Z0-9_]*$/.test(value)) return false;
  if (!/\s/.test(value) && /^[a-z][a-zA-Z0-9_]*([._-][a-zA-Z0-9_]+)+$/.test(value)) return false;

  // Single all-lowercase word with no spaces: usually a variant/value
  // ("outline", "ghost", "auto", "start"). Even if it's English, it's not
  // user-facing prose.
  if (/^[a-z]+$/.test(value)) return false;

  // ALL-CAPS short tokens are usually acronyms used as labels for codes
  // (currency, country, format). Skip unless they have spaces.
  if (!/\s/.test(value) && /^[A-Z0-9_-]+$/.test(value) && value.length <= 5) {
    return false;
  }

  // Require either a capital letter (proper noun / sentence start) or a
  // space (multi-word phrase). This filters out lowercase identifiers that
  // somehow slipped through above.
  if (!/[A-Z]/.test(value) && !/\s/.test(value)) return false;

  return true;
}

function compileIgnore(list) {
  return new Set(list);
}

function isStringLike(node) {
  if (!node) return null;
  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis.map((q) => q.value.cooked).join("");
  }
  return null;
}

function attrName(node) {
  if (!node || !node.name) return null;
  if (node.name.type === "JSXIdentifier") return node.name.name;
  if (node.name.type === "JSXNamespacedName") {
    return `${node.name.namespace.name}:${node.name.name.name}`;
  }
  return null;
}

const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow bare English string literals in user-facing JSX text, JSX attributes, and prop destructuring defaults — wrap with t() instead.",
    },
    schema: [
      {
        type: "object",
        properties: {
          userFacingAttrs: {
            type: "array",
            items: { type: "string" },
          },
          ignore: {
            type: "array",
            items: { type: "string" },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      jsxText:
        'Untranslated literal "{{value}}" in JSX content. Wrap with t() so the workspace language setting is respected. See #1975 / #1982.',
      jsxAttr:
        'Untranslated literal "{{value}}" on user-facing attribute `{{attr}}`. Wrap with t() so the workspace language setting is respected. See #1975 / #1982.',
      propDefault:
        'Untranslated default "{{value}}" for prop `{{prop}}`. Resolve via t() at use site (e.g. `const resolved = {{prop}} ?? t("...")`). See #1975 / #1982.',
    },
  },
  create(context) {
    const options = context.options[0] || {};
    const attrs = new Set(options.userFacingAttrs || DEFAULT_USER_FACING_ATTRS);
    const ignore = compileIgnore([
      ...DEFAULT_IGNORE,
      ...(options.ignore || []),
    ]);

    function check(value, node, messageId, data) {
      if (!looksEnglish(value, ignore)) return;
      const trimmed = value.trim();
      const display = trimmed.length > 40 ? `${trimmed.slice(0, 37)}...` : trimmed;
      context.report({
        node,
        messageId,
        data: { ...data, value: display },
      });
    }

    return {
      JSXText(node) {
        check(node.value, node, "jsxText", {});
      },

      JSXAttribute(node) {
        const name = attrName(node);
        if (!name || !attrs.has(name)) return;
        if (!node.value) return;

        // Direct string literal: aria-label="Close"
        let literal = null;
        if (node.value.type === "Literal") {
          literal = node.value.value;
        }
        // Expression container holding a string literal:
        // aria-label={"Close"} or aria-label={`Close`}
        if (node.value.type === "JSXExpressionContainer") {
          literal = isStringLike(node.value.expression);
        }
        if (literal == null) return;
        check(literal, node.value, "jsxAttr", { attr: name });
      },

      // Prop default in destructuring:
      //   function Foo({ submitLabel = "Create" }: Props) {}
      AssignmentPattern(node) {
        if (!node.left || node.left.type !== "Identifier") return;
        const propName = node.left.name;
        if (!attrs.has(propName)) return;
        const literal = isStringLike(node.right);
        if (literal == null) return;
        check(literal, node.right, "propDefault", { prop: propName });
      },
    };
  },
};

export default rule;
