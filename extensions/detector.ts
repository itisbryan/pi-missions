// extensions/detector.ts — Detect phase/feature/milestone transitions from LLM output

import type { MissionPhase } from "./types.ts";

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
      // Explicit phase number patterns
      new RegExp(`phase\\s+${num}\\s+complete`),
      new RegExp(`phase\\s+${num}\\s+done`),
      new RegExp(`phase\\s+${num}\\s+\\(${name}\\)\\s+complete`),
      new RegExp(`${name}\\s+complete`),
      new RegExp(`${name}\\s+phase\\s+complete`),
      new RegExp(`completed\\s+phase\\s+${num}`),
      new RegExp(`completed\\s+the\\s+${name}\\s+phase`),
      // Natural language completion patterns
      new RegExp(`i'?ve?\\s+completed\\s+(?:the\\s+)?${name}`),
      new RegExp(`i'?m\\s+done\\s+(?:with\\s+)?(?:the\\s+)?${name}`),
      new RegExp(`finished\\s+(?:the\\s+)?${name}\\s+phase`),
      new RegExp(`done\\s+with\\s+(?:the\\s+)?${name}`),
      new RegExp(`wrapped\\s+up\\s+(?:the\\s+)?${name}`),
      new RegExp(`${name}\\s+is\\s+done`),
      new RegExp(`${name}\\s+is\\s+complete`),
      new RegExp(`that\\s+concludes\\s+(?:the\\s+)?${name}`),
      new RegExp(`that\\s+wraps\\s+up\\s+(?:the\\s+)?${name}`),
      // Generic "phase complete" without number/name
      new RegExp(`phase\\s+${num}\\s+is\\s+complete`),
      new RegExp(`${name}\\s+phase\\s+is\\s+done`),
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
      // Explicit phase number patterns
      new RegExp(`moving\\s+to\\s+phase\\s+${num}`),
      new RegExp(`starting\\s+phase\\s+${num}`),
      new RegExp(`proceeding\\s+to\\s+phase\\s+${num}`),
      new RegExp(`beginning\\s+${name}`),
      new RegExp(`starting\\s+${name}`),
      new RegExp(`now\\s+entering\\s+phase\\s+${num}`),
      // Natural language transition patterns
      new RegExp(`moving\\s+on\\s+to\\s+(?:the\\s+)?${name}`),
      new RegExp(`let'?s\\s+(?:now\\s+)?(?:start|begin|move\\s+to)\\s+${name}`),
      new RegExp(`now\\s+(?:let'?s\\s+)?(?:moving\\s+)?(?:on\\s+)?(?:to\\s+)?(?:the\\s+)?${name}`),
      new RegExp(`proceeding\\s+with\\s+(?:the\\s+)?${name}`),
      new RegExp(`next\\s+up\\s*(?:is\\s*)?(?:the\\s+)?${name}`),
      new RegExp(` transitioning\\s+to\\s+(?:the\\s+)?${name}`),
      new RegExp(`now\\s+(?:moving\\s+)?(?:to|into)\\s+(?:the\\s+)?${name}\\s+phase`),
    ];

    for (const pattern of transitionPatterns) {
      if (pattern.test(text)) {
        return { type: "transition", phaseIndex: i };
      }
    }
  }

  return null;
}


