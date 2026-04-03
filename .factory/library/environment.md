# Environment

Environment variables, external dependencies, and setup notes.

**What belongs here:** Required env vars, external API keys/services, dependency quirks, platform-specific notes.
**What does NOT belong here:** Service ports/commands (use `.factory/services.yaml`).

---

## Dependencies

All dependencies are peer dependencies provided by the pi runtime:
- `@mariozechner/pi-coding-agent` — extension API (ExtensionAPI, ExtensionContext)
- `@mariozechner/pi-tui` — terminal UI components
- `@sinclair/typebox` — runtime type validation schemas

No npm install needed. No env vars required. No external services.

## Build

TypeScript-only library. No compilation step needed — pi loads `.ts` files directly.
Type checking: `npx tsc --noEmit`
