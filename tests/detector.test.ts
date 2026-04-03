import { describe, it, expect } from "vitest";
import {
  detectPhaseTransition,
} from "../extensions/detector.ts";
import type { MissionPhase } from "../extensions/types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function phase(name: string, status: MissionPhase["status"]): MissionPhase {
  return { name, emoji: "📐", status };
}

// ---------------------------------------------------------------------------
// detectPhaseTransition — completion
// ---------------------------------------------------------------------------

describe("detectPhaseTransition (completion)", () => {
  const phases = [
    phase("Architect", "active"),
    phase("Implement", "pending"),
    phase("Verify", "pending"),
  ];

  it("detects 'phase 1 complete'", () => {
    const result = detectPhaseTransition("phase 1 complete", phases);
    expect(result).toEqual({ type: "complete", phaseIndex: 0 });
  });

  it("detects 'phase 1 done'", () => {
    expect(detectPhaseTransition("phase 1 done", phases)).toEqual({ type: "complete", phaseIndex: 0 });
  });

  it("detects 'architect complete'", () => {
    expect(detectPhaseTransition("architect complete", phases)).toEqual({ type: "complete", phaseIndex: 0 });
  });

  it("detects 'architect phase complete'", () => {
    expect(detectPhaseTransition("architect phase complete", phases)).toEqual({ type: "complete", phaseIndex: 0 });
  });

  it("detects 'completed phase 1'", () => {
    expect(detectPhaseTransition("completed phase 1", phases)).toEqual({ type: "complete", phaseIndex: 0 });
  });

  it("detects 'completed the architect phase'", () => {
    expect(detectPhaseTransition("completed the architect phase", phases)).toEqual({ type: "complete", phaseIndex: 0 });
  });

  it("does not match pending phases for completion", () => {
    expect(detectPhaseTransition("implement complete", phases)).toBeNull();
  });

  it("returns null when no match", () => {
    expect(detectPhaseTransition("nothing relevant here", phases)).toBeNull();
  });

  it("is case-insensitive (text already lowercased)", () => {
    expect(detectPhaseTransition("phase 1 complete", phases)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// detectPhaseTransition — transition
// ---------------------------------------------------------------------------

describe("detectPhaseTransition (transition)", () => {
  const phases = [
    phase("Architect", "done"),
    phase("Implement", "pending"),
    phase("Verify", "pending"),
  ];

  it("detects 'moving to phase 2'", () => {
    const result = detectPhaseTransition("moving to phase 2", phases);
    expect(result).toEqual({ type: "transition", phaseIndex: 1 });
  });

  it("detects 'starting phase 2'", () => {
    expect(detectPhaseTransition("starting phase 2", phases)).toEqual({ type: "transition", phaseIndex: 1 });
  });

  it("detects 'beginning implement'", () => {
    expect(detectPhaseTransition("beginning implement", phases)).toEqual({ type: "transition", phaseIndex: 1 });
  });

  it("detects 'starting implement'", () => {
    expect(detectPhaseTransition("starting implement", phases)).toEqual({ type: "transition", phaseIndex: 1 });
  });

  it("does not match active phases for transition", () => {
    const withActive = [phase("Architect", "active"), phase("Implement", "pending")];
    expect(detectPhaseTransition("starting architect", withActive)).toBeNull();
  });
});
