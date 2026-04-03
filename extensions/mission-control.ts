// extensions/mission-control.ts — Select-based Mission Control overlay

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type {
  MissionState,
  MissionFeature,
  ValidationAssertion,
} from "./types.ts";
import { formatDuration, getFeatureIcon, getPhaseIcon, truncate } from "./utils.ts";
import { formatProgressLog } from "./progress-log.ts";
import { showModelPicker } from "./model-picker.ts";

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

const MAX_FEATURES_SHOWN = 10;
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
  if (state.mode === "full" && state.milestones) {
    lines.push(...buildFullModePanel(state));
  } else {
    lines.push(...buildSimpleModePanel(state));
  }

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
  if (state.mode === "full" && state.milestones) {
    const allFeatures = state.milestones.flatMap((m) => m.features);
    const done = allFeatures.filter((f) => f.status === "done").length;
    return `(${done}/${allFeatures.length} features)`;
  }

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
// Full Mode Panel
// ---------------------------------------------------------------------------

function buildFullModePanel(state: MissionState): string[] {
  const lines: string[] = [];

  // Current feature spotlight
  if (state.currentFeature && state.milestones) {
    const feature = findFeature(state.milestones.flatMap((m) => m.features), state.currentFeature);
    if (feature) {
      lines.push(SEPARATOR);
      lines.push("  🔧 Current Feature");
      lines.push(`    ${getFeatureIcon(feature.status)} ${truncate(feature.description, 50)}`);
      lines.push(`    Milestone: ${feature.milestone}`);
      if (feature.startedAt) {
        lines.push(`    Elapsed: ${formatDuration(Date.now() - new Date(feature.startedAt).getTime())}`);
      }
      lines.push("");
    }
  }

  // Milestones & features list
  if (state.milestones) {
    lines.push(SEPARATOR);
    lines.push("  📦 Milestones & Features");

    let featuresShown = 0;

    for (const milestone of state.milestones) {
      const mIcon =
        milestone.status === "done" || milestone.status === "sealed"
          ? "✅"
          : milestone.status === "active"
            ? "🔄"
            : "⬜";
      const doneCount = milestone.features.filter((f) => f.status === "done").length;
      lines.push(`    ${mIcon} ${milestone.name} (${doneCount}/${milestone.features.length})`);

      for (const feature of milestone.features) {
        if (featuresShown >= MAX_FEATURES_SHOWN) {
          const remaining =
            state.milestones.flatMap((m) => m.features).length - MAX_FEATURES_SHOWN;
          lines.push(`      … and ${remaining} more`);
          return lines;
        }
        const fIcon = getFeatureIcon(feature.status);
        const active = feature.id === state.currentFeature ? " ◄" : "";
        lines.push(`      ${fIcon} ${truncate(feature.description, 42)}${active}`);
        featuresShown++;
      }
    }
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Validation Panel
// ---------------------------------------------------------------------------

function buildValidationPanel(state: MissionState): string[] {
  const lines: string[] = [];
  const assertions = state.validationAssertions ?? [];

  if (assertions.length === 0) {
    lines.push("  No validation assertions defined.");
    return lines;
  }

  lines.push(HEADER_LINE);
  lines.push("  ✔ Validation Assertions");
  lines.push(HEADER_LINE);
  lines.push("");

  const grouped = groupBy(assertions, (a) => a.area);

  for (const [area, items] of Object.entries(grouped)) {
    const passed = items.filter((a) => a.status === "passed").length;
    lines.push(`  ${area} (${passed}/${items.length} passed)`);

    for (const assertion of items) {
      const icon = assertionIcon(assertion.status);
      lines.push(`    ${icon} ${assertion.title}`);
      if (assertion.evidence) {
        lines.push(`      └ ${truncate(assertion.evidence, 50)}`);
      }
    }
    lines.push("");
  }

  return lines;
}

function assertionIcon(status: ValidationAssertion["status"]): string {
  switch (status) {
    case "passed":
      return "✅";
    case "failed":
      return "❌";
    case "blocked":
      return "🚫";
    case "skipped":
      return "⏭️";
    case "pending":
    default:
      return "⬜";
  }
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
  | "validation"
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

  // Skip current phase/feature (only when running)
  if (!state.paused && !state.completedAt) {
    if (state.mode === "full" && state.currentFeature) {
      actions.push({ key: "skip", label: "⏭ Skip current feature" });
    } else if (state.phases.some((p) => p.status === "active")) {
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

  // Validation (full mode only)
  if (state.mode === "full" && state.validationAssertions?.length) {
    actions.push({ key: "validation", label: "✔ Validation status" });
  }

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

      case "validation": {
        await showValidation(ctx, state);
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
 * Show model assignment as a read-only panel (or editable in future).
 */
async function showModelAssignment(
  ctx: ExtensionContext,
  state: MissionState,
  callbacks: MissionControlCallbacks,
): Promise<boolean> {
  const models = Object.entries(state.modelAssignment);
  const canEdit = !!callbacks.onModelChange && !!callbacks.getAvailableModels;

  // Build display
  const lines: string[] = [
    HEADER_LINE,
    "  🤖 Model Assignment",
    HEADER_LINE,
    "",
  ];

  if (models.length === 0) {
    lines.push("  No model assignments configured.");
    lines.push("  Models default to the current session model.");
  } else {
    for (const [role, modelId] of models) {
      lines.push(`  ${role}: ${modelId}`);
    }
  }
  lines.push("");

  const title = lines.join("\n");

  if (!canEdit) {
    await ctx.ui.select(title, ["← Back"]);
    return false;
  }

  // Build editable options: one per role + back
  const roleOptions = models.map(([role]) => `✏️ Change: ${role}`);
  const choice = await ctx.ui.select(title, [...roleOptions, "← Back"]);

  if (!choice || choice === "← Back") return false;

  // Extract role from choice and show searchable model picker
  const role = choice.replace("✏️ Change: ", "");
  const availableModels = callbacks.getAvailableModels!();
  const modelOptions = [
    { label: "(current model)", id: "" },
    ...availableModels,
  ];

  const picked = await showModelPicker(ctx, `Model for "${role}"`, modelOptions);

  if (!picked || !picked.id) return false;

  callbacks.onModelChange!(role, picked.id);
  ctx.ui.notify(`🤖 ${role} → ${picked.label}`, "info");
  return true;
}

/**
 * Show validation assertions in a detail view.
 */
async function showValidation(
  ctx: ExtensionContext,
  state: MissionState,
): Promise<void> {
  const panel = buildValidationPanel(state);
  const title = panel.join("\n");
  await ctx.ui.select(title, ["← Back"]);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findFeature(
  features: MissionFeature[],
  id: string,
): MissionFeature | undefined {
  return features.find((f) => f.id === id);
}

function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of items) {
    const k = key(item);
    (groups[k] ??= []).push(item);
  }
  return groups;
}
