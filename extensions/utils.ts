// extensions/utils.ts — Shared utility functions for pi-mission

/**
 * Format milliseconds into a human-readable duration string.
 * Examples: '5s', '3m 20s', '1h 15m'
 */
export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/**
 * Map a phase status to its corresponding emoji icon.
 */
export function getPhaseIcon(status: string): string {
  switch (status) {
    case "done":
      return "✅";
    case "active":
      return "🔄";
    case "skipped":
      return "⏭️";
    case "failed":
      return "❌";
    case "pending":
    default:
      return "⬜";
  }
}

/**
 * Map a feature status to its corresponding text icon.
 */
export function getFeatureIcon(status: string): string {
  switch (status) {
    case "done":
      return "✓";
    case "active":
      return "●";
    case "failed":
      return "✗";
    case "cancelled":
      return "⊘";
    case "pending":
    default:
      return "○";
  }
}

/**
 * Extract text content from an agent message.
 * Filters for content blocks with type 'text', joins them, and lowercases.
 * DRY helper used by the phase-transition detector.
 */
export function extractTextFromMessage(message: any): string {
  return (
    message?.content
      ?.filter((c: { type: string }) => c.type === "text")
      .map((c: { type: string; text: string }) => c.text)
      .join(" ")
      .toLowerCase() ?? ""
  );
}

/**
 * Generate a simple unique ID for features/assertions.
 * Combines a timestamp base with random characters.
 */
export function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${timestamp}-${random}`;
}

/**
 * Truncate a string to a maximum length, adding ellipsis if needed.
 */
export function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}
