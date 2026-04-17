// extensions/mission-control.ts — Full TUI overlay Mission Control with animated retro agent
//
// Renders as a ctx.ui.custom() overlay with:
//   - Full-size animated retro RPG agent sprite (left side)
//   - Themed dashboard with phase list, progress bar, activity log (right side)
//   - Single-key shortcuts: P/S/D/R/M/Esc
//   - Real-time elapsed timer (piggybacks on animation tick)
//
// Preserves the same public interface as the old select-based version.

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
  Key,
  matchesKey,
} from "@mariozechner/pi-tui";
import type { MissionState } from "./types.ts";
import { formatDuration, getPhaseIcon, truncate } from "./utils.ts";
import { formatProgressLog } from "./progress-log.ts";
import {
  AgentAnimator,
  getRoleForPhase,
  renderAgent,
  type SpriteRole,
  type SpriteState,
} from "./agent-ascii.ts";
import { buildThemedProgressBar } from "./widget.ts";

// ---------------------------------------------------------------------------
// Public Types (preserved interface)
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

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Show the Mission Control overlay.
 *
 * Renders as a full ctx.ui.custom() component with animated agent sprite,
 * themed dashboard, and keyboard-driven actions.
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

  const result = await ctx.ui.custom<MissionControlResult>(
    (tui, theme, _kb, done) => {
      const mc = new MissionControlComponent(
        tui,
        theme,
        state!,
        callbacks,
        getLatestState,
        (result) => done(result),
        ctx,
      );
      return mc;
    },
  );

  return result ?? { action: "close" };
}

// ---------------------------------------------------------------------------
// Mission Control Component
// ---------------------------------------------------------------------------

class MissionControlComponent {
  // TUI refs
  private tui: { requestRender(): void };
  private theme: { fg(color: string, text: string): string; bold(text: string): string };
  private ctx: ExtensionContext;

  // State
  private state: MissionState;
  private callbacks: MissionControlCallbacks;
  private getLatestState?: () => MissionState | null;
  private onClose: (result: MissionControlResult) => void;

  // Animation
  private animator: AgentAnimator;

  // Layout
  // (manual rendering — no Container needed)

  // Cached render
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    tui: { requestRender(): void },
    theme: { fg(color: string, text: string): string; bold(text: string): string },
    state: MissionState,
    callbacks: MissionControlCallbacks,
    getLatestState: (() => MissionState | null) | undefined,
    onClose: (result: MissionControlResult) => void,
    ctx: ExtensionContext,
  ) {
    this.tui = tui;
    this.theme = theme;
    this.state = state;
    this.callbacks = callbacks;
    this.getLatestState = getLatestState;
    this.onClose = onClose;
    this.ctx = ctx;

    // Start animator for active missions
    this.animator = new AgentAnimator(500);
    if (!state.completedAt && !state.paused) {
      this.animator.start(tui);
    }

    // Build layout (manual rendering)
  }

  // ── Refresh state from external source ──────────────────────────────────

  private refreshState(): void {
    if (this.getLatestState) {
      const latest = this.getLatestState();
      if (latest) this.state = latest;
    }
    // Manage animation based on state
    if (this.state.paused || this.state.completedAt) {
      this.animator.stop();
    } else if (!this.animator.isRunning) {
      this.animator.start(this.tui);
    }
  }

  // ── Action helpers ──────────────────────────────────────────────────────

  private getSpriteState(): SpriteState {
    if (this.state.paused) return "paused";
    if (this.state.completedAt) return "completed";
    return "working";
  }

  private getActiveRole(): SpriteRole {
    const active = this.state.phases.find((p) => p.status === "active");
    return active ? getRoleForPhase(active.name) : "coder";
  }

  // ── Render ──────────────────────────────────────────────────────────────

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    this.refreshState();
    const t = this.theme;
    const s = this.state;
    const lines: string[] = [];
    const elapsed = formatDuration(Date.now() - new Date(s.startedAt).getTime());

    // ── Top border ────────────────────────────────────────────────────────
    lines.push(t.fg("accent", "━".repeat(width)));

    // ── Header ────────────────────────────────────────────────────────────
    const headerText = "  🎯  M I S S I O N   C O N T R O L";
    lines.push(t.fg("accent", t.bold(headerText)));
    lines.push(t.fg("accent", "━".repeat(width)));
    lines.push("");

    // ── Agent sprite + Info panel (side by side) ──────────────────────────
    const spriteState = this.getSpriteState();
    const role = this.getActiveRole();
    const frame = this.animator.currentFrame;
    const spriteLines = renderAgent(role, frame, "full", spriteState);

    const infoLines = this.renderInfoPanel(width - 14, t, s, elapsed);

    // Merge sprite (9 lines) + info side by side
    const maxSpriteLines = spriteLines.length;
    const maxInfoLines = infoLines.length;
    const mergedLines = Math.max(maxSpriteLines, maxInfoLines);

    for (let i = 0; i < mergedLines; i++) {
      const sprite = i < maxSpriteLines ? spriteLines[i] : " ".repeat(11);
      const info = i < maxInfoLines ? infoLines[i] : "";
      lines.push(` ${sprite}  ${info}`);
    }

    lines.push("");

    // ── Progress bar ──────────────────────────────────────────────────────
    const bar = buildThemedProgressBar(s.phases, t);
    const doneCount = s.phases.filter((p) => p.status === "done").length;
    const totalCount = s.phases.length;
    const statusIcon = s.paused ? "⏸" : s.completedAt ? "🎉" : "●";
    const statusLabel = s.paused ? "Paused" : s.completedAt ? "Complete" : "Running";
    const statusColor = s.paused ? "warning" : s.completedAt ? "success" : "accent";

    lines.push(`  ${t.fg(statusColor, statusIcon)} ${t.fg(statusColor, statusLabel)}  ${bar.themed} ${t.fg("accent", `${bar.percentage}%`)}  ${t.fg("dim", `(${doneCount}/${totalCount} phases)`)}`);

    // ── Phase list ────────────────────────────────────────────────────────
    lines.push("");
    lines.push(t.fg("muted", "─".repeat(width)));
    lines.push(`  ${t.fg("text", t.bold("📋 Phases"))}`);

    for (const phase of s.phases) {
      const icon = getPhaseIcon(phase.status);
      const active = phase.status === "active" ? t.fg("accent", " ◄") : "";
      const phaseElapsed =
        phase.status === "active" && phase.startedAt
          ? t.fg("dim", ` (${formatDuration(Date.now() - new Date(phase.startedAt).getTime())})`)
          : phase.status === "done" && phase.startedAt && phase.completedAt
            ? t.fg("dim", ` (${formatDuration(new Date(phase.completedAt).getTime() - new Date(phase.startedAt).getTime())})`)
            : "";
      lines.push(`    ${icon} ${phase.emoji} ${phase.name}${phaseElapsed}${active}`);
    }

    // ── Progress Log ──────────────────────────────────────────────────────
    if (s.progressLog.length > 0) {
      lines.push(t.fg("muted", "─".repeat(width)));
      lines.push(`  ${t.fg("text", t.bold("📜 Recent Activity"))}`);

      const logLines = formatProgressLog(s.progressLog, MAX_LOG_EVENTS);
      const logColors: Record<string, string> = {
        "phase_start": "accent",
        "phase_complete": "success",
        "mission_pause": "warning",
        "mission_resume": "warning",
        "mission_redirect": "dim",
        "mission_complete": "success",
      };

      for (const line of logLines) {
        // Colorize based on event icon
        const color = this.getEventColor(line, logColors);
        lines.push(`    ${t.fg(color, line)}`);
      }
    }

    // ── Model Assignment ──────────────────────────────────────────────────
    const models = Object.entries(s.modelAssignment);
    if (models.length > 0) {
      lines.push(t.fg("muted", "─".repeat(width)));
      lines.push(`  ${t.fg("text", t.bold("🤖 Models"))}`);
      for (const [role, model] of models) {
        lines.push(`    ${t.fg("muted", `${role}:`)} ${model}`);
      }
    }

    // ── Key hints ─────────────────────────────────────────────────────────
    lines.push(t.fg("muted", "─".repeat(width)));
    const hints = this.getActionHints();
    lines.push(`  ${t.fg("dim", hints)}`);
    lines.push("");

    // ── Bottom border ─────────────────────────────────────────────────────
    lines.push(t.fg("accent", "━".repeat(width)));

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  // ── Info panel (rendered beside the sprite) ─────────────────────────────

  private renderInfoPanel(
    panelWidth: number,
    t: { fg(color: string, text: string): string; bold(text: string): string },
    s: MissionState,
    elapsed: string,
  ): string[] {
    const lines: string[] = [];
    const desc = truncate(s.description, panelWidth - 4);
    const modeLabel = s.mode === "minimal" ? "Minimal" : "Standard";

    lines.push(`${t.fg("accent", t.bold(desc))}`);
    lines.push(`  ${t.fg("muted", `Mode:`)} ${t.fg("text", modeLabel)}  ${t.fg("muted", "│")}  ${t.fg("muted", "Autonomy:")} ${t.fg("text", s.autonomy)}  ${t.fg("muted", "│")}  ${t.fg("muted", "Elapsed:")} ${t.fg("text", elapsed)}`);

    // Active phase detail
    const activePhase = s.phases.find((p) => p.status === "active");
    if (activePhase) {
      lines.push("");
      const phaseElapsed = activePhase.startedAt
        ? formatDuration(Date.now() - new Date(activePhase.startedAt).getTime())
        : "";
      lines.push(`  ${t.fg("accent", `${activePhase.emoji} ${activePhase.name}`)} ${t.fg("dim", phaseElapsed ? `(${phaseElapsed})` : "")}`);
    }

    return lines;
  }

  // ── Event color helper ──────────────────────────────────────────────────

  private getEventColor(line: string, colorMap: Record<string, string>): string {
    if (line.includes("✅") || line.includes("Completed")) return colorMap["phase_complete"] ?? "text";
    if (line.includes("🔄") || line.includes("Starting")) return colorMap["phase_start"] ?? "text";
    if (line.includes("⏸") || line.includes("paused")) return colorMap["mission_pause"] ?? "text";
    if (line.includes("▶") || line.includes("resumed")) return colorMap["mission_resume"] ?? "text";
    if (line.includes("↻") || line.includes("Redirect")) return colorMap["mission_redirect"] ?? "text";
    if (line.includes("🎉") || line.includes("complete")) return colorMap["mission_complete"] ?? "text";
    return "text";
  }

  // ── Action hints ────────────────────────────────────────────────────────

  private getActionHints(): string {
    const hints: string[] = [];

    if (!this.state.completedAt) {
      if (this.state.paused) {
        hints.push("P:Resume");
      } else {
        hints.push("P:Pause");
      }

      if (!this.state.paused) {
        hints.push("S:Skip");
      }

      hints.push("D:Done");
      hints.push("R:Redirect");
    }

    hints.push("M:Models");
    hints.push("Esc:Close");

    return hints.join("  ");
  }

  // ── Keyboard handling ───────────────────────────────────────────────────

  handleInput(data: string): void {
    // ── Single-key shortcuts ────────────────────────────────────────────
    const key = data.toLowerCase();

    // P — Pause / Resume
    if (key === "p") {
      this.handlePauseResume();
      return;
    }

    // S — Skip
    if (key === "s" && !this.state.paused && !this.state.completedAt) {
      this.handleSkip();
      return;
    }

    // D — Done
    if (key === "d" && !this.state.completedAt) {
      this.handleDone();
      return;
    }

    // R — Redirect
    if (key === "r" && !this.state.completedAt) {
      this.handleRedirect();
      return;
    }

    // M — Models
    if (key === "m") {
      this.handleModels();
      return;
    }

    // Escape — Close
    if (matchesKey(data, Key.escape)) {
      this.cleanup();
      this.onClose({ action: "close" });
      return;
    }
  }

  // ── Action implementations ──────────────────────────────────────────────

  private handlePauseResume(): void {
    if (this.state.completedAt) return;

    if (this.state.paused) {
      this.callbacks.onResume();
      this.ctx.ui.notify("▶ Mission resumed.", "info");
    } else {
      this.callbacks.onPause();
      this.ctx.ui.notify("⏸ Mission paused.", "info");
    }

    this.refreshState();
    this.invalidate();
    this.tui.requestRender();
  }

  private handleSkip(): void {
    // Fire and forget — the callback mutates state, we refresh on next render
    this.callbacks.onSkip().then((confirmed) => {
      if (confirmed) {
        this.ctx.ui.notify("⏭ Skipped.", "info");
      }
      this.refreshState();
      this.invalidate();
      this.tui.requestRender();
    });
  }

  private handleDone(): void {
    this.callbacks.onDone().then((confirmed) => {
      if (confirmed) {
        this.cleanup();
        this.onClose({ action: "close" });
      }
    });
  }

  private handleRedirect(): void {
    // We need to close the overlay to show an input dialog,
    // then re-open or just send the message and close.
    // Simplest approach: close, let the caller handle input.
    // For now, send a redirect with a default message and close.
    // The user can also type /mission-redirect for a full input.
    this.cleanup();
    this.onClose({ action: "redirect", message: "Please continue with a new focus or direction." });
  }

  private handleModels(): void {
    // Models need the role assigner overlay which conflicts with this overlay.
    // Close and reopen pattern per pi docs.
    this.cleanup();
    this.onClose({ action: "close" });
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  private cleanup(): void {
    this.animator.stop();
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}
