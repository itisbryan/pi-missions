// extensions/types.ts — TypeScript interfaces for pi-mission extension

// ---------------------------------------------------------------------------
// Type Aliases
// ---------------------------------------------------------------------------

/** Controls how much the agent can do without user confirmation. */
export type AutonomyLevel = "low" | "medium" | "high";

/**
 * Mission operating mode.
 * - `simple`  — linear phase-based flow (plan → implement → review → validate)
 * - `full`    — milestone/feature DAG with validation assertions
 * - `minimal` — lightweight checklist mode, no phases or milestones
 */
export type MissionMode = "simple" | "full" | "minimal";

/** Logical role a phase fulfils during a mission. */
export type PhaseRole =
  | "planner"
  | "reviewer"
  | "coder"
  | "tester"
  | "auditor"
  | "verifier";

/** Maps a {@link PhaseRole} to a model identifier (e.g. `"implement" → "claude-sonnet-4"`). */
export type ModelAssignment = Record<string, string>;

// ---------------------------------------------------------------------------
// Core Domain Types
// ---------------------------------------------------------------------------

/** A discrete phase in a simple-mode mission (e.g. "Planning", "Implementation"). */
export interface MissionPhase {
  /** Human-readable phase name. */
  name: string;
  /** Emoji shown in progress displays. */
  emoji: string;
  /** Current lifecycle status. */
  status: "pending" | "active" | "done" | "skipped";
  /** ISO-8601 timestamp when the phase became active. */
  startedAt?: string;
  /** ISO-8601 timestamp when the phase completed or was skipped. */
  completedAt?: string;
}

/**
 * A single deliverable inside a milestone (full-mode missions).
 *
 * Features are the atomic unit of work: each one maps to a concrete behaviour
 * that can be independently implemented, tested, and verified.
 */
export interface MissionFeature {
  /** Unique identifier (e.g. `"feat-auth-login"`). */
  id: string;
  /** What this feature delivers, in plain language. */
  description: string;
  /** Optional pi skill to invoke when implementing this feature. */
  skillName?: string;
  /** Name of the parent milestone this feature belongs to. */
  milestone: string;
  /** Conditions that must be true before work can start. */
  preconditions: string[];
  /** Observable behaviours the feature must exhibit when complete. */
  expectedBehavior: string[];
  /** Steps an agent (or human) follows to verify correctness. */
  verificationSteps: string[];
  /** IDs of {@link ValidationAssertion}s this feature satisfies. */
  fulfills: string[];
  /** Current lifecycle status. */
  status: "pending" | "active" | "done" | "failed" | "cancelled";
  /** ISO-8601 timestamp when work began. */
  startedAt?: string;
  /** ISO-8601 timestamp when the feature reached a terminal status. */
  completedAt?: string;
}

/**
 * A logical grouping of related features that together represent a
 * significant, demonstrable chunk of progress.
 *
 * Milestones are sealed once every contained feature is done (or cancelled).
 */
export interface MissionMilestone {
  /** Human-readable milestone name (e.g. `"Authentication & Authorization"`). */
  name: string;
  /** What completing this milestone means for the mission. */
  description: string;
  /** Ordered list of features that comprise this milestone. */
  features: MissionFeature[];
  /** Current lifecycle status — `sealed` means no further changes allowed. */
  status: "pending" | "active" | "done" | "sealed";
  /** ISO-8601 timestamp when the first feature became active. */
  startedAt?: string;
  /** ISO-8601 timestamp when the milestone was sealed or completed. */
  completedAt?: string;
}

/**
 * A testable claim about the system that must hold true for the mission
 * to be considered successful.
 *
 * Assertions are defined during planning and checked during validation.
 */
export interface ValidationAssertion {
  /** Unique identifier (e.g. `"va-login-redirects"`). */
  id: string;
  /** Domain area this assertion covers (e.g. `"security"`, `"performance"`). */
  area: string;
  /** Short title shown in dashboards and reports. */
  title: string;
  /** Full description of what is being asserted. */
  description: string;
  /** Current verification status. */
  status: "pending" | "passed" | "failed" | "blocked" | "skipped";
  /** Free-text evidence collected when the assertion was evaluated. */
  evidence?: string;
}

// ---------------------------------------------------------------------------
// Events & Logging
// ---------------------------------------------------------------------------

/** An immutable record of something noteworthy that happened during a mission. */
export interface ProgressEvent {
  /** ISO-8601 timestamp of the event. */
  timestamp: string;
  /** Discriminator for the kind of event. */
  type:
    | "phase_start"
    | "phase_complete"
    | "feature_start"
    | "feature_complete"
    | "feature_failed"
    | "milestone_start"
    | "milestone_complete"
    | "mission_pause"
    | "mission_resume"
    | "mission_redirect"
    | "mission_complete";
  /** Human-readable description of what happened. */
  detail: string;
}

// ---------------------------------------------------------------------------
// Mission State (runtime)
// ---------------------------------------------------------------------------

/**
 * The complete runtime state of a mission.
 *
 * Persisted to `.pi-mission/state.json` and reloaded on context resets so
 * the agent can resume exactly where it left off.
 */
export interface MissionState {
  /** High-level description of what this mission aims to achieve. */
  description: string;
  /** Operating mode that governs which fields are active. */
  mode: MissionMode;

  // -- Simple-mode fields ---------------------------------------------------
  /** Name of the currently active phase (simple mode). */
  currentPhase?: string;
  /** Ordered phase list (simple mode). */
  phases: MissionPhase[];

  // -- Full-mode fields -----------------------------------------------------
  /** Milestone DAG (full mode). */
  milestones?: MissionMilestone[];
  /** Name of the currently active milestone (full mode). */
  currentMilestone?: string;
  /** ID of the currently active feature (full mode). */
  currentFeature?: string;
  /** Top-level validation assertions (full mode). */
  validationAssertions?: ValidationAssertion[];

  // -- Shared fields --------------------------------------------------------
  /** How much latitude the agent has to act without confirmation. */
  autonomy: AutonomyLevel;
  /** Per-role model overrides. */
  modelAssignment: ModelAssignment;

  /** Whether the mission is currently paused. */
  paused: boolean;
  /** ISO-8601 timestamp of the most recent pause, if active. */
  pausedAt?: string;
  /** Historical pause/resume pairs for audit. */
  pauseHistory: { pausedAt: string; resumedAt: string }[];

  /** Whether the user has approved the generated spec. */
  specApproved: boolean;
  /** Raw markdown of the approved spec (cached for reference). */
  specMarkdown?: string;

  /** Append-only log of everything notable that happened. */
  progressLog: ProgressEvent[];

  /** ISO-8601 timestamp when the mission was created. */
  startedAt: string;
  /** ISO-8601 timestamp when the mission reached a terminal state. */
  completedAt?: string;
}

// ---------------------------------------------------------------------------
// Configuration & Templates
// ---------------------------------------------------------------------------

/** Blueprint for a phase — no runtime status fields. */
export interface PhaseTemplate {
  /** Phase name. */
  name: string;
  /** Emoji icon. */
  emoji: string;
  /** Instructions shown in the protocol for this phase. */
  instructions: string[];
}

/** Blueprint for a milestone — features start empty, filled during planning. */
export interface MilestoneTemplate {
  /** Milestone name. */
  name: string;
  /** What this milestone delivers. */
  description: string;
  /** Feature stubs (typically empty at template level). */
  features: MissionFeature[];
}

/**
 * Static configuration used to initialise a new mission.
 *
 * Supplied by templates or built interactively during `/mission start`.
 */
export interface MissionConfig {
  /** Operating mode. */
  mode: MissionMode;
  /** Phase definitions (simple/minimal mode). */
  phases?: PhaseTemplate[];
  /** Milestone definitions (full mode). */
  milestones?: MilestoneTemplate[];
}

/** A reusable, named mission blueprint with flat config fields. */
export interface MissionTemplate {
  /** Template display name (e.g. `"Standard"`, `"Full"`, `"Minimal"`). */
  name: string;
  /** What this template is designed for. */
  description: string;
  /** Operating mode. */
  mode: MissionMode;
  /** Phase templates (simple/minimal mode). */
  phases?: PhaseTemplate[];
  /** Milestone templates (full mode). */
  milestones?: MilestoneTemplate[];
}
