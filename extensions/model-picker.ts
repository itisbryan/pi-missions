// extensions/model-picker.ts — Scrollable, searchable model picker overlay
//
// Replaces raw ctx.ui.select() for model lists that can grow large (50+ items).
// Uses SelectList from @mariozechner/pi-tui for fuzzy search and scrolling.

import type { ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import {
  Container,
  type SelectItem,
  SelectList,
  Spacer,
  Text,
} from "@mariozechner/pi-tui";

/** A model entry with display label and underlying ID for storage. */
export interface ModelOption {
  label: string;
  id: string;
}

/** Maximum visible items before the list scrolls */
const MAX_VISIBLE = 10;

/**
 * Show a scrollable, searchable model picker overlay.
 *
 * @param ctx   Extension command or event context (needs ctx.ui.custom)
 * @param title Header displayed above the list
 * @param models Array of model options — first match wins on enter
 * @returns The selected ModelOption, or null if cancelled
 */
export async function showModelPicker(
  ctx: ExtensionCommandContext | ExtensionContext,
  title: string,
  models: ModelOption[],
): Promise<ModelOption | null> {
  const items: SelectItem[] = models.map((m) => ({
    value: m.id,
    label: m.label,
  }));

  const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
    const container = new Container();

    // Top border
    container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
    container.addChild(new Spacer(1));

    // Title
    container.addChild(new Text(theme.fg("accent", theme.bold(title)), 1, 0));

    // Hint
    container.addChild(
      new Text(theme.fg("muted", "Type to filter · ↑↓ navigate · enter select · esc cancel"), 1, 0),
    );
    container.addChild(new Spacer(1));

    // SelectList — scrollable with fuzzy search built-in
    const selectList = new SelectList(
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
    selectList.onSelect = (item) => done(item.value);
    selectList.onCancel = () => done(null);
    container.addChild(selectList);

    container.addChild(new Spacer(1));

    // Bottom border
    container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

    return {
      render: (w: number) => container.render(w),
      invalidate: () => container.invalidate(),
      handleInput: (data: string) => {
        selectList.handleInput(data);
        tui.requestRender();
      },
    };
  });

  if (result === null) return null;

  // Map back to the full ModelOption
  return models.find((m) => m.id === result) ?? null;
}

/**
 * Build model options from the model registry.
 * Falls back to a static list if the registry is unavailable.
 * Always includes "(current model)" as the first option.
 */
export function getAvailableModelOptions(ctx: ExtensionCommandContext): ModelOption[] {
  try {
    const allModels = ctx.modelRegistry.getAll();
    if (allModels.length > 0) {
      return [
        { label: "(current model)", id: "" },
        ...allModels.map((m: any) => ({
          label: `${m.name ?? m.id}`,
          id: m.id as string,
        })),
      ];
    }
  } catch {
    // Registry not available — fall back
  }
  return [
    { label: "(current model)", id: "" },
    { label: "claude-sonnet-4", id: "claude-sonnet-4" },
    { label: "claude-sonnet-4-5", id: "claude-sonnet-4-5" },
    { label: "claude-haiku-4-5", id: "claude-haiku-4-5" },
    { label: "gpt-4o", id: "gpt-4o" },
    { label: "gpt-4o-mini", id: "gpt-4o-mini" },
  ];
}
