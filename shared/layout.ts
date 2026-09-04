import type { ViewMode, WidgetDock } from "./types.js";

export const PILL_INSET: Record<WidgetDock, { x: number; y: number }> = {
  floating: { x: 4, y: 4 },
  left: { x: 6, y: 4 },
  right: { x: 6, y: 4 },
  top: { x: 56, y: 36 },
  "bottom-left": { x: 6, y: 6 },
  "bottom-right": { x: 6, y: 6 },
};

export function isCornerDock(dock: WidgetDock): boolean {
  return dock === "bottom-left" || dock === "bottom-right";
}

export function isSideDock(dock: WidgetDock): boolean {
  return dock === "left" || dock === "right" || isCornerDock(dock);
}

export function isHorizontalDock(dock: WidgetDock): boolean {
  return dock === "floating" || dock === "top";
}

export function compactSize(
  dock: WidgetDock,
  slotCount = 0,
  workWidth?: number,
  workHeight?: number,
): { width: number; height: number } {
  const n = Math.max(0, slotCount);
  if (dock === "top") {
    if (n <= 0) return { width: workWidth ?? 320, height: 110 };
    return { width: 120 + n * 108, height: 84 };
  }
  if (dock === "floating") {
    if (n <= 0) return { width: 96, height: 64 };
    return { width: 56 + n * 108, height: 48 };
  }
  if (n <= 0) {
    // Traversing pets are position:fixed inside a window that already spans the
    // edge. Corner pets sit still as a coil, so the window stays compact.
    if (dock === "left" || dock === "right") {
      return { width: 96, height: workHeight ?? 220 };
    }
    return { width: 200, height: 184 };
  }
  return { width: 96, height: 32 + n * 64 };
}

/** IslandToast padding 12+16, header 14, header gap 7, leftover 8 under the last card. */
const TOAST_CHROME_H = 57;
/** One event: pad 12, border 2, title 13/1.25, body 12/1.3, copy gap 2. */
const TOAST_EVENT_H = 48;
/** Extra body line so a wrapped description still fits instead of clipping. */
const TOAST_EVENT_WRAP = 16;
const TOAST_EVENT_GAP = 5;

export function toastStackHeight(eventCount = 1): number {
  const events = Math.min(4, Math.max(1, eventCount));
  return TOAST_CHROME_H + events * (TOAST_EVENT_H + TOAST_EVENT_WRAP) + (events - 1) * TOAST_EVENT_GAP;
}

export function toastSize(dock: WidgetDock, eventCount = 1): { width: number; height: number } {
  const height = toastStackHeight(eventCount) + PILL_INSET[dock].y;
  if (dock === "top") return { width: 448, height };
  if (isSideDock(dock)) return { width: 320, height };
  return { width: 404, height };
}

export function emptyPanelSize(dock: WidgetDock): { width: number; height: number } {
  if (dock === "top") {
    return {
      width: 280 + PILL_INSET.top.x - PILL_INSET.floating.x,
      height: 120 + PILL_INSET.top.y - PILL_INSET.floating.y,
    };
  }
  if (isSideDock(dock)) return { width: 280, height: 120 };
  return { width: 280, height: 112 };
}

export function panelSize(
  mode: "preview" | "expanded",
  dock: WidgetDock,
  slotCount: number,
  workHeight: number,
): { width: number; height: number } {
  if (slotCount <= 0) {
    const empty = emptyPanelSize(dock);
    return { width: empty.width, height: Math.min(empty.height, workHeight - 16) };
  }
  const slots = Math.max(1, slotCount);
  const top = dock === "top";
  if (mode === "preview") {
    const width = isSideDock(dock) ? 400 : 428;
    const height = 92 + slots * 118;
    const size = { width, height: Math.min(height, workHeight - 16) };
    if (!top) return size;
    return {
      width: size.width + PILL_INSET.top.x - PILL_INSET.floating.x,
      height: size.height + PILL_INSET.top.y - PILL_INSET.floating.y,
    };
  }
  const width = isSideDock(dock) ? 500 : 520;
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
  workWidth?: number,
): { width: number; height: number } {
  if (mode === "compact") {
    return compactSize(dock, slotCount, workWidth, workHeight);
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

export const SNAP_IN = 28;
export const SNAP_OUT = 48;
const EDGE_GROW = 72;

export interface LayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function fitInWork(
  x: number,
  y: number,
  size: { width: number; height: number },
  work: LayoutRect,
): { x: number; y: number } {
  return {
    x: clamp(x, work.x, work.x + work.width - size.width),
    y: clamp(y, work.y, work.y + work.height - size.height),
  };
}

export function centerOnWorkArea(
  size: { width: number; height: number },
  work: LayoutRect,
): { x: number; y: number } {
  return {
    x: Math.round(work.x + (work.width - size.width) / 2),
    y: Math.round(work.y + (work.height - size.height) / 2),
  };
}

export function compactAnchorFromBounds(
  bounds: LayoutRect,
  dock: WidgetDock,
  compact: { width: number; height: number },
): { x: number; y: number } {
  if (dock === "left" || dock === "top") {
    return { x: bounds.x, y: bounds.y };
  }
  if (dock === "right") {
    return { x: bounds.x + bounds.width - compact.width, y: bounds.y };
  }
  if (dock === "bottom-left") {
    return { x: bounds.x, y: bounds.y + bounds.height - compact.height };
  }
  if (dock === "bottom-right") {
    return {
      x: bounds.x + bounds.width - compact.width,
      y: bounds.y + bounds.height - compact.height,
    };
  }
  return {
    x: Math.round(bounds.x + bounds.width / 2 - compact.width / 2),
    y: Math.round(bounds.y + bounds.height / 2 - compact.height / 2),
  };
}

export function positionForSize(
  size: { width: number; height: number },
  dock: WidgetDock,
  work: LayoutRect,
  compactAnchor: { x: number; y: number },
  prevSize: { width: number; height: number },
  options?: { center?: boolean },
): { x: number; y: number } {
  if (options?.center) {
    return centerOnWorkArea(size, work);
  }

  const prevW = prevSize.width;
  const prevH = prevSize.height;

  if (dock === "left") {
    return {
      x: work.x,
      y: clamp(compactAnchor.y, work.y, work.y + work.height - size.height),
    };
  }
  if (dock === "right") {
    return {
      x: work.x + work.width - size.width,
      y: clamp(compactAnchor.y, work.y, work.y + work.height - size.height),
    };
  }
  if (dock === "top") {
    const centerX = compactAnchor.x + prevW / 2;
    return {
      x: clamp(
        Math.round(centerX - size.width / 2),
        work.x,
        work.x + work.width - size.width,
      ),
      y: work.y,
    };
  }
  if (dock === "bottom-left") {
    return {
      x: work.x,
      y: work.y + work.height - size.height,
    };
  }
  if (dock === "bottom-right") {
    return {
      x: work.x + work.width - size.width,
      y: work.y + work.height - size.height,
    };
  }

  const ax = compactAnchor.x;
  const ay = compactAnchor.y;
  const distTop = ay - work.y;
  const distLeft = ax - work.x;
  const distRight = work.x + work.width - (ax + prevW);
  const distBottom = work.y + work.height - (ay + prevH);

  let x: number;
  if (distLeft <= SNAP_IN && distLeft <= distRight) {
    x = ax;
  } else if (distRight <= SNAP_IN) {
    x = ax + prevW - size.width;
  } else if (distLeft <= EDGE_GROW && distLeft <= distRight) {
    x = ax;
  } else if (distRight <= EDGE_GROW) {
    x = ax + prevW - size.width;
  } else {
    x = Math.round(ax + prevW / 2 - size.width / 2);
  }

  let y: number;
  if (distTop <= SNAP_IN && distTop <= distBottom) {
    y = ay;
  } else if (distBottom <= SNAP_IN) {
    y = ay + prevH - size.height;
  } else if (distTop <= EDGE_GROW && distTop <= distBottom) {
    y = ay;
  } else if (distBottom <= EDGE_GROW) {
    y = ay + prevH - size.height;
  } else {
    y = Math.round(ay + prevH / 2 - size.height / 2);
  }

  return fitInWork(x, y, size, work);
}

export interface EdgeDistances {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function edgeDistances(bounds: LayoutRect, work: LayoutRect): EdgeDistances {
  return {
    left: bounds.x - work.x,
    right: work.x + work.width - (bounds.x + bounds.width),
    top: bounds.y - work.y,
    bottom: work.y + work.height - (bounds.y + bounds.height),
  };
}

export function closestSnap(distances: EdgeDistances): WidgetDock {
  const { left, right, top, bottom } = distances;
  const candidates: { dock: WidgetDock; dist: number }[] = [];
  const cornerLeft = left <= SNAP_IN && bottom <= SNAP_IN;
  const cornerRight = right <= SNAP_IN && bottom <= SNAP_IN;

  if (cornerLeft) {
    candidates.push({ dock: "bottom-left", dist: Math.max(left, bottom) });
  }
  if (cornerRight) {
    candidates.push({ dock: "bottom-right", dist: Math.max(right, bottom) });
  }
  if (left <= SNAP_IN && !cornerLeft) {
    candidates.push({ dock: "left", dist: left });
  }
  if (right <= SNAP_IN && !cornerRight) {
    candidates.push({ dock: "right", dist: right });
  }
  if (top <= SNAP_IN) {
    candidates.push({ dock: "top", dist: top });
  }

  if (candidates.length === 0) return "floating";
  candidates.sort((a, b) => a.dist - b.dist);
  return candidates[0]?.dock ?? "floating";
}

export function resolveDock(
  bounds: LayoutRect,
  work: LayoutRect,
  current: WidgetDock,
): WidgetDock {
  const distances = edgeDistances(bounds, work);
  const { left, right, top, bottom } = distances;

  if (current === "left") {
    if (left <= SNAP_OUT && bottom <= SNAP_IN) return "bottom-left";
    if (left <= SNAP_OUT) return "left";
    return closestSnap(distances);
  }
  if (current === "right") {
    if (right <= SNAP_OUT && bottom <= SNAP_IN) return "bottom-right";
    if (right <= SNAP_OUT) return "right";
    return closestSnap(distances);
  }
  if (current === "bottom-left") {
    if (left <= SNAP_OUT && bottom <= SNAP_OUT) return "bottom-left";
    if (left <= SNAP_OUT) return "left";
    return closestSnap(distances);
  }
  if (current === "bottom-right") {
    if (right <= SNAP_OUT && bottom <= SNAP_OUT) return "bottom-right";
    if (right <= SNAP_OUT) return "right";
    return closestSnap(distances);
  }
  if (current === "top") {
    if (top > SNAP_OUT) return closestSnap(distances);
    if (left <= SNAP_IN && left < top) return "left";
    if (right <= SNAP_IN && right < top) return "right";
    return "top";
  }
  return closestSnap(distances);
}
