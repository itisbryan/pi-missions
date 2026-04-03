# pi-mission

Orchestrated multi-phase development missions for [pi](https://github.com/badlogic/pi).

Run structured missions that guide the LLM through **Architect → Review → Implement → Test → Audit → Verify** — with real-time progress tracking, phase auto-detection, and persistent state.

## Install

```bash
pi install /path/to/pi-mission          # local
pi install git:github.com/itisbryan/pi-mission  # git (once published)
```

## Usage

```
/mission Add order filtering to admin dashboard
```

The extension:
1. Injects the **Mission Protocol** into the system prompt
2. Sends a kick-off message that starts the Architect phase
3. Tracks phase transitions by detecting phrases in LLM output
4. Shows a **progress widget** above the editor
5. Persists state — survives `/compact` and session restarts

### Commands

| Command | Description |
|---------|-------------|
| `/mission <description>` | Start a new orchestrated mission |
| `/mission` | Quick-check current mission status |
| `/mission-status` | Detailed phase-by-phase status with durations |
| `/mission-skip` | Skip the current phase |
| `/mission-done` | Mark the entire mission as complete |
| `/mission-reset` | Clear mission state and widget |

### Widget

While a mission is active, a widget above the editor shows:

```
🎯 Add order filtering to admin dashboard
█▓░░░░ 📐 Phase 2/6: Review Plan (1/6 done)
```

### Phases

| # | Phase | What happens |
|---|-------|-------------|
| 1 | 📐 Architect | Analyze codebase, produce a plan with file assignments |
| 2 | 👁️ Review Plan | Present plan, wait for user approval |
| 3 | 🔨 Implement | Execute the plan, parallel work when possible |
| 4 | 🧪 Test | Write tests, run suite, fix failures |
| 5 | 🔍 Audit | Review for bugs, security, performance, style |
| 6 | ✅ Verify | Run full test suite + linter, report status |

### Phase auto-detection

The extension listens for phrases like:
- "Phase 1 complete" / "Architect phase done"
- "Moving to Phase 3" / "Starting Implement"

…and automatically advances the tracker.

## Development

```bash
# Test locally without installing
pi -e /path/to/pi-mission/extensions/index.ts
```

## License

MIT
