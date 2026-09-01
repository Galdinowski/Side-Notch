# Índice: métodos

Métodos e funções de maior blast radius. Chamadores listados só quando confirmados por import/call site.

| Método | Classe / módulo | Chamadores | Dependências | Arquivo |
|---|---|---|---|---|
| `collect` | SourceHub | `collectSources` | 3× `read()` | `electron/sources/collect.ts:11` |
| `read` | CursorSource | SourceHub | CursorReader, fs | `electron/sources/cursor-source.ts:44` |
| `read` / `readOnce` | ClaudeSource | SourceHub | which, execFile | `electron/sources/claude-source.ts:80,88` |
| `read` / `readOnce` | CodexSource | SourceHub | fs, powershell | `electron/sources/codex-source.ts:57,65` |
| `getActiveAgents` | CursorReader | CursorSource.read | execFile, extractJson | `electron/cursor-reader.ts:104` |
| `readOnce` | CursorReader | getActiveAgents | node + script | `electron/cursor-reader.ts:114` |
| `extractJson` | CursorReader | readOnce | JSON.parse | `electron/cursor-reader.ts:78` |
| `findProjectRoot` | cursor-reader módulo | resolveReadAgentsScript | fs | `electron/cursor-reader.ts:12` |
| `resolveNodeBinary` | cursor-reader módulo | construtor | env, fs | `electron/cursor-reader.ts:51` |
| `mapCursorAgent` | cursor-map | CursorSource | AgentSnapshot | `electron/sources/cursor-map.ts:19` |
| `getActiveAgents` | read-agents.mjs | entry script | sqlite | `scripts/read-agents.mjs:82` |
| `isComposerRunning` | read-agents.mjs | getActiveAgents | groupingLooksLive | `scripts/read-agents.mjs:61` |
| `resolveWorkspacePath` | read-agents.mjs | getActiveAgents | workspace.json | `scripts/read-agents.mjs:13` |
| `ingest` | NotificationHub | collectSources | settings | `electron/notifications.ts:68` |
| `enabled` | NotificationHub | ingest | notify* | `electron/notifications.ts:178` |
| `collectSources` | main | pollSources, sources:refresh | SourceHub, notifications | `electron/main.ts:538` |
| `pollSources` | main | interval, IPC | collectSources | `electron/main.ts:556` |
| `registerIpc` | main | whenReady | ipcMain, store | `electron/main.ts:702` |
| `applyBounds` | main | commitMode, poll, dock | sizeForMode | `electron/main.ts:290` |
| `commitMode` | main | IPC commit-bounds | applyBounds | `electron/main.ts:356` |
| `setDock` | main | tray, settings:set | store, applyBounds | `electron/main.ts:334` |
| `moveWindowTo` | main | window:move | resolveDock | `electron/main.ts:368` |
| `isSourceInUse` | shared/types | inUseSources, toCompactSlots | — | `shared/types.ts:107` |
| `healthLine` | shared/types | main tray, App tooltip | SOURCE_ORDER | `shared/types.ts:123` |
| `sizeForMode` | shared/layout | main, App | compact/panel/toast | `shared/layout.ts:66` |
| `go` | App | hover/click/toast | commitBounds, motion | `src/App.tsx:87` |
| `presentToast` | App | onToast, demo | go | `src/App.tsx:218` |
| `toCompactSlots` | source-model | App | isSourceInUse | `src/lib/source-model.ts:79` |
| `sourceStatus` | source-model | slotFromSource, SourceBlock | health, agents | `src/lib/source-model.ts:32` |
| `groupAgents` | source-model | SourceBody | isSubagent | `src/lib/source-model.ts:23` |
| `which` | which.ts | ClaudeSource | where.exe | `electron/which.ts:16` |
| `isClaudeActive` | claude-source | readOnce | JSON row | `electron/sources/claude-source.ts:23` |
| `readActiveSessions` | CodexSource | readOnce | JSONL | `electron/sources/codex-source.ts:118` |
| `pillMode` | motion | App, NotchShell indireto | MotionState | `src/lib/motion.ts:27` |
