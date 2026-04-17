// extensions/agent-ascii.ts — Animated ASCII face emoticons
//
// Each mission phase role maps to an expressive kaomoji face:
//   Planner  → Thinking    ( • ᴗ - ) ✧   eyes shift, spark grows
//   Coder    → Determined  (ง •̀_•́)ง      fists raise, energy builds
//   Tester   → Investigating (☞ ͡° ͜ʖ ͡°)☞ eyes dart, magnify, gotcha
//   Auditor  → Scrutinizing (¬_¬")        squints, eyebrow, verdict
//   Reviewer → Judging     ( ͡° ͜ʖ ͡°)      chin stroke, ponder, approve
//   Verifier → Celebrating (˶ᵔ ᵕ ᵔ˶)     smile grows, sparkles, glow
//
// Sprites come in two sizes:
//   "full"    — 9 lines, for Mission Control overlay
//   "compact" — 3 lines, for the always-visible widget
//
// Special states:
//   "paused"    — sleeping face, zzz bubble, static
//   "completed" — triumphant face, star eyes, static
//
// Animation: 4 working frames per role, cycled by AgentAnimator.

import { PHASE_ROLE_MAP } from "./config.ts";

// ---------------------------------------------------------------------------
// Role mapping helpers
// ---------------------------------------------------------------------------

/**
 * Map a phase name to its sprite role.
 * Falls back to "coder" for unknown phases.
 */
export function getRoleForPhase(phaseName: string): SpriteRole {
  const role = PHASE_ROLE_MAP[phaseName];
  if (role && SPRITE_DATA[role]) return role;
  return "coder";
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SpriteRole = "planner" | "coder" | "tester" | "auditor" | "reviewer" | "verifier";
export type SpriteSize = "full" | "compact";
export type SpriteState = "working" | "paused" | "completed";

interface SpriteFrames {
  full: string[][];
  compact: string[][];
  /** Number of animation frames (indexes 0..frameCount-1) */
  frameCount: number;
}

// ---------------------------------------------------------------------------
// Sprite Data — Animated ASCII Face Emoticons
// ---------------------------------------------------------------------------

const SPRITE_DATA: Record<SpriteRole, SpriteFrames> = {
  // ═══════════════════════════════════════════════════════════════════════
  // PLANNER — Thinking Face ( • ᴗ - ) ✧
  // Eyes shift, thought bubble grows, spark appears, insight flash
  // ═══════════════════════════════════════════════════════════════════════
  planner: {
    frameCount: 4,
    full: [
      // Frame 0 — calm, gathering thoughts
      [
        "   .--.    ",
        "  / .. \\  ",
        " | ·  · | ",
        " |  ~~~  |",
        " |   _   |",
        "  \\    /  ",
        "   |..|   ",
        "   ·      ",
        "  ===     ",
      ],
      // Frame 1 — eyes shift, pondering
      [
        "   .--.    ",
        "  / .. \\  ",
        " |  · ·  |",
        " |  ~~~  |",
        " |   _   |",
        "  \\    /  ",
        "   |..|   ",
        "   ··     ",
        "  ===     ",
      ],
      // Frame 2 — spark appears
      [
        "   .--.    ",
        "  / .. \\  ",
        " | •  · | ",
        " |  ~○~  |",
        " |   _   |",
        "  \\    /  ",
        "   |*.|   ",
        "   ·*.    ",
        "  ===     ",
      ],
      // Frame 3 — insight! eyes sparkle
      [
        "   .--.    ",
        "  / .. \\  ",
        " | ✧  ✧ | ",
        " |  ~☆~  |",
        " |   _   |",
        "  \\    /  ",
        "   |✧✧|   ",
        "   ✧✧✧    ",
        "  ===     ",
      ],
    ],
    compact: [
      // Frame 0 — calm thinking
      [
        " .--. ",
        "|·  ·|",
        " |__| ",
      ],
      // Frame 1 — pondering
      [
        " .--. ",
        "| ·· |",
        " |__| ",
      ],
      // Frame 2 — spark
      [
        " .--. ",
        "|• · |",
        " |__| ",
      ],
      // Frame 3 — insight!
      [
        " .--. ",
        "|✧✧✧ |",
        " |__| ",
      ],
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CODER — Determined Face (ง •̀_•́)ง
  // Brow furrows, jaw sets, energy builds, power burst
  // ═══════════════════════════════════════════════════════════════════════
  coder: {
    frameCount: 4,
    full: [
      // Frame 0 — ready, focused
      [
        "  ╔════╗  ",
        "  ║o  o║  ",
        "  ║ ── ║  ",
        "  ║──皿──║",
        "  ╚════╝  ",
        "  ║    ║   ",
        "  ║    ║   ",
        "  ╚════╝   ",
        "  ╰──╯    ",
      ],
      // Frame 1 — typing, eyes narrow slightly
      [
        "  ╔════╗  ",
        "  ║•  •║  ",
        "  ║ ── ║  ",
        "  ║──皿──║",
        "  ╚════╝  ",
        "  ║    ║   ",
        "  ║ .. ║   ",
        "  ╚════╝   ",
        "  ╰──╯    ",
      ],
      // Frame 2 — focused, brow furrows
      [
        "  ╔════╗  ",
        "  ║• - •║ ",
        "  ║ ── ║  ",
        "  ║──皿──║",
        "  ╚════╝  ",
        "  ║    ║   ",
        "  ║ ## ║   ",
        "  ╚════╝   ",
        "  ╰──╯    ",
      ],
      // Frame 3 — power! code committed
      [
        "  ╔════╗  ",
        "  ║★  ★║  ",
        "  ║ ── ║  ",
        "  ║──▼──║",
        "  ╚════╝  ",
        "  ║    ║   ",
        "  ║ ██ ║   ",
        "  ╚════╝   ",
        "  ╰──╯    ",
      ],
    ],
    compact: [
      // Frame 0 — ready
      [
        " ╔══╗",
        "║o o║",
        " ╚══╝",
      ],
      // Frame 1 — typing
      [
        " ╔══╗",
        "║• •║",
        " ╚══╝",
      ],
      // Frame 2 — focused
      [
        " ╔══╗",
        "║•-•║",
        " ╚══╝",
      ],
      // Frame 3 — power
      [
        " ╔══╗",
        "║★ ★║",
        " ╚══╝",
      ],
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TESTER — Investigating Face (☞ ͡° ͜ʖ ͡°)☞
  // Eyes dart, magnifying, suspicious, gotcha!
  // ═══════════════════════════════════════════════════════════════════════
  tester: {
    frameCount: 4,
    full: [
      // Frame 0 — lurking, suspicious
      [
        "  ╭────╮  ",
        "  │>  <│  ",
        "  │ ── │  ",
        "  │ ω  │  ",
        "  ╰────╯  ",
        "  ○        ",
        "           ",
        "           ",
        "  ══════  ",
      ],
      // Frame 1 — eyes dart right
      [
        "  ╭────╮  ",
        "  │> >>│  ",
        "  │ ── │  ",
        "  │ ω  │  ",
        "  ╰────╯  ",
        "  ○○       ",
        "           ",
        "           ",
        "  ══════  ",
      ],
      // Frame 2 — magnifying
      [
        "  ╭────╮  ",
        "  │>> <│  ",
        "  │ ── │  ",
        "  │ ○  │  ",
        "  ╰────╯  ",
        "  ○○○      ",
        "           ",
        "           ",
        "  ══════  ",
      ],
      // Frame 3 — gotcha! all green
      [
        "  ╭────╮  ",
        "  │★  ★│  ",
        "  │ ── │  ",
        "  │ ▼  │  ",
        "  ╰────╯  ",
        "  ●●●      ",
        "           ",
        "           ",
        "  ══════  ",
      ],
    ],
    compact: [
      // Frame 0 — suspicious
      [
        " ╭──╮",
        "│> <│",
        " ╰──╯",
      ],
      // Frame 1 — darting
      [
        " ╭──╮",
        "│>> │",
        " ╰──╯",
      ],
      // Frame 2 — magnify
      [
        " ╭──╮",
        "│> ○│",
        " ╰──╯",
      ],
      // Frame 3 — gotcha
      [
        " ╭──╮",
        "│★ ★│",
        " ╰──╯",
      ],
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // AUDITOR — Scrutinizing Face (¬_¬")
  // Squints, eyebrow raises, scanning, verdict
  // ═══════════════════════════════════════════════════════════════════════
  auditor: {
    frameCount: 4,
    full: [
      // Frame 0 — squinting, scanning left
      [
        "  ╔════╗  ",
        "  ║¬  ¬║  ",
        "  ║ ── ║  ",
        "  ║ ┸  ║  ",
        "  ╚════╝  ",
        "  <        ",
        "           ",
        "           ",
        "  ══════  ",
      ],
      // Frame 1 — eyebrow raises, scanning mid
      [
        "  ╔════╗  ",
        "  ║¬  ¬║  ",
        "  ║ ── ║  ",
        "  ║ ┸  ║  ",
        "  ╚════╝  ",
        "    >      ",
        "           ",
        "           ",
        "  ══════  ",
      ],
      // Frame 2 — focused squint, scanning right
      [
        "  ╔════╗  ",
        "  ║-  -║  ",
        "  ║ ── ║  ",
        "  ║ ┸  ║  ",
        "  ╚════╝  ",
        "      >    ",
        "           ",
        "           ",
        "  ══════  ",
      ],
      // Frame 3 — verdict! all clear
      [
        "  ╔════╗  ",
        "  ║✓  ✓║  ",
        "  ║ ── ║  ",
        "  ║ ▼  ║  ",
        "  ╚════╝  ",
        "   ✓✓✓    ",
        "           ",
        "           ",
        "  ══════  ",
      ],
    ],
    compact: [
      // Frame 0 — squinting
      [
        " ╔══╗",
        "║¬ ¬║",
        " ╚══╝",
      ],
      // Frame 1 — eyebrow
      [
        " ╔══╗",
        "║¬ ¬║",
        " ╚══╝",
      ],
      // Frame 2 — focused
      [
        " ╔══╗",
        "║- -║",
        " ╚══╝",
      ],
      // Frame 3 — verdict
      [
        " ╔══╗",
        "║✓ ✓║",
        " ╚══╝",
      ],
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // REVIEWER — Judging Face ( ͡° ͜ʖ ͡°)
  // Chin stroke, ponder, consider, approve
  // ═══════════════════════════════════════════════════════════════════════
  reviewer: {
    frameCount: 4,
    full: [
      // Frame 0 — observing, neutral
      [
        "  ╔════╗  ",
        "  ║°  °║  ",
        "  ║ ── ║  ",
        "  ║ ʖ  ║  ",
        "  ╚════╝  ",
        "    ◡      ",
        "           ",
        "           ",
        "  ══════  ",
      ],
      // Frame 1 — chin stroke, pondering
      [
        "  ╔════╗  ",
        "  ║°  °║  ",
        "  ║ ── ║  ",
        "  ║ ʖ  ║  ",
        "  ╚════╝  ",
        "    ◡ ✋    ",
        "           ",
        "           ",
        "  ══════  ",
      ],
      // Frame 2 — hmm, eyes narrow
      [
        "  ╔════╗  ",
        "  ║-  -║  ",
        "  ║ ── ║  ",
        "  ║ ʖ  ║  ",
        "  ╚════╝  ",
        "    ◡ ✋    ",
        "           ",
        "           ",
        "  ══════  ",
      ],
      // Frame 3 — approved! impressed
      [
        "  ╔════╗  ",
        "  ║✧  ✧║  ",
        "  ║ ── ║  ",
        "  ║ ▼  ║  ",
        "  ╚════╝  ",
        "    ◡ ✋    ",
        "           ",
        "           ",
        "  ══════  ",
      ],
    ],
    compact: [
      // Frame 0 — observing
      [
        " ╔══╗",
        "║° °║",
        " ╚══╝",
      ],
      // Frame 1 — pondering
      [
        " ╔══╗",
        "║° °║",
        " ╚══╝",
      ],
      // Frame 2 — hmm
      [
        " ╔══╗",
        "║- -║",
        " ╚══╝",
      ],
      // Frame 3 — approved
      [
        " ╔══╗",
        "║✧ ✧║",
        " ╚══╝",
      ],
    ],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // VERIFIER — Celebrating Face (˶ᵔ ᵕ ᵔ˶)
  // Smile grows, sparkles appear, full glow
  // ═══════════════════════════════════════════════════════════════════════
  verifier: {
    frameCount: 4,
    full: [
      // Frame 0 — content, small smile
      [
        "  ╔════╗  ",
        "  ║•  •║  ",
        "  ║ ── ║  ",
        "  ║ ▽  ║  ",
        "  ╚════╝  ",
        "           ",
        "           ",
        "           ",
        "  ══════  ",
      ],
      // Frame 1 — smile widens
      [
        "  ╔════╗  ",
        "  ║ᵔ  ᵔ║  ",
        "  ║ ── ║  ",
        "  ║ ▼  ║  ",
        "  ╚════╝  ",
        "    ✧      ",
        "           ",
        "           ",
        "  ══════  ",
      ],
      // Frame 2 — sparkles appear
      [
        "  ╔════╗  ",
        "  ║ᵔ  ᵔ║  ",
        "  ║ ── ║  ",
        "  ║ ▽▽ ║  ",
        "  ╚════╝  ",
        "   ✧ ✧    ",
        "           ",
        "           ",
        "  ══════  ",
      ],
      // Frame 3 — full glow, celebration!
      [
        "  ╔════╗  ",
        "  ║★  ★║  ",
        "  ║ ── ║  ",
        "  ║ ▼▼ ║  ",
        "  ╚════╝  ",
        "  ✧ ✧ ✧  ",
        "           ",
        "           ",
        "  ══════  ",
      ],
    ],
    compact: [
      // Frame 0 — content
      [
        " ╔══╗",
        "║• •║",
        " ╚══╝",
      ],
      // Frame 1 — smiling
      [
        " ╔══╗",
        "║ᵔ ᵔ║",
        " ╚══╝",
      ],
      // Frame 2 — sparkling
      [
        " ╔══╗",
        "║ᵔ ᵔ║",
        " ╚══╝",
      ],
      // Frame 3 — glow!
      [
        " ╔══╗",
        "║★ ★║",
        " ╚══╝",
      ],
    ],
  },
};

// ---------------------------------------------------------------------------
// Special State Sprites
// ---------------------------------------------------------------------------

const PAUSED_COMPACT: string[] = [
  " ╔══╗",
  "║- -║",
  " ╚zz╝",
];

const COMPLETED_COMPACT: string[] = [
  " ╔══╗",
  "║★ ★║",
  " ╚▽▽╝",
];

const PAUSED_FULL: string[] = [
  "  ╔════╗  ",
  "  ║-  -║  ",
  "  ║ ── ║  ",
  "  ║    ║  ",
  "  ╚════╝  ",
  "   zzz     ",
  "           ",
  "           ",
  "  ══════  ",
];

const COMPLETED_FULL: string[] = [
  "  ╔════╗  ",
  "  ║★  ★║  ",
  "  ║ ── ║  ",
  "  ║ ▼▼ ║  ",
  "  ╚════╝  ",
  "  ✧ ✧ ✧  ",
  "           ",
  "           ",
  "  ══════  ",
];

// ---------------------------------------------------------------------------
// Render Functions
// ---------------------------------------------------------------------------

/**
 * Render a single agent sprite.
 *
 * @param role       The face role to render
 * @param frameIndex Animation frame (0..3), modulo frameCount
 * @param size       "full" (9 lines) or "compact" (3 lines)
 * @param state      "working" (animated), "paused" (sleeping), "completed" (star eyes)
 * @returns Array of strings, one per line
 */
export function renderAgent(
  role: SpriteRole,
  frameIndex: number,
  size: SpriteSize,
  state: SpriteState,
): string[] {
  // Special states override role-specific art
  if (state === "paused") {
    return size === "full" ? [...PAUSED_FULL] : [...PAUSED_COMPACT];
  }
  if (state === "completed") {
    return size === "full" ? [...COMPLETED_FULL] : [...COMPLETED_COMPACT];
  }

  const data = SPRITE_DATA[role];
  if (!data) return [];

  const frames = size === "full" ? data.full : data.compact;
  const idx = frameIndex % data.frameCount;
  return [...(frames[idx] ?? frames[0])];
}

/**
 * Render multiple agents side-by-side (compact only).
 * Each agent animates with an offset frame index for visual variety.
 *
 * @param count      Number of agents (1-3)
 * @param role       The face role for all agents
 * @param frameIndex Base animation frame
 * @param state      Sprite state
 * @returns Array of strings, one per line
 */
export function renderMultiAgent(
  count: number,
  role: SpriteRole,
  frameIndex: number,
  state: SpriteState,
): string[] {
  const n = Math.min(Math.max(count, 1), 3);

  if (n === 1) {
    return renderAgent(role, frameIndex, "compact", state);
  }

  // Render each agent with offset timing
  const agents: string[][] = [];
  for (let i = 0; i < n; i++) {
    const offsetFrame = (frameIndex + i) % 4;
    agents.push(renderAgent(role, offsetFrame, "compact", state));
  }

  // All compact sprites are 3 lines — combine side by side
  const lineCount = agents[0].length;
  const lines: string[] = [];
  for (let row = 0; row < lineCount; row++) {
    lines.push(agents.map((a) => a[row] ?? "").join(""));
  }
  return lines;
}

// ---------------------------------------------------------------------------
// AgentAnimator — manages setInterval for frame cycling
// ---------------------------------------------------------------------------

export class AgentAnimator {
  private frameIndex = 0;
  private interval: ReturnType<typeof setInterval> | null = null;
  private tui: { requestRender(): void } | null = null;
  private tickMs: number;

  constructor(tickMs = 500) {
    this.tickMs = tickMs;
  }

  /** Current frame index (0-based). */
  get currentFrame(): number {
    return this.frameIndex;
  }

  /**
   * Start the animation loop.
   * @param tui — The TUI instance from the widget/custom callback, used for requestRender()
   */
  start(tui: { requestRender(): void }): void {
    this.stop();
    this.tui = tui;
    this.frameIndex = 0;
    this.interval = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % 4;
      this.tui?.requestRender();
    }, this.tickMs);
  }

  /** Stop the animation and clear the interval. */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.tui = null;
  }

  /** Whether the animator is currently running. */
  get isRunning(): boolean {
    return this.interval !== null;
  }
}
