# 03 — Módulos

**Confiança:** CONFIRMADA por localização e imports.

Cada módulo abaixo é uma pasta/unidade lógica, não um package npm separado.

---

## Main process

| Campo | Valor |
|---|---|
| Nome | Main process |
| Tipo | Processo Electron / orquestração |
| Tecnologia | TypeScript ESM compilado (`module: NodeNext`) |
| Responsabilidade | Ciclo de vida do app, BrowserWindow, tray, dock/snap, polling, IPC, auto-launch |
| Localização | `electron/main.ts` + helpers na mesma pasta |
| Dependências | `electron`, `electron-store`, `auto-launch`, `./layout.js`, `./notifications.js`, `./sources/collect.js`, `./types.js` |
| Dependentes | Nenhum (é o entry `package.json` `"main"`) |

---

## Sources

| Campo | Valor |
|---|---|
| Nome | Sources |
| Tipo | Coleta de estado de terceiros |
| Tecnologia | TypeScript, `execFile`, `fs` |
| Responsabilidade | Produzir `SourceSnapshot[]` a cada poll |
| Localização | `electron/sources/` |
| Dependências | `CursorReader`, `which.ts`, `shared` via `electron/types.ts` |
| Dependentes | `electron/main.ts` (`SourceHub`) |

Subcomponentes: `SourceHub`, `CursorSource`, `ClaudeSource`, `CodexSource`, `mapCursorAgent`.

---

## Cursor reader (subprocesso)

| Campo | Valor |
|---|---|
| Nome | Cursor SQLite reader |
| Tipo | Adapter + script isolado |
| Tecnologia | `child_process.execFile` + `node:sqlite` |
| Responsabilidade | Ler agentes ativos do Cursor sem usar o Node do Electron |
| Localização | `electron/cursor-reader.ts`, `scripts/read-agents.mjs` |
| Dependências | Node do sistema, arquivo `state.vscdb` |
| Dependentes | `CursorSource` |

---

## Notifications

| Campo | Valor |
|---|---|
| Nome | NotificationHub |
| Tipo | Estado + regras de toast |
| Tecnologia | TypeScript em memória |
| Responsabilidade | Detectar ação pendente, conclusão, erro de fonte; emitir `NotchToast` |
| Localização | `electron/notifications.ts` |
| Dependências | `AppSettings`, snapshots |
| Dependentes | `main.ts`; testado por `scripts/notifications.test.mjs` |

---

## Shared contract

| Campo | Valor |
|---|---|
| Nome | Shared |
| Tipo | Biblioteca interna (tipos + layout) |
| Tecnologia | TypeScript compilado duas vezes (electron emit + Vite) |
| Responsabilidade | Contrato de dados, helpers de fonte, geometria da janela |
| Localização | `shared/types.ts`, `shared/layout.ts` |
| Dependências | Nenhuma de runtime |
| Dependentes | Main, renderer, reexport `electron/types.ts` e `electron/layout.ts` |

---

## Renderer

| Campo | Valor |
|---|---|
| Nome | Renderer |
| Tipo | UI React |
| Tecnologia | React 19, Vite, CSS global |
| Responsabilidade | Overlay, morph, drag, demonstração `?demo=` sem preload |
| Localização | `src/` |
| Dependências | `shared/*`, `window.sideNotch` (opcional) |
| Dependentes | Carregado pelo main (`loadURL` / `loadFile`) |

Subcomponentes UI: `App`, `NotchShell`, `CompactView`, `PreviewView`, `ExpandedView`, `SourcePanel`, `AgentCard`, `ContextMeter`, `IslandToast`, `source-model`, `motion`.

---

## Tooling scripts

| Campo | Valor |
|---|---|
| Nome | Scripts |
| Tipo | Build / launch / teste |
| Tecnologia | Node ESM |
| Responsabilidade | Copiar preload, baixar Electron, testar NotificationHub, ler Cursor |
| Localização | `scripts/` |
| Dependentes | npm scripts; CursorReader (apenas `read-agents.mjs`) |

---

## Relação quem-usa-quem (módulos)

```text
scripts/run-electron.mjs
        ↓ spawn
electron/main.ts
        ├── SourceHub
        ├── NotificationHub
        ├── electron-store
        └── BrowserWindow + preload.cjs
                    ↓ IPC
              src/App.tsx
                    ↓
              componentes + shared
```
