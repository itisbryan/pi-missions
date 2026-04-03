# Changelog

## 0.2.1

### Fixed
- Package name updated to `pi-missions` (plural) to match GitHub repo
- Added npm and local path install methods to README
- Added demo.svg showcasing Mission Control, phases, modes, and validation
- Added demo image to README header

## 0.2.0

Complete rewrite — Factory.ai-inspired mission orchestration system.

### Added
- 3 mission modes: Standard (6-phase), Full (milestones + features), Minimal (3-phase)
- Mission Control overlay with inline P/S/D/R/M/V actions (`Ctrl+Shift+M`)
- Per-phase model assignment with auto-switching via `modelRegistry`
- Autonomy levels: Low / Medium / High
- Validation assertion tracking with auto-detection from LLM output
- `mission_update` custom LLM-callable tool for managing features and assertions
- Interactive planning questionnaire (mode, autonomy, models, constraints)
- Pause/resume with history tracking
- Session name lifecycle (🎯 active, ✅ completed)
- Full session lifecycle handling (start/switch/fork/tree/compact)
- Factory-grade system prompts (planning, audit, verify, execution protocols)
- Test suite (85 tests) + ESLint + Vitest

### Changed
- Modular architecture: 13 focused files vs original single 461-line file
- 8 commands (up from 5) + keyboard shortcut

## 0.1.0

Initial release — 6-phase linear missions with phase auto-detection, widget, and state persistence.
