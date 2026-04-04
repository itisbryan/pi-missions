// extensions/planner.ts — Interactive mission planning questionnaire

import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type {
  AutonomyLevel,
  MissionPhase,
  MissionState,
  MissionTemplate,
  ModelAssignment,
  ProgressEvent,
} from "./types.ts";
import {
  DEFAULT_AUTONOMY,
  MISSION_TEMPLATES,
} from "./config.ts";
import { getAvailableModelOptions } from "./model-picker.ts";
import {
  loadModelDefaults,
  saveModelDefaults,
  showRoleModelAssigner,
  validateDefaults,
} from "./role-assigner.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map user-facing mode label → template key */
const MODE_OPTIONS: { label: string; key: string }[] = [
  { label: "Standard (6 phases: Architect → Verify)", key: "standard" },
  { label: "Minimal (3 phases: Plan → Build → Verify)", key: "minimal" },
];

const AUTONOMY_OPTIONS: { label: string; value: AutonomyLevel }[] = [
  { label: "Low — Pause after each phase for review", value: "low" },
  { label: "Medium — Pause at phase boundaries and decision points", value: "medium" },
  { label: "High — Run to completion, only pause on errors", value: "high" },
];

/** Get a template by key */
function getTemplate(key: string): MissionTemplate {
  return MISSION_TEMPLATES[key];
}

/** Build MissionPhase[] from a template's phase definitions, first one active */
function buildPhases(templateKey: string): MissionPhase[] {
  const template = getTemplate(templateKey);
  if (!template.phases) return [];

  return template.phases.map((p, i) => ({
    name: p.name,
    emoji: p.emoji,
    status: i === 0 ? "active" as const : "pending" as const,
    ...(i === 0 ? { startedAt: new Date().toISOString() } : {}),
  }));
}

// ---------------------------------------------------------------------------
// Main planner flow
// ---------------------------------------------------------------------------

/**
 * Run the interactive mission planning questionnaire.
 *
 * Flow:
 *   1. Choose mode (Standard / Minimal)
 *   2. Assign models per role group — required on first run, saved for later
 *   3. Choose autonomy level
 *   4. Optional constraints
 *   5. Build MissionState
 *
 * Returns `null` if the user cancels at any required step.
 */
export async function runMissionPlanner(
  ctx: ExtensionCommandContext,
  description: string,
): Promise<MissionState | null> {
  // ── Step 1: Mode selection ──────────────────────────────────────────────
  const modeLabels = MODE_OPTIONS.map((o) => o.label);
  const modeChoice = await ctx.ui.select("Mission mode", modeLabels);
  if (!modeChoice) return null;

  const selected = MODE_OPTIONS.find((o) => o.label === modeChoice)!;
  const templateKey = selected.key;
  const template = getTemplate(templateKey);
  const mode = template.mode;

  // ── Step 2: Model assignment ────────────────────────────────────────────
  // Check for saved defaults — skip assignment if valid defaults exist
  let modelAssignment: ModelAssignment = {};
  const available = getAvailableModelOptions(ctx);
  const saved = loadModelDefaults();
  const validDefaults = saved ? validateDefaults(saved, available) : null;

  if (validDefaults) {
    // Use saved defaults silently
    modelAssignment = validDefaults;
  } else {
    // First time (or stale defaults) — require assignment via tabbed UI
    const assignment = await showRoleModelAssigner(ctx, templateKey);
    if (assignment === null) return null; // User cancelled

    modelAssignment = assignment;

    // Persist for future missions
    if (Object.keys(assignment).length > 0) {
      saveModelDefaults(assignment);
    }
  }

  // ── Step 3: Autonomy level ──────────────────────────────────────────────
  const autonomyLabels = AUTONOMY_OPTIONS.map((o) => o.label);
  const autonomyChoice = await ctx.ui.select("Autonomy level", autonomyLabels);
  if (!autonomyChoice) return null;

  const autonomy: AutonomyLevel =
    AUTONOMY_OPTIONS.find((o) => o.label === autonomyChoice)?.value ?? DEFAULT_AUTONOMY;

  // ── Step 4: Constraints (optional) ──────────────────────────────────────
  const constraints =
    (await ctx.ui.input(
      "Any constraints or boundaries?",
      "e.g. don't modify auth module (optional)",
    )) ?? "";

  // ── Step 5: Build MissionState ──────────────────────────────────────────
  const now = new Date().toISOString();
  const phases = buildPhases(templateKey);

  const initialEvent: ProgressEvent = {
    timestamp: now,
    type: "phase_start",
    detail: phases.length > 0
      ? `Mission started — entering phase "${phases[0].name}"`
      : `Mission started in ${template.name} mode`,
  };

  const state: MissionState = {
    description: constraints
      ? `${description}\n\nConstraints: ${constraints}`
      : description,
    mode,
    templateKey,
    currentPhase: phases.length > 0 ? phases[0].name : undefined,
    phases,
    autonomy,
    modelAssignment,
    paused: false,
    pauseHistory: [],
    progressLog: [initialEvent],
    startedAt: now,
  };

  return state;
}
