import { describe, it, expect } from "vitest";
import {
  detectPhaseTransition,
  detectFeatureTransition,
  detectMilestoneTransition,
  detectAssertionResult,
} from "../extensions/detector.ts";
import type { MissionPhase, MissionFeature, MissionMilestone, ValidationAssertion } from "../extensions/types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function phase(name: string, status: MissionPhase["status"]): MissionPhase {
  return { name, emoji: "📐", status };
}

function feature(id: string, status: MissionFeature["status"] = "active"): MissionFeature {
  return {
    id,
    description: `Feature ${id}`,
    milestone: "m1",
    preconditions: [],
    expectedBehavior: [],
    verificationSteps: [],
    fulfills: [],
    status,
  };
}

function milestone(name: string, status: MissionMilestone["status"] = "active"): MissionMilestone {
  return { name, description: "", features: [], status };
}

function assertion(id: string, status: ValidationAssertion["status"] = "pending"): ValidationAssertion {
  return { id, area: "auth", title: `Test ${id}`, description: "Test assertion", status };
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
    // Phase 2 (Implement) is pending, not active — should not match
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
    // Architect is active, not pending — transition shouldn't match it
    expect(detectPhaseTransition("starting architect", withActive)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// detectFeatureTransition
// ---------------------------------------------------------------------------

describe("detectFeatureTransition", () => {
  const features = [
    feature("cart-api", "active"),
    feature("auth-service", "pending"),
  ];

  it("detects 'feature cart-api complete'", () => {
    const result = detectFeatureTransition("feature cart-api complete", features);
    expect(result).toEqual({ type: "complete", featureId: "cart-api" });
  });

  it("detects 'feature cart-api done'", () => {
    expect(detectFeatureTransition("feature cart-api done", features)).toEqual({ type: "complete", featureId: "cart-api" });
  });

  it("detects 'completed feature cart-api'", () => {
    expect(detectFeatureTransition("completed feature cart-api", features)).toEqual({ type: "complete", featureId: "cart-api" });
  });

  it("detects 'feature cart-api failed'", () => {
    expect(detectFeatureTransition("feature cart-api failed", features)).toEqual({ type: "failed", featureId: "cart-api" });
  });

  it("detects 'starting feature auth-service'", () => {
    expect(detectFeatureTransition("starting feature auth-service", features)).toEqual({ type: "start", featureId: "auth-service" });
  });

  it("returns null when no match", () => {
    expect(detectFeatureTransition("nothing here", features)).toBeNull();
  });

  it("handles feature IDs with special regex characters", () => {
    const specialFeatures = [feature("feat(auth)", "active")];
    const result = detectFeatureTransition("feature feat(auth) complete", specialFeatures);
    expect(result).toEqual({ type: "complete", featureId: "feat(auth)" });
  });

  it("completion matches before start pattern", () => {
    // 'completed feature X' should be 'complete', not accidentally 'start'
    const result = detectFeatureTransition("completed feature cart-api", features);
    expect(result?.type).toBe("complete");
  });
});

// ---------------------------------------------------------------------------
// detectMilestoneTransition
// ---------------------------------------------------------------------------

describe("detectMilestoneTransition", () => {
  const milestones = [
    milestone("Foundation", "done"),
    milestone("Implementation", "active"),
    milestone("Validation", "pending"),
  ];

  it("detects 'milestone 2 complete'", () => {
    const result = detectMilestoneTransition("milestone 2 complete", milestones);
    expect(result).toEqual({ type: "complete", milestoneIndex: 1 });
  });

  it("detects 'milestone implementation complete'", () => {
    expect(detectMilestoneTransition("milestone implementation complete", milestones))
      .toEqual({ type: "complete", milestoneIndex: 1 });
  });

  it("detects 'implementation milestone complete'", () => {
    expect(detectMilestoneTransition("implementation milestone complete", milestones))
      .toEqual({ type: "complete", milestoneIndex: 1 });
  });

  it("detects 'starting milestone 3'", () => {
    expect(detectMilestoneTransition("starting milestone 3", milestones))
      .toEqual({ type: "start", milestoneIndex: 2 });
  });

  it("returns null when no match", () => {
    expect(detectMilestoneTransition("no milestone here", milestones)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// detectAssertionResult
// ---------------------------------------------------------------------------

describe("detectAssertionResult", () => {
  const assertions = [
    assertion("VAL-AUTH-001", "pending"),
    assertion("VAL-CHECKOUT-002", "failed"),
    assertion("VAL-PERF-003", "passed"), // already passed — should be skipped
  ];

  it("detects 'val-auth-001: passed'", () => {
    const result = detectAssertionResult("val-auth-001: passed", assertions);
    expect(result).toEqual({ type: "passed", assertionId: "VAL-AUTH-001" });
  });

  it("detects 'val-auth-001 passed'", () => {
    expect(detectAssertionResult("val-auth-001 passed", assertions))
      .toEqual({ type: "passed", assertionId: "VAL-AUTH-001" });
  });

  it("detects 'assertion val-auth-001 passed'", () => {
    expect(detectAssertionResult("assertion val-auth-001 passed", assertions))
      .toEqual({ type: "passed", assertionId: "VAL-AUTH-001" });
  });

  it("detects 'val-auth-001 verified'", () => {
    expect(detectAssertionResult("val-auth-001 verified", assertions))
      .toEqual({ type: "passed", assertionId: "VAL-AUTH-001" });
  });

  it("detects 'val-checkout-002: failed'", () => {
    expect(detectAssertionResult("val-checkout-002: failed", assertions))
      .toEqual({ type: "failed", assertionId: "VAL-CHECKOUT-002" });
  });

  it("skips already-passed assertions", () => {
    // VAL-PERF-003 is 'passed' — should not be re-detected
    expect(detectAssertionResult("val-perf-003 passed", assertions)).toBeNull();
  });

  it("returns null when no match", () => {
    expect(detectAssertionResult("nothing relevant", assertions)).toBeNull();
  });
});
