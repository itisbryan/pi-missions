# pi-mission

Factory.ai-inspired orchestrated missions for [pi](https://github.com/badlogic/pi).

Run structured missions that guide the LLM through multi-phase development — with real-time progress tracking, phase/feature auto-detection, milestone validation, and a Mission Control overlay.

## Install

```bash
pi install /path/to/pi-mission          # local
pi install git:github.com/itisbryan/pi-mission  # git (once published)
```

## Quick Start

```
/mission Add order filtering to admin dashboard
```

The extension walks you through a **planning questionnaire** (mode, autonomy, models), then kicks off the mission with a rich protocol injected into the system prompt.

## Mission Modes

| Mode | Phases | Best For |
|------|--------|----------|
| **Standard** | 6 phases: Architect → Review → Implement → Test → Audit → Verify | Most development tasks |
| **Full** | Milestone-based with feature decomposition & validation | Large multi-feature projects |
| **Minimal** | 3 phases: Plan → Build → Verify | Quick fixes and small tasks |

## Commands

| Command | Description |
|---------|-------------|
| `/mission <description>` | Start a new mission (with planning questionnaire) |
| `/mission` | Quick-check current mission status |
| `/mission-status` | Detailed phase-by-phase status with durations |
| `/mission-features` | View features grouped by milestone (full mode) |
| `/mission-validate` | Show validation assertion status |
| `/mission-skip` | Skip the current phase or feature |
| `/mission-done` | Mark the entire mission as complete |
| `/mission-pause` | Toggle pause/resume |
| `/mission-reset` | Clear mission state and widget |

### Keyboard Shortcut

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+M` | Open Mission Control overlay |

## Mission Control

A dashboard overlay showing current feature, feature list, progress log, and inline actions:

```
┌─ Current Feature ──────────────┐ ┌─ Features ──────── 38/39 ─┐
│ cart-api                        │ │ ● cart-api                 │
│ skill: backend-worker           │ │ ✓ user-auth                │
│ milestone: checkout             │ │ ✓ product-catalog          │
│                                 │ │ ○ payment-integration      │
│ preconditions                   │ ├─ Progress Log ────────────┤
│  • Auth service running         │ │ <1m  ● Feature started     │
│ expected behavior               │ │ 5m   ✓ user-auth done      │
│  • Returns 200 with items       │ │ 23m  ⏸ Mission paused      │
└─────────────────────────────────┘ └────────────────────────────┘
P: Pause  S: Skip  D: Done  R: Redirect  M: Models  V: Validate  Esc: Close
```

## Key Features

### Factory.ai-Inspired Protocol
The system prompt is enriched with battle-tested patterns from Factory.ai:
- **Planning protocol** — Read-only analysis, feature decomposition, requirement tracking
- **Execution protocol** — Structured feature implementation with chain-of-thought reporting
- **Audit protocol** — P0-P3 severity code review (null safety, async, security, architecture)
- **Verify protocol** — Test each validation assertion, collect evidence, report results

### Autonomy Levels
Control how much the AI does without pausing:
- **Low** — Pause after each feature for review
- **Medium** — Pause after each milestone (default)
- **High** — Run to completion, only pause on errors

### Per-Phase Model Assignment
Optionally assign different models to different roles:
- Planning → `claude-opus-4-6` (strongest reasoning)
- Implementation → `claude-sonnet-4` (fast coding)
- Audit → `claude-opus-4-6` (careful review)

### Pause & Resume
Toggle pause anytime with `/mission-pause` or `P` in Mission Control. While paused:
- The AI waits for your direction
- You can redirect, change scope, or adjust models
- Resume picks up exactly where you left off

### Milestone Validation (Full Mode)
Features are grouped into milestones. Each milestone:
- Tracks validation assertions (pass/fail/blocked)
- Seals when all features complete
- Triggers validation before proceeding

## Widget

While a mission is active, a widget above the editor shows real-time progress:

**Simple mode:**
```
🎯 Add order filtering to admin dashboard
████▓░░░ 📐 Phase 2/6: Review Plan (1/6 done)
```

**Full mode:**
```
● Running  ██████████▓░░░  12/15 features
🎯 Build CRM · Milestone: checkout · Feature: cart-api
```

**Paused:**
```
⏸ PAUSED — Add order filtering to admin dashboard
████▓░░░ Phase 2/6: Review Plan — paused 3m ago
```

### LLM Tool (Full Mode)

In full mode, a custom `mission_update` tool is registered that the AI can call to:
- **Add features** to milestones during planning
- **Add validation assertions** to the contract
- **Update feature status** (pending → active → done/failed)

This enables the AI to populate the mission plan programmatically after spec approval.

## Architecture

```
extensions/
├── index.ts             # Thin orchestrator (~290 lines)
├── types.ts             # All interfaces (MissionState, Feature, Milestone, etc.)
├── config.ts            # Mission templates (standard/full/minimal)
├── state.ts             # Persistence + TypeBox validation
├── tools.ts             # Custom LLM-callable tool (mission_update)
├── widget.ts            # Progress widget (phase bar, feature progress, pause)
├── mission-control.ts   # Mission Control overlay with inline actions
├── progress-log.ts      # Event timeline tracking
├── detector.ts          # Phase/feature/milestone/assertion detection
├── protocol.ts          # Factory-grade system prompt generation
├── planner.ts           # Interactive planning questionnaire
├── commands.ts          # 8 commands + Ctrl+Shift+M shortcut
└── utils.ts             # Shared helpers
```

## Development

```bash
# Test locally without installing
pi -e /path/to/pi-mission/extensions/index.ts

# Type check
npx tsc --noEmit
```

## Inspired By

- [Factory.ai Missions](https://factory.ai/news/missions) — Multi-agent orchestration with milestones, features, and validation
- Factory's orchestrator/worker architecture, validation contracts, and skill-aware execution

## License

MIT
