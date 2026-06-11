// ground-pr-body.mjs — sanity-check Claude's PR summary against the actual diff.
//
// Reads Claude's free-form summary from stdin and the list of files changed in
// the branch from the DIFF_FILES env var (one path per line). Scans the summary
// for file:line citations (e.g. `src/foo/bar.ts:42`) and decides whether the
// summary is grounded in the diff.
//
// Decision matrix:
//   - no citations at all                    -> exit 0, pass through unchanged
//   - at least one citation matches a diff file -> exit 0, pass through (with a
//     "Note" footer if some citations were ungrounded, so reviewers know)
//   - citations exist but none match the diff   -> exit 1, the caller is expected
//     to discard the summary and fall back to a safe body
//
// Empty DIFF_FILES (worker called us with no diff info) is treated as a no-op
// (exit 0, unchanged) so we never block a PR because of a wiring bug.

import { readFileSync } from "node:fs";

const input = readFileSync(0, "utf8");
const diffFilesRaw = process.env.DIFF_FILES ?? "";
const diffFiles = new Set(
  diffFilesRaw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean),
);

// Only match citations whose extension is plausibly a code/config/doc file.
// Keeps us from flagging things like "v1:2" or "10:30" as citations.
const CODE_EXT =
  "ts|tsx|js|jsx|mjs|cjs|mts|cts|json|md|sh|bash|zsh|css|scss|sass|less|html|htm|" +
  "sql|py|go|rs|java|kt|swift|rb|php|c|cc|cpp|cxx|h|hh|hpp|hxx|m|mm|" +
  "yml|yaml|toml|xml|ini|conf|cfg|lock|txt|snap|vue|svelte|astro|" +
  "tf|hcl|proto|gradle|cmake|mk|env";

// Path must contain at least one path-like char or extension to qualify.
// Captures: 1 = file path, 2 = first line number
const CITATION_RE = new RegExp(
  String.raw`(?<![\w/\-.])` +
    String.raw`([A-Za-z0-9_][\w./\-]*\.(?:${CODE_EXT}))` +
    String.raw`:(\d+)(?:[-:]\d+)?\b`,
  "g",
);

const citations = [];
for (const m of input.matchAll(CITATION_RE)) {
  citations.push({ raw: m[0], file: m[1], line: Number(m[2]) });
}

if (citations.length === 0 || diffFiles.size === 0) {
  process.stdout.write(input);
  process.exit(0);
}

const grounded = citations.filter((c) => diffFiles.has(c.file));
const ungrounded = citations.filter((c) => !diffFiles.has(c.file));

if (grounded.length === 0) {
  // Every cited file is missing from the diff — refuse to use this summary.
  // Print the offenders to stderr for the worker log, then exit non-zero so
  // the caller picks a safe fallback body.
  process.stderr.write(
    `ground-pr-body: all ${citations.length} citation(s) are ungrounded:\n` +
      ungrounded.map((c) => `  - ${c.raw}`).join("\n") +
      "\n",
  );
  process.exit(1);
}

process.stdout.write(input);
if (ungrounded.length > 0) {
  const uniq = [...new Set(ungrounded.map((c) => c.raw))];
  process.stdout.write(
    `\n\n---\n\n` +
      `> :warning: The following file:line reference(s) cited above are not in the diff for this PR and may be inaccurate: ` +
      uniq.map((s) => `\`${s}\``).join(", ") +
      `.\n`,
  );
}
process.exit(0);
