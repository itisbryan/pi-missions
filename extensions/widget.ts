// extensions/widget.ts — Animated retro RPG widget for pi-mission
//
// Renders a compact always-visible status display above the editor using
// the theme-callback form of ctx.ui.setWidget(). Features:
//   - Animated retro RPG agent sprite (compact 3-line)
//   - Themed progress bar with retro styling (━ ╍ ─)
//   - Theme-aware colors (success, accent, muted, dim)
//   - Animation via AgentAnimator + tui.requestRender()
//   - Static paused (zz) and completed (* *) states

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { MissionState, MissionPhase } from "./types.ts";
import { formatDuration, truncate } from "./utils.ts";
import { AgentAnimator, getRoleForPhase, renderAgent } from "./agent-ascii.ts";

// ---------------------------------------------------------------------------
// Internal State
// ---------------------------------------------------------------------------

/** Stored timeout ref so we can cancel auto-clear on reset/new mission. */
let widgetClearTimeout: ReturnType<typeof setTimeout> | null = null;

/** Shared animator instance — persists across re-renders within a mission. */
let animator: AgentAnimator | null = null;

// /** Stored context for auto-clear timer. */
// let widgetCtx: Pick<ExtensionContext, "ui"> | null = null;

// ---------------------------------------------------------------------------
// Themed Progress Bar
// ---------------------------------------------------------------------------

/**
 * Build a themed retro-style progress bar.
 *
 * Uses ASCII characters:
 *   done    → = (equals, success color)
 *   active  → ~ (tilde, accent color)
 *   pending → - (dash, muted color)
 *   skipped → . (dot, dim color)
 *
 * Returns an object with the bar string segments (for themed coloring)
 * and a plain-text version.
 */
export function buildThemedProgressBar(
  phases: MissionPhase[],
  theme: { fg(color: string, text: string): string },
): { themed: string; plain: string; percentage: number } {
  const total = phases.length;
  const done = phases.filter((p) => p.status === "done").length;
  const percentage = total > 0 ? Math.round((done / total) * 100) : 0;

  const segments = phases.map((p) => {
    switch (p.status) {
      case "done":
        return { char: "=", color: "success" };
      case "active":
        return { char: "~", color: "accent" };
      case "skipped":
        return { char: ".", color: "dim" };
      case "pending":
      default:
        return { char: "-", color: "muted" };
    }
  });

  const themed = segments.map((s) => theme.fg(s.color, s.char)).join("");
  const plain = segments.map((s) => s.char).join("");

  return { themed, plain, percentage };
}

// ---------------------------------------------------------------------------
// Widget Timer
// ---------------------------------------------------------------------------

/**
 * Start auto-clear timer for completed missions.
 * Clears any existing timer first, then schedules widget removal after 30s.
 */
export function startWidgetTimer(
  ctx: Pick<ExtensionContext, "ui">,
  _state: MissionState,
  callback?: () => void,
): ReturnType<typeof setTimeout> {
  if (widgetClearTimeout) {
    clearTimeout(widgetClearTimeout);
    widgetClearTimeout = null;
  }

  const timeout = setTimeout(() => {
    stopAnimator();
    ctx.ui.setWidget("mission", undefined);
    widgetClearTimeout = null;
    callback?.();
  }, 30_000);

  widgetClearTimeout = timeout;
  return timeout;
}

// ---------------------------------------------------------------------------
// Animator helpers
// ---------------------------------------------------------------------------

function stopAnimator(): void {
  if (animator) {
    animator.stop();
    animator = null;
  }
}

/**
 * Get or create the shared animator. Starts it if the mission is active.
 */
function ensureAnimator(tui: { requestRender(): void }): AgentAnimator {
  if (!animator) {
    animator = new AgentAnimator(500);
  }
  if (!animator.isRunning) {
    animator.start(tui);
  }
  return animator;
}

// ---------------------------------------------------------------------------
// Render helpers (called inside theme callback)
// ---------------------------------------------------------------------------

function renderActiveWidget(
  state: MissionState,
  tui: { requestRender(): void },
  theme: { fg(color: string, text: string): string },
): { render(width: number): string[]; invalidate(): void } {
  // Ensure animator is running
  ensureAnimator(tui);

  return {
    render(width: number): string[] {
      // Re-read frame on each render tick
      const f = animator?.currentFrame ?? 0;
      const phases = state.phases;
      const activeIdx = phases.findIndex((p) => p.status === "active");
      const doneCount = phases.filter((p) => p.status === "done").length;
      const totalCount = phases.length;
      const activePhase = activeIdx >= 0 ? phases[activeIdx] : null;
      const activeName = activePhase?.name ?? "—";
      const activeEmoji = activePhase?.emoji ?? "📋";

      // Determine sprite role
      const role = activePhase ? getRoleForPhase(activePhase.name) : "coder";

      // Render compact agent
      const agentLines = renderAgent(role, f, "compact", "working");

      // Build themed progress bar
      const bar = buildThemedProgressBar(phases, theme);

      // Build info lines
      const desc = truncate(state.description, width - 10);
      const phaseLabel = `${activeEmoji} Phase ${activeIdx >= 0 ? activeIdx + 1 : doneCount}/${totalCount}: ${activeName}`;
      const elapsed = activePhase?.startedAt
        ? formatDuration(Date.now() - new Date(activePhase.startedAt).getTime())
        : "";
      const elapsedLabel = elapsed ? `elapsed: ${elapsed}` : "";

      // Compose lines: agent + progress side by side
      const lines: string[] = [];

      // Line 0: agent head + progress bar + percentage
      const pctStr = ` ${bar.percentage}%`;
      lines.push(agentLines[0] + " " + bar.themed + theme.fg("accent", pctStr));

      // Line 1: agent body + phase label
      lines.push(agentLines[1] + " " + theme.fg("text", phaseLabel));

      // Line 2: agent feet + elapsed / description
      const footer = elapsedLabel
        ? theme.fg("dim", elapsedLabel)
        : theme.fg("dim", truncate(desc, width - 10));
      lines.push(agentLines[2] + " " + footer);

      return lines;
    },

    invalidate(): void {
      stopAnimator();
    },
  };
}

function renderPausedWidget(
  state: MissionState,
  theme: { fg(color: string, text: string): string },
): { render(width: number): string[]; invalidate(): void } {
  // Capture current snapshot for consistent render
  const pauseElapsed = state.pausedAt
    ? formatDuration(Date.now() - new Date(state.pausedAt).getTime())
    : "";
  const desc = truncate(state.description, 50);
  const pauseInfo = pauseElapsed ? ` (${pauseElapsed})` : "";

  const phases = state.phases;
  const activeIdx = phases.findIndex((p) => p.status === "active");
  const activePhase = activeIdx >= 0 ? phases[activeIdx] : null;
  const activeName = activePhase?.name ?? "—";
  const activeEmoji = activePhase?.emoji ?? "📋";
  const doneCount = phases.filter((p) => p.status === "done").length;
  const totalCount = phases.length;

  const bar = buildThemedProgressBar(phases, theme);
  const pctStr = ` ${bar.percentage}%`;

  // Static paused agent
  const agentLines = renderAgent("coder", 0, "compact", "paused");

  return {
    render(_width: number): string[] {
      const lines: string[] = [];

      // Line 0: sleeping agent + progress bar
      lines.push(agentLines[0] + " " + bar.themed + theme.fg("accent", pctStr));

      // Line 1: sleeping body + pause info
      const pauseLabel = theme.fg("warning", `⏸ PAUSED${pauseInfo} — ${desc}`);
      lines.push(agentLines[1] + " " + pauseLabel);

      // Line 2: feet + phase info
      const phaseLabel = theme.fg("dim", `${activeEmoji} Phase ${activeIdx >= 0 ? activeIdx + 1 : doneCount}/${totalCount}: ${activeName}`);
      lines.push(agentLines[2] + " " + phaseLabel);

      return lines;
    },

    invalidate(): void {
      // No animation to stop for paused state
    },
  };
}

function renderCompletedWidget(
  state: MissionState,
  theme: { fg(color: string, text: string): string },
): { render(width: number): string[]; invalidate(): void } {
  const elapsed = new Date(state.completedAt!).getTime() - new Date(state.startedAt).getTime();
  const duration = formatDuration(elapsed);
  const desc = truncate(state.description, 50);

  // Full progress bar (all done)
  const bar = buildThemedProgressBar(state.phases, theme);
  const pctStr = ` ${bar.percentage}%`;

  // Static completed agent (star eyes)
  const agentLines = renderAgent("coder", 0, "compact", "completed");

  return {
    render(_width: number): string[] {
      const lines: string[] = [];

      // Line 0: star-eyes agent + full bar
      lines.push(agentLines[0] + " " + bar.themed + theme.fg("accent", pctStr));

      // Line 1: star body + celebration
      const celebLabel = theme.fg("success", `🎉 Mission complete (${duration})`);
      lines.push(agentLines[1] + " " + celebLabel);

      // Line 2: feet + description
      lines.push(agentLines[2] + " " + theme.fg("dim", desc));

      return lines;
    },

    invalidate(): void {
      // No animation to stop
    },
  };
}

// ---------------------------------------------------------------------------
// Main Widget Update
// ---------------------------------------------------------------------------

/**
 * Update the mission progress widget.
 *
 * Uses the theme-callback form of setWidget for themed, animated rendering.
 * Manages the AgentAnimator lifecycle: starts for active missions, stops
 * for paused/completed/cleared states.
 */
export function updateWidget(
  ctx: Pick<ExtensionContext, "ui">,
  state: MissionState | null,
): void {
  // Clear any pending auto-clear timer when state changes
  if (widgetClearTimeout) {
    clearTimeout(widgetClearTimeout);
    widgetClearTimeout = null;
  }

  // Store context for timer callbacks
  // widgetCtx = ctx;

  // --- Null state: remove widget + stop animation ---
  if (!state) {
    stopAnimator();
    // currentWidgetState = null;
    ctx.ui.setWidget("mission", undefined);
    return;
  }

  // currentWidgetState = state;

  // --- Completed mission ---
  if (state.completedAt) {
    stopAnimator();

    ctx.ui.setWidget("mission", (tui: any, theme: any) =>
      renderCompletedWidget(state, theme),
    );

    // Auto-clear after 30s
    startWidgetTimer(ctx, state);
    return;
  }

  // --- Paused mission ---
  if (state.paused) {
    stopAnimator();

    ctx.ui.setWidget("mission", (tui: any, theme: any) =>
      renderPausedWidget(state, theme),
    );
    return;
  }

  // --- Active mission: animated themed widget ---
  ctx.ui.setWidget("mission", (tui: any, theme: any) =>
    renderActiveWidget(state, tui, theme),
  );
}
