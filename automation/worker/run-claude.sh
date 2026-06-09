#!/bin/bash
# run-claude.sh — process one issue through Claude Code
# env: JOB_ID, ISSUE_NUMBER, REPO, EVENT_TYPE, TRIGGER_LOGIN, PAYLOAD_JSON
set -uo pipefail

LOG_DIR=/home/claude-bot/logs
JOB_LOG="$LOG_DIR/job-${JOB_ID}.log"
mkdir -p "$LOG_DIR"
exec >>"$JOB_LOG" 2>&1
echo "=== JOB $JOB_ID === issue=$ISSUE_NUMBER repo=$REPO event=$EVENT_TYPE trigger=$TRIGGER_LOGIN $(date -Is)"

REPO_DIR=/home/claude-bot/repo
WT_BASE=/home/claude-bot/worktrees
BRANCH="claude/issue-${ISSUE_NUMBER}"
WT_DIR="${WT_BASE}/issue-${ISSUE_NUMBER}"
TUNING=/home/claude-bot/worker/tuning.json

# Read tunables (with defaults if file missing/broken)
MAX_ATTEMPTS=$(jq -r '.max_attempts // 2' "$TUNING" 2>/dev/null || echo 2)
PER_ATTEMPT_TIMEOUT=$(jq -r '.per_attempt_timeout // 1200' "$TUNING" 2>/dev/null || echo 1200)
MAX_TURNS=$(jq -r '.max_turns // 100' "$TUNING" 2>/dev/null || echo 100)
echo "tunables: max_turns=$MAX_TURNS max_attempts=$MAX_ATTEMPTS per_attempt_timeout=${PER_ATTEMPT_TIMEOUT}s"

ALL_LABELS=("claude:working" "claude:done" "claude:needs-info" "claude:failed" "claude:retry" "claude:conflict" "claude:auto-resolved" "claude:not-a-bug")
AUTO_CLOSE=0  # set to 1 when worker decides to close the issue itself
# Patterns Claude uses when it determines the requested work is ALREADY DONE
# on main (vs. genuinely needing user input). Matching CLAUDE_MSG against
# this means the worker should close the issue, not park it under needs-info.
RESOLVED_PATTERN='already (been )?(resolved|fixed|completed|merged|applied|landed|addressed|implemented|done)|already in place|no change[s]? (needed|warranted|required)|fully resolved|fully addressed|Opened follow-up issue\(s\)|already correct|already typed correctly|audit complete|premise is incorrect|This issue is already|The issue is already|already in main|no remaining|no actionable change|no further action|already on main'
# Patterns indicating the report is NOT actually a bug — feature exists,
# working as designed, user mistake. Triggered by step 0 (TRIAGE FIRST)
# in the prompt. The NOT_A_BUG: marker is the strong primary signal;
# natural-language fallbacks catch cases where Claude forgets the marker.
NOT_A_BUG_PATTERN='^NOT_A_BUG:|not (actually )?a bug|working as (designed|intended|expected)|expected behavi[ou]r|feature (already )?exists|the feature is.{0,40}(at|in|under|located)|no bug (found|reproduced)|the user (appears to have |seems to have |may have )?missed|user (error|mistake|misunderstanding)|behaves correctly|works correctly|functioning as designed'

# --- Helpers ---
set_label() {
  local target="$1"
  for l in "${ALL_LABELS[@]}"; do
    [ "$l" = "$target" ] && continue
    gh issue edit "$ISSUE_NUMBER" --repo "$REPO" --remove-label "$l" 2>/dev/null || true
  done
  gh issue edit "$ISSUE_NUMBER" --repo "$REPO" --add-label "$target" 2>&1 | tail -1
}

post_comment() {
  gh issue comment "$ISSUE_NUMBER" --repo "$REPO" --body-file "$1" 2>&1 | tail -2
}

cleanup_worktree() {
  cd /home/claude-bot
  git -C "$REPO_DIR" worktree remove --force "$WT_DIR" 2>&1 | tail -1 || rm -rf "$WT_DIR"
}

# --- 1. Mark as working ASAP ---
set_label "claude:working"

# --- 2. Fetch latest from origin ---
cd "$REPO_DIR" || { echo "FATAL: REPO_DIR missing"; exit 2; }
git fetch --prune origin 2>&1 | tail -3

# --- 3. Pull issue thread ---
ISSUE_JSON=$(gh issue view "$ISSUE_NUMBER" --repo "$REPO" --json number,title,body,author,state,labels,comments,url 2>&1)
if [ $? -ne 0 ]; then
  echo "FATAL: gh issue view failed: $ISSUE_JSON"
  set_label "claude:failed"
  exit 3
fi

ISSUE_TITLE=$(echo "$ISSUE_JSON" | jq -r .title)
ISSUE_URL=$(echo "$ISSUE_JSON" | jq -r .url)
ISSUE_BODY=$(echo "$ISSUE_JSON" | jq -r .body)
ISSUE_AUTHOR=$(echo "$ISSUE_JSON" | jq -r .author.login)

# --- 4. Set up worktree ---
if [ -d "$WT_DIR" ]; then
  git worktree remove --force "$WT_DIR" 2>&1 || rm -rf "$WT_DIR"
fi
mkdir -p "$WT_BASE"

if git show-ref --verify --quiet "refs/remotes/origin/${BRANCH}"; then
  echo "continuing branch $BRANCH"
  git worktree add -B "$BRANCH" "$WT_DIR" "origin/${BRANCH}"
else
  echo "creating new branch $BRANCH from origin/main"
  git worktree add -b "$BRANCH" "$WT_DIR" origin/main
fi

cd "$WT_DIR"
git config user.name "Claude Bot"
git config user.email "${BOT_GIT_EMAIL:-claude-bot@example.com}"

# --- 5. Build prompt ---
PROMPT_FILE=$(mktemp)
{
  echo "You are working on GitHub issue #${ISSUE_NUMBER} in repo ${REPO}."
  echo "URL: ${ISSUE_URL}"
  echo "Title: ${ISSUE_TITLE}"
  echo "Author: ${ISSUE_AUTHOR}"
  echo
  echo "## Issue body"
  echo "$ISSUE_BODY"
  echo
  echo "## Comments (oldest to newest)"
  echo "$ISSUE_JSON" | jq -r '.comments[] | "### @\(.author.login) at \(.createdAt)\n\(.body)\n"'
  echo
  echo "## Your task"
  echo "0. TRIAGE FIRST (required, before any code changes). Verify the report is actually a problem:"
  echo "   - Does the feature/path the user mentions actually exist in the codebase?"
  echo "   - Is the behavior the user calls a 'bug' actually intentional / working as designed?"
  echo "   - Could the user have missed where the feature lives (wrong screen, wrong menu, different role)?"
  echo "   - Is there a quick way to verify the user's claim (read the relevant component, check the route, check the schema)?"
  echo "   If after this check you conclude the report is NOT a real bug:"
  echo "   - Do NOT commit anything"
  echo "   - Start your response with the literal marker: NOT_A_BUG:"
  echo "   - Follow with: a friendly explanation of what the actual state is, exact file:line references where the feature lives, and how the user can use it"
  echo "   - Example: 'NOT_A_BUG: the export button is in the kebab menu in the top-right of /dashboard/contacts. See src/components/crm/contacts-table.tsx:142. It triggers a CSV download.'"
  echo "1. Read the issue carefully and understand what is being asked."
  echo "2. Investigate the codebase as needed (you are in a fresh worktree of branch ${BRANCH} from main)."
  echo "3. If the issue is a bug or small feature request you can solve cleanly:"
  echo "   - Make the necessary code changes"
  echo "   - Verify by running typecheck/tests where reasonable"
  echo "   - COMMIT your changes with a clear message referencing #${ISSUE_NUMBER}"
  echo "4. SCOPE CHECK — if the task looks LARGE (>5 files, major refactor, new architecture, or you would need >50 tool calls just to investigate):"
  echo "   - Do NOT try to implement end-to-end"
  echo "   - End your response with: your understanding of the task, suggested approach, list of files you would change, and any clarifying questions"
  echo "   - Do NOT commit anything in this case"
  echo "5. If you need clarification or more information:"
  echo "   - Do NOT commit anything"
  echo "   - End your response with a clear, specific question for the issue author"
  echo "6. If the issue is unclear, out of scope, or you cannot solve it:"
  echo "   - Do NOT commit anything"
  echo "   - Explain what is blocking you"
  echo
  echo "## Follow-ups (IMPORTANT)"
  echo "If during your investigation or fix you discover OTHER bugs, anti-patterns, or technical debt that"
  echo "are out of scope for THIS issue but should be tracked separately, list them at the end of your final"
  echo "response under a heading exactly named '## Follow-ups'. One bullet per item."
  echo "Each bullet: short imperative title, then a colon, then a brief description (one line)."
  echo "Example:"
  echo "## Follow-ups"
  echo "- Replace dynamic imports with static in convex/organizations.ts: same V8 anti-pattern as #${ISSUE_NUMBER}, will fail in production"
  echo "- Add typecheck for X: missing in CI"
  echo "Each line will become its own GitHub issue with auto-followup label. Be specific. Do NOT list trivial style nits."
  echo "If there are no follow-ups, OMIT the section entirely (do not write '## Follow-ups' with empty body)."
  echo
  echo "Be concise. Do not run long-running dev servers. Do not delete files outside this worktree."
} > "$PROMPT_FILE"

echo "--- PROMPT START ---"
cat "$PROMPT_FILE"
echo "--- PROMPT END ---"

# --- 6. Run Claude with retry ---
CLAUDE_OUT=$(mktemp)
CLAUDE_EXIT=99
CLAUDE_MSG=""
LAST_ERROR_KIND=""
ATTEMPT=0
while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  ATTEMPT=$((ATTEMPT+1))
  echo "--- ATTEMPT $ATTEMPT/$MAX_ATTEMPTS (max_turns=$MAX_TURNS, timeout=${PER_ATTEMPT_TIMEOUT}s) ---"
  HOME=/home/claude-bot timeout "$PER_ATTEMPT_TIMEOUT" claude \
    --permission-mode bypassPermissions \
    --max-turns "$MAX_TURNS" \
    -p "$(cat $PROMPT_FILE)" \
    > "$CLAUDE_OUT" 2>&1
  CLAUDE_EXIT=$?
  CLAUDE_MSG=$(cat "$CLAUDE_OUT")
  echo "--- CLAUDE EXIT=$CLAUDE_EXIT (attempt $ATTEMPT) ---"
  echo "${CLAUDE_MSG:0:500}"
  echo "--- ---"

  if [ "$CLAUDE_EXIT" -eq 0 ]; then
    echo "claude exited cleanly on attempt $ATTEMPT"
    break
  fi

  if echo "$CLAUDE_MSG" | grep -q "Reached max turns"; then
    LAST_ERROR_KIND="max-turns"
  elif [ "$CLAUDE_EXIT" -eq 124 ]; then
    LAST_ERROR_KIND="wallclock-timeout"
  else
    LAST_ERROR_KIND="exit-${CLAUDE_EXIT}"
  fi
  echo "claude failed on attempt $ATTEMPT: $LAST_ERROR_KIND"

  if [ $ATTEMPT -lt $MAX_ATTEMPTS ]; then
    echo "retrying in 5s..."
    sleep 5
  fi
done

# --- 7. Decide outcome ---
COMMITS_AHEAD=$(git rev-list --count "origin/main..HEAD" 2>/dev/null || echo 0)
echo "commits ahead of origin/main: $COMMITS_AHEAD (final exit=$CLAUDE_EXIT, kind=$LAST_ERROR_KIND)"

COMMENT_FILE=$(mktemp)
FINAL_LABEL=""

if [ "$COMMITS_AHEAD" -gt 0 ]; then
  echo "pushing branch $BRANCH"
  git push --set-upstream origin "$BRANCH" 2>&1 | tail -3

  PR_NUM=$(gh pr list --repo "$REPO" --head "$BRANCH" --json number --jq ".[0].number" 2>/dev/null)
  if [ -z "$PR_NUM" ] || [ "$PR_NUM" = "null" ]; then
    PR_BODY="Auto-generated by Claude in response to issue #${ISSUE_NUMBER}.

Closes #${ISSUE_NUMBER}

---

## Claude summary

${CLAUDE_MSG}"
    PR_NUM=$(gh pr create --repo "$REPO" --base main --head "$BRANCH" --title "$ISSUE_TITLE" --body "$PR_BODY" 2>&1 | tail -1 | grep -oE "[0-9]+$")
    echo "created PR #$PR_NUM"
  else
    echo "PR #$PR_NUM exists, will retry merge"
  fi

  # SAFETY: only auto-merge claude/issue-* branches (extra guard beyond the loop's own scoping)
  if [[ ! "$BRANCH" =~ ^claude/issue-[0-9]+$ ]]; then
    echo "REFUSE auto-merge: branch '$BRANCH' does not match claude/issue-N pattern"
    {
      echo "🤖 Pushed ${COMMITS_AHEAD} commit(s) to **PR #${PR_NUM}** but auto-merge was REFUSED — branch name doesn't match required pattern."
    } > "$COMMENT_FILE"
    FINAL_LABEL="claude:conflict"
  else
  # Auto-merge unless safety valve label is on the issue
  ISSUE_LABELS=$(echo "$ISSUE_JSON" | jq -r ".labels[].name" 2>/dev/null)
  if echo "$ISSUE_LABELS" | grep -q "^claude:no-auto-merge$"; then
    echo "claude:no-auto-merge present — skipping auto-merge"
    {
      echo "🤖 Pushed ${COMMITS_AHEAD} commit(s) to \`${BRANCH}\` and opened **PR #${PR_NUM}**."
      echo
      echo "_Auto-merge skipped (\`claude:no-auto-merge\` label is set). Please review and merge manually._"
      echo
      echo "---"
      echo
      echo "${CLAUDE_MSG}"
    } > "$COMMENT_FILE"
    FINAL_LABEL="claude:done"
  else
    echo "auto-merging PR #$PR_NUM (squash)"
    MERGE_OUT=$(gh pr merge "$PR_NUM" --repo "$REPO" --squash --delete-branch --admin 2>&1)
    MERGE_EXIT=$?
    echo "merge output: $MERGE_OUT"
    echo "merge exit: $MERGE_EXIT"
    if [ "$MERGE_EXIT" -eq 0 ]; then
      # Confirm actually merged (could be queued via --auto if checks pending)
      sleep 2
      PR_STATE=$(gh pr view "$PR_NUM" --repo "$REPO" --json state --jq ".state" 2>/dev/null)
      if [ "$PR_STATE" = "MERGED" ]; then
        {
          echo "🤖 Implemented in **PR #${PR_NUM}** (squash-merged to \`main\`, branch deleted). ✅"
          echo
          echo "---"
          echo
          echo "${CLAUDE_MSG}"
        } > "$COMMENT_FILE"
        FINAL_LABEL="claude:done"
      else
        {
          echo "🤖 **PR #${PR_NUM}** queued for auto-merge (will merge when checks pass)."
          echo
          echo "---"
          echo
          echo "${CLAUDE_MSG}"
        } > "$COMMENT_FILE"
        FINAL_LABEL="claude:done"
      fi
    else
      {
        echo "🤖 Pushed ${COMMITS_AHEAD} commit(s) to **PR #${PR_NUM}** but **auto-merge failed**."
        echo
        echo "Likely cause: merge conflict, failing required check, or branch protection rule."
        echo
        echo "<details><summary>gh output</summary>"
        echo
        echo "\`\`\`"
        echo "${MERGE_OUT}" | tail -10
        echo "\`\`\`"
        echo
        echo "</details>"
        echo
        echo "Please review the PR and merge manually."
        echo
        echo "---"
        echo
        echo "${CLAUDE_MSG}"
      } > "$COMMENT_FILE"
      FINAL_LABEL="claude:conflict"
    fi
  fi
  fi

elif [ "$CLAUDE_EXIT" -eq 0 ]; then
  # Clean exit with no commits. Three sub-cases, checked in this order:
  #   (a) TRIAGE result: NOT a bug (feature exists / working as designed)
  #   (b) Already done on main (resolved in another PR or delegated)
  #   (c) Genuine needs-info — Claude has a question for the author
  if echo "$CLAUDE_MSG" | grep -qiE "$NOT_A_BUG_PATTERN"; then
    echo "no commits — triage says NOT A BUG, auto-closing"
    {
      echo "🤖 ${CLAUDE_MSG}"
      echo
      echo "---"
      echo "_Auto-closed by worker: triage determined this is not a bug (feature exists, working as designed, or user mistake). If you disagree, reopen and comment \`@claude\` with more context — e.g. screenshots, exact steps to reproduce, or the version you're testing._"
    } > "$COMMENT_FILE"
    FINAL_LABEL="claude:not-a-bug"
    AUTO_CLOSE=1
  elif echo "$CLAUDE_MSG" | grep -qiE "$RESOLVED_PATTERN"; then
    echo "no commits — worker confirms already resolved on main, auto-closing"
    {
      echo "🤖 ${CLAUDE_MSG}"
      echo
      echo "---"
      echo "_Auto-closed by worker: no code change was required (issue already resolved on \`main\` or fully delegated to follow-up issues). Reopen if this was a mistake._"
    } > "$COMMENT_FILE"
    FINAL_LABEL="claude:auto-resolved"
    AUTO_CLOSE=1
  else
    echo "no commits, clean exit — genuine needs-info"
    {
      echo "🤖 ${CLAUDE_MSG}"
      echo
      echo "---"
      echo "_Reply with \`@claude\` and any additional info to continue._"
    } > "$COMMENT_FILE"
    FINAL_LABEL="claude:needs-info"
  fi

else
  echo "all $MAX_ATTEMPTS attempts failed (last: $LAST_ERROR_KIND)"
  case "$LAST_ERROR_KIND" in
    max-turns)
      MSG="I tried ${MAX_ATTEMPTS} times but ran out of my turn budget on each attempt. The task is bigger than I can handle in one go."
      ;;
    wallclock-timeout)
      MSG="I tried ${MAX_ATTEMPTS} times but each run exceeded the time limit. The task may require investigation that's too broad."
      ;;
    *)
      MSG="I tried ${MAX_ATTEMPTS} times but failed each attempt (${LAST_ERROR_KIND}). This may be a transient issue with my tooling — try again later, or check the worker logs."
      ;;
  esac
  {
    echo "🤖 ${MSG}"
    echo
    echo "**To unblock me, please:**"
    echo "- Break this issue into smaller, focused sub-issues, OR"
    echo "- Point me to the specific files/components I should change, OR"
    echo "- Share what you have already tried or considered"
    echo
    echo "Then mention \`@claude\` again."
    echo
    echo "<sub>Worker job #${JOB_ID} on \`${BRANCH}\` — last error: \`${LAST_ERROR_KIND}\`</sub>"
  } > "$COMMENT_FILE"
  FINAL_LABEL="claude:failed"
fi

# --- 8. Post comment + set final label (+ auto-close if applicable) ---
post_comment "$COMMENT_FILE"
set_label "$FINAL_LABEL"

if [ "$AUTO_CLOSE" = "1" ]; then
  echo "auto-closing issue #${ISSUE_NUMBER}"
  gh issue close "$ISSUE_NUMBER" --repo "$REPO" --reason "completed" 2>&1 | tail -1
fi

# --- 9. Auto-tune on systemic failure ---
if [ "$FINAL_LABEL" = "claude:failed" ] && [ -n "$LAST_ERROR_KIND" ]; then
  echo "--- AUTO-TUNE check (kind=$LAST_ERROR_KIND) ---"
  node /home/claude-bot/worker/tune.mjs "$LAST_ERROR_KIND" 2>&1 | tail -5
fi

# --- 10. Extract follow-ups from Claude's output, create separate issues ---
echo "--- FOLLOW-UPS extraction ---"
FOLLOWUPS=$(echo "$CLAUDE_MSG" | node /home/claude-bot/worker/extract-followups.mjs 2>/dev/null || true)
if [ -n "$FOLLOWUPS" ]; then
  echo "found $(echo "$FOLLOWUPS" | wc -l) follow-up(s)"
  CREATED_LIST=""
  while IFS= read -r item; do
    [ -z "$item" ] && continue
    # Title: up to 80 chars, prefer up to first colon
    if [[ "$item" == *:* ]]; then
      TITLE="${item%%:*}"
    else
      TITLE="$item"
    fi
    TITLE="${TITLE:0:80}"
    BODY="Auto-discovered by Claude during work on issue #${ISSUE_NUMBER}.

> ${item}

---

Original issue: #${ISSUE_NUMBER}
Originating job: \`worker job #${JOB_ID}\` on branch \`${BRANCH}\`

This issue was opened automatically. Add \`@claude\` in a comment to attempt a fix, or close if it's a duplicate / not actionable."
    NEW_URL=$(gh issue create --repo "$REPO" --title "$TITLE" --body "$BODY" --label "auto-followup" 2>&1 | tail -1)
    if echo "$NEW_URL" | grep -qE "^https://github.com/.*/issues/[0-9]+$"; then
      NEW_NUM=$(basename "$NEW_URL")
      echo "  created #$NEW_NUM: $TITLE"
      CREATED_LIST="${CREATED_LIST}- #${NEW_NUM} — ${TITLE}\n"
    else
      echo "  FAILED to create issue for: $TITLE — output: $NEW_URL"
    fi
  done <<< "$FOLLOWUPS"

  # Comment on the original issue with the list of created follow-ups
  if [ -n "$CREATED_LIST" ]; then
    FOLLOWUP_COMMENT=$(mktemp)
    {
      echo "🤖 Opened follow-up issue(s) for out-of-scope findings discovered while working on this:"
      echo
      printf "%b" "$CREATED_LIST"
    } > "$FOLLOWUP_COMMENT"
    gh issue comment "$ISSUE_NUMBER" --repo "$REPO" --body-file "$FOLLOWUP_COMMENT" 2>&1 | tail -1
    rm -f "$FOLLOWUP_COMMENT"
  fi
else
  echo "no follow-ups detected"
fi

# --- 11. Cleanup ---
rm -f "$PROMPT_FILE" "$CLAUDE_OUT" "$COMMENT_FILE"
cleanup_worktree

echo "=== JOB $JOB_ID DONE label=$FINAL_LABEL exit=0 ==="
exit 0
