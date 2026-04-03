# Architecture

How the pi-mission extension works.

## Overview

pi-mission is a TypeScript extension for the pi coding agent that provides orchestrated multi-phase development missions. Users start a mission via `/mission <description>`, and the extension tracks progress through 6 phases (Architect → Review Plan → Implement → Test → Audit → Verify) with auto-detection of phase transitions from LLM output.

## Components

### Extension Entry (index.ts)
Thin orchestration: registers 3 event hooks and 5 commands. Delegates all logic to modules.

### Types (types.ts)
- `MissionPhase` — name, emoji, status, timestamps
- `MissionState` — description, currentPhase, phases[], startedAt, completedAt
- `MissionConfig` — configurable phases with name, emoji, instructions[]

### Config (config.ts)
Default mission configuration with 6 standard phases. Phase names and instructions are defined here.

### Validation (validate.ts)
Uses `@sinclair/typebox` schemas to validate restored mission state at runtime. Returns validated data or null.

### Phase Detector (phase-detector.ts)
Pure function that scans assistant message text for phase transition/completion phrases. Patterns derived from config phase names, not hardcoded.

### State (state.ts)
- `saveMissionState` — persist via `pi.appendEntry`
- `restoreMissionState` — scan entries, validate with typebox, return most recent valid
- `clearMissionState` — handle reset cleanup (clear persisted entries)
- `advancePhase` — shared utility for phase transitions (done/skip/advance)

### Widget (widget.ts)
- `updateWidget` — render progress bar with phase emojis
- `getPhaseIcon` — map status to emoji
- `formatDuration` — human-readable duration

### Protocol (protocol.ts)
- `buildMissionProtocol` — generate system prompt from MissionConfig
- `buildMissionStatus` — generate current status injection text

### Commands (commands.ts)
5 handler functions for `/mission`, `/mission-status`, `/mission-skip`, `/mission-done`, `/mission-reset`.

## Data Flow

1. User runs `/mission <desc>` → state initialized, widget shown, kick-off message sent
2. `before_agent_start` hook injects protocol + status into system prompt each turn
3. `message_end` hook scans assistant output for phase transition phrases
4. On detection: phase status updated, state persisted, widget updated
5. Commands allow manual phase control (skip, done, reset)

## Invariants

- Mission state is always validated before use (typebox)
- Phase transitions use shared advancePhase — no duplication
- All handlers have try/catch — no uncaught exceptions
- Widget always reflects current state via persistAndUpdate
