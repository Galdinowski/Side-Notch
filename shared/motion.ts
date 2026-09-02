import type { ViewMode } from "./types.js";

export type MotionState =
  | "compact"
  | "expanding"
  | "preview"
  | "pinning"
  | "expanded"
  | "unpinning"
  | "collapsing"
  | "toasting"
  | "toast";

export const MORPH = {
  expandMs: 240,
  collapseMs: 200,
  contentInMs: 140,
  contentInDelayMs: 96,
  contentOutMs: 90,
  leaveMs: 160,
  toastMs: 4200,
  dragPx: 6,
  easeExpand: "cubic-bezier(0.22, 1, 0.36, 1)",
  easeCollapse: "cubic-bezier(0.32, 0.72, 0, 1)",
} as const;

export function pillMode(motion: MotionState): ViewMode {
  if (motion === "expanded" || motion === "pinning") return "expanded";
  if (motion === "compact" || motion === "collapsing") return "compact";
  if (motion === "toast" || motion === "toasting") return "toast";
  return "preview";
}

export function morphKind(motion: MotionState): "expand" | "collapse" | "none" {
  if (motion === "expanding" || motion === "pinning" || motion === "toasting") return "expand";
  if (motion === "collapsing" || motion === "unpinning") return "collapse";
  return "none";
}

export function morphDuration(motion: MotionState): number {
  const kind = morphKind(motion);
  if (kind === "expand") return MORPH.expandMs;
  if (kind === "collapse") return MORPH.collapseMs;
  return 0;
}

export function isSettledCompact(motion: MotionState): boolean {
  return motion === "compact";
}

export function slotCountForPill(
  mode: ViewMode,
  compactSlots: number,
  visitSlots: number,
): number {
  if (mode === "compact") return Math.max(0, compactSlots);
  if (mode === "toast") return Math.max(1, visitSlots);
  return Math.max(0, visitSlots);
}
