// extensions/commands.ts — All 8 command handlers + keyboard shortcut

import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import { Key } from "@mariozechner/pi-tui";

import type { MissionState } from "./types.ts";
import type { MissionControlCallbacks, MissionControlResult } from "./mission-control.ts";
import { saveMissionState, addProgressEvent } from "./state.ts";
import { formatDuration, getPhaseIcon } from "./utils.ts";
// config.ts exports are used via planner.ts at runtime
import { runMissionPlanner } from "./planner.ts";
import { updateWidget as updateMissionWidget } from "./widget.ts";

// ---------------------------------------------------------------------------
// Forward declaration — mission-control.ts will provide this
// ---------------------------------------------------------------------------

type ShowMissionControlFn = (
  ctx: any,
  state: MissionState | null,
  callbacks: MissionControlCallbacks,
  getLatestState?: () => MissionState | null,
) => Promise<MissionControlResult>;

// Lazy import to avoid circular dependency; mission-control.ts may not exist yet.
let showMissionControl: ShowMissionControlFn | undefined;
async function loadMissionControl(): Promise<void> {
  try {
    const mod = await import("./mission-control.ts");
    showMissionControl = mod.showMissionControl;
  } catch {
    // mission-control.ts not yet available — shortcut will notify
  }
}

// ---------------------------------------------------------------------------
// Use the rich widget from widget.ts (handles all modes, pause, completion)
function updateWidgetFromCommands(
  ctx: Pick<ExtensionCommandContext, "ui">,
  state: MissionState | null,
): void {
  updateMissionWidget(ctx, state);
}

// ---------------------------------------------------------------------------
// Main registration function
// ---------------------------------------------------------------------------

export function registerMissionCommands(
  pi: ExtensionAPI,
  getState: () => MissionState | null,
  setState: (s: MissionState | null) => void,
): void {
  // Eagerly attempt to load mission-control
  loadMissionControl();

  // Helper: persist + update widget after every state change
  function persist(ctx: Pick<ExtensionCommandContext, "ui">, state: MissionState): void {
    setState(state);
    saveMissionState(pi, state);
    updateWidgetFromCommands(ctx, state);
  }

  // -----------------------------------------------------------------------
  // 1. /mission — Start new mission or show quick status
  // -----------------------------------------------------------------------

  pi.registerCommand("mission", {
    description:
      "Start a new orchestrated mission or show quick status of the active one",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      try {
        const description = args.trim();
        const state = getState();

        // No args + no mission → usage
        if (!description && !state) {
          ctx.ui.notify(
            "Usage: /mission <description of what to build/fix>",
            "warning",
          );
          return;
        }

        // No args + active mission → quick status notification
        if (!description && state && !state.completedAt) {
          const elapsed = formatDuration(
            Date.now() - new Date(state.startedAt).getTime(),
          );

          const active = state.phases.find((p) => p.status === "active");
          const phaseIdx = active
            ? state.phases.indexOf(active) + 1
            : state.phases.length;
          ctx.ui.notify(
            `Active: ${state.description} (${elapsed})\n` +
              `Phase ${phaseIdx}/${state.phases.length}: ${active?.emoji ?? "✅"} ${active?.name ?? "Done"}`,
            "info",
          );
          return;
        }

        // Has args + active mission → confirm overwrite
        if (description && state && !state.completedAt) {
          const ok = await ctx.ui.confirm(
            "Active Mission",
            `There's already an active mission:\n"${state.description}"\n\nStart a new one?`,
          );
          if (!ok) return;
        }

        // Has args → run planner questionnaire, then kick off
        const newState = await runMissionPlanner(ctx, description);
        if (!newState) {
          // User cancelled the planner
          return;
        }

        persist(ctx, newState);

        // Build kick-off message based on mode
        const firstPhase = newState.phases.find((p) => p.status === "active");
        const kickoff =
          `Run an orchestrated mission for: ${description}\n\n` +
          `Start with Phase 1 (${firstPhase?.name ?? "Plan"}): ` +
          `Analyze the codebase and produce a detailed implementation plan. ` +
          `Present the plan for my approval before implementing.`;

        pi.sendUserMessage(kickoff);
        pi.setSessionName(`🎯 ${description}`);
        ctx.ui.notify(`🚀 Mission started: ${description}`, "info");
      } catch (err: any) {
        ctx.ui.notify(`Error in /mission: ${err.message}`, "error");
      }
    },
  });

  // -----------------------------------------------------------------------
  // 2. /mission-status — Detailed status via ctx.ui.select()
  // -----------------------------------------------------------------------

  pi.registerCommand("mission-status", {
    description: "Show detailed mission status with phase/milestone durations",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      try {
        const state = getState();
        if (!state) {
          ctx.ui.notify(
            "No active mission. Use /mission <description> to start one.",
            "info",
          );
          return;
        }

        const elapsed = formatDuration(
          Date.now() - new Date(state.startedAt).getTime(),
        );
        const lines: string[] = [
          `Mission: ${state.description}`,
          `Mode: ${state.mode}`,
          `Elapsed: ${elapsed}`,
          `Autonomy: ${state.autonomy}`,
        ];

        // Model assignment
        const models = Object.entries(state.modelAssignment);
        if (models.length > 0) {
          lines.push("");
          lines.push("Model Assignment:");
          for (const [role, model] of models) {
            lines.push(`  ${role} → ${model}`);
          }
        }

        if (state.completedAt) {
          const totalDuration = formatDuration(
            new Date(state.completedAt).getTime() -
              new Date(state.startedAt).getTime(),
          );
          lines.push(`Completed in: ${totalDuration}`);
        }

        lines.push("");

        lines.push("Phases:");
        for (let i = 0; i < state.phases.length; i++) {
          const p = state.phases[i];
          const icon = getPhaseIcon(p.status);
          let dur = "";
          if (p.startedAt && p.completedAt) {
            dur = ` (${formatDuration(new Date(p.completedAt).getTime() - new Date(p.startedAt).getTime())})`;
          } else if (p.startedAt) {
            dur = ` (${formatDuration(Date.now() - new Date(p.startedAt).getTime())} elapsed)`;
          }
          lines.push(
            `  ${icon} Phase ${i + 1}: ${p.emoji} ${p.name}${dur}`,
          );
        }

        await ctx.ui.select("Mission Status", lines);
      } catch (err: any) {
        ctx.ui.notify(`Error in /mission-status: ${err.message}`, "error");
      }
    },
  });

  // -----------------------------------------------------------------------
  // 3. /mission-skip — Skip current phase
  // -----------------------------------------------------------------------

  pi.registerCommand("mission-skip", {
    description: "Skip the current phase or feature",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      try {
        let state = getState();
        if (!state || state.completedAt) {
          ctx.ui.notify("No active mission phase/feature to skip.", "warning");
          return;
        }

        const now = new Date().toISOString();

        const activePhase = state.phases.find((p) => p.status === "active");
        if (!activePhase) {
          ctx.ui.notify("No active phase to skip.", "warning");
          return;
        }

        const ok = await ctx.ui.confirm(
          "Skip Phase",
          `Skip "${activePhase.name}" phase?`,
        );
        if (!ok) return;

        const phases = state.phases.map((p) => ({ ...p }));
        const activeIdx = phases.findIndex((p) => p.status === "active");

        phases[activeIdx].status = "skipped";
        phases[activeIdx].completedAt = now;

        const next: Partial<MissionState> = { phases };

        if (activeIdx + 1 < phases.length) {
          phases[activeIdx + 1].status = "active";
          phases[activeIdx + 1].startedAt = now;
          next.currentPhase = phases[activeIdx + 1].name;
        } else {
          next.completedAt = now;
        }

        state = { ...state, ...next };
        addProgressEvent(
          state,
          "phase_complete",
          `Skipped phase: ${activePhase.name}`,
        );
        persist(ctx, state);

        const nextPhase = state.phases.find((p) => p.status === "active");
        if (state.completedAt) {
          pi.setSessionName(`✅ ${state.description}`);
          ctx.ui.notify("🎉 Mission complete!", "info");
        } else {
          ctx.ui.notify(`Skipped → ${nextPhase?.emoji ?? "📋"} ${nextPhase?.name ?? "—"}`, "info");
        }
      } catch (err: any) {
        ctx.ui.notify(`Error in /mission-skip: ${err.message}`, "error");
      }
    },
  });

  // -----------------------------------------------------------------------
  // 4. /mission-done — Mark mission complete
  // -----------------------------------------------------------------------

  pi.registerCommand("mission-done", {
    description: "Mark the current mission as complete",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      try {
        const state = getState();
        if (!state) {
          ctx.ui.notify("No active mission.", "warning");
          return;
        }
        if (state.completedAt) {
          ctx.ui.notify("Mission already completed.", "info");
          return;
        }

        const ok = await ctx.ui.confirm(
          "Complete Mission",
          "Mark mission as done? All remaining phases/features will be skipped.",
        );
        if (!ok) return;

        const now = new Date().toISOString();

        // Mark remaining phases as skipped
        const phases = state.phases.map((p) => {
          if (p.status === "active") {
            return { ...p, status: "done" as const, completedAt: now };
          }
          if (p.status === "pending") {
            return { ...p, status: "skipped" as const };
          }
          return { ...p };
        });

        const updated: MissionState = {
          ...state,
          phases,
          completedAt: now,
        };
        addProgressEvent(updated, "mission_complete", "Mission marked complete by user");
        persist(ctx, updated);

        const totalDuration = formatDuration(
          new Date(now).getTime() - new Date(state.startedAt).getTime(),
        );
        pi.setSessionName(`✅ ${state.description}`);
        ctx.ui.notify(`🎉 Mission complete! (${totalDuration})`, "info");
      } catch (err: any) {
        ctx.ui.notify(`Error in /mission-done: ${err.message}`, "error");
      }
    },
  });

  // -----------------------------------------------------------------------
  // 5. /mission-pause — Toggle pause/resume
  // -----------------------------------------------------------------------

  pi.registerCommand("mission-pause", {
    description: "Toggle pause/resume on the current mission",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      try {
        const state = getState();
        if (!state) {
          ctx.ui.notify("No active mission.", "warning");
          return;
        }
        if (state.completedAt) {
          ctx.ui.notify("Mission already completed.", "info");
          return;
        }

        const now = new Date().toISOString();

        if (state.paused) {
          // Resume
          const pauseEntry = state.pausedAt
            ? { pausedAt: state.pausedAt, resumedAt: now }
            : undefined;

          const updated: MissionState = {
            ...state,
            paused: false,
            pausedAt: undefined,
            pauseHistory: pauseEntry
              ? [...state.pauseHistory, pauseEntry]
              : state.pauseHistory,
          };
          addProgressEvent(updated, "mission_resume", "Mission resumed");
          persist(ctx, updated);

          ctx.ui.notify("▶ Mission resumed", "info");
        } else {
          // Pause
          const updated: MissionState = {
            ...state,
            paused: true,
            pausedAt: now,
          };
          addProgressEvent(updated, "mission_pause", "Mission paused");
          persist(ctx, updated);

          ctx.ui.notify("⏸ Mission paused", "info");
        }
      } catch (err: any) {
        ctx.ui.notify(`Error in /mission-pause: ${err.message}`, "error");
      }
    },
  });

  // -----------------------------------------------------------------------
  // 6. /mission-reset — Clear everything
  // -----------------------------------------------------------------------

  pi.registerCommand("mission-reset", {
    description: "Clear all mission state and widget",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      try {
        const state = getState();
        if (!state) {
          ctx.ui.notify("No mission to reset.", "info");
          return;
        }

        const ok = await ctx.ui.confirm(
          "Reset Mission",
          "Clear all mission state? This cannot be undone.",
        );
        if (!ok) return;

        setState(null);
        // Persist a null-state marker so restoreMissionState doesn't
        // resurrect the old state on session restart
        pi.appendEntry("mission-state", null);
        ctx.ui.setWidget("mission", undefined);
        pi.setSessionName(""); // Clear session name
        ctx.ui.notify("Mission cleared.", "info");
      } catch (err: any) {
        ctx.ui.notify(`Error in /mission-reset: ${err.message}`, "error");
      }
    },
  });

  // -----------------------------------------------------------------------
  // Keyboard shortcut: Ctrl+Shift+M → Mission Control
  // -----------------------------------------------------------------------

  pi.registerShortcut(Key.ctrlShift("m"), {
    description: "Open Mission Control",
    handler: async (ctx) => {
      try {
        // Lazy-load if not yet available
        if (!showMissionControl) {
          await loadMissionControl();
        }

        if (!showMissionControl) {
          ctx.ui.notify(
            "Mission Control not available yet. Install mission-control.ts.",
            "warning",
          );
          return;
        }

        const state = getState();

        // Build callbacks that tie back to state management
        const callbacks: MissionControlCallbacks = {
          onPause: () => {
            const s = getState();
            if (!s || s.completedAt) return;
            const now = new Date().toISOString();
            const updated: MissionState = { ...s, paused: true, pausedAt: now };
            addProgressEvent(updated, "mission_pause", "Mission paused via Mission Control");
            setState(updated);
            saveMissionState(pi, updated);
            updateWidgetFromCommands(ctx, updated);
          },
          onResume: () => {
            const s = getState();
            if (!s || !s.paused) return;
            const now = new Date().toISOString();
            const pauseEntry = s.pausedAt
              ? { pausedAt: s.pausedAt, resumedAt: now }
              : undefined;
            const updated: MissionState = {
              ...s,
              paused: false,
              pausedAt: undefined,
              pauseHistory: pauseEntry
                ? [...s.pauseHistory, pauseEntry]
                : s.pauseHistory,
            };
            addProgressEvent(updated, "mission_resume", "Mission resumed via Mission Control");
            setState(updated);
            saveMissionState(pi, updated);
            updateWidgetFromCommands(ctx, updated);
          },
          onSkip: async () => {
            const ok = await ctx.ui.confirm("Skip", "Skip current phase/feature?");
            if (!ok) return false;
            const s = getState();
            if (!s || s.completedAt) return false;
            const now = new Date().toISOString();

            let updated: MissionState;

            const phases = s.phases.map((p) => ({ ...p }));
            const activeIdx = phases.findIndex((p) => p.status === "active");
            if (activeIdx === -1) return false;
            phases[activeIdx].status = "skipped";
            phases[activeIdx].completedAt = now;
            const next: Partial<MissionState> = { phases };
            if (activeIdx + 1 < phases.length) {
              phases[activeIdx + 1].status = "active";
              phases[activeIdx + 1].startedAt = now;
              next.currentPhase = phases[activeIdx + 1].name;
            } else {
              next.completedAt = now;
            }
            updated = { ...s, ...next };
            const skippedName = s.phases[activeIdx]?.name ?? "phase";
            addProgressEvent(updated, "phase_complete", `Skipped ${skippedName} (via Mission Control)`);

            setState(updated);
            saveMissionState(pi, updated);
            updateWidgetFromCommands(ctx, updated);
            if (updated.completedAt) {
              pi.setSessionName(`✅ ${updated.description}`);
            }
            return true;
          },
          onDone: async () => {
            const ok = await ctx.ui.confirm("Complete", "Mark mission as done?");
            if (!ok) return false;
            const s = getState();
            if (!s) return false;
            const now = new Date().toISOString();

            // Mark remaining phases as done/skipped
            const phases = s.phases.map((p) => {
              if (p.status === "active") return { ...p, status: "done" as const, completedAt: now };
              if (p.status === "pending") return { ...p, status: "skipped" as const };
              return { ...p };
            });

            const updated: MissionState = { ...s, phases, completedAt: now };
            addProgressEvent(updated, "mission_complete", "Mission completed via Mission Control");
            setState(updated);
            saveMissionState(pi, updated);
            updateWidgetFromCommands(ctx, updated);
            pi.setSessionName(`✅ ${s.description}`);
            return true;
          },
          onRedirect: (message: string) => {
            const s = getState();
            if (s) {
              addProgressEvent(s, "mission_redirect", message);
              saveMissionState(pi, s);
            }
            pi.sendUserMessage(message);
          },
          onModelChange: (role: string, modelId: string) => {
            const s = getState();
            if (!s) return;
            const updated: MissionState = {
              ...s,
              modelAssignment: { ...s.modelAssignment, [role]: modelId },
            };
            setState(updated);
            saveMissionState(pi, updated);
          },
          getAvailableModels: () => {
            try {
              const allModels = ctx.modelRegistry.getAll();
              return allModels.map((m: any) => ({ label: m.name ?? m.id, id: m.id as string }));
            } catch {
              return [];
            }
          },
        };

        await showMissionControl(ctx, state, callbacks, getState);
      } catch (err: any) {
        ctx.ui.notify(`Error opening Mission Control: ${err.message}`, "error");
      }
    },
  });
}
