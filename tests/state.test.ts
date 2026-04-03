import { describe, it, expect } from "vitest";
import {
  restoreMissionState,
  clearMissionState,
  advancePhase,
  addProgressEvent,
} from "../extensions/state.ts";
import type { MissionState } from "../extensions/types.ts";

// ---------------------------------------------------------------------------
// Minimal state factory
// ---------------------------------------------------------------------------

function makeSimpleState(overrides: Partial<MissionState> = {}): MissionState {
  return {
    description: "Test mission",
    mode: "simple",
    phases: [
      { name: "Architect", emoji: "📐", status: "active", startedAt: new Date().toISOString() },
      { name: "Implement", emoji: "🔨", status: "pending" },
      { name: "Verify", emoji: "✅", status: "pending" },
    ],
    autonomy: "medium",
    modelAssignment: {},
    paused: false,
    pauseHistory: [],
    progressLog: [],
    startedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// restoreMissionState
// ---------------------------------------------------------------------------

describe("restoreMissionState", () => {
  it("returns null for empty entries", () => {
    expect(restoreMissionState([])).toBeNull();
  });

  it("returns null when no mission-state entries", () => {
    const entries = [
      { type: "message", role: "user", content: "hello" },
      { type: "custom", customType: "other-type", data: {} },
    ];
    expect(restoreMissionState(entries)).toBeNull();
  });

  it("returns null for null data (reset marker)", () => {
    const entries = [
      { type: "custom", customType: "mission-state", data: null },
    ];
    expect(restoreMissionState(entries)).toBeNull();
  });

  it("returns null for undefined data", () => {
    const entries = [
      { type: "custom", customType: "mission-state", data: undefined },
    ];
    expect(restoreMissionState(entries)).toBeNull();
  });

  it("returns null for schema-invalid data", () => {
    const entries = [
      { type: "custom", customType: "mission-state", data: { description: "no required fields" } },
    ];
    expect(restoreMissionState(entries)).toBeNull();
  });

  it("returns latest valid state from entries", () => {
    const state = makeSimpleState({ description: "latest" });
    const entries = [
      { type: "custom", customType: "mission-state", data: makeSimpleState({ description: "old" }) },
      { type: "custom", customType: "mission-state", data: state },
    ];
    const result = restoreMissionState(entries);
    expect(result?.description).toBe("latest");
  });

  it("skips corrupted entries and finds last valid", () => {
    const validState = makeSimpleState();
    const entries = [
      { type: "custom", customType: "mission-state", data: validState },
      { type: "custom", customType: "mission-state", data: { bad: "data" } },
    ];
    const result = restoreMissionState(entries);
    expect(result?.description).toBe("Test mission");
  });

  it("null reset marker stops scan (returns null even with valid earlier entries)", () => {
    const entries = [
      { type: "custom", customType: "mission-state", data: makeSimpleState() },
      { type: "custom", customType: "mission-state", data: null },
    ];
    expect(restoreMissionState(entries)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// clearMissionState
// ---------------------------------------------------------------------------

describe("clearMissionState", () => {
  it("returns null", () => {
    const mockPi = { appendEntry: () => {} } as any;
    expect(clearMissionState(mockPi)).toBeUndefined();
  });

  it("calls pi.appendEntry with null", () => {
    const calls: any[] = [];
    const mockPi = { appendEntry: (...args: any[]) => calls.push(args) } as any;
    clearMissionState(mockPi);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(["mission-state", null]);
  });
});

// ---------------------------------------------------------------------------
// advancePhase
// ---------------------------------------------------------------------------

describe("advancePhase", () => {
  it("marks active phase as done and activates next", () => {
    const state = makeSimpleState();
    const result = advancePhase(state);

    expect(result.phases[0].status).toBe("done");
    expect(result.phases[0].completedAt).toBeDefined();
    expect(result.phases[1].status).toBe("active");
    expect(result.phases[1].startedAt).toBeDefined();
    expect(result.completedAt).toBeUndefined();
  });

  it("sets completedAt when last phase completes", () => {
    const state = makeSimpleState({
      phases: [
        { name: "Architect", emoji: "📐", status: "done", startedAt: new Date().toISOString(), completedAt: new Date().toISOString() },
        { name: "Implement", emoji: "🔨", status: "done", startedAt: new Date().toISOString(), completedAt: new Date().toISOString() },
        { name: "Verify", emoji: "✅", status: "active", startedAt: new Date().toISOString() },
      ],
    });
    const result = advancePhase(state);

    expect(result.phases[2].status).toBe("done");
    expect(result.completedAt).toBeDefined();
  });

  it("returns unchanged state when no active phase", () => {
    const state = makeSimpleState({
      phases: [
        { name: "Architect", emoji: "📐", status: "done" },
        { name: "Implement", emoji: "🔨", status: "done" },
      ],
    });
    const result = advancePhase(state);
    expect(result).toBe(state);
  });

  it("updates currentPhase to next phase name", () => {
    const state = makeSimpleState();
    const result = advancePhase(state);
    expect(result.currentPhase).toBe("Implement");
  });

  it("does not mutate the original state", () => {
    const state = makeSimpleState();
    const original = JSON.stringify(state);
    advancePhase(state);
    expect(JSON.stringify(state)).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// addProgressEvent
// ---------------------------------------------------------------------------

describe("addProgressEvent", () => {
  it("pushes an event to progressLog", () => {
    const state = makeSimpleState();
    addProgressEvent(state, "phase_start", "Starting Architect");
    expect(state.progressLog).toHaveLength(1);
    expect(state.progressLog[0].type).toBe("phase_start");
    expect(state.progressLog[0].detail).toBe("Starting Architect");
  });

  it("timestamp is a valid ISO-8601 string", () => {
    const state = makeSimpleState();
    addProgressEvent(state, "mission_complete", "Done");
    const ts = state.progressLog[0].timestamp;
    expect(new Date(ts).toISOString()).toBe(ts);
  });

  it("accumulates multiple events in order", () => {
    const state = makeSimpleState();
    addProgressEvent(state, "phase_start", "Start");
    addProgressEvent(state, "phase_complete", "Complete");
    addProgressEvent(state, "mission_complete", "Done");
    expect(state.progressLog).toHaveLength(3);
    expect(state.progressLog.map(e => e.type)).toEqual([
      "phase_start",
      "phase_complete",
      "mission_complete",
    ]);
  });
});
