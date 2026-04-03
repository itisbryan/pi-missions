<div align="center">

# pi-mission

### Factory.ai-inspired mission orchestration for pi

**[Install](#install)** · **[Usage](#usage)** · **[How it works](#how-it-works)** · **[Modes](#modes)**

</div>

Run structured, multi-phase development missions inside [pi](https://github.com/badlogic/pi). Describe your goal, approve the plan, and let the orchestration layer track progress through milestones, features, and validation — with a real-time Mission Control overlay.

Inspired by [Factory.ai Missions](https://factory.ai/news/missions).

---

## Install

```bash
pi install git:github.com/itisbryan/pi-missions
```

Then `/reload` in pi.

## Usage

```
/mission Build a user authentication system
```

Pi opens a **planning questionnaire** — choose your mode, autonomy level, and optionally assign different models to different phases — then kicks off the mission.

### Commands

| Command | Description |
|---------|-------------|
| `/mission <description>` | Start a new mission (interactive planner) |
| `/mission` | Quick-check current mission status |
| `/mission-status` | Detailed status with phase/feature durations |
| `/mission-features` | Browse features grouped by milestone (full mode) |
| `/mission-validate` | Show validation assertion status |
| `/mission-skip` | Skip the current phase or feature |
| `/mission-done` | Mark the entire mission as complete |
| `/mission-pause` | Toggle pause/resume |
| `/mission-reset` | Clear mission state and widget |

### Keyboard shortcut

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+M` | Open Mission Control overlay |

## Mission Control

A dashboard overlay with inline actions — no need to type commands:

```
┌─ Current Feature ──────────────────┐ ┌─ Features ──────── 12/15 ─┐
│ cart-api                            │ │ ● cart-api                 │
│ skill: backend-worker               │ │ ✓ user-auth                │
│ milestone: checkout                 │ │ ✓ product-catalog          │
│                                     │ │ ○ payment-integration      │
│ preconditions                       │ ├─ Progress Log ────────────┤
│  • Auth service running             │ │ <1m  ● Feature started     │
│ expected behavior                   │ │ 5m   ✓ user-auth done      │
│  • Returns 200 with cart items      │ │ 23m  ⏸ Mission paused      │
└─────────────────────────────────────┘ └────────────────────────────┘
P: Pause  S: Skip  D: Done  R: Redirect  M: Models  V: Validate  Esc: Close
```

| Key | Action |
|-----|--------|
| `P` | Pause / Resume |
| `S` | Skip current phase or feature |
| `D` | Mark mission done |
| `R` | Redirect — type a new instruction for the agent |
| `M` | Edit per-phase model assignment |
| `V` | Show validation contract status |

## Modes

Choose your mode when starting a mission:

| Mode | Structure | Best for |
|------|-----------|----------|
| **Standard** | 6 phases: Architect → Review → Implement → Test → Audit → Verify | Most development tasks |
| **Full** | Milestones + features + validation assertions | Large multi-feature projects |
| **Minimal** | 3 phases: Plan → Build → Verify | Quick fixes and small changes |

### Standard / Minimal — phase widget

```
🎯 Build user authentication
████▓░░░ 📐 Phase 2/6: Review Plan (1/6 done)
```

### Full — feature widget

```
● Running  ██████████▓░░░  12/15 features
🎯 Build user authentication · Milestone: auth · Feature: jwt-tokens
```

### Paused

```
⏸ PAUSED (3m) — Build user authentication
████▓░░░ Phase 2/6: Review Plan
```

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  pi session (cwd: /my-project)                              │
│                                                             │
│  /mission Build a CRM                                       │
│     │                                                       │
│     ├─► Planning questionnaire                              │
│     │     Mode? Standard / Full / Minimal                   │
│     │     Autonomy? Low / Medium / High                     │
│     │     Models? (optional per-phase assignment)           │
│     │                                                       │
│     ├─► Mission protocol injected into system prompt        │
│     │   on every turn (before_agent_start)                  │
│     │                                                       │
│     ├─► LLM output scanned after each turn                  │
│     │   (message_end) for:                                  │
│     │     Phase transitions ("Phase 1 complete")            │
│     │     Feature transitions ("Feature cart-api done")     │
│     │     Milestone transitions                             │
│     │     Assertion results ("VAL-AUTH-001 passed")         │
│     │     Spec approval ("Plan approved")                   │
│     │                                                       │
│     ├─► State persists in session entries                   │
│     │   (survives /compact and session restarts)            │
│     │                                                       │
│     └─► Widget + Mission Control show live progress         │
│                                                             │
│  Full mode: AI uses mission_update tool to register         │
│  features and assertions after spec approval                │
└─────────────────────────────────────────────────────────────┘
```

### What gets injected into the system prompt

On every turn, the extension appends:

- **Mission protocol** — instructions for the current phase (planning, execution, audit, verify)
- **Current status** — mission description, phase/feature/milestone position, progress counts
- **Autonomy guidance** — when to pause based on Low/Medium/High setting
- **Pause notice** — if paused, tells the agent to wait for direction

### Per-phase model assignment (optional)

Assign different models to different roles during the planner:

```
🧠 Planning & Architecture  →  claude-opus-4-6
🔨 Implementation           →  claude-sonnet-4
🔍 Code Review / Audit      →  claude-opus-4-6
✅ Validation               →  claude-opus-4-6
```

Models switch automatically when phases transition. Uses your actual `modelRegistry` — no hardcoded list.

### Autonomy levels

| Level | Behavior |
|-------|----------|
| **Low** | Pause after every feature, wait for "continue" |
| **Medium** | Pause at milestone boundaries and decision points (default) |
| **High** | Run to completion, only pause on critical failure |

### State persistence

Mission state is stored via `pi.appendEntry()` — custom entries survive `/compact` and session restarts. When you resume a session, the widget and session name are automatically restored.

`/mission-reset` appends a null marker that tells the restore logic to stay cleared — the old state won't reappear.

### Full mode — mission_update tool

In full mode, a custom LLM-callable tool (`mission_update`) is registered. After spec approval, the AI calls it to:

- Add features to milestones
- Add validation assertions
- Update feature status (active / done / failed)

This keeps the state in sync with what the AI is actually doing, not just what it announces in text.

## Architecture

```
extensions/
├── index.ts             # Thin orchestrator (~290 lines)
├── types.ts             # All interfaces (MissionState, Feature, Milestone, etc.)
├── config.ts            # Mission templates (standard / full / minimal)
├── state.ts             # Persistence + TypeBox runtime validation
├── tools.ts             # Custom LLM-callable tool (mission_update)
├── widget.ts            # Progress widget (phase bar / feature bar / pause)
├── mission-control.ts   # Mission Control overlay (P/S/D/R/M/V)
├── progress-log.ts      # Event timeline with relative timestamps
├── detector.ts          # Phase / feature / milestone / assertion detection
├── protocol.ts          # System prompt generation (planning, audit, verify)
├── planner.ts           # Interactive planning questionnaire
├── commands.ts          # 8 commands + Ctrl+Shift+M shortcut
└── utils.ts             # Shared helpers
```

## Development

```bash
# Install dependencies
npm install

# Type check
npm run typecheck

# Lint
npm run lint

# Run tests
npm test

# Test in watch mode
npm run test:watch

# Test locally without installing
pi -e /path/to/pi-missions/extensions/index.ts
```

### Tests

The test suite covers core logic that doesn't depend on the pi runtime:

```
tests/
├── state.test.ts     — state persistence, advancePhase, advanceFeature, addProgressEvent
├── detector.test.ts  — phase/feature/milestone/assertion detection patterns
└── utils.test.ts     — formatDuration, icons, extractText, truncate, generateId
```

## Inspired By

- [Factory.ai Missions](https://factory.ai/news/missions) — multi-agent orchestration with milestones, features, and validation
- Factory's orchestrator/worker architecture, validation contracts, and skill-aware execution patterns

## License

MIT
