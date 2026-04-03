// extensions/tools.ts — Custom LLM-callable tools for mission management

import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { MissionState, MissionFeature, ValidationAssertion } from "./types.ts";
import { saveMissionState, addProgressEvent } from "./state.ts";
import { updateWidget } from "./widget.ts";

// ---------------------------------------------------------------------------
// Tool: mission_update
// ---------------------------------------------------------------------------

const AddFeatureParams = Type.Object({
  action: Type.Literal("add_feature"),
  milestone: Type.String({ description: "Name of the milestone to add the feature to" }),
  id: Type.String({ description: "Unique feature ID (e.g. 'feat-auth-login')" }),
  description: Type.String({ description: "What this feature delivers" }),
  preconditions: Type.Optional(Type.Array(Type.String(), { description: "What must be true before starting" })),
  expectedBehavior: Type.Optional(Type.Array(Type.String(), { description: "Observable behaviors when complete" })),
  verificationSteps: Type.Optional(Type.Array(Type.String(), { description: "How to verify correctness" })),
  fulfills: Type.Optional(Type.Array(Type.String(), { description: "Validation assertion IDs this feature satisfies" })),
});

const AddAssertionParams = Type.Object({
  action: Type.Literal("add_assertion"),
  id: Type.String({ description: "Assertion ID (e.g. 'VAL-AUTH-001')" }),
  area: Type.String({ description: "Domain area (e.g. 'authentication')" }),
  title: Type.String({ description: "Short title" }),
  description: Type.String({ description: "Testable behavioral description" }),
});

const UpdateFeatureStatusParams = Type.Object({
  action: Type.Literal("update_feature_status"),
  featureId: Type.String({ description: "Feature ID to update" }),
  status: Type.Union([
    Type.Literal("pending"),
    Type.Literal("active"),
    Type.Literal("done"),
    Type.Literal("failed"),
    Type.Literal("cancelled"),
  ]),
});

const MissionUpdateParams = Type.Union([
  AddFeatureParams,
  AddAssertionParams,
  UpdateFeatureStatusParams,
]);

/**
 * Register the `mission_update` tool that allows the LLM to manage
 * mission features and validation assertions during full-mode missions.
 */
export function registerMissionTools(
  pi: ExtensionAPI,
  getState: () => MissionState | null,
  setState: (s: MissionState | null) => void,
): void {
  pi.registerTool({
    name: "mission_update",
    label: "Mission Update",
    description:
      "Add features to milestones, add validation assertions, or update feature status " +
      "during a full-mode mission. Use this to populate the mission plan.",
    promptSnippet: "mission_update — Add features/assertions to the mission plan",
    promptGuidelines: [
      "Use mission_update to register features after the user approves the plan in full-mode missions.",
      "Call mission_update with action 'update_feature_status' when completing or failing a feature.",
    ],
    parameters: MissionUpdateParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = getState();
      if (!state) {
        return { type: "text", content: [{ type: "text", text: "No active mission." }] };
      }

      if (state.mode !== "full") {
        return {
          type: "text",
          content: [{ type: "text", text: "mission_update is only available in full mode." }],
        };
      }

      const action = (params as any).action;

      if (action === "add_feature") {
        return handleAddFeature(pi, state, params as any, setState, ctx);
      }

      if (action === "add_assertion") {
        return handleAddAssertion(pi, state, params as any, setState, ctx);
      }

      if (action === "update_feature_status") {
        return handleUpdateFeatureStatus(pi, state, params as any, setState, ctx);
      }

      return {
        type: "text",
        content: [{ type: "text", text: `Unknown action: ${action}` }],
      };
    },
  });
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

function handleAddFeature(
  pi: ExtensionAPI,
  state: MissionState,
  params: {
    milestone: string;
    id: string;
    description: string;
    preconditions?: string[];
    expectedBehavior?: string[];
    verificationSteps?: string[];
    fulfills?: string[];
  },
  setState: (s: MissionState | null) => void,
  ctx: ExtensionContext,
): any {
  if (!state.milestones) {
    return { type: "text", content: [{ type: "text", text: "No milestones defined." }] };
  }

  const milestone = state.milestones.find(
    (m) => m.name.toLowerCase() === params.milestone.toLowerCase(),
  );

  if (!milestone) {
    const available = state.milestones.map((m) => m.name).join(", ");
    return {
      type: "text",
      content: [{ type: "text", text: `Milestone "${params.milestone}" not found. Available: ${available}` }],
    };
  }

  // Check for duplicate ID
  const existingFeature = state.milestones.flatMap((m) => m.features).find((f) => f.id === params.id);
  if (existingFeature) {
    return {
      type: "text",
      content: [{ type: "text", text: `Feature "${params.id}" already exists in milestone "${existingFeature.milestone}".` }],
    };
  }

  const feature: MissionFeature = {
    id: params.id,
    description: params.description,
    milestone: milestone.name,
    preconditions: params.preconditions ?? [],
    expectedBehavior: params.expectedBehavior ?? [],
    verificationSteps: params.verificationSteps ?? [],
    fulfills: params.fulfills ?? [],
    status: "pending",
  };

  milestone.features.push(feature);
  addProgressEvent(state, "feature_start", `Added feature: ${params.id} to ${milestone.name}`);
  setState(state);
  saveMissionState(pi, state);
  updateWidget(ctx, state);

  return {
    type: "text",
    content: [{
      type: "text",
      text: `✓ Feature "${params.id}" added to milestone "${milestone.name}" (${milestone.features.length} features total).`,
    }],
  };
}

function handleAddAssertion(
  pi: ExtensionAPI,
  state: MissionState,
  params: { id: string; area: string; title: string; description: string },
  setState: (s: MissionState | null) => void,
  _ctx: ExtensionContext,
): any {
  if (!state.validationAssertions) {
    state.validationAssertions = [];
  }

  // Check for duplicate
  if (state.validationAssertions.find((a) => a.id === params.id)) {
    return {
      type: "text",
      content: [{ type: "text", text: `Assertion "${params.id}" already exists.` }],
    };
  }

  const assertion: ValidationAssertion = {
    id: params.id,
    area: params.area,
    title: params.title,
    description: params.description,
    status: "pending",
  };

  state.validationAssertions.push(assertion);
  setState(state);
  saveMissionState(pi, state);

  return {
    type: "text",
    content: [{
      type: "text",
      text: `✓ Assertion "${params.id}" added (area: ${params.area}, ${state.validationAssertions.length} total).`,
    }],
  };
}

function handleUpdateFeatureStatus(
  pi: ExtensionAPI,
  state: MissionState,
  params: { featureId: string; status: MissionFeature["status"] },
  setState: (s: MissionState | null) => void,
  ctx: ExtensionContext,
): any {
  if (!state.milestones) {
    return { type: "text", content: [{ type: "text", text: "No milestones defined." }] };
  }

  for (const m of state.milestones) {
    const feature = m.features.find((f) => f.id === params.featureId);
    if (feature) {
      const oldStatus = feature.status;
      feature.status = params.status;

      if (params.status === "active") {
        feature.startedAt = new Date().toISOString();
        state.currentFeature = feature.id;
        state.currentMilestone = m.name;
        if (m.status === "pending") {
          m.status = "active";
          m.startedAt = m.startedAt ?? new Date().toISOString();
        }
      } else if (["done", "failed", "cancelled"].includes(params.status)) {
        feature.completedAt = new Date().toISOString();
      }

      const eventType = params.status === "done" ? "feature_complete"
        : params.status === "failed" ? "feature_failed"
        : "feature_start";
      addProgressEvent(state, eventType, `Feature ${params.featureId}: ${oldStatus} → ${params.status}`);
      setState(state);
      saveMissionState(pi, state);
      updateWidget(ctx, state);

      return {
        type: "text",
        content: [{
          type: "text",
          text: `✓ Feature "${params.featureId}" status: ${oldStatus} → ${params.status}`,
        }],
      };
    }
  }

  return {
    type: "text",
    content: [{ type: "text", text: `Feature "${params.featureId}" not found.` }],
  };
}
