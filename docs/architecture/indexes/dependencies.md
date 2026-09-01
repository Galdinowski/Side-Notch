# Índice: dependências

| Origem | Destino | Tipo | Confiança | Risco |
|---|---|---|---|---|
| electron/main.ts | SourceHub | import classe | CONFIRMADA | ALTO |
| electron/main.ts | NotificationHub | import classe | CONFIRMADA | MÉDIO |
| electron/main.ts | shared via types/layout | import | CONFIRMADA | CRÍTICO |
| electron/main.ts | electron-store | npm | CONFIRMADA | ALTO |
| electron/main.ts | auto-launch | npm | CONFIRMADA | MÉDIO |
| SourceHub | Cursor/Claude/Codex Source | composição | CONFIRMADA | ALTO |
| CursorSource | CursorReader | composição | CONFIRMADA | CRÍTICO |
| CursorReader | read-agents.mjs | spawn | CONFIRMADA | CRÍTICO |
| CursorReader | node.exe | spawn | CONFIRMADA | CRÍTICO |
| ClaudeSource | claude CLI | spawn | CONFIRMADA | ALTO |
| CodexSource | ~/.codex | fs | CONFIRMADA | ALTO |
| CodexSource | powershell WMI | spawn | CONFIRMADA | MÉDIO |
| src/App.tsx | shared/types, layout | import | CONFIRMADA | CRÍTICO |
| src/App.tsx | window.sideNotch | global IPC | CONFIRMADA | CRÍTICO |
| preload.cjs | ipcRenderer canais antigos | runtime | CONFIRMADA | CRÍTICO |
| preload.ts | ipcRenderer canais atuais | fonte não emitida | CONFIRMADA | CRÍTICO |
| notifications.test.mjs | dist-electron notifications.js | import build | CONFIRMADA | BAIXO |
| package.json | @types/sql.js | npm unused | CONFIRMADA | BAIXO |
| package.json | public/icon.ico | config build | CONFIRMADA ausente | MÉDIO |
| index.html | Google Fonts | rede | CONFIRMADA | BAIXO |
| copy-preload.mjs | electron/preload.cjs | copy | CONFIRMADA | CRÍTICO |
