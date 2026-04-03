---
name: refactor-worker
description: Refactors and extracts TypeScript modules for the pi-mission extension
---

# Refactor Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Use for all features in this mission — extracting modules, adding validation, fixing bugs, and rewriting the entry point. Each feature focuses on creating or refactoring a specific module under `extensions/`.

## Required Skills

None — this is pure TypeScript refactoring with no browser or CLI testing surfaces.

## Work Procedure

### Step 1: Understand the Feature

1. Read `mission.md`, `AGENTS.md`, and `.factory/library/architecture.md` for full context.
2. Read the current `extensions/index.ts` to understand the existing code you're refactoring FROM.
3. Read any already-extracted modules in `extensions/` to understand conventions and interfaces.
4. Read the feature description carefully — understand exactly what module(s) to create or modify.

### Step 2: Write Tests First (Red)

Since there's no test framework set up, write **compile-time verification** instead:
1. Before writing implementation, create the target file with just the type signatures and exports.
2. Verify `npx tsc --noEmit` — it should fail because the types exist but aren't implemented.
3. This establishes the contract the implementation must fulfill.

### Step 3: Implement (Green)

1. Write the full implementation in the target file.
2. Import from `@sinclair/typebox` for validation (already a peer dep).
3. Import types from `./types.ts` for shared interfaces.
4. Follow the architectural patterns established in earlier features.
5. Ensure all exports match what other modules will need.

### Step 4: Verify

1. Run `npx tsc --noEmit` — MUST pass with zero errors.
2. If it fails, fix all errors before proceeding.
3. Manually review the code for:
   - No `any` types
   - No hardcoded phase names (use config)
   - No duplicated logic (use shared utilities)
   - Try/catch in all handlers (for commands.ts)
   - No unsafe `as` casts for state restoration

### Step 5: Commit

1. Stage only the files you created/modified.
2. Commit with a descriptive message referencing the feature.
3. Do NOT commit changes to `.factory/` or mission directory.

## Example Handoff

```json
{
  "salientSummary": "Extracted extensions/phase-detector.ts with detectPhaseTransition pure function. Patterns derived from phase names in config, not hardcoded. tsc --noEmit passes. No other files modified.",
  "whatWasImplemented": "Created extensions/phase-detector.ts exporting detectPhaseTransition(text, phases, currentPhase) that returns { type, phaseIndex } | null. Handles 6 completion patterns and 6 transition patterns per phase. Only matches active phases for completion and pending phases for transitions.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      { "command": "npx tsc --noEmit", "exitCode": 0, "observation": "Zero TypeScript errors" }
    ],
    "interactiveChecks": []
  },
  "tests": {
    "added": [
      {
        "file": "extensions/phase-detector.ts",
        "cases": [
          { "name": "detectPhaseTransition", "verifies": "Returns correct result for 'Phase 1 complete' with active phase[0]" },
          { "name": "detectPhaseTransition", "verifies": "Returns null for non-matching text" },
          { "name": "detectPhaseTransition", "verifies": "Patterns built from phase names, not hardcoded" }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- TypeScript compilation fails and you cannot resolve it within the feature scope
- The feature requires changes to `package.json` or `prompts/mission.md`
- The feature depends on a module that hasn't been extracted yet and is blocking your work
- You discover an architectural issue that affects multiple features
