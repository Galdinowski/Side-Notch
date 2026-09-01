import type { ReactNode } from "react";
import type { ViewMode, WidgetDock } from "../../shared/types";

interface NotchShellProps {
  children: ReactNode;
  dock: WidgetDock;
  viewMode: ViewMode;
  ariaLabel: string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
}

export function NotchShell({
  children,
  dock,
  viewMode,
  ariaLabel,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: NotchShellProps) {
  const placement = dock === "floating" ? "island" : "side";

  return (
    <div
      className={`notch-root notch-root--${placement} notch-root--${dock} notch-root--${viewMode}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <button
        type="button"
        className="notch-pill"
        onClick={onClick}
        aria-label={ariaLabel}
        aria-expanded={viewMode !== "compact"}
      >
        <div className="notch-pill__content" key={`${viewMode}-${placement}`}>
          {children}
        </div>
      </button>
    </div>
  );
}
