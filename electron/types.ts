export type {
  SubagentInfo,
  ComposerHeaderValue,
  AgentSnapshot,
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
  isSourceInUse,
  isSourceVisible,
  isWidgetDock,
  inUseSources,
  visibleSources,
  panelSources,
  groupAgents,
  healthLine,
} from "../shared/types.js";

declare global {
  interface Window {
    sideNotch: import("../shared/types.js").SideNotchAPI;
  }
}
