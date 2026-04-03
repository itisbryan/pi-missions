# User Testing

Testing surface and validation approach for pi-mission.

**What belongs here:** Testing surface findings, required testing skills/tools, resource cost classification.

---

## Validation Surface

This is a TypeScript library with no running services or web UI. Validation surfaces are:

1. **TypeScript compilation** — `tsc --noEmit` as hard gate
2. **Code review** — verify architectural decomposition, error handling, no duplication
3. **Manual command testing** — verify commands work in pi agent (requires pi runtime)

### Tools
- `typecheck` — tsc --noEmit for compilation verification
- Manual review — code inspection for architectural quality

## Resource Cost
- Typecheck: negligible (~1s, ~50MB)
- No concurrent validation needed — single surface with minimal resource cost
- Max concurrent validators: N/A (no parallel surfaces)
