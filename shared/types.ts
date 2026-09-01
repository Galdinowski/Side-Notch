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

export type WidgetDock = "floating" | "left" | "right" | "top";
export type ViewMode = "compact" | "preview" | "expanded" | "toast";

export interface AppSettings {
  dock: WidgetDock;
  launchOnStartup: boolean;
  pollIntervalMs: number;
  windowX?: number;
  windowY?: number;
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
