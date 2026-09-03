import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NotchShell } from "./components/NotchShell";
import { CompactView } from "./components/CompactView";
import { PreviewView } from "./components/PreviewView";
import { ExpandedView } from "./components/ExpandedView";
import type { AgentSnapshot, AppSettings, NotchToast, SourceId, SourcesPayload, ViewMode, WidgetDock } from "../shared/types";
import { healthLine, isWidgetDock, panelSources, visibleSources } from "../shared/types";
import { compactSize, isHorizontalDock, pillSizeForWindow, sizeForMode } from "../shared/layout";
import { overallStatus, toCompactSlots } from "./lib/source-model";
import {
  MORPH,
  morphDuration,
  morphKind,
  pillMode,
  slotCountForPill,
  type MotionState,
} from "../shared/motion";

const NOTIFICATION_PRIORITY = {
  action: 0,
  error: 1,
  completed: 2,
} as const;

function workHeight(): number {
  return window.screen.availHeight || 1080;
}

function dockFromQuery(): WidgetDock | null {
  const value = new URLSearchParams(window.location.search).get("dock");
  return isWidgetDock(value) ? value : null;
}

function initialDock(): WidgetDock {
  if (window.sideNotch) return "floating";
  return dockFromQuery() ?? "top";
}

function fingerprint(payload: SourcesPayload): string {
  return JSON.stringify(payload.sources);
}

function demoAgent(source: SourceId, name: string): AgentSnapshot {
  return {
    source,
    id: `demo-${source}`,
    composerId: `demo-${source}`,
    workspaceId: "ws",
    workspacePath: null,
    name,
    subtitle: "Em execução",
    contextUsagePercent: source === "cursor" ? 42 : null,
    isRunning: true,
    isSubagent: false,
    parentComposerId: null,
    hasBlockingPendingActions: false,
    linesAdded: 8,
    linesRemoved: 2,
    filesChanged: 1,
  };
}

function demoAgentsPayload(): SourcesPayload {
  return {
    capturedAt: Date.now(),
    sources: [
      {
        source: "cursor",
        health: { status: "ok" },
        agents: [demoAgent("cursor", "Refactor")],
        liveProcessCount: 0,
      },
      {
        source: "claude",
        health: { status: "ok" },
        agents: [demoAgent("claude", "Review")],
        liveProcessCount: 0,
      },
    ],
  };
}

export default function App() {
  const [payload, setPayload] = useState<SourcesPayload | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [motion, setMotion] = useState<MotionState>("compact");
  const [pinned, setPinned] = useState(false);
  const [toast, setToast] = useState<NotchToast | null>(null);
  const [pillSize, setPillSize] = useState(() => {
    const startDock = initialDock();
    return pillSizeForWindow(compactSize(startDock, 0), startDock);
  });

  const motionRef = useRef<MotionState>("compact");
  const pinnedRef = useRef(false);
  const hoveredRef = useRef(false);
  const hoverArmedRef = useRef(true);
  const focusedRef = useRef(false);
  const draggingRef = useRef(false);
  const dockRef = useRef<WidgetDock>("floating");
  const visitSlotsRef = useRef(1);
  const compactSlotsRef = useRef(0);
  const boundsGenRef = useRef(0);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const morphTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastRef = useRef<NotchToast | null>(null);
  const payloadKeyRef = useRef("");
  const sourcesRef = useRef<SourcesPayload["sources"]>([]);
  const lifecycleRef = useRef(0);

  const sources = payload?.sources ?? [];
  sourcesRef.current = sources;
  const dock: WidgetDock = settings?.dock ?? (window.sideNotch ? "floating" : initialDock());
  dockRef.current = dock;
  const panels = useMemo(() => panelSources(sources), [sources]);
  const slots = useMemo(() => toCompactSlots(sources), [sources]);
  compactSlotsRef.current = slots.length;
  const tooltip = useMemo(
    () => (sources.length ? healthLine(sources) : "Side-notch"),
    [sources],
  );

  const syncPill = useCallback((mode: ViewMode, nextDock: WidgetDock, slotsForVisit: number) => {
    const windowSize = sizeForMode(mode, nextDock, slotsForVisit, workHeight());
    setPillSize(pillSizeForWindow(windowSize, nextDock));
  }, []);

  const commitWindow = useCallback((mode: ViewMode, gen: number) => {
    if (!window.sideNotch) return;
    void window.sideNotch
      .commitBounds(mode, { slotCount: visitSlotsRef.current })
      .then((rect) => {
        if (gen !== boundsGenRef.current) return;
        setPillSize(pillSizeForWindow(rect, dockRef.current));
      })
      .catch((error: unknown) => {
        console.error("[side-notch] failed to commit bounds", error);
      });
  }, []);

  const go = useCallback(
    (next: MotionState) => {
      const sameTransition =
        motionRef.current === next &&
        (next === "expanding" ||
          next === "pinning" ||
          next === "toasting" ||
          next === "collapsing" ||
          next === "unpinning");
      if (motionRef.current === next && (!sameTransition || morphTimerRef.current)) return;
      if (morphTimerRef.current) {
        clearTimeout(morphTimerRef.current);
        morphTimerRef.current = null;
      }

      const gen = ++boundsGenRef.current;
      const prev = motionRef.current;
      motionRef.current = next;
      setMotion(next);

      if (next === "expanding" && prev === "compact") {
        visitSlotsRef.current = panelSources(sourcesRef.current).length;
      }
      if (next === "pinning" && (prev === "compact" || prev === "expanding" || prev === "collapsing")) {
        visitSlotsRef.current = panelSources(sourcesRef.current).length;
      }

      const nextPill = pillMode(next);
      const kind = morphKind(next);
      syncPill(
        nextPill,
        dockRef.current,
        slotCountForPill(nextPill, compactSlotsRef.current, visitSlotsRef.current),
      );

      if (kind === "expand") {
        commitWindow(nextPill, gen);
      }

      const duration = morphDuration(next);
      const finish = (settled: MotionState, commit?: ViewMode) => {
        morphTimerRef.current = null;
        if (gen !== boundsGenRef.current) return;
        motionRef.current = settled;
        setMotion(settled);
        if (commit) commitWindow(commit, gen);
      };

      if (next === "expanding") {
        morphTimerRef.current = setTimeout(() => finish("preview"), duration);
      } else if (next === "pinning") {
        morphTimerRef.current = setTimeout(() => finish("expanded"), duration);
      } else if (next === "toasting") {
        morphTimerRef.current = setTimeout(() => finish("toast"), duration);
      } else if (next === "collapsing") {
        morphTimerRef.current = setTimeout(() => finish("compact"), duration);
      } else if (next === "unpinning") {
        morphTimerRef.current = setTimeout(() => finish("preview", "preview"), duration);
      }
    },
    [commitWindow, syncPill],
  );

  const scheduleToastClose = useCallback(
    (next: NotchToast) => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (next.sticky) return;
      toastTimerRef.current = setTimeout(() => {
        if (
          pinnedRef.current ||
          hoveredRef.current ||
          focusedRef.current ||
          draggingRef.current
        ) return;
        setToast(null);
        toastRef.current = null;
        window.sideNotch?.setMouseIgnore(true);
        const current = motionRef.current;
        if (current === "toast" || current === "toasting") {
          go("collapsing");
        }
      }, MORPH.toastMs);
    },
    [go],
  );

  const reconcileToast = useCallback(
    (nextSources: SourcesPayload["sources"]) => {
      const current = toastRef.current;
      if (!current) return;
      const bySource = new Map(nextSources.map((source) => [source.source, source]));
      const events = current.events.filter((event) => {
        const source = bySource.get(event.source);
        if (!source) return true;
        if (event.kind === "error") return source.health.status === "error";
        if (event.kind !== "action" || source.health.status !== "ok") return true;
        return source.agents.some(
          (agent) =>
            agent.hasBlockingPendingActions &&
            (event.taskId ? agent.id === event.taskId : agent.name === event.taskName),
        );
      });
      const sticky = events.some((event) => event.kind === "action" || event.kind === "error");
      if (events.length === current.events.length && sticky === current.sticky) return;

      if (events.length === 0) {
        if (
          (hoveredRef.current || focusedRef.current || draggingRef.current) &&
          (motionRef.current === "toast" || motionRef.current === "toasting")
        ) {
          const acknowledged = { ...current, sticky: false };
          toastRef.current = acknowledged;
          setToast(acknowledged);
          return;
        }
        toastRef.current = null;
        setToast(null);
        if (
          !pinnedRef.current &&
          (motionRef.current === "toast" || motionRef.current === "toasting")
        ) {
          window.sideNotch?.setMouseIgnore(true);
          go("collapsing");
        }
        return;
      }

      const reconciled = { events, sticky };
      toastRef.current = reconciled;
      setToast(reconciled);
      if (!pinnedRef.current) scheduleToastClose(reconciled);
    },
    [go, scheduleToastClose],
  );

  const presentToast = useCallback(
    (next: NotchToast) => {
      const previous = toastRef.current;
      const known = new Set(previous?.events.map((event) => event.id) ?? []);
      const events = [
        ...(previous?.events ?? []),
        ...next.events.filter((event) => !known.has(event.id)),
      ]
        .sort(
          (a, b) =>
            NOTIFICATION_PRIORITY[a.kind] - NOTIFICATION_PRIORITY[b.kind] ||
            b.createdAt - a.createdAt,
        )
        .slice(0, 8);
      const merged: NotchToast = {
        events,
        sticky: Boolean(previous?.sticky || next.sticky),
      };
      toastRef.current = merged;
      setToast(merged);
      window.sideNotch?.setMouseIgnore(false);
      visitSlotsRef.current = Math.min(4, Math.max(1, events.length));
      if (pinnedRef.current) return;

      const current = motionRef.current;
      if (current !== "toast" && current !== "toasting") {
        go("toasting");
      } else {
        const gen = ++boundsGenRef.current;
        syncPill("toast", dockRef.current, visitSlotsRef.current);
        commitWindow("toast", gen);
      }

      scheduleToastClose(merged);
    },
    [commitWindow, go, scheduleToastClose, syncPill],
  );

  useEffect(() => {
    void window.sideNotch?.getSettings().then((next) => {
      setSettings(next);
      dockRef.current = next.dock;
      syncPill("compact", next.dock, 0);
    });
  }, [syncPill]);

  useEffect(() => {
    if (!window.sideNotch) return;

    const unsubUpdate = window.sideNotch.onSourcesUpdate((next) => {
      const key = fingerprint(next);
      if (key === payloadKeyRef.current) return;
      payloadKeyRef.current = key;
      reconcileToast(next.sources);
      setPayload(next);
      const mode = pillMode(motionRef.current);
      if (mode === "compact") return;
      visitSlotsRef.current = panelSources(next.sources).length;
      const gen = ++boundsGenRef.current;
      syncPill(mode, dockRef.current, visitSlotsRef.current);
      commitWindow(mode, gen);
    });
    const unsubDock = window.sideNotch.onDockChange((next) => {
      dockRef.current = next;
      setSettings((prev) => (prev ? { ...prev, dock: next } : prev));
      const mode = pillMode(motionRef.current);
      syncPill(mode, next, slotCountForPill(mode, compactSlotsRef.current, visitSlotsRef.current));
    });
    const unsubExpand = window.sideNotch.onRequestExpand(() => {
      pinnedRef.current = true;
      setPinned(true);
      visitSlotsRef.current = panelSources(sourcesRef.current).length;
      go("pinning");
    });
    const unsubToast = window.sideNotch.onToast((next) => {
      presentToast(next);
    });

    void window.sideNotch.refreshSources().then((next) => {
      payloadKeyRef.current = fingerprint(next);
      setPayload(next);
    }).catch((error: unknown) => {
      console.error("[side-notch] refresh failed", error);
    });

    return () => {
      unsubUpdate?.();
      unsubDock?.();
      unsubExpand?.();
      unsubToast?.();
    };
  }, [commitWindow, go, presentToast, reconcileToast, syncPill]);

  useEffect(() => {
    if (window.sideNotch) return;
    const params = new URLSearchParams(window.location.search);
    const previewDock = params.get("dock");
    if (previewDock === "left" || previewDock === "right" || params.get("demo") === "agents") {
      setPayload(demoAgentsPayload());
    }
  }, []);

  useEffect(() => {
    if (window.sideNotch) return;
    const demo = new URLSearchParams(window.location.search).get("demo");
    if (demo !== "toast" && demo !== "grouped" && demo !== "completed") return;
    const now = Date.now();
    const demoToast: NotchToast = {
      events:
        demo === "grouped"
          ? [
              {
                id: "demo-action",
                source: "cursor",
                kind: "action",
                title: "Intervenção necessária",
                body: "Autorizar operação",
                createdAt: now,
              },
              {
                id: "demo-completed-a",
                source: "codex",
                kind: "completed",
                title: "Tarefa concluída",
                body: "Análise do projeto",
                createdAt: now + 1,
              },
              {
                id: "demo-completed-b",
                source: "claude",
                kind: "completed",
                title: "Tarefa concluída",
                body: "Build",
                createdAt: now + 2,
              },
            ]
          : [
              {
                id: `demo-${demo}`,
                source: demo === "completed" ? "codex" : "cursor",
                kind: demo === "completed" ? "completed" : "action",
                title: demo === "completed" ? "Tarefa concluída" : "Intervenção necessária",
                body: demo === "completed" ? "Análise do projeto" : "Precisa da sua ação",
                createdAt: now,
              },
            ],
      sticky: demo !== "completed",
    };
    toastRef.current = demoToast;
    setToast(demoToast);
    visitSlotsRef.current = Math.min(4, Math.max(1, demoToast.events.length));
    go("toasting");
    scheduleToastClose(demoToast);
  }, [go, scheduleToastClose]);

  useEffect(() => {
    const mode = pillMode(motion);
    const count = slotCountForPill(mode, slots.length, visitSlotsRef.current);
    syncPill(mode, dock, count);
    if (motion !== "compact") return;
    if (motionRef.current !== "compact") return;
    const gen = ++boundsGenRef.current;
    commitWindow("compact", gen);
  }, [slots.length, dock, motion, commitWindow, syncPill]);

  const handleHoverEnter = useCallback(() => {
    hoveredRef.current = true;
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    window.sideNotch?.setMouseIgnore(false);
    if (!hoverArmedRef.current) return;
    if (draggingRef.current || pinnedRef.current) return;
    const current = motionRef.current;
    if (current === "toast" || current === "toasting") return;
    if (visibleSources(sourcesRef.current).length === 0) return;
    if (current === "compact") {
      go("expanding");
    }
  }, [go]);

  const handleHoverLeave = useCallback(() => {
    hoveredRef.current = false;
    hoverArmedRef.current = true;
    window.sideNotch?.setMouseIgnore(true);
    if (pinnedRef.current || focusedRef.current || draggingRef.current) return;
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = setTimeout(() => {
      if (
        hoveredRef.current ||
        focusedRef.current ||
        pinnedRef.current ||
        draggingRef.current
      ) return;
      const current = motionRef.current;
      if (current === "expanded" || current === "pinning") return;
      if (current === "toast" || current === "toasting") {
        if (toastRef.current?.sticky) return;
        setToast(null);
        toastRef.current = null;
        go("collapsing");
        return;
      }
      if (current === "compact") return;
      go("collapsing");
    }, MORPH.leaveMs);
  }, [go]);

  const handleDragStart = useCallback(() => {
    draggingRef.current = true;
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  const handleDragEnd = useCallback(() => {
    draggingRef.current = false;
    window.sideNotch?.endDrag();
    if (!hoveredRef.current && !focusedRef.current && !pinnedRef.current) {
      const current = motionRef.current;
      if (current !== "compact" && current !== "collapsing") {
        window.sideNotch?.setMouseIgnore(true);
        go("collapsing");
      }
    }
  }, [go]);

  const handleFocus = useCallback(() => {
    focusedRef.current = true;
    window.sideNotch?.setMouseIgnore(false);
  }, []);

  const handleBlur = useCallback(() => {
    focusedRef.current = false;
    if (hoveredRef.current || pinnedRef.current || draggingRef.current) return;
    window.sideNotch?.setMouseIgnore(true);
    const currentToast = toastRef.current;
    if (currentToast && !currentToast.sticky) scheduleToastClose(currentToast);
  }, [scheduleToastClose]);

  const collapseToCompact = useCallback(() => {
    if (draggingRef.current) return;
    const current = motionRef.current;
    if (current === "compact") return;
    hoverArmedRef.current = false;
    hoveredRef.current = false;
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    pinnedRef.current = false;
    setPinned(false);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    window.sideNotch?.setMouseIgnore(true);
    go("collapsing");
  }, [go]);

  const handleClick = useCallback(() => {
    if (draggingRef.current) return;
    const current = motionRef.current;
    if (current === "compact" || current === "collapsing") {
      pinnedRef.current = true;
      setPinned(true);
      visitSlotsRef.current = panelSources(sourcesRef.current).length;
      go("pinning");
      return;
    }
    if (current === "toast" || current === "toasting") {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToast(null);
      toastRef.current = null;
      pinnedRef.current = true;
      setPinned(true);
      visitSlotsRef.current = panelSources(sourcesRef.current).length;
      go("pinning");
      return;
    }
    if (current === "preview" || current === "expanding" || current === "unpinning") {
      pinnedRef.current = true;
      setPinned(true);
      go("pinning");
      return;
    }
    collapseToCompact();
  }, [collapseToCompact, go]);

  useEffect(() => {
    const lifecycle = ++lifecycleRef.current;
    return () => {
      queueMicrotask(() => {
        // Strict Mode remounts effects immediately in development.
        if (lifecycle !== lifecycleRef.current) return;
        if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
        if (morphTimerRef.current) clearTimeout(morphTimerRef.current);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      });
    };
  }, []);

  const visual = pillMode(motion);
  const idle = overallStatus(slots) === "idle";
  const shellLabel =
    visual === "expanded"
      ? "Lista de fontes. Clique para recolher."
      : visual === "preview"
        ? "Prévia por fonte. Clique para expandir."
        : visual === "toast"
          ? toast
            ? `${toast.events.length} evento${toast.events.length === 1 ? "" : "s"} de atividade`
            : "Notificação"
          : `${tooltip}. Clique para expandir.`;

  return (
    <NotchShell
      dock={dock}
      motion={motion}
      pillMode={visual}
      contentMode={visual}
      pinned={pinned}
      idle={idle}
      toast={toast}
      pillSize={pillSize}
      ariaLabel={shellLabel}
      onHoverEnter={handleHoverEnter}
      onHoverLeave={handleHoverLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onClick={handleClick}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <CompactView
        slots={slots}
        layout={isHorizontalDock(dock) ? "island" : "side"}
        tooltip={tooltip}
        dock={dock}
      />
      <PreviewView sources={panels} onExpand={handleClick} onCollapse={collapseToCompact} />
      <ExpandedView sources={panels} onCollapse={collapseToCompact} />
    </NotchShell>
  );
}
