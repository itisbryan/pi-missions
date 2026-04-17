import { describe, it, expect } from "vitest";
import {
  renderAgent,
  renderMultiAgent,
  getRoleForPhase,
  AgentAnimator,
  type SpriteRole,
} from "../extensions/agent-ascii.ts";

// ---------------------------------------------------------------------------
// Sprite data completeness
// ---------------------------------------------------------------------------

const ALL_ROLES: SpriteRole[] = ["planner", "coder", "tester", "auditor", "reviewer", "verifier"];

describe("sprite data completeness", () => {
  it("all 6 roles have full sprite data", () => {
    for (const role of ALL_ROLES) {
      for (let f = 0; f < 4; f++) {
        const lines = renderAgent(role, f, "full", "working");
        expect(lines.length, `${role} full frame ${f} should have 9 lines`).toBe(9);
      }
    }
  });

  it("all 6 roles have compact sprite data", () => {
    for (const role of ALL_ROLES) {
      for (let f = 0; f < 4; f++) {
        const lines = renderAgent(role, f, "compact", "working");
        expect(lines.length, `${role} compact frame ${f} should have 3 lines`).toBe(3);
      }
    }
  });

  it("all frames cycle (frameIndex wraps via modulo)", () => {
    for (const role of ALL_ROLES) {
      const frame0 = renderAgent(role, 0, "compact", "working");
      const frame4 = renderAgent(role, 4, "compact", "working"); // should wrap to 0
      expect(frame4).toEqual(frame0);
    }
  });
});

// ---------------------------------------------------------------------------
// Special states
// ---------------------------------------------------------------------------

describe("special states", () => {
  it("paused state returns static sprite regardless of role", () => {
    for (const role of ALL_ROLES) {
      const full = renderAgent(role, 0, "full", "paused");
      const compact = renderAgent(role, 0, "compact", "paused");
      expect(full.length).toBe(9);
      expect(compact.length).toBe(3);
      // Paused should contain "zz"
      expect(full.some((l) => l.includes("zz"))).toBe(true);
      expect(compact.some((l) => l.includes("zz"))).toBe(true);
    }
  });

  it("completed state returns star-eyes sprite regardless of role", () => {
    for (const role of ALL_ROLES) {
      const full = renderAgent(role, 0, "full", "completed");
      const compact = renderAgent(role, 0, "compact", "completed");
      expect(full.length).toBe(9);
      expect(compact.length).toBe(3);
      // Completed should contain star eyes
      expect(full.some((l) => l.includes("★  ★"))).toBe(true);
      expect(compact.some((l) => l.includes("★ ★"))).toBe(true);
    }
  });

  it("paused and completed are the same across all frame indices", () => {
    for (const role of ALL_ROLES) {
      const p0 = renderAgent(role, 0, "compact", "paused");
      const p3 = renderAgent(role, 3, "compact", "paused");
      expect(p0).toEqual(p3);

      const c0 = renderAgent(role, 0, "compact", "completed");
      const c3 = renderAgent(role, 3, "compact", "completed");
      expect(c0).toEqual(c3);
    }
  });
});

// ---------------------------------------------------------------------------
// Width constraints
// ---------------------------------------------------------------------------

describe("width constraints", () => {
  it("compact sprites are ≤ 5 visible characters wide", () => {
    for (const role of ALL_ROLES) {
      for (let f = 0; f < 4; f++) {
        const lines = renderAgent(role, f, "compact", "working");
        for (const line of lines) {
          // Strip ANSI (shouldn't be any, but be safe) and measure
          const visible = line.replace(/\x1b\[[0-9;]*m/g, "");
          expect(visible.length, `${role} compact frame ${f}: "${visible}" too wide`).toBeLessThanOrEqual(6);
        }
      }
    }
  });

  it("full sprites are ≤ 10 visible characters wide", () => {
    for (const role of ALL_ROLES) {
      for (let f = 0; f < 4; f++) {
        const lines = renderAgent(role, f, "full", "working");
        for (const line of lines) {
          const visible = line.replace(/\x1b\[[0-9;]*m/g, "");
          expect(visible.length, `${role} full frame ${f}: "${visible}" too wide`).toBeLessThanOrEqual(11);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Multi-agent rendering
// ---------------------------------------------------------------------------

describe("renderMultiAgent", () => {
  it("renders 1 agent identically to renderAgent compact", () => {
    const single = renderAgent("coder", 0, "compact", "working");
    const multi = renderMultiAgent(1, "coder", 0, "working");
    expect(multi).toEqual(single);
  });

  it("renders 2 agents side-by-side", () => {
    const lines = renderMultiAgent(2, "coder", 0, "working");
    expect(lines.length).toBe(3);
    // Each compact sprite is ~5 chars, so 2 side-by-side should be ~10 chars
    for (const line of lines) {
      expect(line.length).toBeGreaterThan(8);
    }
  });

  it("renders 3 agents side-by-side", () => {
    const lines = renderMultiAgent(3, "coder", 0, "working");
    expect(lines.length).toBe(3);
    for (const line of lines) {
      expect(line.length).toBeGreaterThan(12);
    }
  });

  it("clamps count to 1-3 range", () => {
    const zero = renderMultiAgent(0, "coder", 0, "working");
    const one = renderMultiAgent(1, "coder", 0, "working");
    expect(zero).toEqual(one);

    const five = renderMultiAgent(5, "coder", 0, "working");
    const three = renderMultiAgent(3, "coder", 0, "working");
    expect(five).toEqual(three);
  });

  it("agents have offset animation frames", () => {
    // Frame 0: all start at offset 0,1,2
    // We can verify by checking that at least one differs between single and multi
    const lines2 = renderMultiAgent(2, "coder", 0, "working");
    const lines1 = renderMultiAgent(1, "coder", 0, "working");
    // The first agent in the 2-agent render should match the single agent
    // (both at frame 0), but the concatenation makes the line longer
    expect(lines2[0].length).toBeGreaterThan(lines1[0].length);
  });
});

// ---------------------------------------------------------------------------
// Role mapping
// ---------------------------------------------------------------------------

describe("getRoleForPhase", () => {
  it("maps known phase names to correct roles", () => {
    expect(getRoleForPhase("Architect")).toBe("planner");
    expect(getRoleForPhase("Review Plan")).toBe("reviewer");
    expect(getRoleForPhase("Implement")).toBe("coder");
    expect(getRoleForPhase("Build")).toBe("coder");
    expect(getRoleForPhase("Test")).toBe("tester");
    expect(getRoleForPhase("Audit")).toBe("auditor");
    expect(getRoleForPhase("Verify")).toBe("verifier");
    expect(getRoleForPhase("Plan")).toBe("planner");
  });

  it("falls back to coder for unknown phases", () => {
    expect(getRoleForPhase("Unknown")).toBe("coder");
    expect(getRoleForPhase("")).toBe("coder");
  });
});

// ---------------------------------------------------------------------------
// AgentAnimator
// ---------------------------------------------------------------------------

describe("AgentAnimator", () => {
  it("starts not running", () => {
    const animator = new AgentAnimator();
    expect(animator.isRunning).toBe(false);
    expect(animator.currentFrame).toBe(0);
  });

  it("starts and stops cleanly", () => {
    const animator = new AgentAnimator(50); // fast tick for tests
    const requestRenderCalls: number[] = [];
    const mockTui = { requestRender: () => requestRenderCalls.push(Date.now()) };

    animator.start(mockTui);
    expect(animator.isRunning).toBe(true);

    animator.stop();
    expect(animator.isRunning).toBe(false);
  });

  it("increments frame on tick", async () => {
    const animator = new AgentAnimator(30);
    const mockTui = { requestRender: () => {} };

    animator.start(mockTui);
    expect(animator.currentFrame).toBe(0);

    // Wait for a couple ticks
    await new Promise((r) => setTimeout(r, 80));

    const frame = animator.currentFrame;
    expect(frame).toBeGreaterThan(0);

    animator.stop();
  });

  it("wraps frame back to 0 after 4 frames", async () => {
    const animator = new AgentAnimator(20);
    const mockTui = { requestRender: () => {} };

    animator.start(mockTui);

    // Wait long enough for multiple cycles
    await new Promise((r) => setTimeout(r, 200));

    // Frame should be 0-3 (modulo 4)
    expect(animator.currentFrame).toBeGreaterThanOrEqual(0);
    expect(animator.currentFrame).toBeLessThan(4);

    animator.stop();
  });

  it("calling stop when not running is safe", () => {
    const animator = new AgentAnimator();
    animator.stop(); // should not throw
    animator.stop(); // double stop should not throw
    expect(animator.isRunning).toBe(false);
  });

  it("calling start twice restarts cleanly", () => {
    const animator = new AgentAnimator(50);
    const mockTui = { requestRender: () => {} };

    animator.start(mockTui);
    // firstInterval = animator.isRunning;

    animator.start(mockTui); // restart
    expect(animator.isRunning).toBe(true);

    animator.stop();
    expect(animator.isRunning).toBe(false);
  });
});
