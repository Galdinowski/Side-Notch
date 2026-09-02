export type SourceId = "cursor" | "claude" | "codex";

export type SourceHealthStatus = "ok" | "missing" | "outdated" | "error";

export interface SourceHealth {
  status: SourceHealthStatus;
  detail?: string;
}

export interface SubagentInfo {
  parentComposerId?: string;
  subagentType?: number;
}

export interface ComposerHeaderValue {
  composerId: string;
  name: string;
  subtitle?: string;
  contextUsagePercent?: number;
  unfinishedRunAt?: number | null;
  unifiedMode?: string;
  hasBlockingPendingActions?: boolean;
  isArchived?: boolean;
  isDraft?: boolean;
  subagentInfo?: SubagentInfo;
  totalLinesAdded?: number;
  totalLinesRemoved?: number;
  filesChangedCount?: number;
}

export interface AgentSnapshot {
  source: SourceId;
  id: string;
  composerId: string;
  workspaceId: string;
  workspacePath: string | null;
  name: string;
  subtitle: string;
  contextUsagePercent: number | null;
  isRunning: boolean;
  isSubagent: boolean;
  parentComposerId: string | null;
  hasBlockingPendingActions: boolean;
  linesAdded: number;
  linesRemoved: number;
  filesChanged: number;
}

export interface SourceSnapshot {
  source: SourceId;
  health: SourceHealth;
  agents: AgentSnapshot[];
  liveProcessCount: number;
}

export interface SourcesPayload {
  sources: SourceSnapshot[];
  capturedAt: number;
}

export const WIDGET_DOCKS = [
  "floating",
  "left",
  "right",
  "top",
  "bottom-left",
  "bottom-right",
] as const;

export type WidgetDock = (typeof WIDGET_DOCKS)[number];

export function isWidgetDock(value: string | null | undefined): value is WidgetDock {
  return (WIDGET_DOCKS as readonly string[]).includes(value ?? "");
}
export type ViewMode = "compact" | "preview" | "expanded" | "toast";

export type NotificationKind = "action" | "error" | "completed";

export interface NotchNotification {
  id: string;
  source: SourceId;
  kind: NotificationKind;
  taskId?: string;
  title: string;
  body: string;
  taskName?: string;
  createdAt: number;
}

export interface NotchToast {
  events: NotchNotification[];
  sticky: boolean;
}

export interface AppSettings {
  dock: WidgetDock;
  launchOnStartup: boolean;
  pollIntervalMs: number;
  windowX?: number;
  windowY?: number;
  notifyCursor: boolean;
  notifyClaude: boolean;
  notifyCodex: boolean;
}

export const SOURCE_ORDER: SourceId[] = ["cursor", "claude", "codex"];

export const SOURCE_LABEL: Record<SourceId, string> = {
  cursor: "Cursor",
  claude: "Claude",
  codex: "Codex",
};

export function isSourceInUse(source: SourceSnapshot): boolean {
  if (source.agents.length > 0) return true;
  if (source.source === "codex" && source.liveProcessCount > 0) return true;
  return false;
}

export function isSourceVisible(source: SourceSnapshot): boolean {
  if (isSourceInUse(source)) return true;
  return source.health.status === "error" || source.health.status === "outdated";
}

function orderedSources(
  sources: SourceSnapshot[],
  predicate: (source: SourceSnapshot) => boolean,
): SourceSnapshot[] {
  return SOURCE_ORDER.map((id) => sources.find((item) => item.source === id)).filter(
    (source): source is SourceSnapshot => Boolean(source && predicate(source)),
  );
}

export function inUseSources(sources: SourceSnapshot[]): SourceSnapshot[] {
  return orderedSources(sources, isSourceInUse);
}

export function visibleSources(sources: SourceSnapshot[]): SourceSnapshot[] {
  return orderedSources(sources, isSourceVisible);
}

export function panelSources(sources: SourceSnapshot[]): SourceSnapshot[] {
  return visibleSources(sources);
}

export interface GroupedAgent {
  parent: AgentSnapshot;
  children: AgentSnapshot[];
}

export function groupAgents(agents: AgentSnapshot[]): GroupedAgent[] {
  const parents = agents.filter((agent) => !agent.isSubagent);
  const parentIds = new Set(parents.map((parent) => parent.composerId));
  const subagents = agents.filter((agent) => agent.isSubagent);
  const grouped = parents.map((parent) => ({
    parent,
    children: subagents.filter((child) => child.parentComposerId === parent.composerId),
  }));
  for (const orphan of subagents) {
    if (orphan.parentComposerId && parentIds.has(orphan.parentComposerId)) continue;
    grouped.push({ parent: orphan, children: [] });
  }
  return grouped;
}

export function healthLine(sources: SourceSnapshot[]): string {
  return SOURCE_ORDER.map((id) => {
    const source = sources.find((s) => s.source === id);
    if (!source) return null;
    const name = SOURCE_LABEL[id];
    switch (source.health.status) {
      case "missing":
        return `${name} ausente`;
      case "outdated":
        return `${name} desatualizado`;
      case "error":
        return `${name} erro`;
      default:
        if (source.source === "codex" && source.liveProcessCount > 0) {
          return `${name} ${source.liveProcessCount}`;
        }
        if (source.agents.length > 0) {
          return `${name} ${source.agents.length}`;
        }
        return `${name} ok`;
    }
  })
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CommitBoundsOptions {
  slotCount?: number;
}

export interface SideNotchAPI {
  getSettings: () => Promise<AppSettings>;
  setSettings: (partial: Partial<AppSettings>) => Promise<AppSettings>;
  commitBounds: (mode: ViewMode, options?: CommitBoundsOptions) => Promise<WindowRect>;
  moveWindow: (x: number, y: number) => void;
  setMouseIgnore: (ignore: boolean) => void;
  endDrag: () => void;
  refreshSources: () => Promise<SourcesPayload>;
  onSourcesUpdate: (callback: (payload: SourcesPayload) => void) => () => void;
  onDockChange: (callback: (dock: WidgetDock) => void) => () => void;
  onRequestExpand: (callback: () => void) => () => void;
  onToast: (callback: (toast: NotchToast) => void) => () => void;
}
