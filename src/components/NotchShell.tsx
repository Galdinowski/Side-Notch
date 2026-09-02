import {
  Children,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { NotchToast, ViewMode, WidgetDock } from "../../shared/types";
import { MORPH, morphKind, type MotionState } from "../../shared/motion";
import { IslandToast } from "./IslandToast";

interface NotchShellProps {
  children: ReactNode;
  dock: WidgetDock;
  motion: MotionState;
  pillMode: ViewMode;
  contentMode: ViewMode;
  pinned: boolean;
  idle: boolean;
  toast: NotchToast | null;
  pillSize: { width: number; height: number };
  ariaLabel: string;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onClick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

interface DragSession {
  pointerId: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  dragging: boolean;
}

function layersFromChildren(children: ReactNode): {
  compact: ReactNode;
  preview: ReactNode;
  expanded: ReactNode;
} {
  const list = Children.toArray(children);
  return {
    compact: list[0],
    preview: list[1],
    expanded: list[2],
  };
}

function placementOf(dock: WidgetDock): "island" | "side" | "top" | "corner" {
  if (dock === "top") return "top";
  if (dock === "bottom-left" || dock === "bottom-right") return "corner";
  if (dock === "left" || dock === "right") return "side";
  return "island";
}

export function NotchShell({
  children,
  dock,
  motion,
  pillMode,
  contentMode,
  pinned,
  idle,
  toast,
  pillSize,
  ariaLabel,
  onHoverEnter,
  onHoverLeave,
  onFocus,
  onBlur,
  onClick,
  onDragStart,
  onDragEnd,
}: NotchShellProps) {
  const placement = placementOf(dock);
  const kind = morphKind(motion);
  const dragRef = useRef<DragSession | null>(null);
  const skipClickRef = useRef(false);
  const layers = layersFromChildren(children);

  const duration = kind === "expand" ? `${MORPH.expandMs}ms` : kind === "collapse" ? `${MORPH.collapseMs}ms` : "0ms";
  const ease = kind === "collapse" ? MORPH.easeCollapse : MORPH.easeExpand;
  const contentDuration = kind === "collapse" ? `${MORPH.contentOutMs}ms` : `${MORPH.contentInMs}ms`;
  const contentDelay = kind === "expand" ? `${MORPH.contentInDelayMs}ms` : "0ms";

  const finishPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // already released
    }
    if (session.dragging) {
      skipClickRef.current = true;
      onDragEnd();
    }
    dragRef.current = null;
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("[data-no-drag]")) return;
    skipClickRef.current = false;
    window.sideNotch?.setMouseIgnore(false);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.screenX,
      startY: event.screenY,
      offsetX: event.clientX,
      offsetY: event.clientY,
      dragging: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const dx = event.screenX - session.startX;
    const dy = event.screenY - session.startY;
    if (!session.dragging && Math.hypot(dx, dy) >= MORPH.dragPx) {
      session.dragging = true;
      onDragStart();
    }
    if (session.dragging) {
      window.sideNotch?.moveWindow(event.screenX - session.offsetX, event.screenY - session.offsetY);
    }
  };

  const handleClick = (event: { target: EventTarget | null }) => {
    if (skipClickRef.current) {
      skipClickRef.current = false;
      return;
    }
    const node = event.target;
    const element =
      node instanceof Element ? node : node instanceof Node ? node.parentElement : null;
    if (element?.closest("[data-no-drag]")) return;
    onClick();
  };

  return (
    <div
      className={`notch-root notch-root--${placement} notch-root--${dock} notch-root--${pillMode}${
        kind !== "none" ? " notch-root--morphing" : ""
      }${idle ? " notch-root--idle" : ""}`}
      style={
        {
          "--pill-w": `${pillSize.width}px`,
          "--pill-h": `${pillSize.height}px`,
          "--morph-duration": duration,
          "--morph-ease": ease,
          "--content-duration": contentDuration,
          "--content-delay": contentDelay,
        } as CSSProperties
      }
    >
      {placement === "top" ? <div className="notch-aura" aria-hidden="true" /> : null}
      <div
        className={`notch-pill${pinned ? " notch-pill--pinned" : ""}`}
        role="region"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleClick({ target: event.target });
          }
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        onMouseEnter={onHoverEnter}
        onMouseLeave={onHoverLeave}
        onFocus={onFocus}
        onBlur={onBlur}
        aria-label={ariaLabel}
        aria-expanded={pillMode !== "compact"}
      >
        <div className="notch-pill__stack">
          <div
            className={`notch-pill__layer${contentMode === "compact" ? " is-active" : ""}`}
            data-layer="compact"
            aria-hidden={contentMode !== "compact"}
            inert={contentMode !== "compact" ? true : undefined}
          >
            {layers.compact}
          </div>
          <div
            className={`notch-pill__layer${contentMode === "preview" ? " is-active" : ""}`}
            data-layer="preview"
            aria-hidden={contentMode !== "preview"}
            inert={contentMode !== "preview" ? true : undefined}
          >
            {layers.preview}
          </div>
          <div
            className={`notch-pill__layer${contentMode === "expanded" ? " is-active" : ""}`}
            data-layer="expanded"
            aria-hidden={contentMode !== "expanded"}
            inert={contentMode !== "expanded" ? true : undefined}
          >
            {layers.expanded}
          </div>
          <div
            className={`notch-pill__layer${contentMode === "toast" ? " is-active" : ""}`}
            data-layer="toast"
            aria-hidden={contentMode !== "toast"}
            inert={contentMode !== "toast" ? true : undefined}
          >
            {toast ? <IslandToast toast={toast} /> : null}
          </div>
        </div>
        {pinned ? <span className="notch-pin" aria-hidden="true" /> : null}
      </div>
    </div>
  );
}
