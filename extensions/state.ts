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

const ProgressEventSchema = Type.Object({
  timestamp: Type.String(),
  type: Type.Union([
    Type.Literal("phase_start"),
    Type.Literal("phase_complete"),
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
    Type.Literal("minimal"),
  ]),

  currentPhase: Type.Optional(Type.String()),
  phases: Type.Array(MissionPhaseSchema),

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
