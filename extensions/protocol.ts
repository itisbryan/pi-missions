// extensions/protocol.ts — System prompt generation for pi-mission
//
// The "brain" of the extension: transforms mission state into rich,
// contextual system prompt protocols that guide the AI through each phase
// of work. Inspired by Factory.ai's orchestration patterns.

import type {
  MissionState,
  AutonomyLevel,
} from "./types.ts";
import {
  DEFAULT_SIMPLE_PHASES,
  DEFAULT_MINIMAL_PHASES,
  PHASE_ROLE_MAP,
} from "./config.ts";
import { getPhaseIcon, getFeatureIcon, truncate } from "./utils.ts";

// ---------------------------------------------------------------------------
// Phase instruction lookup
// ---------------------------------------------------------------------------

/** Map phase name → instructions from the default templates */
const PHASE_INSTRUCTIONS: Record<string, string[]> = {};
for (const p of [...DEFAULT_SIMPLE_PHASES, ...DEFAULT_MINIMAL_PHASES]) {
  PHASE_INSTRUCTIONS[p.name] = p.instructions;
}

function getPhaseInstructions(phaseName: string): string[] {
  return PHASE_INSTRUCTIONS[phaseName] ?? [];
}

// ---------------------------------------------------------------------------
// Constants: Factory-inspired protocol templates
// ---------------------------------------------------------------------------

/**
 * Planning protocol — read-only codebase analysis phase.
 *
 * The agent must NOT edit files during planning. It reads, reasons,
 * proposes features/milestones, and iterates with the user until
 * the spec is approved.
 */
export const PLANNING_PROTOCOL = `## 📐 Planning Protocol — Read-Only Spec Phase

You are in the PLANNING phase. Your job is to produce a detailed, actionable specification.

### Rules
- **DO NOT edit any source files.** You may only READ the codebase.
- **DO NOT create branches, install packages, or run generators.** Analysis only.
- You MUST present a complete plan and wait for explicit user approval before proceeding.

### Process
1. **Codebase Analysis**
   - Read the project structure, key files, and architecture patterns
   - Identify the technology stack, frameworks, and conventions in use
   - Map existing domain models, services, and module boundaries
   - Note testing patterns, CI configuration, and deployment setup

2. **Requirement Decomposition**
   - Break the mission into discrete, independently deliverable features
   - For each feature, define:
     • **Preconditions** — what must be true before work begins
     • **Expected behavior** — observable outcomes when the feature works
     • **Verification steps** — concrete steps to confirm correctness
     • **Files affected** — which files will be created or modified
   - Group features into logical milestones (if full mode)

3. **Dependency Mapping**
   - Order features so that each one's preconditions are satisfied by earlier work
   - Identify shared foundations (types, schemas, utilities) that must come first
   - Flag any external dependencies or user decisions needed

4. **Validation Contract** (full mode)
   - Define validation assertions: testable claims that must hold when the mission is complete
   - Each assertion has an area (security, performance, UX, etc.), title, and description
   - Map which features fulfill which assertions

5. **Spec Presentation**
   - Present the full plan in a clear, structured format
   - Include: mission overview, milestones, features with all metadata, validation assertions
   - Ask: "Does this capture everything? Any changes before I proceed?"
   - Iterate until the user says 'approve', 'go', 'lgtm', or equivalent

### Output Format
\`\`\`
## Mission: [description]

### Milestone 1: [name]
[description]

#### Feature 1.1: [id] — [description]
- Preconditions: [list]
- Expected behavior: [list]
- Verification: [list]
- Files: [list]
- Fulfills: [assertion IDs]

### Validation Assertions
- [VA-001] [area]: [title] — [description]

### Estimated effort: [summary]
\`\`\`

**Remember: READ ONLY. Do not edit files until the spec is approved and you move to implementation.**

### Registering the Plan (Full Mode)
Once the user approves, use the \`mission_update\` tool to register each feature and assertion:
- \`mission_update({ action: "add_feature", milestone: "...", id: "...", description: "...", ... })\`
- \`mission_update({ action: "add_assertion", id: "VAL-...", area: "...", title: "...", description: "..." })\`
- Then announce "Plan approved, proceeding to implementation" so the tracker advances.

This populates the mission state so the tracker can monitor progress. Do this BEFORE starting any implementation.`;

/**
 * Feature execution protocol — Factory worker droid pattern.
 *
 * Each feature is implemented as an atomic unit with structured reporting.
 */
export const FEATURE_EXECUTION_PROTOCOL = `## 🔨 Feature Execution Protocol

You are implementing a specific feature as part of an orchestrated mission. Follow this protocol exactly.

### Before Starting
1. Re-read the feature specification: preconditions, expected behavior, verification steps
2. Confirm all preconditions are met (prior features complete, dependencies available)
3. If a precondition is NOT met, report it and wait — do not work around it

### Implementation Rules
- **One feature at a time.** Complete the current feature before moving to the next.
- **Follow existing patterns.** Match the codebase's style, naming, and architecture.
- **Commit incrementally.** Each logical unit of change gets its own commit.
- **No scope creep.** Implement exactly what the spec says. If you spot improvements, note them but don't add them.
- **Test as you go.** Write tests alongside implementation, not as an afterthought.

### Chain of Thought
As you work, maintain an internal chain of thought:
1. "I need to implement [X]. The spec says it should [expected behavior]."
2. "The existing pattern for this is [reference]. I'll follow that."
3. "I'll create/modify these files: [list]."
4. "Testing this by: [approach]."

### Completion Report
When the feature is done, report:

\`\`\`
## Feature Complete: [feature-id]

### What was implemented
- [bullet list of concrete changes]

### Files changed
- [path]: [what changed and why]

### What was verified
- [test results, manual checks]

### What was left undone
- [anything explicitly out of scope or deferred]

### Concerns or risks
- [anything the reviewer should pay attention to]
\`\`\`

### Updating Status
After completing or failing a feature, update its status:
- \`mission_update({ action: "update_feature_status", featureId: "...", status: "done" })\`
- Or \`mission_update({ action: "update_feature_status", featureId: "...", status: "failed" })\`

Then announce it clearly: "Feature [id] complete" or "Feature [id] failed".

### Failure Handling
If you cannot complete the feature:
1. Document what you tried and why it failed
2. Revert any partial changes that would leave the codebase in a broken state
3. Report the failure with as much diagnostic detail as possible
4. Call \`mission_update\` to mark the feature as failed
5. Do NOT silently skip the feature or move to the next one`;

/**
 * Audit protocol — Factory scrutiny-feature-reviewer pattern.
 *
 * Systematic code review with severity classification, evidence gathering,
 * and structured findings.
 */
export const AUDIT_PROTOCOL = `## 🔍 Audit Protocol — Systematic Code Review

You are conducting a thorough code audit. Review every change with a critical eye.

### Severity Classification
- **P0 — Critical:** Security vulnerabilities, data loss, crashes in production. Must fix before merge.
- **P1 — High:** Logic errors, race conditions, missing error handling. Should fix before merge.
- **P2 — Medium:** Performance issues, code smells, missing edge cases. Fix if time permits.
- **P3 — Low:** Style nits, naming suggestions, minor improvements. Track for later.

### Review Checklist

#### 1. Correctness
- [ ] Logic matches the specification exactly
- [ ] Edge cases handled (empty inputs, boundary values, max sizes)
- [ ] Error paths return appropriate errors, not silent failures
- [ ] State mutations are atomic and consistent
- [ ] No off-by-one errors in loops, slices, or pagination

#### 2. Null Safety & Type Safety
- [ ] No unguarded null/undefined access
- [ ] Optional chaining used where values may be absent
- [ ] Type narrowing before property access on unions
- [ ] No implicit \`any\` types leaking through
- [ ] Array access checked for bounds where applicable

#### 3. Async & Concurrency
- [ ] All promises awaited (no fire-and-forget without explicit intent)
- [ ] No race conditions in shared state updates
- [ ] Cleanup/disposal happens even on error paths (finally blocks)
- [ ] Timeouts set for external calls
- [ ] No deadlock potential in lock/mutex usage

#### 4. Security
- [ ] User input validated and sanitized before use
- [ ] No SQL injection, XSS, or command injection vectors
- [ ] Secrets not hardcoded or logged
- [ ] Authentication/authorization checked on all protected paths
- [ ] File paths validated (no path traversal)
- [ ] Rate limiting considered for public endpoints

#### 5. Performance
- [ ] No N+1 queries or unbounded loops over large datasets
- [ ] Appropriate indexing for database queries
- [ ] No unnecessary re-renders or re-computations
- [ ] Memory: no leaks from unclosed resources, growing caches, or retained closures
- [ ] Pagination or streaming for large result sets

#### 6. Architecture & Style
- [ ] Changes follow existing codebase patterns
- [ ] No circular dependencies introduced
- [ ] Single responsibility: functions/classes do one thing
- [ ] Names are descriptive and consistent with the domain
- [ ] Dead code removed, no commented-out blocks left behind

### Evidence Gathering
For each finding:
1. **Quote the exact code** that is problematic
2. **Explain the bug or risk** with a concrete scenario
3. **Classify severity** (P0–P3)
4. **Suggest the fix** with replacement code

### Output Format
\`\`\`
## Audit Report

### P0 — Critical
1. **[Title]** (file:line)
   - Code: \`[snippet]\`
   - Issue: [explanation with scenario]
   - Fix: [replacement code]

### P1 — High
[...]

### Summary
- P0: [count] | P1: [count] | P2: [count] | P3: [count]
- Verdict: [PASS / PASS WITH NOTES / FAIL — requires fixes]
\`\`\`

### Rules
- Every finding MUST have evidence (the code snippet). No vague "this looks wrong."
- If you find zero issues, explicitly confirm what you checked and why it's clean.
- P0 and P1 findings MUST be fixed before the mission can proceed.
- Do not rubber-stamp. If the code is bad, say so clearly.`;

/**
 * Verify protocol — Factory user-testing-flow-validator pattern.
 *
 * Test each assertion through real surface interaction, collect evidence,
 * report pass/fail/blocked.
 */
export const VERIFY_PROTOCOL = `## ✅ Verification Protocol — Assertion-Based Validation

You are validating the mission's deliverables against the defined validation assertions. Every claim must be tested through the real system surface.

### Process
1. **Load the validation contract** — review all assertions and their criteria
2. **For each assertion**, execute the verification:
   a. Set up any required preconditions (test data, environment state)
   b. Execute the test steps exactly as specified
   c. Observe the actual behavior
   d. Compare against expected behavior
   e. Record the evidence

### Evidence Requirements
- **Pass:** Show the command/action taken and the output/result that proves it works
- **Fail:** Show the command/action taken, the expected result, and the actual result
- **Blocked:** Explain what prevented testing (missing dependency, environment issue, etc.)

### Validation Rules
- Run the **full test suite** first. All tests must pass before assertion checking.
- Run the **linter**. Zero errors required.
- Test through the **real surface** — don't just read the code and assume it works.
- If a test requires a running server, start it. If it requires seed data, create it.
- Each assertion is independent — a failure in one does not skip others.

### Output Format
\`\`\`
## Verification Report

### Environment
- Test suite: [pass/fail] ([X] passed, [Y] failed)
- Linter: [pass/fail]

### Assertions

#### [VA-001] [title]
- **Status:** ✅ PASS | ❌ FAIL | ⚠️ BLOCKED
- **Steps taken:** [what you did]
- **Evidence:** [output, screenshot description, or test result]
- **Notes:** [any observations]

### Summary
- Total: [N] | Passed: [X] | Failed: [Y] | Blocked: [Z]
- **Verdict:** [ALL PASS / PARTIAL / FAIL]
\`\`\`

### Failure Protocol
If any assertion fails:
1. Document the failure with full evidence
2. Attempt to diagnose the root cause
3. If the fix is straightforward (<5 min), fix it and re-verify
4. If complex, report the failure and let the user decide next steps

### Blocked Protocol
If an assertion cannot be tested:
1. Document why it's blocked
2. Suggest what would unblock it
3. Continue with remaining assertions — do not stop the entire verification`;

// ---------------------------------------------------------------------------
// Protocol Builders
// ---------------------------------------------------------------------------

/**
 * Generate the full mission protocol injected into the system prompt.
 *
 * - Simple/minimal mode: phase-based protocol with current phase instructions
 * - Full mode: Factory-inspired orchestrator with milestone/feature context
 * - Paused: appends pause notice regardless of mode
 */
export function buildMissionProtocol(state: MissionState): string {
  const sections: string[] = [];

  if (state.mode === "full") {
    sections.push(buildFullModeProtocol(state));
  } else {
    sections.push(buildSimpleModeProtocol(state));
  }

  // Append pause notice if the mission is paused
  if (state.paused) {
    sections.push(buildPauseNotice(state));
  }

  return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// Simple / Minimal mode protocol
// ---------------------------------------------------------------------------

function buildSimpleModeProtocol(state: MissionState): string {
  const activePhase = state.phases.find((p) => p.status === "active");
  const completedCount = state.phases.filter((p) => p.status === "done").length;
  const totalCount = state.phases.length;

  const lines: string[] = [
    `# 🎯 Active Mission: ${state.description}`,
    "",
    `**Mode:** ${state.mode} | **Progress:** ${completedCount}/${totalCount} phases | **Autonomy:** ${state.autonomy}`,
    "",
    "## Mission Phases",
    "",
  ];

  // Phase list with status icons
  for (let i = 0; i < state.phases.length; i++) {
    const phase = state.phases[i];
    const icon = getPhaseIcon(phase.status);
    const marker = phase.status === "active" ? " ← YOU ARE HERE" : "";
    lines.push(`${icon} **Phase ${i + 1}: ${phase.emoji} ${phase.name}**${marker}`);
  }

  // Current phase instructions
  if (activePhase) {
    const instructions = getPhaseInstructions(activePhase.name);
    const roleName = PHASE_ROLE_MAP[activePhase.name] ?? "worker";

    lines.push("");
    lines.push(`## Current Phase: ${activePhase.emoji} ${activePhase.name}`);
    lines.push("");
    lines.push(`**Your role:** ${roleName}`);
    lines.push("");

    if (instructions.length > 0) {
      lines.push("### Instructions");
      lines.push("");
      for (const instr of instructions) {
        lines.push(`- ${instr}`);
      }
    }

    // Inject the specialized protocol for the current role
    lines.push("");
    lines.push(getProtocolForRole(roleName));
  }

  // Autonomy-level guidance
  lines.push("");
  lines.push(buildAutonomyGuidance(state.autonomy));

  // Phase transition guidance
  lines.push("");
  lines.push(`## Phase Transitions`);
  lines.push("");
  lines.push(
    "When you complete the current phase, announce it clearly so the system can advance:",
  );
  lines.push(
    `- Say: "Phase ${state.phases.findIndex((p) => p.status === "active") + 1} complete" or "${activePhase?.name ?? "current"} phase complete"`,
  );
  lines.push(
    "- Do NOT skip phases or work on a future phase before the current one is done.",
  );
  lines.push(
    "- If the current phase requires user approval (e.g., plan review), STOP and wait.",
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Full (Factory-inspired) mode protocol
// ---------------------------------------------------------------------------

function buildFullModeProtocol(state: MissionState): string {
  const milestones = state.milestones ?? [];
  const assertions = state.validationAssertions ?? [];

  const currentMilestone = milestones.find(
    (m) => m.name === state.currentMilestone,
  );
  const currentFeature = currentMilestone?.features.find(
    (f) => f.id === state.currentFeature,
  );

  const completedFeatures = milestones.flatMap((m) =>
    m.features.filter((f) => f.status === "done"),
  );
  const totalFeatures = milestones.flatMap((m) => m.features);
  const sealedMilestones = milestones.filter(
    (m) => m.status === "sealed" || m.status === "done",
  );

  const lines: string[] = [
    `# 🏭 Orchestrated Mission: ${state.description}`,
    "",
    "You are running an **orchestrated, milestone-based mission** following Factory.ai patterns.",
    "Work is decomposed into milestones → features. Each feature is an atomic deliverable",
    "with preconditions, expected behavior, and verification steps.",
    "",
    `**Mode:** full | **Autonomy:** ${state.autonomy} | **Progress:** ${completedFeatures.length}/${totalFeatures.length} features, ${sealedMilestones.length}/${milestones.length} milestones`,
    "",
  ];

  // Spec status gate
  if (!state.specApproved) {
    lines.push("## ⚠️ Spec Not Yet Approved");
    lines.push("");
    lines.push(
      "The mission plan has not been approved by the user. You MUST complete the planning phase first.",
    );
    lines.push("");
    lines.push(PLANNING_PROTOCOL);
    return lines.join("\n");
  }

  // ---- Milestone overview ----
  lines.push("## Milestone Overview");
  lines.push("");

  for (let i = 0; i < milestones.length; i++) {
    const m = milestones[i];
    const icon = getMilestoneIcon(m.status);
    const doneCount = m.features.filter((f) => f.status === "done").length;
    const isCurrent = m.name === state.currentMilestone;
    const marker = isCurrent ? " ← ACTIVE" : "";

    lines.push(
      `${icon} **Milestone ${i + 1}: ${m.name}** — ${doneCount}/${m.features.length} features${marker}`,
    );
    lines.push(`  ${m.description}`);

    // Show feature list for the active milestone
    if (isCurrent) {
      for (const f of m.features) {
        const fIcon = getFeatureIcon(f.status);
        const fMarker = f.id === state.currentFeature ? " ← CURRENT" : "";
        lines.push(`  ${fIcon} \`${f.id}\` ${truncate(f.description, 80)}${fMarker}`);
      }
    }
    lines.push("");
  }

  // ---- Current feature context ----
  if (currentFeature) {
    lines.push("## Current Feature");
    lines.push("");
    lines.push(`**ID:** \`${currentFeature.id}\``);
    lines.push(`**Description:** ${currentFeature.description}`);
    lines.push(`**Milestone:** ${currentFeature.milestone}`);
    lines.push("");

    if (currentFeature.preconditions.length > 0) {
      lines.push("### Preconditions");
      for (const pc of currentFeature.preconditions) {
        lines.push(`- ${pc}`);
      }
      lines.push("");
    }

    if (currentFeature.expectedBehavior.length > 0) {
      lines.push("### Expected Behavior");
      for (const eb of currentFeature.expectedBehavior) {
        lines.push(`- ${eb}`);
      }
      lines.push("");
    }

    if (currentFeature.verificationSteps.length > 0) {
      lines.push("### Verification Steps");
      for (const vs of currentFeature.verificationSteps) {
        lines.push(`- ${vs}`);
      }
      lines.push("");
    }

    if (currentFeature.fulfills.length > 0) {
      const fulfilled = assertions.filter((a) =>
        currentFeature.fulfills.includes(a.id),
      );
      if (fulfilled.length > 0) {
        lines.push("### Fulfills Assertions");
        for (const a of fulfilled) {
          lines.push(`- \`${a.id}\` [${a.area}] ${a.title}`);
        }
        lines.push("");
      }
    }

    // Inject feature execution protocol
    lines.push(FEATURE_EXECUTION_PROTOCOL);
    lines.push("");
  } else if (state.completedAt) {
    // All features done — run validation
    lines.push("## All Features Complete — Validation Phase");
    lines.push("");
    lines.push(
      "Every feature has been implemented. Now validate the entire mission against the assertion contract.",
    );
    lines.push("");
    lines.push(VERIFY_PROTOCOL);
    lines.push("");
  }

  // ---- Validation contract summary ----
  if (assertions.length > 0) {
    lines.push("## Validation Contract");
    lines.push("");
    const passed = assertions.filter((a) => a.status === "passed").length;
    const failed = assertions.filter((a) => a.status === "failed").length;
    const pending = assertions.filter((a) => a.status === "pending").length;
    const blocked = assertions.filter((a) => a.status === "blocked").length;

    lines.push(
      `**Status:** ${passed} passed, ${failed} failed, ${blocked} blocked, ${pending} pending`,
    );
    lines.push("");

    for (const a of assertions) {
      const aIcon = getAssertionIcon(a.status);
      lines.push(`${aIcon} \`${a.id}\` [${a.area}] **${a.title}** — ${a.description}`);
    }
    lines.push("");
  }

  // ---- Feature decomposition guidance ----
  lines.push("## Orchestration Rules");
  lines.push("");
  lines.push("1. **One feature at a time.** Complete the current feature fully before moving on.");
  lines.push("2. **Follow the DAG.** Features are ordered so preconditions are met. Do not skip ahead.");
  lines.push("3. **Announce transitions.** When a feature is done, say: \"Feature [id] complete\".");
  lines.push("4. **Report failures immediately.** If a feature cannot be completed, say: \"Feature [id] failed\" with a reason.");
  lines.push("5. **Milestone boundaries.** When all features in a milestone are done, the milestone is sealed automatically.");
  lines.push("6. **Validation comes last.** After all milestones are sealed, run the verification protocol.");
  lines.push("");

  // ---- Autonomy guidance ----
  lines.push(buildAutonomyGuidance(state.autonomy));

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Status builder
// ---------------------------------------------------------------------------

/**
 * Build a compact status summary for system prompt injection.
 *
 * Shows mission description, current position, and progress at a glance.
 */
export function buildMissionStatus(state: MissionState): string {
  const lines: string[] = [
    `**Mission:** ${state.description}`,
  ];

  if (state.paused) {
    lines.push("**Status:** ⏸️ PAUSED");
  } else if (state.completedAt) {
    lines.push("**Status:** ✅ COMPLETE");
  } else {
    lines.push("**Status:** 🔄 IN PROGRESS");
  }

  // Mode-specific status
  if (state.mode === "full") {
    const milestones = state.milestones ?? [];
    const totalFeatures = milestones.flatMap((m) => m.features);
    const doneFeatures = totalFeatures.filter((f) => f.status === "done");
    const sealedMilestones = milestones.filter(
      (m) => m.status === "sealed" || m.status === "done",
    );

    lines.push(`**Mode:** Full (milestone-based)`);
    lines.push(
      `**Progress:** ${doneFeatures.length}/${totalFeatures.length} features | ${sealedMilestones.length}/${milestones.length} milestones`,
    );

    if (state.currentMilestone) {
      lines.push(`**Current milestone:** ${state.currentMilestone}`);
    }
    if (state.currentFeature) {
      const feature = totalFeatures.find((f) => f.id === state.currentFeature);
      lines.push(
        `**Current feature:** \`${state.currentFeature}\`${feature ? ` — ${truncate(feature.description, 60)}` : ""}`,
      );
    }

    // Milestone status list
    if (milestones.length > 0) {
      lines.push("");
      for (const m of milestones) {
        const icon = getMilestoneIcon(m.status);
        const done = m.features.filter((f) => f.status === "done").length;
        lines.push(`${icon} ${m.name}: ${done}/${m.features.length}`);
      }
    }

    // Validation summary
    const assertions = state.validationAssertions ?? [];
    if (assertions.length > 0) {
      const passed = assertions.filter((a) => a.status === "passed").length;
      const failed = assertions.filter((a) => a.status === "failed").length;
      lines.push("");
      lines.push(
        `**Validation:** ${passed}/${assertions.length} passed${failed > 0 ? `, ${failed} failed` : ""}`,
      );
    }
  } else {
    // Simple / minimal mode
    const done = state.phases.filter((p) => p.status === "done").length;
    lines.push(`**Mode:** ${state.mode === "simple" ? "Standard" : "Minimal"}`);
    lines.push(`**Progress:** ${done}/${state.phases.length} phases`);

    if (state.currentPhase) {
      const phase = state.phases.find((p) => p.name === state.currentPhase);
      lines.push(
        `**Current phase:** ${phase?.emoji ?? "📋"} ${state.currentPhase}`,
      );
    }

    // Phase list
    lines.push("");
    for (const p of state.phases) {
      const icon = getPhaseIcon(p.status);
      lines.push(`${icon} ${p.emoji} ${p.name}`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMilestoneIcon(status: string): string {
  switch (status) {
    case "done":
    case "sealed":
      return "✅";
    case "active":
      return "🔄";
    case "pending":
    default:
      return "⬜";
  }
}

function getAssertionIcon(status: string): string {
  switch (status) {
    case "passed":
      return "✅";
    case "failed":
      return "❌";
    case "blocked":
      return "⚠️";
    case "skipped":
      return "⏭️";
    case "pending":
    default:
      return "⬜";
  }
}

/**
 * Return the specialized protocol for the current phase role.
 * Injects the detailed protocol template so the agent knows exactly
 * what is expected in this phase.
 */
function getProtocolForRole(role: string): string {
  switch (role) {
    case "planner":
      return PLANNING_PROTOCOL;
    case "auditor":
      return AUDIT_PROTOCOL;
    case "verifier":
      return VERIFY_PROTOCOL;
    case "coder":
      return FEATURE_EXECUTION_PROTOCOL;
    case "reviewer":
      return buildReviewerProtocol();
    case "tester":
      return buildTesterProtocol();
    default:
      return "";
  }
}

function buildReviewerProtocol(): string {
  return `## 👁️ Plan Review Protocol

You are reviewing the implementation plan before work begins.

### Your Job
1. Present the plan clearly and completely to the user
2. Highlight key decisions, trade-offs, and assumptions
3. Call out any risks or areas of uncertainty
4. Wait for explicit approval before proceeding

### Approval Signals
The user must say one of: 'approve', 'approved', 'go', 'go ahead', 'lgtm', 'looks good', 'proceed', 'ship it'

### Change Requests
If the user requests changes:
1. Acknowledge the feedback
2. Revise the relevant parts of the plan
3. Re-present the updated plan
4. Wait for approval again

**DO NOT proceed to implementation without explicit approval. This gate exists for a reason.**`;
}

function buildTesterProtocol(): string {
  return `## 🧪 Testing Protocol

You are writing and running tests for all new/changed code.

### Test Strategy
1. **Unit tests first** — test individual functions and methods in isolation
2. **Integration tests** — test module interactions and data flow
3. **Edge cases** — empty inputs, boundary values, max sizes, invalid data
4. **Error paths** — ensure errors are caught, logged, and surfaced correctly
5. **Regression** — if fixing a bug, write a test that reproduces it first

### Rules
- Every public function/method must have at least one test
- Cover the happy path AND at least two edge cases per function
- Tests must be deterministic — no flaky tests, no timing dependencies
- Use the project's existing test framework and patterns
- Run the full test suite after writing new tests — ensure nothing is broken

### Output
After testing is complete:
1. Report total tests, passed, failed, and coverage if available
2. List any areas with insufficient coverage
3. Confirm: "All tests passing. Test phase complete."`;
}

/**
 * Build autonomy-level instructions that control how much the agent
 * can do without pausing for user confirmation.
 */
function buildAutonomyGuidance(autonomy: AutonomyLevel): string {
  const lines = ["## Autonomy Level"];
  lines.push("");

  switch (autonomy) {
    case "low":
      lines.push("**Level: LOW** — Pause after every feature or significant change.");
      lines.push("");
      lines.push("- Complete one feature or phase step, then STOP and summarize what you did.");
      lines.push("- Wait for the user to say 'continue', 'next', or 'go' before proceeding.");
      lines.push("- If you encounter any ambiguity, ask immediately — do not assume.");
      lines.push("- Present diffs or summaries of changes before moving on.");
      break;

    case "medium":
      lines.push("**Level: MEDIUM** — Pause at milestone boundaries and decision points.");
      lines.push("");
      lines.push("- Work through features within a milestone without pausing.");
      lines.push("- STOP at milestone boundaries to summarize progress and confirm direction.");
      lines.push("- STOP if you encounter ambiguity that could affect the overall plan.");
      lines.push("- STOP if a feature fails and you're unsure how to proceed.");
      lines.push("- For routine decisions (naming, file structure), use your best judgment.");
      break;

    case "high":
      lines.push("**Level: HIGH** — Run to completion with minimal interruption.");
      lines.push("");
      lines.push("- Work through all milestones and features without pausing.");
      lines.push("- Only STOP if:");
      lines.push("  • A critical failure occurs that you cannot recover from");
      lines.push("  • An external dependency is missing (API key, service, etc.)");
      lines.push("  • The spec is fundamentally ambiguous and proceeding would waste effort");
      lines.push("- For all other decisions, use your best judgment and document your choices.");
      lines.push("- At the end, provide a comprehensive summary of everything done.");
      break;
  }

  return lines.join("\n");
}

/**
 * Build the pause notice appended when a mission is paused.
 */
function buildPauseNotice(state: MissionState): string {
  const lines = [
    "---",
    "",
    "## ⏸️ Mission PAUSED",
    "",
    "This mission is currently **paused**. Do not proceed with any mission work.",
    "",
    "- Wait for the user to resume the mission (via `/mission resume`)",
    "- You may answer questions about the mission status or plan",
    "- You may discuss changes to the plan",
    "- Do NOT implement, test, review, or modify any code for this mission",
  ];

  if (state.pausedAt) {
    lines.push("");
    lines.push(`*Paused at: ${state.pausedAt}*`);
  }

  return lines.join("\n");
}
