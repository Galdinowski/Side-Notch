import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NotchShell } from "./components/NotchShell";
import { CompactView } from "./components/CompactView";
import { PreviewView } from "./components/PreviewView";
import { ExpandedView } from "./components/ExpandedView";
import type { AgentSnapshot, AppSettings, ViewMode, WidgetDock } from "../shared/types";
import type { WidgetStatus } from "./components/CompactView";

const VIEW_MODE_RANK: Record<ViewMode, number> = {
  compact: 0,
  preview: 1,
  expanded: 2,
};

function groupAgents(agents: AgentSnapshot[]) {
  const parents = agents.filter((a) => !a.isSubagent);
  const subagents = agents.filter((a) => a.isSubagent);

  return parents.map((parent) => ({
    parent,
    children: subagents.filter((s) => s.parentComposerId === parent.composerId),
  }));
}

function deriveWidgetStatus(
  agents: AgentSnapshot[],
  error: string | null,
): WidgetStatus {
  if (error) return "error";
  if (agents.length === 0) return "idle";
  if (agents.some((a) => a.hasBlockingPendingActions)) return "warning";
  if (agents.some((a) => a.isRunning)) return "processing";
  return "idle";
}

function compactTooltip(
  status: WidgetStatus,
  activeCount: number,
  maxContext: number,
  error: string | null,
): string {
  if (status === "error") {
    return error ?? "Erro ao ler dados do Cursor";
  }
  if (activeCount === 0) {
    return "Nenhuma tarefa ativa no Cursor";
  }
  const taskLabel = activeCount === 1 ? "tarefa ativa" : "tarefas ativas";
  return `${activeCount} ${taskLabel} · ${Math.round(maxContext)}% contexto máximo`;
}

export default function App() {
  const [agents, setAgents] = useState<AgentSnapshot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("compact");
  const [pinnedExpanded, setPinnedExpanded] = useState(false);
  const viewModeRef = useRef<ViewMode>("compact");
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitioningRef = useRef(false);
  const draggingRef = useRef(false);
  const skipClickRef = useRef(false);
  const pinnedRef = useRef(false);
  const dragResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dock: WidgetDock = settings?.dock ?? "floating";
  const grouped = useMemo(() => groupAgents(agents), [agents]);
  const activeCount = agents.length;
  const maxContext = useMemo(
    () => (agents.length ? Math.max(...agents.map((a) => a.contextUsagePercent)) : 0),
    [agents],
  );
  const widgetStatus = useMemo(
    () => deriveWidgetStatus(agents, error),
    [agents, error],
  );
  const compactTooltipText = useMemo(
    () => compactTooltip(widgetStatus, activeCount, maxContext, error),
    [widgetStatus, activeCount, maxContext, error],
  );

  const applyViewMode = useCallback(async (mode: ViewMode) => {
    if (viewModeRef.current === mode || transitioningRef.current) return;
    if (!window.sideNotch) return;

    transitioningRef.current = true;
    const expanding = VIEW_MODE_RANK[mode] > VIEW_MODE_RANK[viewModeRef.current];

    try {
      if (expanding) {
        await window.sideNotch.resizeWindow(mode);
        viewModeRef.current = mode;
        setViewMode(mode);
      } else {
        viewModeRef.current = mode;
        setViewMode(mode);
        await window.sideNotch.resizeWindow(mode);
      }
    } catch (error) {
      console.error("[side-notch] failed to resize window", error);
    } finally {
      transitioningRef.current = false;
    }
  }, []);

  useEffect(() => {
    void window.sideNotch?.getSettings().then(setSettings);
  }, []);

  useEffect(() => {
    if (!window.sideNotch) {
      setError("API do Electron indisponível. Abra o app com npm run electron:dev");
      return;
    }

    const unsubUpdate = window.sideNotch.onAgentsUpdate((next) => {
      setAgents(next);
      setError(null);
    });
    const unsubError = window.sideNotch.onAgentsError((message) => {
      setError(message);
    });
    const unsubDock = window.sideNotch.onDockChange((next) => {
      setSettings((prev) => (prev ? { ...prev, dock: next } : prev));
    });
    const unsubDrag = window.sideNotch.onWindowDragging(() => {
      draggingRef.current = true;
      skipClickRef.current = true;
      if (dragResetTimerRef.current) clearTimeout(dragResetTimerRef.current);
      dragResetTimerRef.current = setTimeout(() => {
        draggingRef.current = false;
        skipClickRef.current = false;
      }, 280);
      if (!pinnedRef.current && viewModeRef.current !== "compact") {
        void applyViewMode("compact");
      }
    });

    void window.sideNotch.refreshAgents().then((next) => {
      setAgents(next);
      setError(null);
    }).catch((err: unknown) => {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "Erro ao ler dados do Cursor";
      setError(message);
    });

    return () => {
      unsubUpdate?.();
      unsubError?.();
      unsubDock?.();
      unsubDrag?.();
      if (dragResetTimerRef.current) clearTimeout(dragResetTimerRef.current);
    };
  }, [applyViewMode]);

  const handleMouseEnter = () => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    if (draggingRef.current || pinnedExpanded) return;
    void applyViewMode("preview");
  };

  const handleMouseLeave = () => {
    draggingRef.current = false;
    if (pinnedExpanded) return;
    leaveTimerRef.current = setTimeout(() => {
      void applyViewMode("compact");
    }, 120);
  };

  const handleClick = () => {
    if (skipClickRef.current) {
      skipClickRef.current = false;
      return;
    }
    const nextPinned = !pinnedExpanded;
    pinnedRef.current = nextPinned;
    setPinnedExpanded(nextPinned);
    void applyViewMode(nextPinned ? "expanded" : "compact");
  };

  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    };
  }, []);

  const shellLabel =
    viewMode === "expanded"
      ? "Lista completa de tarefas do Cursor. Clique para recolher."
      : viewMode === "preview"
        ? "Prévia das tarefas do Cursor. Clique para expandir."
        : compactTooltipText;

  return (
    <NotchShell
      dock={dock}
      viewMode={viewMode}
      ariaLabel={shellLabel}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      {viewMode === "compact" && (
        <CompactView
          activeCount={activeCount}
          maxContext={maxContext}
          status={widgetStatus}
          layout={dock === "floating" ? "island" : "side"}
          tooltip={compactTooltipText}
        />
      )}
      {viewMode === "preview" && (
        <PreviewView
          grouped={grouped}
          error={error}
          status={widgetStatus}
          activeCount={activeCount}
        />
      )}
      {viewMode === "expanded" && (
        <ExpandedView grouped={grouped} error={error} activeCount={activeCount} />
      )}
    </NotchShell>
  );
}
