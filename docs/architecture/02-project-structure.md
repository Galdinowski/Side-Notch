# 02 — Estrutura do projeto

**Confiança:** CONFIRMADA (inventário do repositório em 2026-09-01). 42 arquivos rastreados no workspace (sem `node_modules`, `dist`, `dist-electron`).

## Hierarquia real

```text
side-notch (npm package)
│
├── Aplicação desktop
│   ├── Main process .............. electron/
│   ├── Preload IPC ............... electron/preload.cjs (+ preload.ts não compilado)
│   └── Renderer React ............ src/ + index.html
│
├── Contrato compartilhado ........ shared/
│
├── Coleta de fontes
│   ├── Hub ....................... electron/sources/collect.ts
│   ├── Cursor .................... electron/sources/cursor-source.ts
│   ├── Claude .................... electron/sources/claude-source.ts
│   ├── Codex ..................... electron/sources/codex-source.ts
│   └── Reader SQLite ............. scripts/read-agents.mjs + electron/cursor-reader.ts
│
├── Notificações .................. electron/notifications.ts
│
├── Tooling ....................... scripts/copy-preload.mjs, run-electron.mjs
│
├── Testes ........................ scripts/notifications.test.mjs
│
├── Configuração .................. package.json, tsconfig*.json, vite.config.ts
│
├── Documentação humana ........... README.md
└── Esta base ..................... docs/architecture/   (este diretório)
```

Não existem pastas `apps/`, `packages/`, `services/`, `prisma/`, `migrations/`, `.github/workflows/`.

## Árvore de arquivos-fonte

```text
Side-Notch/
├── electron/
│   ├── main.ts
│   ├── preload.ts          # excluído do tsc; API alinhada ao renderer
│   ├── preload.cjs         # copiado para dist; API antiga
│   ├── types.ts            # reexporta shared + Window.sideNotch
│   ├── layout.ts           # reexporta shared/layout
│   ├── notifications.ts
│   ├── cursor-reader.ts
│   ├── which.ts
│   └── sources/
│       ├── collect.ts
│       ├── cursor-source.ts
│       ├── cursor-map.ts
│       ├── claude-source.ts
│       └── codex-source.ts
├── shared/
│   ├── types.ts
│   └── layout.ts
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── vite-env.d.ts
│   ├── lib/
│   │   ├── motion.ts
│   │   └── source-model.ts
│   ├── components/
│   │   ├── NotchShell.tsx
│   │   ├── CompactView.tsx
│   │   ├── PreviewView.tsx
│   │   ├── ExpandedView.tsx
│   │   ├── SourcePanel.tsx
│   │   ├── AgentCard.tsx
│   │   ├── ContextMeter.tsx
│   │   └── IslandToast.tsx
│   └── styles/
│       └── global.css
├── scripts/
│   ├── read-agents.mjs
│   ├── copy-preload.mjs
│   ├── run-electron.mjs
│   └── notifications.test.mjs
├── index.html
├── vite.config.ts
├── tsconfig.json
├── tsconfig.electron.json
├── tsconfig.node.json
├── package.json
├── package-lock.json
├── .gitignore
└── README.md
```

## Artefatos gerados (gitignore)

| Caminho | Origem |
|---|---|
| `dist/` | Vite (renderer) |
| `dist-electron/` | `tsc -p tsconfig.electron.json` + copy preload |
| `release/` | electron-builder |
| `%LOCALAPPDATA%\side-notch-electron\` | zip Electron extraído por `run-electron.mjs` |
| `node_modules/` | npm |

## Referenciado e ausente no repositório

| Referência | Onde | Status |
|---|---|---|
| `public/icon.ico` | `package.json` → `build.win.icon` | **Não encontrado** no inventário |
| `.env` / `.env.example` | `.gitignore` menciona | **Não encontrado** |
| Docker / CI | — | **Não encontrado** |

## Configurações TypeScript (três projetos)

| Arquivo | Include | Emit |
|---|---|---|
| `tsconfig.json` | `src`, `shared` | `noEmit` (Vite transpila) |
| `tsconfig.electron.json` | `electron/**/*.ts`, `shared`; **exclude** `electron/preload.ts` | `dist-electron/` |
| `tsconfig.node.json` | `vite.config.ts` | `noEmit` |

## Carregamento dinâmico / indireto

Não há plugin system, reflection de classes, ou `import()` dinâmico de features.

Caminhos resolvidos em runtime (não aparecem como import estático):

- `scripts/read-agents.mjs` via `CursorReader.findProjectRoot`
- binário Node via `SIDE_NOTCH_NODE` / PATH / Program Files
- `claude` via `where.exe`
- `preload.cjs` via `path.join(__dirname, "preload.cjs")`
- URL Vite `http://127.0.0.1:5173` vs `dist/index.html`
- `CODEX_HOME` ou `~/.codex`
- `%APPDATA%\Cursor\...`

Ver [10-configuration.md](./10-configuration.md).
