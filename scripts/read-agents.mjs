import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
const stateDbPath = path.join(appData, "Cursor", "User", "globalStorage", "state.vscdb");
const workspaceStorageDir = path.join(appData, "Cursor", "User", "workspaceStorage");

const workspaceCache = new Map();

function resolveWorkspacePath(workspaceId) {
  if (workspaceId === "empty-window") return null;
  if (workspaceCache.has(workspaceId)) {
    return workspaceCache.get(workspaceId) ?? null;
  }

  const workspaceJson = path.join(workspaceStorageDir, workspaceId, "workspace.json");
  if (!fs.existsSync(workspaceJson)) {
    workspaceCache.set(workspaceId, null);
    return null;
  }

  try {
    const data = JSON.parse(fs.readFileSync(workspaceJson, "utf8"));
    if (!data.folder) {
      workspaceCache.set(workspaceId, null);
      return null;
    }

    const decoded = decodeURIComponent(data.folder.replace(/^file:\/\//, ""));
    const normalized = decoded.replace(/\//g, path.sep);
    workspaceCache.set(workspaceId, normalized);
    return normalized;
  } catch {
    workspaceCache.set(workspaceId, null);
    return null;
  }
}

function isActiveComposer(parsed) {
  if (parsed.isArchived || parsed.isDraft) return false;
  if (parsed.unfinishedRunAt != null) return true;
  if (parsed.hasBlockingPendingActions) return true;
  return false;
}

function getActiveAgents() {
  if (!fs.existsSync(stateDbPath)) {
    return [];
  }

  const db = new DatabaseSync(stateDbPath, { readOnly: true });

  try {
    const rows = db
      .prepare(
        `SELECT composerId, workspaceId, isSubagent, value
         FROM composerHeaders
         WHERE isArchived = 0`,
      )
      .all();

    const agents = [];

    for (const row of rows) {
      let parsed;
      try {
        parsed = JSON.parse(row.value);
      } catch {
        continue;
      }

      if (!isActiveComposer(parsed)) continue;

      agents.push({
        composerId: row.composerId,
        workspaceId: row.workspaceId,
        workspacePath: resolveWorkspacePath(row.workspaceId),
        name: parsed.name || "Untitled agent",
        subtitle: parsed.subtitle || "Working...",
        contextUsagePercent: Number(parsed.contextUsagePercent) || 0,
        isRunning: parsed.unfinishedRunAt != null,
        isSubagent: row.isSubagent === 1,
        parentComposerId: parsed.subagentInfo?.parentComposerId ?? null,
        hasBlockingPendingActions: parsed.hasBlockingPendingActions ?? false,
        linesAdded: parsed.totalLinesAdded ?? 0,
        linesRemoved: parsed.totalLinesRemoved ?? 0,
        filesChanged: parsed.filesChangedCount ?? 0,
      });
    }

    return agents.sort((a, b) => {
      if (a.isSubagent !== b.isSubagent) return a.isSubagent ? 1 : -1;
      return b.contextUsagePercent - a.contextUsagePercent;
    });
  } finally {
    db.close();
  }
}

try {
  process.stdout.write(JSON.stringify(getActiveAgents()));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(message);
  process.exit(1);
}
