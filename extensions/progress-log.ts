// extensions/progress-log.ts — Timeline formatting for mission progress events

import type { ProgressEvent } from "./types.ts";
// formatDuration available from utils.ts if needed for event detail formatting

// ---------------------------------------------------------------------------
// Icon mapping
// ---------------------------------------------------------------------------

const EVENT_ICONS: Record<ProgressEvent["type"], string> = {
  phase_complete: "✅",
  phase_start: "🔄",
  mission_pause: "⏸",
  mission_resume: "▶",
  mission_redirect: "↻",
  mission_complete: "🎉",
};

/**
 * Map an event type to its display icon.
 */
export function getEventIcon(type: ProgressEvent["type"]): string {
  return EVENT_ICONS[type] ?? "•";
}

// ---------------------------------------------------------------------------
// Relative time
// ---------------------------------------------------------------------------

/**
 * Convert an ISO-8601 timestamp to a compact relative-time string
 * measured from now.
 *
 * Examples: '<1m', '5m', '2h', '23h', '2d'
 */
export function formatRelativeTime(timestamp: number | string): string {
  const ts = typeof timestamp === "string" ? new Date(timestamp).getTime() : timestamp;
  const deltaMs = Date.now() - ts;
  const seconds = Math.floor(deltaMs / 1000);

  if (seconds < 60) return "<1m";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  return `${days}d`;
}

// ---------------------------------------------------------------------------
// Log formatting
// ---------------------------------------------------------------------------

/**
 * Format progress events as displayable timeline lines.
 *
 * Each line: `<relative_time>  <icon> <detail>`
 *
 * Returns most-recent events first, capped to {@link maxEvents}.
 *
 * @param events    - The full progress log (oldest → newest).
 * @param maxEvents - Maximum lines to return (default `10`).
 */
export function formatProgressLog(
  events: ProgressEvent[],
  maxEvents: number = 10,
): string[] {
  // Most recent first, then cap
  const recent = [...events].reverse().slice(0, maxEvents);

  return recent.map((evt) => {
    const ts = new Date(evt.timestamp).getTime();
    const relTime = formatRelativeTime(ts);
    const icon = getEventIcon(evt.type);
    return `${relTime}  ${icon} ${evt.detail}`;
  });
}
