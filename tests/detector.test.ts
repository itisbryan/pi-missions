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

  // --- Broader natural language patterns ---

  it("detects 'i've completed the architect'", () => {
    expect(detectPhaseTransition("i've completed the architect", phases)).toEqual({ type: "complete", phaseIndex: 0 });
  });

  it("detects 'i'm done with the architect'", () => {
    expect(detectPhaseTransition("i'm done with the architect", phases)).toEqual({ type: "complete", phaseIndex: 0 });
  });

  it("detects 'finished the architect phase'", () => {
    expect(detectPhaseTransition("finished the architect phase", phases)).toEqual({ type: "complete", phaseIndex: 0 });
  });

  it("detects 'done with architect'", () => {
    expect(detectPhaseTransition("done with architect", phases)).toEqual({ type: "complete", phaseIndex: 0 });
  });

  it("detects 'wrapped up the architect'", () => {
    expect(detectPhaseTransition("wrapped up the architect", phases)).toEqual({ type: "complete", phaseIndex: 0 });
  });

  it("detects 'architect is done'", () => {
    expect(detectPhaseTransition("architect is done", phases)).toEqual({ type: "complete", phaseIndex: 0 });
  });

  it("detects 'architect is complete'", () => {
    expect(detectPhaseTransition("architect is complete", phases)).toEqual({ type: "complete", phaseIndex: 0 });
  });

  it("detects 'that concludes the architect'", () => {
    expect(detectPhaseTransition("that concludes the architect", phases)).toEqual({ type: "complete", phaseIndex: 0 });
  });

  it("detects 'that wraps up the architect'", () => {
    expect(detectPhaseTransition("that wraps up the architect", phases)).toEqual({ type: "complete", phaseIndex: 0 });
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

  it("does not match done phases for completion", () => {
    const withActive = [
      phase("Architect", "done"),
      phase("Implement", "active"),
      phase("Verify", "pending"),
    ];
    // Architect is done, not active — completion patterns should not match
    expect(detectPhaseTransition("architect complete", withActive)).toBeNull();
  });

  it("returns null when no match", () => {
    expect(detectPhaseTransition("nothing relevant here", phases)).toBeNull();
  });

  // --- Broader natural language patterns ---

  it("detects 'moving on to the implement'", () => {
    expect(detectPhaseTransition("moving on to the implement", phases)).toEqual({ type: "transition", phaseIndex: 1 });
  });

  it("detects \"let's now start implement\"", () => {
    expect(detectPhaseTransition("let's now start implement", phases)).toEqual({ type: "transition", phaseIndex: 1 });
  });

  it("detects 'proceeding with the implement'", () => {
    expect(detectPhaseTransition("proceeding with the implement", phases)).toEqual({ type: "transition", phaseIndex: 1 });
  });

  it("detects 'next up is the implement'", () => {
    expect(detectPhaseTransition("next up is the implement", phases)).toEqual({ type: "transition", phaseIndex: 1 });
  });

  it("detects 'now moving to the implement phase'", () => {
    expect(detectPhaseTransition("now moving to the implement phase", phases)).toEqual({ type: "transition", phaseIndex: 1 });
  });
});
