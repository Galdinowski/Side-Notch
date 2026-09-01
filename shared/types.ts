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

/** Legacy renderer shape kept until the multi-source UI lands. */
export interface AgentSnapshot {
  composerId: string;
  workspaceId: string;
  workspacePath: string | null;
  name: string;
  subtitle: string;
  contextUsagePercent: number;
  isRunning: boolean;
  isSubagent: boolean;
  parentComposerId: string | null;
  hasBlockingPendingActions: boolean;
  linesAdded: number;
  linesRemoved: number;
  filesChanged: number;
}

export interface SourceAgentSnapshot {
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
  agents: SourceAgentSnapshot[];
  liveProcessCount: number;
}

export interface SourcesPayload {
  sources: SourceSnapshot[];
  capturedAt: number;
}

export type WidgetDock = "floating" | "left" | "right" | "top";
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

export const SOURCE_TICK: Record<SourceId, string> = {
  cursor: "CSR",
  claude: "CLD",
  codex: "CDX",
};

export function isSourceInUse(source: SourceSnapshot): boolean {
  if (source.agents.length > 0) return true;
  if (source.source === "codex" && source.liveProcessCount > 0) return true;
  return false;
}

export function inUseSources(sources: SourceSnapshot[]): SourceSnapshot[] {
  return SOURCE_ORDER.map((id) => sources.find((s) => s.source === id)).filter(
    (s): s is SourceSnapshot => Boolean(s && isSourceInUse(s)),
  );
}

export function panelSources(sources: SourceSnapshot[]): SourceSnapshot[] {
  return inUseSources(sources);
}

export function healthLine(sources: SourceSnapshot[]): string {
  return SOURCE_ORDER.map((id) => {
    const source = sources.find((s) => s.source === id);
    if (!source || source.health.status === "missing") return null;
    const name = SOURCE_LABEL[id];
    switch (source.health.status) {
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
  resizeWindow: (mode: ViewMode) => Promise<void>;
  refreshAgents: () => Promise<AgentSnapshot[]>;
  onAgentsUpdate: (callback: (agents: AgentSnapshot[]) => void) => () => void;
  onAgentsError: (callback: (message: string) => void) => () => void;
  onDockChange: (callback: (dock: WidgetDock) => void) => () => void;
  onWindowDragging: (callback: () => void) => () => void;
}
