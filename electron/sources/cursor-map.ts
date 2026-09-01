import type { SourceAgentSnapshot } from "../types.js";

export interface RawCursorAgent {
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

export function mapCursorAgent(raw: RawCursorAgent): SourceAgentSnapshot {
  return {
    source: "cursor",
    id: raw.composerId,
    composerId: raw.composerId,
    workspaceId: raw.workspaceId,
    workspacePath: raw.workspacePath,
    name: raw.name,
    subtitle: raw.subtitle,
    contextUsagePercent: Number.isFinite(raw.contextUsagePercent)
      ? raw.contextUsagePercent
      : 0,
    isRunning: raw.isRunning,
    isSubagent: raw.isSubagent,
    parentComposerId: raw.parentComposerId,
    hasBlockingPendingActions: raw.hasBlockingPendingActions,
    linesAdded: raw.linesAdded,
    linesRemoved: raw.linesRemoved,
    filesChanged: raw.filesChanged,
  };
}
