// extensions/types.ts — TypeScript interfaces for pi-mission extension

// ---------------------------------------------------------------------------
// Type Aliases
// ---------------------------------------------------------------------------

/** Controls how much the agent can do without user confirmation. */
export type AutonomyLevel = "low" | "medium" | "high";

/**
 * Mission operating mode.
 * - `simple`  — linear phase-based flow (plan → implement → review → validate)
 * - `minimal` — lightweight checklist mode
 */
export type MissionMode = "simple" | "minimal";

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

/**
 * Static configuration used to initialise a new mission.
 *
 * Supplied by templates or built interactively during `/mission start`.
 */
export interface MissionConfig {
  /** Operating mode. */
  mode: MissionMode;
  /** Phase definitions. */
  phases?: PhaseTemplate[];
}

/** A reusable, named mission blueprint with flat config fields. */
export interface MissionTemplate {
  /** Template display name (e.g. `"Standard"`, `"Minimal"`). */
  name: string;
  /** What this template is designed for. */
  description: string;
  /** Operating mode. */
  mode: MissionMode;
  /** Phase templates. */
  phases?: PhaseTemplate[];
}
