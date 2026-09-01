export type {
  SubagentInfo,
  ComposerHeaderValue,
  AgentSnapshot,
  SourceAgentSnapshot,
  AppSettings,
  SideNotchAPI,
  ViewMode,
  WidgetDock,
  NotchToast,
  NotchNotification,
  NotificationKind,
  WindowRect,
  CommitBoundsOptions,
  SourceId,
  SourceHealth,
  SourceHealthStatus,
  SourceSnapshot,
  SourcesPayload,
} from "../shared/types.js";

export {
  SOURCE_ORDER,
  SOURCE_LABEL,
  SOURCE_TICK,
  isSourceInUse,
  inUseSources,
  panelSources,
  healthLine,
} from "../shared/types.js";

declare global {
  interface Window {
    sideNotch: import("../shared/types.js").SideNotchAPI;
  }
}
