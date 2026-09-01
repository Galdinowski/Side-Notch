# 04 — Dependências

**Confiança:** CONFIRMADA para imports TypeScript/JS. PROVÁVEL para runtime (spawn, PATH, arquivos).

Análise por leitura de `import`/`require` e metadados de `package.json`. AST de compilador não foi executado nesta passagem.

## Pacote → pacote (npm)

```text
side-notch
  runtime
    ├── electron-store
    └── auto-launch
  dev / empacotado
    ├── electron
    ├── electron-builder
    ├── react, react-dom
    ├── vite, @vitejs/plugin-react
    ├── typescript
    ├── concurrently, wait-on
    ├── @electron/get
    └── @types/*  (@types/sql.js NÃO usado no código)
```

Não há workspaces npm. Um único grafo.

## Projeto → projeto

Não aplicável: um único projeto.

## Módulo → módulo

```text
electron/main.ts
  → electron/layout.ts → shared/layout.ts → shared/types.ts
  → electron/notifications.ts → electron/types.ts → shared/types.ts
  → electron/sources/collect.ts
        → cursor-source.ts → cursor-reader.ts → cursor-map.ts → types.ts
        → claude-source.ts → which.ts + types.ts
        → codex-source.ts → which.ts + types.ts

src/main.tsx → src/App.tsx
  → shared/types.ts, shared/layout.ts
  → src/lib/source-model.ts → shared/types.ts
  → src/lib/motion.ts → shared/types.ts
  → NotchShell → IslandToast
  → CompactView
  → PreviewView / ExpandedView → SourcePanel → AgentCard → ContextMeter
```

`scripts/read-agents.mjs` **não importa** TypeScript do repo. Contrato com `CursorReader` é JSON stdout (formato `RawCursorAgent`). **Confirmado** por `extractJson` + `mapCursorAgent`.

`scripts/notifications.test.mjs` importa o **JS compilado** `dist-electron/electron/notifications.js`, não o `.ts`.

## Namespace / arquivo → arquivo (compartilhado)

`shared/` é o único namespace compartilhado entre processos. Main acessa via `electron/types.ts` e `electron/layout.ts` (reexport). Renderer importa `../shared/...` direto.

Duplicação de declaração global `Window.sideNotch`:

- `electron/types.ts` linhas 31–35
- `src/vite-env.d.ts` linhas 5–8

Não é ciclo; são dois programas TypeScript.

## Interface → implementação

| Contrato | Implementação | Confiança |
|---|---|---|
| `SideNotchAPI` (`shared/types.ts`) | `electron/preload.ts` | CONFIRMADA no fonte TS; o CJS runtime **não** implementa este contrato |
| Formato `RawCursorAgent` | stdout de `read-agents.mjs` | CONFIRMADA por mapeamento de campos |
| `SourceSnapshot` | `CursorSource.read`, `ClaudeSource.read`, `CodexSource.read` | CONFIRMADA |
| `NotificationHub.setOnToast` | callback em `main.ts` que envia `toast:show` | CONFIRMADA |

Não há DI container, interfaces TypeScript `implements` além dos formatos de dados.

## Classe → classe (estrutural)

```text
SourceHub
  possui CursorSource, ClaudeSource, CodexSource
CursorSource
  possui CursorReader
CursorReader
  não possui classes; chama processo
NotificationHub
  isolado; recebido por main
```

Não há herança de classes no código da aplicação.

## Método → método

Ver [05-call-graph.md](./05-call-graph.md) e [indexes/methods.md](./indexes/methods.md).

## Dependências de runtime (fora do grafo de import)

| Origem | Destino | Tipo | Confiança |
|---|---|---|---|
| `CursorReader` | `node.exe` + `read-agents.mjs` | spawn | CONFIRMADA |
| `ClaudeSource` | binário `claude` | spawn | CONFIRMADA |
| `CodexSource` | `powershell.exe` + WMI | spawn | CONFIRMADA |
| `CodexSource` | `~/.codex` | filesystem | CONFIRMADA |
| `read-agents.mjs` | `state.vscdb` | SQLite readonly | CONFIRMADA |
| `main` | `preload.cjs` | load script | CONFIRMADA |
| `copy-preload.mjs` | `electron/preload.cjs` → `dist-electron/...` | copy | CONFIRMADA |
| `run-electron.mjs` | GitHub via `@electron/get` | download | CONFIRMADA |
| Renderer | `window.sideNotch` | contextBridge | CONFIRMADA se preload carregar |

## Acoplamento (resumo)

| Origem | Destino | Tipo | Confiança | Risco |
|---|---|---|---|---|
| main + renderer | `shared/types.ts` | import | CONFIRMADA | CRÍTICO — quebra IPC e UI juntos |
| main + renderer | `shared/layout.ts` | import | CONFIRMADA | ALTO — tamanho de janela divergente |
| CursorSource | JSON do script | contrato implícito | CONFIRMADA | ALTO |
| App.tsx | `window.sideNotch` | global | CONFIRMADA | CRÍTICO se preload CJS antigo |
| NotificationHub | flags `notify*` | settings | CONFIRMADA | MÉDIO |

Índice tabular: [indexes/dependencies.md](./indexes/dependencies.md).
