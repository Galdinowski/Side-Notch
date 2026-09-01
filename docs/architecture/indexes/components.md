# Índice: componentes

| Componente | Tipo | Módulo | Responsabilidade | Dependências | Arquivo |
|---|---|---|---|---|---|
| Main bootstrap | processo | Main | ciclo de vida, IPC, dock | electron, store, hubs | `electron/main.ts` |
| SourceHub | orquestrador | Sources | collect paralelo | 3 sources | `electron/sources/collect.ts` |
| CursorSource | adapter | Sources | health + map Cursor | CursorReader, fs | `electron/sources/cursor-source.ts` |
| ClaudeSource | adapter | Sources | CLI claude | which, execFile | `electron/sources/claude-source.ts` |
| CodexSource | adapter | Sources | JSONL + WMI | fs, powershell | `electron/sources/codex-source.ts` |
| CursorReader | spawn | Cursor reader | exec script | child_process | `electron/cursor-reader.ts` |
| mapCursorAgent | mapper | Sources | Raw → AgentSnapshot | types | `electron/sources/cursor-map.ts` |
| NotificationHub | serviço | Notifications | ingest → toast | types | `electron/notifications.ts` |
| which / childEnv | util | Main | PATH + env limpo | where.exe | `electron/which.ts` |
| layout reexport | fachada | Main | sizes | shared/layout | `electron/layout.ts` |
| types reexport | fachada | Main | tipos + Window | shared/types | `electron/types.ts` |
| preload CJS | ponte IPC | Main | contextBridge (runtime) | electron | `electron/preload.cjs` |
| preload TS | ponte IPC | Main | contextBridge (não emitido) | electron | `electron/preload.ts` |
| read-agents | script | Cursor reader | SQL + regras Cursor | node:sqlite | `scripts/read-agents.mjs` |
| App | root UI | Renderer | motion + IPC | NotchShell, views, shared | `src/App.tsx` |
| NotchShell | shell UI | Renderer | drag, layers, a11y | IslandToast, motion | `src/components/NotchShell.tsx` |
| CompactView | view | Renderer | slots / pip dormante | source-model | `src/components/CompactView.tsx` |
| PreviewView | view | Renderer | painel preview | SourcePanel | `src/components/PreviewView.tsx` |
| ExpandedView | view | Renderer | painel expanded | SourcePanel | `src/components/ExpandedView.tsx` |
| SourcePanel | view | Renderer | blocos por fonte | AgentCard, source-model | `src/components/SourcePanel.tsx` |
| AgentCard | view | Renderer | tarefa + subagents | ContextMeter | `src/components/AgentCard.tsx` |
| ContextMeter | view | Renderer | barra de % | — | `src/components/ContextMeter.tsx` |
| IslandToast | view | Renderer | lista de eventos | types | `src/components/IslandToast.tsx` |
| source-model | lib UI | Renderer | slots, status, group | shared/types | `src/lib/source-model.ts` |
| motion | lib UI | Renderer | MotionState / MORPH | shared/types | `src/lib/motion.ts` |
| copy-preload | tooling | Tooling | copia CJS | fs | `scripts/copy-preload.mjs` |
| run-electron | tooling | Tooling | download + launch | @electron/get | `scripts/run-electron.mjs` |
