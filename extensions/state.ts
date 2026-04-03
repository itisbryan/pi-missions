// extensions/state.ts — State persistence with TypeBox validation

import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { MissionState, ProgressEvent } from "./types.ts";

// ---------------------------------------------------------------------------
// TypeBox Schemas — runtime validation mirrors the MissionState interface
// ---------------------------------------------------------------------------

const MissionPhaseSchema = Type.Object({
  name: Type.String(),
  emoji: Type.String(),
  status: Type.Union([
    Type.Literal("pending"),
    Type.Literal("active"),
    Type.Literal("done"),
    Type.Literal("skipped"),
  ]),
  startedAt: Type.Optional(Type.String()),
  completedAt: Type.Optional(Type.String()),
});

const MissionFeatureSchema = Type.Object({
  id: Type.String(),
  description: Type.String(),
  skillName: Type.Optional(Type.String()),
  milestone: Type.String(),
  preconditions: Type.Array(Type.String()),
  expectedBehavior: Type.Array(Type.String()),
  verificationSteps: Type.Array(Type.String()),
  fulfills: Type.Array(Type.String()),
  status: Type.Union([
    Type.Literal("pending"),
    Type.Literal("active"),
    Type.Literal("done"),
    Type.Literal("failed"),
    Type.Literal("cancelled"),
  ]),
  startedAt: Type.Optional(Type.String()),
  completedAt: Type.Optional(Type.String()),
});

const MissionMilestoneSchema = Type.Object({
  name: Type.String(),
  description: Type.String(),
  features: Type.Array(MissionFeatureSchema),
  status: Type.Union([
    Type.Literal("pending"),
    Type.Literal("active"),
    Type.Literal("done"),
    Type.Literal("sealed"),
  ]),
  startedAt: Type.Optional(Type.String()),
  completedAt: Type.Optional(Type.String()),
});

const ValidationAssertionSchema = Type.Object({
  id: Type.String(),
  area: Type.String(),
  title: Type.String(),
  description: Type.String(),
  status: Type.Union([
    Type.Literal("pending"),
    Type.Literal("passed"),
    Type.Literal("failed"),
    Type.Literal("blocked"),
    Type.Literal("skipped"),
  ]),
  evidence: Type.Optional(Type.String()),
});

const ProgressEventSchema = Type.Object({
  timestamp: Type.String(),
  type: Type.Union([
    Type.Literal("phase_start"),
    Type.Literal("phase_complete"),
    Type.Literal("feature_start"),
    Type.Literal("feature_complete"),
    Type.Literal("feature_failed"),
    Type.Literal("milestone_start"),
    Type.Literal("milestone_complete"),
    Type.Literal("mission_pause"),
    Type.Literal("mission_resume"),
    Type.Literal("mission_redirect"),
    Type.Literal("mission_complete"),
  ]),
  detail: Type.String(),
});

const PauseEntrySchema = Type.Object({
  pausedAt: Type.String(),
  resumedAt: Type.String(),
});

export const MissionStateSchema = Type.Object({
  description: Type.String(),
  mode: Type.Union([
    Type.Literal("simple"),
    Type.Literal("full"),
    Type.Literal("minimal"),
  ]),

  // Simple-mode fields
  currentPhase: Type.Optional(Type.String()),
  phases: Type.Array(MissionPhaseSchema),

  // Full-mode fields
  milestones: Type.Optional(Type.Array(MissionMilestoneSchema)),
  currentMilestone: Type.Optional(Type.String()),
  currentFeature: Type.Optional(Type.String()),
  validationAssertions: Type.Optional(Type.Array(ValidationAssertionSchema)),

  // Shared fields
  autonomy: Type.Union([
    Type.Literal("low"),
    Type.Literal("medium"),
    Type.Literal("high"),
  ]),
  modelAssignment: Type.Record(Type.String(), Type.String()),

  paused: Type.Boolean(),
  pausedAt: Type.Optional(Type.String()),
  pauseHistory: Type.Array(PauseEntrySchema),

  specApproved: Type.Boolean(),
  specMarkdown: Type.Optional(Type.String()),

  progressLog: Type.Array(ProgressEventSchema),

  startedAt: Type.String(),
  completedAt: Type.Optional(Type.String()),
});

// ---------------------------------------------------------------------------
// State Persistence
// ---------------------------------------------------------------------------

/**
 * Persist mission state as a custom session entry.
 * Entries are append-only — the latest entry wins on restore.
 */
export function saveMissionState(pi: ExtensionAPI, state: MissionState): void {
  pi.appendEntry("mission-state", { ...state });
}

/**
 * Scan session entries for the most recent valid mission state.
 * Iterates from the end for an early break — the last valid entry is the
 * current state since entries are append-only.
 */
export function restoreMissionState(entries: any[]): MissionState | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type !== "custom" || entry.customType !== "mission-state") {
      continue;
    }

    const data = entry.data;

    // A null entry is a "reset" marker — mission was cleared
    if (data === null || data === undefined) {
      return null;
    }

    // Cast via unknown: TypeBox CJS/ESM dual-package types don't unify
    if (Value.Check(MissionStateSchema as unknown as Parameters<typeof Value.Check>[0], data)) {
      return data as MissionState;
    }
    // Corrupted or schema-incompatible entry — skip and keep scanning
  }

  return null;
}

/**
 * Clear mission state by persisting a null marker.
 * The caller should also set its local reference to null.
 *
 * @example
 * ```ts
 * pi.appendEntry("mission-state", null); // persist the reset
 * setState(null);                         // clear local ref
 * ```
 *
 * @deprecated Use `pi.appendEntry("mission-state", null)` directly.
 *             Kept for backward compatibility.
 */
export function clearMissionState(pi: ExtensionAPI): void {
  pi.appendEntry("mission-state", null);
}

// ---------------------------------------------------------------------------
// Phase & Feature Advancement
// ---------------------------------------------------------------------------

/**
 * Mark the current phase as done and advance to the next one.
 * If there are no more phases the mission is marked complete.
 * Returns a shallow-cloned state with updated phases.
 */
export function advancePhase(state: MissionState): MissionState {
  const now = new Date().toISOString();
  const phases = state.phases.map((p) => ({ ...p }));

  // Find the active phase
  const activeIdx = phases.findIndex((p) => p.status === "active");
  if (activeIdx === -1) return state;

  // Complete the active phase
  phases[activeIdx].status = "done";
  phases[activeIdx].completedAt = now;

  const next: Partial<MissionState> = { phases };

  if (activeIdx + 1 < phases.length) {
    // Activate the next phase
    phases[activeIdx + 1].status = "active";
    phases[activeIdx + 1].startedAt = now;
    next.currentPhase = phases[activeIdx + 1].name;
  } else {
    // All phases complete — close the mission
    next.completedAt = now;
  }

  return { ...state, ...next };
}

/**
 * Mark the current feature as done and advance to the next one within the
 * same milestone, or to the first feature of the next milestone.
 * Seals milestones when all their features are terminal. If every milestone
 * is sealed the mission is marked complete.
 * Returns a shallow-cloned state (full-mode only).
 */
export function advanceFeature(state: MissionState): MissionState {
  if (!state.milestones) return state;

  const now = new Date().toISOString();
  const milestones = state.milestones.map((m) => ({
    ...m,
    features: m.features.map((f) => ({ ...f })),
  }));

  // Locate the active feature
  let activeMilestoneIdx = -1;
  let activeFeatureIdx = -1;

  for (let mi = 0; mi < milestones.length; mi++) {
    const fi = milestones[mi].features.findIndex((f) => f.status === "active");
    if (fi !== -1) {
      activeMilestoneIdx = mi;
      activeFeatureIdx = fi;
      break;
    }
  }

  if (activeMilestoneIdx === -1 || activeFeatureIdx === -1) return state;

  const milestone = milestones[activeMilestoneIdx];
  const feature = milestone.features[activeFeatureIdx];

  // Complete the active feature
  feature.status = "done";
  feature.completedAt = now;

  const next: Partial<MissionState> = { milestones };

  // Try to find the next pending feature in the same milestone
  const nextInMilestone = milestone.features.findIndex(
    (f, i) => i > activeFeatureIdx && f.status === "pending",
  );

  if (nextInMilestone !== -1) {
    // Activate the next feature in the same milestone
    milestone.features[nextInMilestone].status = "active";
    milestone.features[nextInMilestone].startedAt = now;
    next.currentFeature = milestone.features[nextInMilestone].id;
  } else {
    // Seal the current milestone if all features are terminal
    const allTerminal = milestone.features.every((f) =>
      ["done", "failed", "cancelled"].includes(f.status),
    );
    if (allTerminal) {
      milestone.status = "sealed";
      milestone.completedAt = now;
    }

    // Find the next milestone with pending features
    let found = false;
    for (let mi = activeMilestoneIdx + 1; mi < milestones.length; mi++) {
      const pendingFeature = milestones[mi].features.find(
        (f) => f.status === "pending",
      );
      if (pendingFeature) {
        milestones[mi].status = "active";
        milestones[mi].startedAt = milestones[mi].startedAt ?? now;
        pendingFeature.status = "active";
        pendingFeature.startedAt = now;
        next.currentMilestone = milestones[mi].name;
        next.currentFeature = pendingFeature.id;
        found = true;
        break;
      }
    }

    if (!found) {
      // All milestones exhausted — mission complete
      next.completedAt = now;
      next.currentFeature = undefined;
      next.currentMilestone = undefined;
    }
  }

  return { ...state, ...next };
}

// ---------------------------------------------------------------------------
// Progress Logging
// ---------------------------------------------------------------------------

/**
 * Append an event to the mission's progress log.
 * Mutates the state in-place for convenience — callers should persist
 * afterwards via `saveMissionState`.
 */
export function addProgressEvent(
  state: MissionState,
  type: ProgressEvent["type"],
  detail: string,
): void {
  state.progressLog.push({
    timestamp: new Date().toISOString(),
    type,
    detail,
  });
}
