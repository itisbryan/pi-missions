// extensions/role-assigner.ts — Tabbed role-based model assignment UI
//
// Shows a single overlay with tabs for each role group (Planner / Worker / Validator).
// Tab to switch, type to fuzzy-filter, Enter to assign, auto-advances to next.
// Persists defaults to .pi/mission-model-defaults.json so subsequent missions
// skip the assignment step.

import * as fs from "fs";
import * as path from "path";
import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import {
  Container,
  fuzzyFilter,
  Input,
  Key,
  matchesKey,
  type SelectItem,
  SelectList,
  Spacer,
  Text,
} from "@mariozechner/pi-tui";
import type { ModelAssignment } from "./types.ts";
import { getAvailableModelOptions, type ModelOption } from "./model-picker.ts";

// ---------------------------------------------------------------------------
// Role groups — maps template key to 3 logical tabs
// ---------------------------------------------------------------------------

interface RoleGroup {
  label: string;
  emoji: string;
  /** Which PHASE_ROLE_MAP roles this group covers */
  roles: string[];
}

const STANDARD_GROUPS: RoleGroup[] = [
  { label: "Planner", emoji: "📐", roles: ["planner", "reviewer"] },
  { label: "Worker", emoji: "🔨", roles: ["coder", "tester"] },
  { label: "Validator", emoji: "✅", roles: ["auditor", "verifier"] },
];

const MINIMAL_GROUPS: RoleGroup[] = [
  { label: "Planner", emoji: "📐", roles: ["planner"] },
  { label: "Worker", emoji: "🔨", roles: ["coder"] },
  { label: "Validator", emoji: "✅", roles: ["verifier"] },
];

export function getRoleGroups(templateKey: string): RoleGroup[] {
  return templateKey === "minimal" ? MINIMAL_GROUPS : STANDARD_GROUPS;
}

// ---------------------------------------------------------------------------
// Persistence — project-local defaults
// ---------------------------------------------------------------------------

const DEFAULTS_FILE = ".pi/mission-model-defaults.json";

export function loadModelDefaults(): ModelAssignment | null {
  try {
    const fullPath = path.resolve(DEFAULTS_FILE);
    if (fs.existsSync(fullPath)) {
      const data = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
      if (data && typeof data === "object" && Object.keys(data).length > 0) {
        return data as ModelAssignment;
      }
    }
  } catch {
    // Corrupted or inaccessible — treat as no defaults
  }
  return null;
}

export function saveModelDefaults(assignment: ModelAssignment): void {
  try {
    const fullPath = path.resolve(DEFAULTS_FILE);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, JSON.stringify(assignment, null, 2) + "\n");
  } catch {
    // Best-effort — don't crash the mission
  }
}

/**
 * Validate saved defaults against the current model registry.
 * Returns null if any assigned model ID is no longer available.
 */
export function validateDefaults(
  defaults: ModelAssignment,
  available: ModelOption[],
): ModelAssignment | null {
  const ids = new Set(available.map((m) => m.id));
  for (const modelId of Object.values(defaults)) {
    if (modelId && !ids.has(modelId)) return null;
  }
  return defaults;
}

// ---------------------------------------------------------------------------
// Tabbed role model assigner UI
// ---------------------------------------------------------------------------

/** Max visible models in the scrollable list */
const MAX_VISIBLE = 8;

/**
 * Show a tabbed model assignment overlay.
 *
 * Each tab represents a role group (Planner / Worker / Validator).
 * The user picks a model per group. When all groups are assigned,
 * the overlay auto-closes and returns the full ModelAssignment.
 *
 * @returns ModelAssignment mapping each role → model ID, or null if cancelled
 */
export async function showRoleModelAssigner(
  ctx: ExtensionCommandContext,
  templateKey: string,
): Promise<ModelAssignment | null> {
  const groups = getRoleGroups(templateKey);
  const modelOptions = getAvailableModelOptions(ctx).filter((m) => m.id);
  const allItems: SelectItem[] = modelOptions.map((m) => ({
    value: m.id,
    label: m.label,
  }));

  if (allItems.length === 0) return {};

  return ctx.ui.custom<ModelAssignment | null>((tui, theme, _kb, done) => {
    // ── State ──────────────────────────────────────────────────────────
    let activeTab = 0;
    const assigned = new Map<number, SelectItem>();

    // ── Build container ────────────────────────────────────────────────
    const container = new Container();

    // Top border
    container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

    // Tab bar (rebuilt on every tab switch)
    const tabBarText = new Text("", 1, 0);
    container.addChild(tabBarText);
    container.addChild(new Spacer(1));

    // Search input
    const searchInput = new Input();
    container.addChild(searchInput);
    container.addChild(new Spacer(1));

    // Model list (rebuilt on filter/tab changes)
    let currentItems = [...allItems];
    let selectList = buildSelectList(currentItems);
    const listContainer = new Container();
    listContainer.addChild(selectList);
    container.addChild(listContainer);

    container.addChild(new Spacer(1));

    // Assigned summary (rebuilt on assignment)
    const summaryText = new Text("", 1, 0);
    container.addChild(summaryText);

    // Key hints
    container.addChild(
      new Text(
        theme.fg("dim", "↑↓ navigate · Enter select · Tab switch · Esc cancel"),
        1,
        0,
      ),
    );
    container.addChild(new Spacer(1));

    // Bottom border
    container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

    // ── Helpers ────────────────────────────────────────────────────────

    function buildSelectList(items: SelectItem[]): SelectList {
      const sl = new SelectList(
        items,
        Math.min(items.length, MAX_VISIBLE),
        {
          selectedPrefix: (t) => theme.fg("accent", t),
          selectedText: (t) => theme.fg("accent", t),
          description: (t) => theme.fg("muted", t),
          scrollInfo: (t) => theme.fg("dim", t),
          noMatch: (t) => theme.fg("warning", t),
        },
      );
      sl.onSelect = handleModelSelect;
      sl.onCancel = () => done(null);
      return sl;
    }

    function rebuildList() {
      const query = searchInput.getValue();
      currentItems = query
        ? fuzzyFilter(allItems, query, (item) => `${item.label} ${item.value}`)
        : [...allItems];
      selectList = buildSelectList(currentItems);
      listContainer.clear();
      listContainer.addChild(selectList);
    }

    function updateTabBar() {
      const group = groups[activeTab];
      const tabs = groups.map((g, i) => {
        const isActive = i === activeTab;
        const isAssigned = assigned.has(i);
        const dot = isActive ? "●" : isAssigned ? "✓" : "○";
        const label = `${dot} ${g.label}`;
        if (isActive) return theme.fg("accent", label);
        if (isAssigned) return theme.fg("success", label);
        return theme.fg("muted", label);
      });
      const roleHint = theme.fg("dim", ` (${group.roles.join(", ")})`);
      tabBarText.setText(
        "  Select Model    " + tabs.join(theme.fg("muted", " │ ")) + roleHint,
      );
    }

    function updateSummary() {
      const lines: string[] = [];
      for (let i = 0; i < groups.length; i++) {
        if (assigned.has(i)) {
          const g = groups[i];
          const model = assigned.get(i)!;
          lines.push(
            theme.fg("muted", `  ${g.emoji} ${g.label}: `) +
              theme.fg("success", model.label),
          );
        }
      }
      summaryText.setText(lines.length > 0 ? lines.join("\n") : "");
    }

    function handleModelSelect(item: SelectItem) {
      assigned.set(activeTab, item);

      // Find next unassigned group
      let next = -1;
      for (let i = 1; i <= groups.length; i++) {
        const idx = (activeTab + i) % groups.length;
        if (!assigned.has(idx)) {
          next = idx;
          break;
        }
      }

      if (next !== -1) {
        // Advance to next unassigned tab
        activeTab = next;
        searchInput.setValue("");
        rebuildList();
        updateTabBar();
        updateSummary();
        tui.requestRender();
      } else {
        // All assigned — build result and close
        const result: ModelAssignment = {};
        for (const [groupIdx, model] of assigned) {
          for (const role of groups[groupIdx].roles) {
            result[role] = model.value;
          }
        }
        done(result);
      }
    }

    function switchTab(direction: number) {
      activeTab = (activeTab + direction + groups.length) % groups.length;
      searchInput.setValue("");
      rebuildList();
      updateTabBar();
      tui.requestRender();
    }

    // ── Initial render ─────────────────────────────────────────────────
    updateTabBar();
    updateSummary();

    // ── Component interface ────────────────────────────────────────────
    // Track the last search value to detect changes
    let lastSearch = "";

    return {
      // Focusable — propagate to searchInput for IME cursor positioning
      get focused() {
        return searchInput.focused;
      },
      set focused(value: boolean) {
        searchInput.focused = value;
      },

      render: (w: number) => container.render(w),
      invalidate: () => container.invalidate(),

      handleInput: (data: string) => {
        // Tab → switch to next group
        if (matchesKey(data, Key.tab)) {
          switchTab(1);
          return;
        }
        // Shift+Tab → switch to previous group
        if (matchesKey(data, Key.shift("tab"))) {
          switchTab(-1);
          return;
        }
        // Escape → cancel (or clear search first)
        if (matchesKey(data, Key.escape)) {
          if (searchInput.getValue()) {
            searchInput.setValue("");
            rebuildList();
            tui.requestRender();
          } else {
            done(null);
          }
          return;
        }
        // Up/Down → pass to SelectList for navigation
        if (matchesKey(data, Key.up) || matchesKey(data, Key.down)) {
          selectList.handleInput(data);
          tui.requestRender();
          return;
        }
        // Enter → pass to SelectList (triggers onSelect)
        if (matchesKey(data, Key.enter)) {
          selectList.handleInput(data);
          tui.requestRender();
          return;
        }
        // Everything else → search input
        searchInput.handleInput(data);
        const newSearch = searchInput.getValue();
        if (newSearch !== lastSearch) {
          lastSearch = newSearch;
          rebuildList();
        }
        tui.requestRender();
      },
    };
  });
}
