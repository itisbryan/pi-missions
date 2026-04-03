/**
 * pi-mission — Factory-style orchestrated multi-phase development missions
 *
 * Thin orchestrator that wires together the factored modules:
 *   state.ts     — Persistence, phase/feature advancement, progress logging
 *   widget.ts    — Compact always-visible progress widget
 *   detector.ts  — LLM output pattern matching for transitions
 *   protocol.ts  — System prompt injection (mission protocol + live status)
 *   commands.ts  — All /mission* slash command registrations
 *   utils.ts     — Shared helpers (text extraction, formatting)
 *
 * Commands (registered via commands.ts):
 *   /mission <desc>    Start a new mission
 *   /mission           Show quick status
 *   /mission-status    Detailed phase-by-phase status
 *   /mission-skip      Skip current phase
 *   /mission-done      Mark mission complete
 *   /mission-pause     Pause the mission
 *   /mission-resume    Resume a paused mission
 *   /mission-reset     Clear mission and widget
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { MissionState } from "./types.ts";
import { restoreMissionState, saveMissionState, advancePhase, advanceFeature, addProgressEvent } from "./state.ts";
import { updateWidget } from "./widget.ts";
import { detectPhaseTransition, detectFeatureTransition, detectMilestoneTransition, detectAssertionResult } from "./detector.ts";
import { buildMissionProtocol, buildMissionStatus } from "./protocol.ts";
import { extractTextFromMessage } from "./utils.ts";
import { registerMissionCommands } from "./commands.ts";
import { PHASE_ROLE_MAP } from "./config.ts";
import { registerMissionTools } from "./tools.ts";

// ---------------------------------------------------------------------------
// Model auto-switching helper
// ---------------------------------------------------------------------------

/**
 * Switch to the assigned model for the current phase role, if configured.
 * Looks up the active phase name → role (via PHASE_ROLE_MAP) → model ID
 * (via state.modelAssignment), then finds the matching model in the registry.
 */
async function maybeSwitchModel(
  pi: ExtensionAPI,
  state: MissionState,
  ctx: { modelRegistry: { getAll(): Array<{ id: string }> } },
): Promise<void> {
  if (Object.keys(state.modelAssignment).length === 0) return;

  let targetModelId: string | undefined;

  if (state.mode === "full") {
    // Full mode: use "coder" role during feature execution, "verifier" when all done
    const role = state.completedAt ? "verifier" : "coder";
    targetModelId = state.modelAssignment[role];
  } else {
    // Simple/minimal mode: determine role from active phase
    const activePhase = state.phases.find((p) => p.status === "active");
    if (!activePhase) return;
    const role = PHASE_ROLE_MAP[activePhase.name];
    if (!role) return;
    targetModelId = state.modelAssignment[role];
  }

  if (!targetModelId) return;

  // Find matching model in registry
  const allModels = ctx.modelRegistry.getAll();
  const model = allModels.find(
    (m) => m.id === targetModelId || m.id.includes(targetModelId),
  );

  if (model) {
    try {
      await pi.setModel(model as any);
    } catch {
      // Model switch failed — continue with current model
    }
  }
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function missionExtension(pi: ExtensionAPI) {
  let mission: MissionState | null = null;

  const getState = () => mission;
  const setState = (s: MissionState | null) => { mission = s; };

  // -------------------------------------------------------------------
  // Session lifecycle — restore persisted state on any session change
  // -------------------------------------------------------------------

  /** Shared restore logic for all session lifecycle events. */
  function restoreFromSession(ctx: Pick<ExtensionContext, "ui" | "sessionManager">, source: string): void {
    try {
      mission = restoreMissionState(ctx.sessionManager.getEntries());
      if (mission && !mission.completedAt) {
        updateWidget(ctx, mission);
        pi.setSessionName(`🎯 ${mission.description}`);
      } else if (mission && mission.completedAt) {
        updateWidget(ctx, mission); // Show completed widget briefly
        pi.setSessionName(`✅ ${mission.description}`);
      } else {
        updateWidget(ctx, null);
      }
    } catch (err) {
      console.error(`[pi-mission] ${source} failed:`, err);
    }
  }

  pi.on("session_start", async (_event, ctx) => restoreFromSession(ctx, "session_start"));
  pi.on("session_switch", async (_event, ctx) => restoreFromSession(ctx, "session_switch"));
  pi.on("session_fork", async (_event, ctx) => restoreFromSession(ctx, "session_fork"));
  pi.on("session_tree", async (_event, ctx) => restoreFromSession(ctx, "session_tree"));
  pi.on("session_compact", async (_event, ctx) => restoreFromSession(ctx, "session_compact"));

  // -------------------------------------------------------------------
  // Auto-detect phase/feature transitions from LLM output
  // Note: Mission state survives compaction because appendEntry creates
  // custom entries (type: "custom") which are preserved in the session
  // tree. The before_agent_start handler re-injects the protocol each turn.
  // -------------------------------------------------------------------

  pi.on("message_end", async (event, ctx) => {
    try {
      if (!mission || mission.completedAt || mission.paused) return;
      if (event.message.role !== "assistant") return;

      const text = extractTextFromMessage(event.message);
      if (!text) return;

      let updated = false;

      if (mission.mode === "simple" || mission.mode === "minimal") {
        // --- Simple/Minimal: phase-based detection ---
        const activeIdx = mission.phases.findIndex((p) => p.status === "active");
        const result = detectPhaseTransition(text, mission.phases, activeIdx);

        if (result) {
          if (result.type === "complete") {
            const phaseName = mission.phases[result.phaseIndex].name;
            mission = advancePhase(mission);
            addProgressEvent(mission, "phase_complete", `Completed phase: ${phaseName}`);
            // Log the next phase starting, or mission complete
            if (mission.completedAt) {
              addProgressEvent(mission, "mission_complete", "All phases complete — mission finished");
            } else {
              const nextActive = mission.phases.find((p) => p.status === "active");
              if (nextActive) {
                addProgressEvent(mission, "phase_start", `Starting phase: ${nextActive.name}`);
              }
            }
          } else {
            // Transition: LLM announced moving to phase N — advance from current
            mission = advancePhase(mission);
            const newActive = mission.phases.find((p) => p.status === "active");
            if (newActive) {
              addProgressEvent(mission, "phase_start", `Advancing to phase: ${newActive.name}`);
            } else if (mission.completedAt) {
              addProgressEvent(mission, "mission_complete", "All phases complete — mission finished");
            }
          }
          updated = true;
        }
      } else {
        // --- Full mode: feature + milestone detection ---
        const allFeatures = mission.milestones?.flatMap((m) => m.features) ?? [];
        const featureResult = detectFeatureTransition(text, allFeatures);

        if (featureResult) {
          if (featureResult.type === "complete") {
            mission = advanceFeature(mission);
            addProgressEvent(mission, "feature_complete", `Completed feature: ${featureResult.featureId}`);
            if (mission.completedAt) {
              addProgressEvent(mission, "mission_complete", "All features complete — mission finished");
            }
          } else if (featureResult.type === "start") {
            addProgressEvent(mission, "feature_start", `Starting feature: ${featureResult.featureId}`);
          } else if (featureResult.type === "failed") {
            addProgressEvent(mission, "feature_failed", `Feature failed: ${featureResult.featureId}`);
          }
          updated = true;
        }

        if (!updated && mission.milestones) {
          const msResult = detectMilestoneTransition(text, mission.milestones);
          if (msResult) {
            const msName = mission.milestones[msResult.milestoneIndex]?.name ?? `#${msResult.milestoneIndex + 1}`;
            if (msResult.type === "complete") {
              addProgressEvent(mission, "milestone_complete", `Completed milestone: ${msName}`);
            } else if (msResult.type === "start") {
              addProgressEvent(mission, "milestone_start", `Starting milestone: ${msName}`);
            }
            updated = true;
          }
        }

        // --- Spec approval detection (full mode) ---
        if (mission.mode === "full" && !mission.specApproved && !updated) {
          const approvalPatterns = [
            /plan\s+approved/,
            /spec\s+approved/,
            /specification\s+approved/,
            /proceeding\s+(?:to|with)\s+implementation/,
            /moving\s+to\s+implementation/,
            /beginning\s+implementation/,
            /starting\s+implementation/,
          ];
          if (approvalPatterns.some((p) => p.test(text))) {
            mission = { ...mission, specApproved: true };
            addProgressEvent(mission, "phase_complete", "Spec approved — entering implementation");
            updated = true;
          }
        }

        // --- Validation assertion detection ---
        if (mission.validationAssertions && mission.validationAssertions.length > 0) {
          const assertionResult = detectAssertionResult(text, mission.validationAssertions);
          if (assertionResult) {
            const assertion = mission.validationAssertions.find(
              (a) => a.id === assertionResult.assertionId,
            );
            if (assertion) {
              assertion.status = assertionResult.type;
              addProgressEvent(
                mission,
                assertionResult.type === "passed" ? "feature_complete" : "feature_failed",
                `Assertion ${assertion.id}: ${assertionResult.type}`,
              );
              updated = true;
            }
          }
        }
      }

      if (updated) {
        saveMissionState(pi, mission);
        updateWidget(ctx, mission);

        // Update session name if mission completed via auto-detection
        if (mission.completedAt) {
          pi.setSessionName(`✅ ${mission.description}`);
        }

        // Auto-switch model if assignment exists for the new phase/role
        await maybeSwitchModel(pi, mission, ctx);
      }
    } catch (err) {
      console.error("[pi-mission] message_end failed:", err);
    }
  });

  // -------------------------------------------------------------------
  // System prompt injection — adds protocol + live status
  // -------------------------------------------------------------------

  pi.on("before_agent_start", async (event, _ctx) => {
    try {
      if (!mission || mission.completedAt) return;

      const protocol = buildMissionProtocol(mission);
      const status = buildMissionStatus(mission);

      return {
        systemPrompt:
          event.systemPrompt +
          "\n\n---\n\n" +
          protocol +
          "\n\n" +
          status,
      };
    } catch (err) {
      console.error("[pi-mission] before_agent_start failed:", err);
    }
  });

  // -------------------------------------------------------------------
  // Register all /mission* commands
  // -------------------------------------------------------------------

  registerMissionCommands(pi, getState, setState);

  // -------------------------------------------------------------------
  // Register mission management tool (for full mode feature population)
  // -------------------------------------------------------------------

  registerMissionTools(pi, getState, setState);
}
