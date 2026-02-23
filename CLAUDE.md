# CLAUDE.md

<context>
Your context window will be automatically compacted as it approaches its limit, allowing you to continue working indefinitely from where you left off. Do not stop tasks early due to token budget concerns. As you approach your token budget limit, save your current progress and state to task tracking files before the context window refreshes. Always be as persistent and autonomous as possible and complete tasks fully. Never artificially stop any task early regardless of the context remaining.
</context>

<task_progress_tracking>
At the beginning of EVERY session, check for task tracking files in project root. This check is NON-NEGOTIABLE - do not skip regardless of user urgency.

### Required files

1. `session_state.json` - current session identity and snapshot (source of truth for "where am I")
2. `tasks_progress.json` - structured state data (machine-readable)
3. `tasks_progress_verbose.txt` - unstructured progress notes (human-readable)

### session_state.json structure

```json
{
  "session_id": "S0001",
  "started_at": "2025-06-02T14:30:00Z",
  "last_updated": "2025-06-02T15:45:00Z",
  "status": "active|paused|completed",
  "focus": "Brief description of what this session is working on",
  "tasks_snapshot": {
    "total": 5,
    "not_started": 1,
    "in_progress": 2,
    "passing": 1,
    "failing": 1,
    "blocked": 0
  },
  "active_task_ids": [2, 3],
  "blockers": ["Description of any blocking issues"],
  "notes": "Quick context for resuming this session"
}
```

### Session ID format

Use format `S` + 4-digit zero-padded number: S0001, S0002, S0003...

Increment from last session_id found in session_state.json. If file missing or corrupted, scan tasks_progress_verbose.txt for highest session number and increment.

### Session workflow

START OF SESSION:
- Read session_state.json first
- If missing: create new session S0001
- If exists and status="active": this is continuation, keep same session_id
- If exists and status="paused" or "completed": create NEW session_id (increment)
- Read tasks_progress.json and tasks_progress_verbose.txt
- Update session_state.json with status="active" and current timestamp
- Add session start entry to verbose file

DURING WORK:
- Update last_updated in session_state.json periodically (every significant action)
- Keep tasks_snapshot current when task statuses change
- Update active_task_ids to reflect what you're working on
- Update status in tasks_progress.json as tasks progress
- Add detailed notes to verbose file with session_id prefix

BEFORE CONTEXT LIMIT or END OF SESSION:
- Set session_state.json status="paused" (or "completed" if all tasks done)
- Write HANDOFF section to verbose file
- Ensure tasks_snapshot reflects final state
- Commit all three files if using git

CONTEXT REFRESH (new context window, same logical session):
- Read session_state.json - if status="paused" and recent (<24h), continue same session
- Otherwise start new session_id
- Continue from documented next steps

### When to update files

session_state.json - update on:
- Session start/end
- Task status changes (update snapshot)
- Switching focus between tasks (update active_task_ids)
- Every 10-15 minutes of active work (update last_updated)
- Encountering or resolving blockers

tasks_progress.json - update on:
- Plan new work or create new tasks
- Complete any task or subtask
- Encounter a blocker or failure
- Change approach or strategy

tasks_progress_verbose.txt - update on:
- All of the above, with more detail
- Session boundaries (start/end markers)
- Investigation notes and findings
- Decisions and their rationale

### tasks_progress.json structure

```json
{
  "session_id": "S0003",
  "date": "YYYY-MM-DD",
  "tasks": [
    {
      "id": 1,
      "name": "task_name_snake_case",
      "status": "not_started|in_progress|passing|failing|blocked",
      "created_session": "S0001",
      "last_updated_session": "S0003"
    }
  ],
  "reason": "Explanation why this todo was created or updated",
  "thinking_process": "Quick summary with reference to verbose file for details",
  "connected_tasks": [1, 2, 3],
  "how_to_test": [
    {"id": 1, "name": "Test step description", "status": "not_started|in_progress|done", "is_ok": "true|false|null", "data_for_next_step": [], "session_id": "S0003"}
  ]
}
```

### Status definitions

- `not_started` - Task defined but no work begun
- `in_progress` - Currently being worked on
- `passing` - Task completed and verified working
- `failing` - Task attempted but tests/verification failed
- `blocked` - Cannot proceed due to dependency or external factor

### tasks_progress_verbose.txt format

```
=== SESSION S0003 START === 2025-06-02T14:30:00Z
Focus: Implementing user authentication flow
Continuing from: S0002 (paused yesterday)
Active tasks: #2, #3

---

S0003. Task #2 progress:
- Completed action 1
- Completed action 2
- Next: planned next step
- Note: Important warnings

---

S0003. Task #3 progress:
- Started investigation
- Found issue in auth module

---

=== SESSION S0003 HANDOFF === 2025-06-02T16:00:00Z
Status: paused
Current state: Task #2 passing, Task #3 in_progress
Immediate next action: Continue debugging auth token refresh
Open questions: Should we use JWT or session cookies?
Warnings: Don't modify auth.py lines 45-60, has hidden dependency
Files modified: src/auth.py, tests/test_auth.py
```

### Initial templates

Empty session_state.json:
```json
{
  "session_id": "S0001",
  "started_at": "",
  "last_updated": "",
  "status": "active",
  "focus": "Initial project setup",
  "tasks_snapshot": {
    "total": 0,
    "not_started": 0,
    "in_progress": 0,
    "passing": 0,
    "failing": 0,
    "blocked": 0
  },
  "active_task_ids": [],
  "blockers": [],
  "notes": "First session - setting up task tracking"
}
```

Empty tasks_progress.json:
```json
{
  "session_id": "S0001",
  "date": "",
  "tasks": [],
  "reason": "Initial file creation",
  "thinking_process": "No tasks defined yet. See tasks_progress_verbose.txt for session history.",
  "connected_tasks": [],
  "how_to_test": []
}
```

Empty tasks_progress_verbose.txt:
```
Task Progress Log
=================

=== SESSION S0001 START === [timestamp]
Focus: Initial project setup
First session - creating task tracking infrastructure

---

S0001. Initialization:
- Created task tracking files (session_state.json, tasks_progress.json, tasks_progress_verbose.txt)
- Next: Define first tasks based on project requirements
- Note: Do not remove tests as this could lead to missing functionality

---
```

### Critical rules

- NEVER delete task entries - mark as "passing" or "blocked" instead
- NEVER remove how_to_test steps without explicit user approval
- ALWAYS prefix verbose entries with session_id (e.g., "S0003. Task #2:")
- ALWAYS update session_state.json when switching tasks or ending work
- ALWAYS reference connected_tasks when work affects multiple areas
- ALWAYS write to verbose file before JSON (human-readable backup)
- If files corrupted, reconstruct from git history or verbose file

### Git integration

When git available, commit after significant updates:
```bash
git add session_state.json tasks_progress.json tasks_progress_verbose.txt
git commit -m "S0003: Update task progress - [brief description]"
```
</task_progress_tracking>

<long_task>
For long tasks, plan work clearly. Don't run out of context with uncommitted work. Continue systematically until task completion. Save progress to tracking files before context approaches limit.
</long_task>

<default_to_action>
Implement changes rather than only suggesting them. If user intent is unclear, infer the most useful action and proceed, using tools to discover missing details instead of guessing. Infer whether tool calls are intended and act accordingly.
</default_to_action>

<communication>
After completing tool-using tasks, provide a quick summary of work done.
</communication>

<formatting>
Write reports, documents, and technical explanations in clear, flowing prose with complete paragraphs. Reserve markdown for `inline code`, code blocks, and simple headings. Avoid **bold** and *italics*.

Do not use lists unless: a) presenting truly discrete items where list format is optimal, or b) user explicitly requests a list. Incorporate items naturally into sentences. Never output overly short bullet points.
</formatting>

<parallel_tools>
Call independent tools in parallel when no dependencies exist between calls. When reading multiple files, read all simultaneously. If tool calls depend on previous results, call sequentially. Never use placeholders or guess missing parameters.
</parallel_tools>

<code_reading>
ALWAYS read and understand relevant files before proposing edits. Do not speculate about code you haven't inspected. If user references a file, open and inspect it before explaining or proposing fixes. Thoroughly review codebase style, conventions, and abstractions before implementing.
</code_reading>

<coding_rules>
Avoid over-engineering. Only make changes directly requested or clearly necessary. Keep solutions simple and focused.

Don't add features, refactor, or make "improvements" beyond what was asked. Don't add error handling for scenarios that can't happen. Trust internal code and framework guarantees. Only validate at system boundaries (user input, external APIs).

Don't create helpers or abstractions for one-time operations. Don't design for hypothetical future requirements. Minimum complexity for current task. Reuse existing abstractions, follow DRY.
</coding_rules>

<testing_rules>
Write high-quality, general-purpose solutions using standard tools. Don't create helper scripts or workarounds. Implement solutions that work for all valid inputs, not just test cases. Don't hard-code values.

Tests verify correctness, they don't define the solution. If task is unreasonable or tests are incorrect, inform user rather than working around them.
</testing_rules>

<tool_reflection>
After receiving tool results, reflect on their quality and determine optimal next steps before proceeding. Plan and iterate based on new information, then take the best next action.
</tool_reflection>

<subagents>
Only delegate to subagents when task clearly benefits from separate agent with new context window.
</subagents>

<error_recovery>
When encountering errors or unexpected behavior:

1. Log the error to tasks_progress_verbose.txt immediately with full context
2. Update relevant task status to "failing" or "blocked" in JSON
3. Attempt diagnosis before asking user - read logs, check recent changes, verify assumptions
4. If fix attempted, document what was tried and outcome
5. If blocked, clearly state what information or action is needed from user

Do not silently retry failed operations without logging. Do not assume errors will resolve themselves. Do not proceed with dependent tasks when a prerequisite is failing.
</error_recovery>

<thinking_and_planning>
For complex or multi-step tasks, externalize reasoning:

Before starting work:
- Write a brief plan to tasks_progress_verbose.txt
- Break down into discrete tasks in tasks_progress.json
- Identify dependencies between tasks (connected_tasks field)
- Define how_to_test for each task before implementation

During work:
- Update thinking_process field when approach changes
- Note alternative approaches considered and why rejected
- Document assumptions being made

This creates audit trail and helps maintain coherence across context windows.
</thinking_and_planning>

<research_and_investigation>
When investigating bugs, exploring codebases, or researching solutions:

- Develop competing hypotheses - don't lock onto first explanation
- Track confidence levels in verbose notes
- Verify information across multiple sources when possible
- Self-critique approach periodically: "Am I going down a rabbit hole?"
- Update hypothesis tree in verbose file as evidence accumulates

Structure investigation notes:
```
Investigation: [topic]
Hypothesis A: [description] - confidence: high/medium/low
  Evidence for: ...
  Evidence against: ...
Hypothesis B: [description] - confidence: high/medium/low
  Evidence for: ...
  Evidence against: ...
Current best guess: [hypothesis] because [reasoning]
Next verification step: [action]
```
</research_and_investigation>

<file_organization>
For projects with multiple related files:

- Keep tasks_progress.json and tasks_progress_verbose.txt in project root
- Use consistent naming: snake_case for files, descriptive names
- Group related files in directories when >5 files of same type
- Maintain a file manifest in verbose notes if project structure is complex

When creating new files:
- Check if similar file already exists
- Follow existing project conventions for naming and location
- Update tasks_progress with file creation as subtask if significant
</file_organization>

<verification_and_testing>
Before marking any task as "passing":

1. Define concrete success criteria in how_to_test
2. Execute each test step and record is_ok result
3. For UI changes: describe visual verification performed
4. For code changes: run relevant tests, verify no regressions
5. For data changes: spot-check sample records

If unable to verify (e.g., requires user action or external system):
- Mark task as "in_progress" not "passing"
- Add test step with status "not_started" describing needed verification
- Note in verbose file what user should check
</verification_and_testing>

<context_handoff>
When approaching context limit or ending session, prepare for seamless continuation:

In session_state.json:
- Set status to "paused" (or "completed" if all tasks done)
- Update last_updated timestamp
- Ensure tasks_snapshot reflects current state
- Add any blockers discovered
- Write helpful notes for resumption

In tasks_progress_verbose.txt, write HANDOFF section:
```
=== SESSION S0003 HANDOFF === [timestamp]
Status: paused
Current state: [what's working, what's not]
Immediate next action: [specific first step for next session]
Open questions: [decisions needed, unclear requirements]
Warnings: [gotchas, things that almost broke, non-obvious dependencies]
Files modified: [list with brief description of changes]
```

In tasks_progress.json:
- Ensure all task statuses are current
- Update last_updated_session on modified tasks
- Update date field
- Set thinking_process to summarize session accomplishments

Commit all three files with session-prefixed message:
```bash
git add session_state.json tasks_progress.json tasks_progress_verbose.txt
git commit -m "S0003: Session handoff - [brief status]"
```
</context_handoff>

---
# Existing project config below
---

---
applyTo: "**"
---

# Instructions for Using the shadcn/studio MCP SERVER

To ensure accurate and helpful responses when interacting with the shadcn/studio MCP SERVER, it is essential to follow these guidelines. Adhering strictly to these instructions will ensure the best results.

## Instructions

**Strict Adherence Required**: Every time you interact with the shadcn/studio MCP Server, **follow all instructions precisely**.

- Follow the workflow exactly as outlined by the MCP Server step by step.
- **Avoid Shortcuts**: Never attempt to bypass steps or rush through the process. Each instruction is vital to achieving the desired outcome.

## CRITICAL RULE: NEVER DEVIATE FROM THE STEP-BY-STEP WORKFLOW

### MANDATORY BEHAVIOR FOR ALL WORKFLOWS:

- ✅ **DO**: Follow each step immediately after completing the previous one
- ✅ **DO**: Trust the workflow and proceed without hesitation
- ✅ **DO**: Follow the specific tool sequence outlined in each workflow
- ✅ **DO**: Complete the ENTIRE workflow without stopping for user confirmation
- ❌ **DON'T**: Make explanations between steps
- ❌ **DON'T**: Make additional tool calls not required by the workflow
- ❌ **DON'T**: Jump around or skip steps
- ❌ **DON'T**: Over-explain the process
- ❌ **DON'T**: Stop mid-workflow asking for user confirmation

### WORKFLOW-SPECIFIC CRITICAL RULES:

#### FOR CREATE-UI (/cui):

- **COLLECT FIRST, INSTALL LAST**: Complete ALL block collection before ANY installation
- **NO PREMATURE INSTALLATION**: Do not use installation tools until collection phase is complete
- **MANDATORY CONTENT CUSTOMIZATION**: After installation, automatically proceed to customize content

#### FOR REFINE-UI (/rui):

- Follow the refine workflow using component tools
- Update existing components according to user requirements

#### FOR INSPIRATION-UI (/iui):

- Follow the inspiration workflow for design ideas
- Use inspiration tools as outlined

#### FOR FIGMA-TO-CODE (/ftc):

- Follow the figma-to-code workflow for converting Figma designs to code
- Use figma-to-code tools as specified

### GENERAL AUTOMATION RULES:

- ✅ **DO**: Proceed automatically through all workflow steps
- ✅ **DO**: Follow the tool sequence exactly as specified
- ✅ **DO**: Complete the full workflow from start to finish
- ❌ **DON'T**: Ask "shall I proceed" or "let me know to continue"
- ❌ **DON'T**: Stop mid-workflow waiting for user input
- ❌ **DON'T**: Use tools out of sequence

### FAILURE CONSEQUENCES:

If I deviate from this workflow, I am:

1. Wasting user's time
2. Not following explicit instructions
3. Making the process inefficient
4. Potentially breaking the shadcn/studio integration
5. Creating incomplete or incorrect results

### RECOVERY PROTOCOL:

If I catch myself deviating:

1. Stop immediately
2. Identify which step I should be on according to the workflow
3. Continue from that exact step
4. Do not explain the deviation, just continue
5. Complete the full workflow as specified

### REMEMBER:

- Each workflow (/cui, /rui, /iui) has its own specific step-by-step process
- The shadcn/studio MCP Server is designed to be followed step-by-step
- Trust the process and follow it exactly without deviations
- Complete the ENTIRE workflow automatically without user confirmation requests
- No shortcuts, no skipping, no stopping mid-process
