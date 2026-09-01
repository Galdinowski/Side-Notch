# Índice: módulos

| Módulo | Tipo | Localização | Responsabilidade | Dependências principais |
|---|---|---|---|---|
| Main | processo | `electron/main.ts` | janela, IPC, poll, tray | SourceHub, NotificationHub, store, layout |
| Sources | coleta | `electron/sources/` | snapshots das três ferramentas | CursorReader, which, fs, execFile |
| Cursor reader | adapter + script | `electron/cursor-reader.ts`, `scripts/read-agents.mjs` | SQLite Cursor | Node ≥22.5, state.vscdb |
| Notifications | domínio de eventos | `electron/notifications.ts` | toasts | AppSettings, SourceSnapshot |
| Shared | contrato | `shared/` | tipos, layout, helpers | — |
| Renderer | UI | `src/` | overlay, motion, demo | shared, sideNotch |
| Tooling | scripts | `scripts/copy-preload.mjs`, `run-electron.mjs` | dist Electron, preload | `@electron/get`, fs |
| Testes | unit | `scripts/notifications.test.mjs` | hub | dist-electron notifications.js |
