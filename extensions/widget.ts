// extensions/widget.ts — Compact always-visible progress widget for pi-mission

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type {
  MissionState,
  MissionPhase,
} from "./types.ts";
import { formatDuration, truncate } from "./utils.ts";

// ---------------------------------------------------------------------------
// Internal State
// ---------------------------------------------------------------------------

/** Stored timeout ref so we can cancel auto-clear on reset/new mission. */
let widgetClearTimeout: ReturnType<typeof setTimeout> | null = null;

// ---------------------------------------------------------------------------
// Progress Bar Builders
// ---------------------------------------------------------------------------

/**
 * Build a text progress bar from mission phases.
 * done → █, active → ▓, pending/skipped → ░
 */
export function buildProgressBar(phases: MissionPhase[]): string {
  return phases
    .map((p) => {
      switch (p.status) {
        case "done":
          return "█";
        case "active":
          return "▓";
        case "skipped":
        case "pending":
        default:
          return "░";
      }
    })
    .join("");
}

// ---------------------------------------------------------------------------
// Widget Timer
// ---------------------------------------------------------------------------

/**
 * Start auto-clear timer for completed missions.
 * Clears any existing timer first, then schedules widget removal after 30s.
 * Returns the timeout ref for external cleanup.
 */
export function startWidgetTimer(
  ctx: Pick<ExtensionContext, "ui">,
  state: MissionState,
  callback?: () => void
): ReturnType<typeof setTimeout> {
  // Always clear previous timer
  if (widgetClearTimeout) {
    clearTimeout(widgetClearTimeout);
    widgetClearTimeout = null;
  }

  const timeout = setTimeout(() => {
    ctx.ui.setWidget("mission", undefined);
    widgetClearTimeout = null;
    callback?.();
  }, 30_000);

  widgetClearTimeout = timeout;
  return timeout;
}

// ---------------------------------------------------------------------------
// Main Widget Update
// ---------------------------------------------------------------------------

/**
 * Update the mission progress widget.
 *
 * Renders a compact, always-visible status line(s) above the editor.
 * Adapts layout based on mission mode and lifecycle state.
 */
export function updateWidget(
  ctx: Pick<ExtensionContext, "ui">,
  state: MissionState | null
): void {
  // Clear any pending auto-clear timer when state changes
  if (widgetClearTimeout) {
    clearTimeout(widgetClearTimeout);
    widgetClearTimeout = null;
  }

  // --- Null state: remove widget ---
  if (!state) {
    ctx.ui.setWidget("mission", undefined);
    return;
  }

  // --- Completed mission ---
  if (state.completedAt) {
    const elapsed = new Date(state.completedAt).getTime() - new Date(state.startedAt).getTime();
    const duration = formatDuration(elapsed);
    const desc = truncate(state.description, 60);

    ctx.ui.setWidget("mission", [`🎉 Mission complete (${duration}): ${desc}`]);

    // Auto-clear after 30s
    startWidgetTimer(ctx, state);
    return;
  }

  // --- Paused mission ---
  if (state.paused) {
    const pauseElapsed = state.pausedAt
      ? formatDuration(Date.now() - new Date(state.pausedAt).getTime())
      : "";
    const desc = truncate(state.description, 60);
    const pauseInfo = pauseElapsed ? ` (paused ${pauseElapsed})` : "";

    ctx.ui.setWidget("mission", [`⏸ PAUSED${pauseInfo} — ${desc}`]);
    return;
  }

  const lines = buildSimpleWidget(state);
  ctx.ui.setWidget("mission", lines);
}

// ---------------------------------------------------------------------------
// Mode-specific builders (internal)
// ---------------------------------------------------------------------------

function buildSimpleWidget(state: MissionState): string[] {
  const desc = truncate(state.description, 70);
  const phases = state.phases;

  const activeIdx = phases.findIndex((p) => p.status === "active");
  const doneCount = phases.filter((p) => p.status === "done").length;
  const totalCount = phases.length;
  const activePhase = activeIdx >= 0 ? phases[activeIdx] : null;
  const activeName = activePhase?.name ?? "—";
  const activeEmoji = activePhase?.emoji ?? "📋";

  const bar = buildProgressBar(phases);
  const phaseLabel = `${activeEmoji} Phase ${activeIdx >= 0 ? activeIdx + 1 : doneCount}/${totalCount}: ${activeName} (${doneCount}/${totalCount} done)`;

  return [`🎯 ${desc}`, `${bar} ${phaseLabel}`];
}


