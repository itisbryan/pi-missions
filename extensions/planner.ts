// extensions/planner.ts — Interactive mission planning questionnaire

import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type {
  AutonomyLevel,
  MissionMode,
  MissionPhase,
  MissionState,
  MissionTemplate,
  ModelAssignment,
  ProgressEvent,
} from "./types.ts";
import {
  DEFAULT_AUTONOMY,
  MISSION_TEMPLATES,
  PHASE_ROLE_MAP,
} from "./config.ts";
import { getAvailableModelOptions, showModelPicker } from "./model-picker.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map user-facing mode label → template key + MissionMode */
const MODE_OPTIONS: { label: string; key: string; mode: MissionMode }[] = [
  { label: "Standard (6 phases: Architect → Verify)", key: "standard", mode: "simple" },
  { label: "Full (milestones + features, Factory-style)", key: "full", mode: "full" },
  { label: "Minimal (3 phases: Plan → Build → Verify)", key: "minimal", mode: "simple" },
];

const AUTONOMY_OPTIONS: { label: string; value: AutonomyLevel }[] = [
  { label: "Low — Pause after each feature for review", value: "low" },
  { label: "Medium — Pause after each milestone", value: "medium" },
  { label: "High — Run to completion, only pause on errors", value: "high" },
];

// Model helpers moved to model-picker.ts (getAvailableModelOptions, showModelPicker)

/** Get a template by key */
function getTemplate(key: string): MissionTemplate {
  return MISSION_TEMPLATES[key];
}

/** Extract unique phase roles from the selected template's phases */
function getPhaseRoles(templateKey: string): string[] {
  const template = getTemplate(templateKey);
  if (!template.phases) return [];

  const roles = new Set<string>();
  for (const phase of template.phases) {
    const role = PHASE_ROLE_MAP[phase.name];
    if (role) roles.add(role);
  }
  return [...roles];
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
 * Walks the user through mode, autonomy, model assignment, and constraints,
 * then returns a fully initialised MissionState ready for execution.
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
  const mode = selected.mode;

  // ── Step 2: Autonomy level ──────────────────────────────────────────────
  const autonomyLabels = AUTONOMY_OPTIONS.map((o) => o.label);
  const autonomyChoice = await ctx.ui.select("Autonomy level", autonomyLabels);
  if (!autonomyChoice) return null;

  const autonomy: AutonomyLevel =
    AUTONOMY_OPTIONS.find((o) => o.label === autonomyChoice)?.value ?? DEFAULT_AUTONOMY;

  // ── Step 3: Model assignment (optional) ─────────────────────────────────
  let modelAssignment: ModelAssignment = {};

  const customizeModels = await ctx.ui.confirm(
    "Model assignment",
    "Customize models per phase?",
  );

  if (customizeModels) {
    const roles = getPhaseRoles(templateKey);

    for (const role of roles) {
      const modelOptions = getAvailableModelOptions(ctx);
      const picked = await showModelPicker(ctx, `Model for "${role}"`, modelOptions);
      // Skip cancelled selections — use current model (empty = default)
      if (picked && picked.id) {
        modelAssignment[role] = picked.id;
      }
    }
  }

  // ── Step 4: Constraints (optional) ──────────────────────────────────────
  const constraints =
    (await ctx.ui.input(
      "Any constraints or boundaries?",
      "e.g. don't modify auth module (optional)",
    )) ?? "";

  // ── Step 5: Build MissionState ──────────────────────────────────────────
  const now = new Date().toISOString();
  const phases = buildPhases(templateKey);
  const template = getTemplate(templateKey);

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

    // Simple-mode fields
    currentPhase: phases.length > 0 ? phases[0].name : undefined,
    phases,

    // Full-mode fields (populated later during planning phase)
    ...(mode === "full"
      ? {
          milestones: template.milestones?.map((m) => ({
            name: m.name,
            description: m.description,
            features: [],
            status: "pending" as const,
          })) ?? [],
          currentMilestone: undefined,
          currentFeature: undefined,
          validationAssertions: [],
        }
      : {}),

    // Shared fields
    autonomy,
    modelAssignment,
    paused: false,
    pauseHistory: [],
    specApproved: false,
    progressLog: [initialEvent],
    startedAt: now,
  };

  return state;
}
