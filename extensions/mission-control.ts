// extensions/mission-control.ts — Select-based Mission Control overlay

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type {
  MissionState,
} from "./types.ts";
import { formatDuration, getPhaseIcon, truncate } from "./utils.ts";
import { formatProgressLog } from "./progress-log.ts";
import { showRoleModelAssigner } from "./role-assigner.ts";

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

export interface MissionControlCallbacks {
  onPause: () => void;
  onResume: () => void;
  onSkip: () => Promise<boolean>;
  onDone: () => Promise<boolean>;
  onRedirect: (message: string) => void;
  onModelChange?: (role: string, modelId: string) => void;
  getAvailableModels?: () => { label: string; id: string }[];
}

export type MissionControlResult =
  | { action: "close" }
  | { action: "redirect"; message: string };

// ---------------------------------------------------------------------------
// Internal Constants
// ---------------------------------------------------------------------------

const MAX_LOG_EVENTS = 5;
const SEPARATOR = "─".repeat(48);
const HEADER_LINE = "━".repeat(48);

// ---------------------------------------------------------------------------
// Dashboard Builder
// ---------------------------------------------------------------------------

/**
 * Build the text lines shown above the action selector.
 * Adapts layout to the mission mode (simple / full / minimal).
 */
function buildDashboard(state: MissionState): string[] {
  const lines: string[] = [];
  const elapsed = formatDuration(Date.now() - new Date(state.startedAt).getTime());

  // ── Header ──────────────────────────────────────────────────────────────
  lines.push(HEADER_LINE);
  lines.push("  🎯  M I S S I O N   C O N T R O L");
  lines.push(HEADER_LINE);
  lines.push("");
  lines.push(`  ${truncate(state.description, 60)}`);
  lines.push(`  Mode: ${state.mode}  │  Autonomy: ${state.autonomy}  │  Elapsed: ${elapsed}`);

  // ── Status Bar ──────────────────────────────────────────────────────────
  const statusIcon = state.paused ? "⏸" : state.completedAt ? "🎉" : "●";
  const statusLabel = state.paused
    ? "Paused"
    : state.completedAt
      ? "Complete"
      : "Running";
  const progress = buildProgressSummary(state);
  lines.push(`  ${statusIcon} ${statusLabel}  ${progress}`);
  lines.push("");

  // ── Mode-specific panels ────────────────────────────────────────────────
  lines.push(...buildSimpleModePanel(state));

  // ── Progress Log ────────────────────────────────────────────────────────
  if (state.progressLog.length > 0) {
    lines.push(SEPARATOR);
    lines.push("  📜 Recent Activity");
    const logLines = formatProgressLog(state.progressLog, MAX_LOG_EVENTS);
    for (const line of logLines) {
      lines.push(`    ${line}`);
    }
  }

  // ── Model Assignment ────────────────────────────────────────────────────
  const models = Object.entries(state.modelAssignment);
  if (models.length > 0) {
    lines.push(SEPARATOR);
    lines.push("  🤖 Models");
    for (const [role, model] of models) {
      lines.push(`    ${role}: ${model}`);
    }
  }

  lines.push(SEPARATOR);
  lines.push("  ↑↓ Navigate  │  Enter Select  │  Esc Close");
  lines.push("");

  return lines;
}

/**
 * Compact progress fraction, e.g. "3/8 features" or "2/6 phases".
 */
function buildProgressSummary(state: MissionState): string {
  const done = state.phases.filter((p) => p.status === "done").length;
  return `(${done}/${state.phases.length} phases)`;
}

// ---------------------------------------------------------------------------
// Simple / Minimal Mode Panel
// ---------------------------------------------------------------------------

function buildSimpleModePanel(state: MissionState): string[] {
  const lines: string[] = [];

  lines.push(SEPARATOR);
  lines.push("  📋 Phases");

  for (const phase of state.phases) {
    const icon = getPhaseIcon(phase.status);
    const active = phase.status === "active" ? " ◄" : "";
    const elapsed =
      phase.status === "active" && phase.startedAt
        ? ` (${formatDuration(Date.now() - new Date(phase.startedAt).getTime())})`
        : "";
    lines.push(`    ${icon} ${phase.emoji} ${phase.name}${elapsed}${active}`);
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Action Menu
// ---------------------------------------------------------------------------

type ActionKey =
  | "pause"
  | "resume"
  | "skip"
  | "done"
  | "redirect"
  | "models"
  | "close";

interface ActionOption {
  key: ActionKey;
  label: string;
}

/**
 * Build the list of available actions based on current state.
 */
function buildActions(state: MissionState): ActionOption[] {
  const actions: ActionOption[] = [];

  // Pause / Resume toggle
  if (state.completedAt) {
    // No pause/resume for completed missions
  } else if (state.paused) {
    actions.push({ key: "resume", label: "▶ Resume mission" });
  } else {
    actions.push({ key: "pause", label: "⏸ Pause mission" });
  }

  // Skip current phase (only when running)
  if (!state.paused && !state.completedAt) {
    if (state.phases.some((p) => p.status === "active")) {
      actions.push({ key: "skip", label: "⏭ Skip current phase" });
    }
  }

  // Mark done
  if (!state.completedAt) {
    actions.push({ key: "done", label: "🎉 Mark mission done" });
  }

  // Redirect
  if (!state.completedAt) {
    actions.push({ key: "redirect", label: "↻ Redirect (send instruction)" });
  }

  // Model assignment
  actions.push({ key: "models", label: "🤖 Change model assignment" });

  actions.push({ key: "close", label: "✕ Close" });

  return actions;
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Show the Mission Control select-based overlay.
 *
 * Loops until the user picks Close (or presses Esc), executing inline
 * actions for pause, resume, skip, done, redirect, and model changes.
 */
export async function showMissionControl(
  ctx: ExtensionContext,
  state: MissionState | null,
  callbacks: MissionControlCallbacks,
  getLatestState?: () => MissionState | null,
): Promise<MissionControlResult> {
  if (!state) {
    ctx.ui.notify("No active mission.", "warning");
    return { action: "close" };
  }

  // Loop: show dashboard → pick action → execute → repeat
  while (true) {
    // Re-fetch latest state if getter provided (callbacks may have mutated it)
    if (getLatestState) {
      const latest = getLatestState();
      if (latest) state = latest;
    }

    const dashboard = buildDashboard(state);
    const actions = buildActions(state);
    const options = actions.map((a) => a.label);

    // Display as a select dialog — the title carries the dashboard text
    const title = dashboard.join("\n");
    const choice = await ctx.ui.select(title, options);

    // Esc or dismissed → close
    if (choice === undefined) {
      return { action: "close" };
    }

    const selected = actions.find((a) => a.label === choice);
    if (!selected) {
      return { action: "close" };
    }

    // Execute the chosen action
    switch (selected.key) {
      case "pause":
        callbacks.onPause();
        ctx.ui.notify("⏸ Mission paused.", "info");
        // Reflect state change for next loop iteration
        state = { ...state, paused: true, pausedAt: new Date().toISOString() };
        break;

      case "resume":
        callbacks.onResume();
        ctx.ui.notify("▶ Mission resumed.", "info");
        state = { ...state, paused: false, pausedAt: undefined };
        break;

      case "skip": {
        const confirmed = await callbacks.onSkip();
        if (confirmed) {
          ctx.ui.notify("⏭ Skipped.", "info");
        }
        // State was mutated by the callback — re-show with whatever the caller updated
        break;
      }

      case "done": {
        const confirmed = await callbacks.onDone();
        if (confirmed) {
          return { action: "close" };
        }
        break;
      }

      case "redirect": {
        const message = await ctx.ui.input(
          "Redirect: enter instruction for the agent",
          "e.g. focus on error handling first",
        );
        if (message && message.trim()) {
          callbacks.onRedirect(message.trim());
          ctx.ui.notify(`↻ Redirected: ${truncate(message.trim(), 40)}`, "info");
          return { action: "redirect", message: message.trim() };
        }
        break;
      }

      case "models": {
        const changed = await showModelAssignment(ctx, state, callbacks);
        if (changed && getLatestState) {
          const latest = getLatestState();
          if (latest) state = latest;
        }
        break;
      }

      case "close":
        return { action: "close" };
    }
  }
}

// ---------------------------------------------------------------------------
// Sub-screens
// ---------------------------------------------------------------------------

/**
 * Infer template key from state — uses stored templateKey or falls back
 * to phase count heuristic for backward compatibility.
 */
function inferTemplateKey(state: MissionState): string {
  if (state.templateKey) return state.templateKey;
  // Backward compat: minimal has 3 phases, standard has 6
  return state.phases.length <= 3 ? "minimal" : "standard";
}

/**
 * Show the tabbed, searchable model assigner (same UI as initial setup)
 * pre-populated with the current model assignments.
 */
async function showModelAssignment(
  ctx: ExtensionContext,
  state: MissionState,
  callbacks: MissionControlCallbacks,
): Promise<boolean> {
  const canEdit = !!callbacks.onModelChange;

  if (!canEdit) {
    // Read-only fallback
    const models = Object.entries(state.modelAssignment);
    const lines = [
      HEADER_LINE,
      "  \uD83E\uDD16 Model Assignment",
      HEADER_LINE,
      "",
      ...(models.length > 0
        ? models.map(([role, modelId]) => `  ${role}: ${modelId}`)
        : ["  No model assignments configured."]),
      "",
    ];
    await ctx.ui.select(lines.join("\n"), ["\u2190 Back"]);
    return false;
  }

  const templateKey = inferTemplateKey(state);

  // Reuse the same tabbed, searchable assigner with current assignments
  const updated = await showRoleModelAssigner(
    ctx as any, // ExtensionContext is a superset at runtime
    templateKey,
    state.modelAssignment,
  );

  if (!updated) return false;

  // Apply changes for each role that differs
  let changed = false;
  for (const [role, modelId] of Object.entries(updated)) {
    if (modelId && modelId !== state.modelAssignment[role]) {
      callbacks.onModelChange!(role, modelId);
      changed = true;
    }
  }

  if (changed) {
    ctx.ui.notify("\uD83E\uDD16 Model assignments updated.", "info");
  }
  return changed;
}


