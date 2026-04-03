/**
 * pi-mission — Orchestrated multi-phase development missions
 *
 * Provides:
 *   /mission <description>   Start a new mission
 *   /mission                 Show quick status
 *   /mission-status          Detailed phase-by-phase status
 *   /mission-skip            Skip current phase
 *   /mission-done            Mark mission complete
 *   /mission-reset           Clear mission and widget
 *
 * Widget shows real-time progress bar and current phase.
 * System prompt is augmented with mission protocol while active.
 * State persists in the session — survives /compact and restarts.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MissionPhase {
  name: string;
  emoji: string;
  status: "pending" | "active" | "done" | "skipped";
  startedAt?: number;
  completedAt?: number;
}

interface MissionState {
  description: string;
  currentPhase: number;
  phases: MissionPhase[];
  startedAt: number;
  completedAt?: number;
}

// ---------------------------------------------------------------------------
// Default phases — can be overridden per-project via prompts/mission.md args
// ---------------------------------------------------------------------------

const DEFAULT_PHASES: Omit<MissionPhase, "status">[] = [
  { name: "Architect", emoji: "📐" },
  { name: "Review Plan", emoji: "👁️" },
  { name: "Implement", emoji: "🔨" },
  { name: "Test", emoji: "🧪" },
  { name: "Audit", emoji: "🔍" },
  { name: "Verify", emoji: "✅" },
];

// ---------------------------------------------------------------------------
// Mission protocol injected into the system prompt
// ---------------------------------------------------------------------------

const MISSION_PROTOCOL = `
## Active Mission Protocol

You are running an orchestrated mission. Follow these phases strictly:

### Phase 1: Architect
- Analyze the codebase and understand the domain
- Produce a detailed implementation plan with file assignments
- List all files to create/modify with clear descriptions
- **STOP and present the plan for approval before proceeding**

### Phase 2: Review Plan
- Present the plan clearly to the user
- Wait for explicit approval (user says "approve", "go", "lgtm", etc.)
- If the user requests changes, revise the plan and re-present
- Do NOT proceed to implementation without approval

### Phase 3: Implement
- Execute the plan. Run independent tasks in parallel when possible
- Use subagents or parallel tool calls for concurrent work
- Follow the project's architecture patterns and code style
- Commit work incrementally

### Phase 4: Test
- Write tests for all new/changed code
- Cover edge cases, error conditions, and boundary values
- Run the test suite and fix any failures

### Phase 5: Audit
- Review all changes for:
  - Bugs and logic errors
  - Security issues
  - Performance concerns
  - Code style violations
  - Missing error handling
- Fix any issues found

### Phase 6: Verify
- Run the full test suite and linter
- Ensure all tests pass and no lint errors
- Report the final status

**After completing each phase, announce it clearly** so the mission tracker can update.
Use phrases like "Phase 1 (Architect) complete" or "Moving to Phase 3 (Implement)".
`;

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function missionExtension(pi: ExtensionAPI) {
  let mission: MissionState | null = null;

  // -------------------------------------------------------------------
  // Session lifecycle — restore persisted state
  // -------------------------------------------------------------------

  pi.on("session_start", async (_event, ctx) => {
    mission = null;
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === "mission-state") {
        mission = entry.data as MissionState;
      }
    }
    if (mission && !mission.completedAt) {
      updateWidget(ctx);
    }
  });

  // -------------------------------------------------------------------
  // Auto-detect phase transitions from LLM output
  // -------------------------------------------------------------------

  pi.on("message_end", async (event, ctx) => {
    if (!mission || mission.completedAt) return;
    if (event.message.role !== "assistant") return;

    const text =
      event.message.content
        ?.filter((c: { type: string }) => c.type === "text")
        .map((c: { type: string; text: string }) => c.text)
        .join(" ")
        .toLowerCase() ?? "";

    for (let i = 0; i < mission.phases.length; i++) {
      const phase = mission.phases[i];
      const phaseName = phase.name.toLowerCase();
      const phaseNum = i + 1;

      const completionPatterns = [
        `phase ${phaseNum} complete`,
        `phase ${phaseNum} done`,
        `phase ${phaseNum} (${phaseName}) complete`,
        `${phaseName} complete`,
        `${phaseName} phase complete`,
        `${phaseName} phase done`,
        `completed phase ${phaseNum}`,
        `completed the ${phaseName} phase`,
      ];

      const transitionPatterns = [
        `moving to phase ${phaseNum}`,
        `starting phase ${phaseNum}`,
        `proceeding to phase ${phaseNum}`,
        `beginning ${phaseName}`,
        `starting ${phaseName}`,
        `now entering phase ${phaseNum}`,
      ];

      // Phase completion
      if (completionPatterns.some((p) => text.includes(p)) && phase.status === "active") {
        phase.status = "done";
        phase.completedAt = Date.now();

        if (i + 1 < mission.phases.length) {
          mission.currentPhase = i + 1;
          mission.phases[i + 1].status = "active";
          mission.phases[i + 1].startedAt = Date.now();
        } else {
          mission.completedAt = Date.now();
        }

        saveMissionState();
        updateWidget(ctx);
        break;
      }

      // Phase transition
      if (
        transitionPatterns.some((p) => text.includes(p)) &&
        phase.status === "pending" &&
        i > 0
      ) {
        const prev = mission.phases[i - 1];
        if (prev.status === "active") {
          prev.status = "done";
          prev.completedAt = Date.now();
        }

        phase.status = "active";
        phase.startedAt = Date.now();
        mission.currentPhase = i;

        saveMissionState();
        updateWidget(ctx);
        break;
      }
    }
  });

  // -------------------------------------------------------------------
  // System prompt injection — adds protocol + live status
  // -------------------------------------------------------------------

  pi.on("before_agent_start", async (event, _ctx) => {
    if (!mission || mission.completedAt) return;

    const currentPhase = mission.phases[mission.currentPhase];
    const phaseStatus = mission.phases
      .map((p, i) => {
        const icon =
          p.status === "done" ? "✅" : p.status === "active" ? "🔄" : "⬜";
        return `${icon} Phase ${i + 1}: ${p.name}`;
      })
      .join("\n");

    return {
      systemPrompt:
        event.systemPrompt +
        MISSION_PROTOCOL +
        `\n\n### Current Mission Status\n` +
        `Mission: ${mission.description}\n` +
        `Current Phase: ${mission.currentPhase + 1} (${currentPhase.name})\n\n` +
        `${phaseStatus}\n`,
    };
  });

  // -------------------------------------------------------------------
  // Commands
  // -------------------------------------------------------------------

  pi.registerCommand("mission", {
    description: "Run a full orchestrated mission — architect, implement, test, audit, verify",
    handler: async (args, ctx) => {
      const description = args.trim();

      if (!description) {
        if (mission && !mission.completedAt) {
          const phase = mission.phases[mission.currentPhase];
          ctx.ui.notify(
            `Active: ${mission.description}\n` +
            `Phase ${mission.currentPhase + 1}/${mission.phases.length}: ${phase.emoji} ${phase.name}`,
            "info",
          );
          return;
        }
        ctx.ui.notify("Usage: /mission <description of what to build/fix>", "warning");
        return;
      }

      // Confirm overwrite if a mission is active
      if (mission && !mission.completedAt) {
        const ok = await ctx.ui.confirm(
          "Active Mission",
          `There's already an active mission:\n"${mission.description}"\n\nStart a new one?`,
        );
        if (!ok) return;
      }

      // Initialize
      mission = {
        description,
        currentPhase: 0,
        phases: DEFAULT_PHASES.map((p) => ({ ...p, status: "pending" as const })),
        startedAt: Date.now(),
      };
      mission.phases[0].status = "active";
      mission.phases[0].startedAt = Date.now();

      saveMissionState();
      updateWidget(ctx);

      pi.sendUserMessage(
        `Run an orchestrated mission for: ${description}\n\n` +
        `Start with Phase 1 (Architect): Analyze the codebase and produce a detailed ` +
        `implementation plan. Present the plan for my approval before implementing.`,
      );

      ctx.ui.notify(`🚀 Mission started: ${description}`, "info");
    },
  });

  pi.registerCommand("mission-status", {
    description: "Show detailed mission status with phase durations",
    handler: async (_args, ctx) => {
      if (!mission) {
        ctx.ui.notify("No active mission. Use /mission <description> to start one.", "info");
        return;
      }

      const elapsed = formatDuration(Date.now() - mission.startedAt);
      const lines = [
        `Mission: ${mission.description}`,
        `Started: ${elapsed} ago`,
        ...(mission.completedAt
          ? [`Completed: ${formatDuration(Date.now() - mission.completedAt)} ago`]
          : []),
        "",
        ...mission.phases.map((p, i) => {
          const icon =
            p.status === "done"
              ? "✅"
              : p.status === "active"
                ? "🔄"
                : p.status === "skipped"
                  ? "⏭️"
                  : "⬜";
          const dur =
            p.startedAt && p.completedAt
              ? ` (${formatDuration(p.completedAt - p.startedAt)})`
              : p.startedAt
                ? ` (${formatDuration(Date.now() - p.startedAt)} elapsed)`
                : "";
          return `${icon} Phase ${i + 1}: ${p.emoji} ${p.name}${dur}`;
        }),
      ].filter(Boolean);

      await ctx.ui.select("Mission Status", lines);
    },
  });

  pi.registerCommand("mission-skip", {
    description: "Skip the current mission phase",
    handler: async (_args, ctx) => {
      if (!mission || mission.completedAt) {
        ctx.ui.notify("No active mission phase to skip.", "warning");
        return;
      }

      const current = mission.phases[mission.currentPhase];
      const ok = await ctx.ui.confirm("Skip Phase", `Skip "${current.name}" phase?`);
      if (!ok) return;

      current.status = "skipped";
      current.completedAt = Date.now();

      if (mission.currentPhase + 1 < mission.phases.length) {
        mission.currentPhase++;
        mission.phases[mission.currentPhase].status = "active";
        mission.phases[mission.currentPhase].startedAt = Date.now();
      } else {
        mission.completedAt = Date.now();
      }

      saveMissionState();
      updateWidget(ctx);

      const nextPhase = mission.phases[mission.currentPhase];
      ctx.ui.notify(
        mission.completedAt
          ? "🎉 Mission complete!"
          : `Skipped → Phase ${mission.currentPhase + 1}: ${nextPhase.emoji} ${nextPhase.name}`,
        "info",
      );
    },
  });

  pi.registerCommand("mission-done", {
    description: "Mark the current mission as complete",
    handler: async (_args, ctx) => {
      if (!mission) {
        ctx.ui.notify("No active mission.", "warning");
        return;
      }
      if (mission.completedAt) {
        ctx.ui.notify("Mission already completed.", "info");
        return;
      }

      const ok = await ctx.ui.confirm("Complete Mission", "Mark mission as done?");
      if (!ok) return;

      for (const phase of mission.phases) {
        if (phase.status === "active") {
          phase.status = "done";
          phase.completedAt = Date.now();
        } else if (phase.status === "pending") {
          phase.status = "skipped";
        }
      }

      mission.completedAt = Date.now();
      saveMissionState();
      updateWidget(ctx);

      ctx.ui.notify(`🎉 Mission complete! (${formatDuration(Date.now() - mission.startedAt)})`, "info");
    },
  });

  pi.registerCommand("mission-reset", {
    description: "Clear mission state and widget",
    handler: async (_args, ctx) => {
      if (!mission) {
        ctx.ui.notify("No mission to reset.", "info");
        return;
      }

      const ok = await ctx.ui.confirm("Reset Mission", "Clear all mission state?");
      if (!ok) return;

      mission = null;
      ctx.ui.setWidget("mission", undefined);
      ctx.ui.notify("Mission cleared.", "info");
    },
  });

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  function saveMissionState() {
    if (mission) {
      pi.appendEntry("mission-state", { ...mission });
    }
  }

  function updateWidget(ctx: Pick<ExtensionContext, "ui">) {
    if (!mission) {
      ctx.ui.setWidget("mission", undefined);
      return;
    }

    if (mission.completedAt) {
      const elapsed = formatDuration(mission.completedAt - mission.startedAt);
      ctx.ui.setWidget("mission", [`🎉 Mission complete (${elapsed}): ${mission.description}`]);
      setTimeout(() => ctx.ui.setWidget("mission", undefined), 30_000);
      return;
    }

    const done = mission.phases.filter((p) => p.status === "done").length;
    const total = mission.phases.length;
    const bar = mission.phases
      .map((p) =>
        p.status === "done" ? "█" : p.status === "active" ? "▓" : "░",
      )
      .join("");

    const current = mission.phases[mission.currentPhase];
    ctx.ui.setWidget("mission", [
      `🎯 ${mission.description}`,
      `${bar} ${current.emoji} Phase ${mission.currentPhase + 1}/${total}: ${current.name} (${done}/${total} done)`,
    ]);
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
