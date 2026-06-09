# Prompt patterns

The bot's behavior is defined almost entirely by `worker/run-claude.sh` — Claude
itself is just a CLI. This doc captures the *shape* of the instructions
`run-claude.sh` constructs and pipes into `claude -p`. Read the file to see the
exact strings (they evolve).

## High-level flow inside `run-claude.sh`

```
for attempt in 1..MAX_ATTEMPTS:
  prepare worktree
  build prompt:
      <issue body> + <comments> + <step-0 triage rules> + <step-1 fix rules>
  invoke claude -p "$PROMPT" --permission-mode bypassPermissions
  parse exit + capture last line
  decide label:
      regex match NOT_A_BUG: pattern → claude:not-a-bug + close
      regex match RESOLVED_PATTERN  → claude:auto-resolved + close
      PR opened                     → claude:done
      no PR + needs-info markers    → claude:needs-info
      hard error                    → claude:failed (retry budget permitting)
  post comment with verdict
  if follow-up findings → extract-followups.mjs opens auto-tracked issues
```

## Triage rules (step 0 — TRIAGE FIRST)

The bot is instructed to *verify the report is actually a bug* before touching
code:

1. Reproduce against the current `main` checkout.
2. If the requested feature already exists, output `NOT_A_BUG:` and explain
   where the implementation lives (cite **greppable** files and symbols, not
   PR numbers — see hallucination warnings).
3. If the underlying root cause was already merged but the user is looking at
   a stale deploy, label it `claude:auto-resolved` and explain.
4. If the issue body is empty or ambiguous, do not guess — `claude:needs-info`.

## Fix rules (step 1 — only after triage said "real bug")

- Branch: `claude/issue-<num>` off the latest `main`.
- Work in a worktree (`/home/claude-bot/worktrees/issue-<num>`).
- Open a PR titled with the conventional-commits format derived from the
  issue title.
- Body of PR: link the issue, describe the fix in 2–3 bullets.
- If something out-of-scope is needed, open a follow-up issue with
  `auto-followup` label instead of expanding the PR.

## Tunables (`worker/tuning.json`)

| Field                  | Default | Effect                                            |
| ---------------------- | ------: | ------------------------------------------------- |
| `max_turns`            | 100     | Hard cap on Claude's tool-call rounds per attempt |
| `max_attempts`         | 2       | Retry budget per issue                            |
| `per_attempt_timeout`  | 1200s   | Wall-clock cap per attempt                        |

`tune.mjs` mutates this file based on exit-code patterns across the last 25
finished jobs:
- > 30% timeout → bump `per_attempt_timeout`
- > 30% max-turns hit → bump `max_turns` (asymptote at 200)
- < 5% retries used → trim `max_attempts` back to 2

## Known hallucination modes

1. **PR number ≠ issue number, but bot cites them interchangeably.**
   In the squash-merge commit footer the bot frequently sees
   `(#1199) (#1202)` — the first is the originating issue, the second is the
   actual PR. The bot has historically picked the first and called it "PR".
   When auditing, grep for the commit hash; that's authoritative.

2. **Cited commit hash exists but the symbol it claims doesn't.**
   Defense: `run-claude.sh` should grep-confirm every file:line citation
   before posting. Not currently enforced — open follow-up.

3. **Verdict relies on "this is already deployed", but the prod deployment
   is stale.** See `KNOWN-FAILURE-MODES.md`.
