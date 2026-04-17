import { describe, it, expect } from "vitest";
import {
  formatDuration,
  getPhaseIcon,
  extractTextFromMessage,
  truncate,
  generateId,
} from "../extensions/utils.ts";
import { buildThemedProgressBar } from "../extensions/widget.ts";
import type { MissionPhase } from "../extensions/types.ts";

// ---------------------------------------------------------------------------
// formatDuration
// ---------------------------------------------------------------------------

describe("formatDuration", () => {
  it("formats seconds", () => {
    expect(formatDuration(5_000)).toBe("5s");
    expect(formatDuration(59_000)).toBe("59s");
    expect(formatDuration(0)).toBe("0s");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(60_000)).toBe("1m 0s");
    expect(formatDuration(90_000)).toBe("1m 30s");
    expect(formatDuration(3_540_000)).toBe("59m 0s");
  });

  it("formats hours and minutes", () => {
    expect(formatDuration(3_600_000)).toBe("1h 0m");
    expect(formatDuration(5_400_000)).toBe("1h 30m");
    expect(formatDuration(7_320_000)).toBe("2h 2m");
  });
});

// ---------------------------------------------------------------------------
// getPhaseIcon
// ---------------------------------------------------------------------------

describe("getPhaseIcon", () => {
  it("maps done → ✅", () => expect(getPhaseIcon("done")).toBe("✅"));
  it("maps active → 🔄", () => expect(getPhaseIcon("active")).toBe("🔄"));
  it("maps skipped → ⏭️", () => expect(getPhaseIcon("skipped")).toBe("⏭️"));
  it("maps failed → ❌", () => expect(getPhaseIcon("failed")).toBe("❌"));
  it("maps pending → ⬜ (default)", () => expect(getPhaseIcon("pending")).toBe("⬜"));
  it("maps unknown → ⬜ (default)", () => expect(getPhaseIcon("unknown")).toBe("⬜"));
});

// ---------------------------------------------------------------------------
// extractTextFromMessage
// ---------------------------------------------------------------------------

describe("extractTextFromMessage", () => {
  it("extracts and joins text blocks", () => {
    const message = {
      content: [
        { type: "text", text: "Hello World" },
        { type: "text", text: "Second block" },
      ],
    };
    expect(extractTextFromMessage(message)).toBe("hello world second block");
  });

  it("filters out non-text blocks", () => {
    const message = {
      content: [
        { type: "tool_use", id: "abc", name: "bash", input: {} },
        { type: "text", text: "Result here" },
      ],
    };
    expect(extractTextFromMessage(message)).toBe("result here");
  });

  it("returns empty string for null message", () => {
    expect(extractTextFromMessage(null)).toBe("");
  });

  it("returns empty string for message with no content", () => {
    expect(extractTextFromMessage({})).toBe("");
  });

  it("returns empty string for empty content array", () => {
    expect(extractTextFromMessage({ content: [] })).toBe("");
  });

  it("lowercases all text", () => {
    const message = { content: [{ type: "text", text: "Phase 1 COMPLETE" }] };
    expect(extractTextFromMessage(message)).toBe("phase 1 complete");
  });
});

// ---------------------------------------------------------------------------
// truncate
// ---------------------------------------------------------------------------

describe("truncate", () => {
  it("returns string unchanged when within limit", () => {
    expect(truncate("hello", 10)).toBe("hello");
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("truncates with ellipsis when over limit", () => {
    expect(truncate("hello world", 8)).toBe("hello w…");
  });

  it("handles empty string", () => {
    expect(truncate("", 10)).toBe("");
  });

  it("ellipsis counts as 1 char", () => {
    const result = truncate("abcdef", 4);
    expect(result).toBe("abc…");
    expect(result.length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// generateId
// ---------------------------------------------------------------------------

describe("generateId", () => {
  it("returns a non-empty string", () => {
    expect(typeof generateId()).toBe("string");
    expect(generateId().length).toBeGreaterThan(0);
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });

  it("contains a hyphen separator", () => {
    expect(generateId()).toContain("-");
  });
});

// ---------------------------------------------------------------------------
// buildThemedProgressBar
// ---------------------------------------------------------------------------

// Minimal mock theme that just returns the text unstyled
const mockTheme = { fg: (_color: string, text: string) => text };

function phase(name: string, status: MissionPhase["status"]): MissionPhase {
  return { name, emoji: "📋", status };
}

describe("buildThemedProgressBar", () => {
  it("returns 0% for all pending phases", () => {
    const bar = buildThemedProgressBar(
      [phase("A", "pending"), phase("B", "pending"), phase("C", "pending")],
      mockTheme,
    );
    expect(bar.percentage).toBe(0);
    expect(bar.plain).toBe("───");
  });

  it("returns 100% for all done phases", () => {
    const bar = buildThemedProgressBar(
      [phase("A", "done"), phase("B", "done"), phase("C", "done")],
      mockTheme,
    );
    expect(bar.percentage).toBe(100);
    expect(bar.plain).toBe("━━━");
  });

  it("shows correct characters per status", () => {
    const bar = buildThemedProgressBar(
      [phase("A", "done"), phase("B", "active"), phase("C", "pending"), phase("D", "skipped")],
      mockTheme,
    );
    expect(bar.plain).toBe("━╍─┄");
    expect(bar.percentage).toBe(25);
  });

  it("returns empty bar for zero phases", () => {
    const bar = buildThemedProgressBar([], mockTheme);
    expect(bar.plain).toBe("");
    expect(bar.percentage).toBe(0);
  });

  it("calculates percentage correctly", () => {
    const bar = buildThemedProgressBar(
      [phase("A", "done"), phase("B", "done"), phase("C", "active")],
      mockTheme,
    );
    expect(bar.percentage).toBe(67); // 2/3 = 66.67 → rounds to 67
  });
});
