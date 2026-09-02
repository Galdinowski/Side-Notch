import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
const stateDbPath = path.join(appData, "Cursor", "User", "globalStorage", "state.vscdb");
const workspaceStorageDir = path.join(appData, "Cursor", "User", "workspaceStorage");
const RUN_LOOKBACK_MS = 2 * 60 * 60 * 1000;

const workspaceCache = new Map();

let db = null;
let headerStmt = null;
let runStmt = null;

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

function parseJson(value) {
  if (value == null || value === "") return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function groupingLooksLive(grouping) {
  if (!grouping || typeof grouping !== "object") return false;
  if (grouping.hasText || grouping.isKeptFinalAiVisibleOutsideWorkedForGroup) return false;
  if (grouping.turnDurationMs != null) return false;
  if (grouping.hasThinking && grouping.thinkingDurationMs == null) return true;
  if (grouping.capabilityType != null || grouping.toolFormerTool != null) return true;
  return false;
}

function isComposerRunning(header, run) {
  if (header.unfinishedRunAt != null || run?.unfinishedRunAt != null) return true;
  if (run?.chatGenerationUUID) return true;
  if (run?.isContinuationInProgress) return true;
  const generating = parseJson(run?.generatingBubbleIds);
  if (Array.isArray(generating) && generating.length > 0) return true;
  const status = String(run?.status ?? "").toLowerCase();
  if (status === "generating" || status === "running" || status === "in_progress") {
    return true;
  }
  return groupingLooksLive(parseJson(run?.lastGrouping));
}

function pickNumber(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function pickOptionalNumber(...values) {
  for (const value of values) {
    if (value == null || value === "") continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function closeDb() {
  if (!db) return;
  try {
    db.close();
  } catch {
    // Connection may already be invalid after Cursor replaces the file.
  }
  db = null;
  headerStmt = null;
  runStmt = null;
}

function openDb() {
  closeDb();
  if (!fs.existsSync(stateDbPath)) return false;
  db = new DatabaseSync(stateDbPath, { readOnly: true });
  headerStmt = db.prepare(
    `SELECT composerId, workspaceId, isSubagent, checkpointAt, lastUpdatedAt, recency, value
     FROM composerHeaders
     WHERE isArchived = 0`,
  );
  runStmt = db.prepare(
    `SELECT
       json_extract(value, '$.status') as status,
       json_extract(value, '$.chatGenerationUUID') as chatGenerationUUID,
       json_extract(value, '$.unfinishedRunAt') as unfinishedRunAt,
       json_extract(value, '$.isContinuationInProgress') as isContinuationInProgress,
       json_extract(value, '$.generatingBubbleIds') as generatingBubbleIds,
       json_extract(value, '$.hasBlockingPendingActions') as hasBlockingPendingActions,
       json_extract(value, '$.contextUsagePercent') as contextUsagePercent,
       json_extract(value, '$.name') as name,
       json_extract(value, '$.subtitle') as subtitle,
       json_extract(value, '$.totalLinesAdded') as totalLinesAdded,
       json_extract(value, '$.totalLinesRemoved') as totalLinesRemoved,
       json_extract(value, '$.filesChangedCount') as filesChangedCount,
       json_extract(value, '$.fullConversationHeadersOnly[#-1].grouping') as lastGrouping
     FROM cursorDiskKV
     WHERE key = ?`,
  );
  return true;
}

function queryAgents() {
  const rows = headerStmt.all();
  const now = Date.now();
  const agents = [];

  for (const row of rows) {
    let parsed;
    try {
      parsed = JSON.parse(row.value);
    } catch {
      continue;
    }

    if (parsed.isArchived || parsed.isDraft) continue;

    const checkpoint = pickNumber(
      row.checkpointAt,
      parsed.conversationCheckpointLastUpdatedAt,
      row.lastUpdatedAt,
      parsed.lastUpdatedAt,
      row.recency,
    );
    const shouldLoadRun =
      parsed.unfinishedRunAt != null ||
      parsed.hasBlockingPendingActions ||
      (checkpoint > 0 && now - checkpoint < RUN_LOOKBACK_MS);

    const run = shouldLoadRun ? (runStmt.get(`composerData:${row.composerId}`) ?? null) : null;
    const isRunning = isComposerRunning(parsed, run);
    const hasBlockingPendingActions = Boolean(
      parsed.hasBlockingPendingActions || run?.hasBlockingPendingActions,
    );

    if (!isRunning && !hasBlockingPendingActions) continue;

    agents.push({
      composerId: row.composerId,
      workspaceId: row.workspaceId,
      workspacePath: resolveWorkspacePath(row.workspaceId),
      name: run?.name || parsed.name || "Agente sem nome",
      subtitle: run?.subtitle || parsed.subtitle || "Em execução",
      contextUsagePercent: pickOptionalNumber(
        run?.contextUsagePercent,
        parsed.contextUsagePercent,
      ),
      isRunning,
      isSubagent: row.isSubagent === 1,
      parentComposerId: parsed.subagentInfo?.parentComposerId ?? null,
      hasBlockingPendingActions,
      linesAdded: pickNumber(run?.totalLinesAdded, parsed.totalLinesAdded),
      linesRemoved: pickNumber(run?.totalLinesRemoved, parsed.totalLinesRemoved),
      filesChanged: pickNumber(run?.filesChangedCount, parsed.filesChangedCount),
    });
  }

  return agents.sort((a, b) => {
    if (a.isSubagent !== b.isSubagent) return a.isSubagent ? 1 : -1;
    return (b.contextUsagePercent ?? -1) - (a.contextUsagePercent ?? -1);
  });
}

function getActiveAgents() {
  if (!db && !openDb()) return [];
  try {
    return queryAgents();
  } catch {
    if (!openDb()) return [];
    return queryAgents();
  }
}

function writeAgentsLine() {
  process.stdout.write(`${JSON.stringify(getActiveAgents())}\n`);
}

export { getActiveAgents, pickNumber, pickOptionalNumber };

const entry = process.argv[1];
const isCli =
  Boolean(entry) &&
  path.normalize(fileURLToPath(import.meta.url)).toLowerCase() ===
    path.normalize(path.resolve(entry)).toLowerCase();

if (isCli) {
  const stdioMode = process.argv.includes("--stdio");
  if (stdioMode) {
    const rl = readline.createInterface({ input: process.stdin });
    rl.on("line", () => {
      try {
        writeAgentsLine();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stdout.write(`${JSON.stringify({ error: message })}\n`);
      }
    });
  } else {
    try {
      process.stdout.write(JSON.stringify(getActiveAgents()));
      closeDb();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(message);
      process.exit(1);
    }
  }
}
