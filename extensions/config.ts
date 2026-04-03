// extensions/config.ts — Mission configuration templates and defaults

import type {
  AutonomyLevel,
  MilestoneTemplate,
  MissionTemplate,
  PhaseRole,
  PhaseTemplate,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Phase templates
// ---------------------------------------------------------------------------

/** Standard 6-phase mission (architect → verify) */
export const DEFAULT_SIMPLE_PHASES: PhaseTemplate[] = [
  {
    name: "Architect",
    emoji: "📐",
    instructions: [
      "Analyze the codebase and understand the domain",
      "Produce a detailed implementation plan with file assignments",
      "List all files to create/modify with clear descriptions",
      "STOP and present the plan for approval before proceeding",
    ],
  },
  {
    name: "Review Plan",
    emoji: "👁️",
    instructions: [
      "Present the plan clearly to the user",
      "Wait for explicit approval (user says 'approve', 'go', 'lgtm', etc.)",
      "If the user requests changes, revise the plan and re-present",
      "Do NOT proceed to implementation without approval",
    ],
  },
  {
    name: "Implement",
    emoji: "🔨",
    instructions: [
      "Execute the plan — run independent tasks in parallel when possible",
      "Use subagents or parallel tool calls for concurrent work",
      "Follow the project's architecture patterns and code style",
      "Commit work incrementally",
    ],
  },
  {
    name: "Test",
    emoji: "🧪",
    instructions: [
      "Write tests for all new/changed code",
      "Cover edge cases, error conditions, and boundary values",
      "Run the test suite and fix any failures",
    ],
  },
  {
    name: "Audit",
    emoji: "🔍",
    instructions: [
      "Review all changes for bugs, logic errors, and security issues",
      "Check for performance concerns and code style violations",
      "Verify error handling is complete",
      "Fix any issues found",
    ],
  },
  {
    name: "Verify",
    emoji: "✅",
    instructions: [
      "Run the full test suite and linter",
      "Ensure all tests pass and no lint errors",
      "Report the final status",
    ],
  },
];

/** Minimal 3-phase mission for quick tasks */
export const DEFAULT_MINIMAL_PHASES: PhaseTemplate[] = [
  {
    name: "Plan",
    emoji: "📋",
    instructions: [
      "Briefly outline the approach",
      "Identify files to create or modify",
      "Present the plan for approval",
    ],
  },
  {
    name: "Build",
    emoji: "🔨",
    instructions: [
      "Implement the plan and write tests",
      "Follow existing patterns and code style",
      "Commit work incrementally",
    ],
  },
  {
    name: "Verify",
    emoji: "✅",
    instructions: [
      "Run tests and linter",
      "Quick review for obvious issues",
      "Report the final status",
    ],
  },
];

// ---------------------------------------------------------------------------
// Milestone templates (full Factory-style mode)
// ---------------------------------------------------------------------------

/** Template milestones for full mode — features are filled during planning */
export const DEFAULT_FULL_MILESTONES: MilestoneTemplate[] = [
  {
    name: "Foundation",
    description: "Core types, schemas, and shared utilities",
    features: [],
  },
  {
    name: "Implementation",
    description: "Primary feature work and integrations",
    features: [],
  },
  {
    name: "Validation",
    description: "Testing, audit, and final verification",
    features: [],
  },
];

// ---------------------------------------------------------------------------
// Mission templates
// ---------------------------------------------------------------------------

export const MISSION_TEMPLATES: Record<string, MissionTemplate> = {
  standard: {
    name: "Standard",
    description: "6-phase linear mission: architect, review, implement, test, audit, verify",
    mode: "simple",
    phases: DEFAULT_SIMPLE_PHASES,
  },
  full: {
    name: "Full",
    description: "Milestone-based Factory-style orchestration with feature decomposition",
    mode: "full",
    milestones: DEFAULT_FULL_MILESTONES,
  },
  minimal: {
    name: "Minimal",
    description: "3-phase quick mission: plan, build, verify",
    mode: "simple",
    phases: DEFAULT_MINIMAL_PHASES,
  },
};

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_AUTONOMY: AutonomyLevel = "medium";

// ---------------------------------------------------------------------------
// Phase → role mapping (for model assignment)
// ---------------------------------------------------------------------------

export const PHASE_ROLE_MAP: Record<string, PhaseRole> = {
  Architect: "planner",
  "Review Plan": "reviewer",
  Plan: "planner",
  Implement: "coder",
  Build: "coder",
  Test: "tester",
  Audit: "auditor",
  Verify: "verifier",
};
