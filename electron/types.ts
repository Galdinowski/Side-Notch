export type {
  SubagentInfo,
  ComposerHeaderValue,
  AgentSnapshot,
  AppSettings,
  SideNotchAPI,
  ViewMode,
  WidgetDock,
} from "../shared/types.js";

declare global {
  interface Window {
    sideNotch: import("../shared/types.js").SideNotchAPI;
  }
}
