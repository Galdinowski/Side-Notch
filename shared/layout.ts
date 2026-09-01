import type { ViewMode, WidgetDock } from "./types.js";

export const PILL_INSET: Record<WidgetDock, { x: number; y: number }> = {
  floating: { x: 4, y: 4 },
  left: { x: 6, y: 4 },
  right: { x: 6, y: 4 },
  top: { x: 56, y: 36 },
};

export function isHorizontalDock(dock: WidgetDock): boolean {
  return dock === "floating" || dock === "top";
}

export function compactSize(
  dock: WidgetDock,
  slotCount = 0,
): { width: number; height: number } {
  const n = Math.max(0, slotCount);
  if (dock === "top") {
    if (n <= 0) return { width: 156, height: 70 };
    return { width: 104 + n * 92, height: 82 };
  }
  if (dock === "floating") {
    if (n <= 0) return { width: 44, height: 42 };
    return { width: 48 + n * 92, height: 46 };
  }
  if (n <= 0) return { width: 48, height: 48 };
  return { width: 88, height: 28 + n * 62 };
}

export function toastSize(dock: WidgetDock, eventCount = 1): { width: number; height: number } {
  const events = Math.min(4, Math.max(1, eventCount));
  if (dock === "top") return { width: 448, height: 84 + events * 48 };
  if (dock === "left" || dock === "right") return { width: 320, height: 76 + events * 56 };
  return { width: 404, height: 72 + events * 48 };
}

export function panelSize(
  mode: "preview" | "expanded",
  dock: WidgetDock,
  slotCount: number,
  workHeight: number,
): { width: number; height: number } {
  const slots = Math.max(1, slotCount);
  const top = dock === "top";
  if (mode === "preview") {
    const width = dock === "left" || dock === "right" ? 400 : 428;
    const height = 92 + slots * 118;
    const size = { width, height: Math.min(height, workHeight - 16) };
    if (!top) return size;
    return {
      width: size.width + PILL_INSET.top.x - PILL_INSET.floating.x,
      height: size.height + PILL_INSET.top.y - PILL_INSET.floating.y,
    };
  }
  const width = dock === "left" || dock === "right" ? 500 : 520;
  const height = 108 + slots * 168;
  const size = { width, height: Math.min(height, workHeight - 16) };
  if (!top) return size;
  return {
    width: size.width + PILL_INSET.top.x - PILL_INSET.floating.x,
    height: size.height + PILL_INSET.top.y - PILL_INSET.floating.y,
  };
}

export function sizeForMode(
  mode: ViewMode,
  dock: WidgetDock,
  slotCount: number,
  workHeight: number,
): { width: number; height: number } {
  if (mode === "compact") {
    return compactSize(dock, slotCount);
  }
  if (mode === "toast") {
    return toastSize(dock, slotCount);
  }
  return panelSize(mode, dock, slotCount, workHeight);
}

export function pillSizeForWindow(
  windowSize: { width: number; height: number },
  dock: WidgetDock,
): { width: number; height: number } {
  const inset = PILL_INSET[dock];
  return {
    width: Math.max(1, windowSize.width - inset.x),
    height: Math.max(1, windowSize.height - inset.y),
  };
}
