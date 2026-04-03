// extensions/detector.ts — Detect phase/feature/milestone transitions from LLM output

import type { MissionPhase, MissionFeature, MissionMilestone, ValidationAssertion } from "./types.ts";

// ---------------------------------------------------------------------------
// Phase Detection
// ---------------------------------------------------------------------------

interface PhaseTransitionResult {
  type: "complete" | "transition";
  phaseIndex: number;
}

/**
 * Detect phase completion or transition signals in LLM output.
 *
 * Builds regex patterns dynamically from the phase list — nothing is hardcoded.
 * Completion only matches phases with status `"active"`.
 * Transition only matches phases with status `"pending"`.
 *
 * @param text - Already-lowercased LLM output
 */
export function detectPhaseTransition(
  text: string,
  phases: MissionPhase[],
  _currentPhase?: number,
): PhaseTransitionResult | null {
  // Escape special regex characters in a name
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // --- Completion patterns (active phases only) ---
  for (let i = 0; i < phases.length; i++) {
    if (phases[i].status !== "active") continue;

    const num = i + 1; // 1-based index shown to users
    const name = esc(phases[i].name.toLowerCase());

    const completionPatterns = [
      new RegExp(`phase\\s+${num}\\s+complete`),
      new RegExp(`phase\\s+${num}\\s+done`),
      new RegExp(`phase\\s+${num}\\s+\\(${name}\\)\\s+complete`),
      new RegExp(`${name}\\s+complete`),
      new RegExp(`${name}\\s+phase\\s+complete`),
      new RegExp(`completed\\s+phase\\s+${num}`),
      new RegExp(`completed\\s+the\\s+${name}\\s+phase`),
    ];

    for (const pattern of completionPatterns) {
      if (pattern.test(text)) {
        return { type: "complete", phaseIndex: i };
      }
    }
  }

  // --- Transition patterns (pending phases only) ---
  for (let i = 0; i < phases.length; i++) {
    if (phases[i].status !== "pending") continue;

    const num = i + 1;
    const name = esc(phases[i].name.toLowerCase());

    const transitionPatterns = [
      new RegExp(`moving\\s+to\\s+phase\\s+${num}`),
      new RegExp(`starting\\s+phase\\s+${num}`),
      new RegExp(`proceeding\\s+to\\s+phase\\s+${num}`),
      new RegExp(`beginning\\s+${name}`),
      new RegExp(`starting\\s+${name}`),
      new RegExp(`now\\s+entering\\s+phase\\s+${num}`),
    ];

    for (const pattern of transitionPatterns) {
      if (pattern.test(text)) {
        return { type: "transition", phaseIndex: i };
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Feature Detection
// ---------------------------------------------------------------------------

interface FeatureTransitionResult {
  type: "complete" | "start" | "failed";
  featureId: string;
}

/**
 * Detect feature lifecycle signals in LLM output.
 *
 * Matches features by their unique ID.
 *
 * @param text - Already-lowercased LLM output
 */
export function detectFeatureTransition(
  text: string,
  features: MissionFeature[],
): FeatureTransitionResult | null {
  for (const feature of features) {
    const id = feature.id.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Order matters — check completion before start so "completed feature X"
    // isn't accidentally caught by a start pattern first.
    const patterns: { pattern: RegExp; type: FeatureTransitionResult["type"] }[] = [
      { pattern: new RegExp(`feature\\s+${id}\\s+complete`), type: "complete" },
      { pattern: new RegExp(`feature\\s+${id}\\s+done`), type: "complete" },
      { pattern: new RegExp(`completed\\s+feature\\s+${id}`), type: "complete" },
      { pattern: new RegExp(`feature\\s+${id}\\s+failed`), type: "failed" },
      { pattern: new RegExp(`starting\\s+feature\\s+${id}`), type: "start" },
    ];

    for (const { pattern, type } of patterns) {
      if (pattern.test(text)) {
        return { type, featureId: feature.id };
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Milestone Detection
// ---------------------------------------------------------------------------

interface MilestoneTransitionResult {
  type: "complete" | "start";
  milestoneIndex: number;
}

/**
 * Detect milestone lifecycle signals in LLM output.
 *
 * Matches by 1-based index or by name.
 *
 * @param text - Already-lowercased LLM output
 */
export function detectMilestoneTransition(
  text: string,
  milestones: MissionMilestone[],
): MilestoneTransitionResult | null {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  for (let i = 0; i < milestones.length; i++) {
    const num = i + 1;
    const name = esc(milestones[i].name.toLowerCase());

    const patterns: { pattern: RegExp; type: MilestoneTransitionResult["type"] }[] = [
      { pattern: new RegExp(`milestone\\s+${num}\\s+complete`), type: "complete" },
      { pattern: new RegExp(`milestone\\s+${name}\\s+complete`), type: "complete" },
      { pattern: new RegExp(`${name}\\s+milestone\\s+complete`), type: "complete" },
      { pattern: new RegExp(`starting\\s+milestone\\s+${num}`), type: "start" },
      { pattern: new RegExp(`starting\\s+milestone\\s+${name}`), type: "start" },
    ];

    for (const { pattern, type } of patterns) {
      if (pattern.test(text)) {
        return { type, milestoneIndex: i };
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Validation Assertion Detection
// ---------------------------------------------------------------------------

interface AssertionDetectionResult {
  type: "passed" | "failed";
  assertionId: string;
}

/**
 * Detect validation assertion results in LLM output.
 *
 * Scans for patterns like:
 *   - "assertion VAL-AUTH-001 passed"
 *   - "VAL-AUTH-001: passed"
 *   - "VAL-AUTH-001 failed"
 *   - "assertion VAL-AUTH-001 verified"
 *
 * @param text - Already-lowercased LLM output
 */
export function detectAssertionResult(
  text: string,
  assertions: ValidationAssertion[],
): AssertionDetectionResult | null {
  for (const assertion of assertions) {
    // Only check pending/failed assertions (don't re-detect already passed)
    if (assertion.status !== "pending" && assertion.status !== "failed") continue;

    const id = assertion.id.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const passPatterns = [
      new RegExp(`${id}[:\\s]+pass(?:ed)?`),
      new RegExp(`assertion\\s+${id}\\s+pass(?:ed)?`),
      new RegExp(`${id}\\s+verified`),
      new RegExp(`assertion\\s+${id}\\s+verified`),
    ];

    const failPatterns = [
      new RegExp(`${id}[:\\s]+fail(?:ed)?`),
      new RegExp(`assertion\\s+${id}\\s+fail(?:ed)?`),
    ];

    for (const pattern of passPatterns) {
      if (pattern.test(text)) {
        return { type: "passed", assertionId: assertion.id };
      }
    }

    for (const pattern of failPatterns) {
      if (pattern.test(text)) {
        return { type: "failed", assertionId: assertion.id };
      }
    }
  }

  return null;
}
