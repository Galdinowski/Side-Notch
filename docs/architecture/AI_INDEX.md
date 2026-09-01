# AI Architecture Index

Este diretório contém o mapa arquitetural do projeto. Antes de executar uma alteração significativa, consulte primeiro `AI_INDEX.md` e os índices especializados. Utilize-os para localizar componentes, dependências, fluxos, banco, integrações e riscos. A documentação é um índice de navegação e contexto, não uma substituição do código-fonte. Antes de tomar decisões críticas, confirme as relações diretamente no código atual.

## Instrução

Antes de modificar código:

1. Consulte este índice.
2. Identifique o módulo afetado.
3. Consulte suas dependências.
4. Consulte o call graph.
5. Consulte banco e integrações quando aplicável.
6. Consulte componentes críticos e riscos.
7. Confirme a relação no código-fonte antes de modificar qualquer comportamento.

## Technology

Desktop overlay Windows. Pacote npm único `side-notch` 0.1.0.

- Runtime: Electron 34 (Chromium + Node 20 embutido) + Node.js do sistema ≥ 22.5 para SQLite
- UI: React 19 + Vite 6 + TypeScript 5.8
- Persistência local: `electron-store` (settings). Sem banco próprio.
- Leitura externa: SQLite do Cursor (`node:sqlite`), CLI `claude agents --json`, arquivos `~/.codex`
- Detalhe: [01-technology-stack.md](./01-technology-stack.md)

## Projects

| Projeto | Tipo | Entrada |
|---|---|---|
| `side-notch` | App Electron desktop | `electron/main.ts` (main), `src/main.tsx` (renderer) |

Índice: [indexes/projects.md](./indexes/projects.md)

## Modules

| Módulo | Pasta | Papel |
|---|---|---|
| Main process | `electron/` | Janela, tray, IPC, polling, layout nativo |
| Sources | `electron/sources/` | Coleta Cursor / Claude / Codex |
| Shared | `shared/` | Tipos e layout usados por main e renderer |
| Renderer | `src/` | Overlay React (ilha / laterais / topo) |
| Reader script | `scripts/read-agents.mjs` | SQLite do Cursor via Node externo |
| Tooling | `scripts/` | Preload copy, Electron dist, testes |

Detalhe: [03-modules.md](./03-modules.md) · [indexes/modules.md](./indexes/modules.md)

## Components

Pontos de troca frequentes:

- `SourceHub` — fan-out das três fontes
- `CursorReader` + `read-agents.mjs` — único caminho SQLite
- `NotificationHub` — toasts de conclusão / ação / erro
- `App` — máquina de estados visual (compact → preview → expanded → toast)
- `shared/types.ts` — contrato de dados e IPC
- `shared/layout.ts` — tamanho da janela (main e renderer devem concordar)

Índice: [indexes/components.md](./indexes/components.md)

## Critical Components

Impacto alto se alterados: `electron/main.ts`, `shared/types.ts`, `shared/layout.ts`, `SourceHub`, `scripts/read-agents.mjs`, `src/App.tsx`, preload IPC.

Ver: [14-critical-components.md](./14-critical-components.md)

**Atenção:** o preload **efetivamente copiado** é `electron/preload.cjs` (API antiga). `electron/preload.ts` descreve a API atual mas é excluído do `tsc`. Confirme qual arquivo está em `dist-electron/electron/preload.cjs` antes de mexer em IPC. Ver [16-architecture-risks.md](./16-architecture-risks.md).

## Dependencies

```text
src/*  ──imports──►  shared/*
electron/*  ──imports──►  shared/*
electron/main  ──usa──►  SourceHub, NotificationHub, electron-store, auto-launch
SourceHub  ──usa──►  CursorSource, ClaudeSource, CodexSource
CursorSource  ──spawn──►  CursorReader  ──execFile──►  node + read-agents.mjs
ClaudeSource  ──execFile──►  claude agents --json
CodexSource  ──fs──►  ~/.codex  +  PowerShell Win32_Process
```

Sem ciclos de import TypeScript detectados. Detalhe: [04-dependencies.md](./04-dependencies.md) · [15-circular-dependencies.md](./15-circular-dependencies.md)

## Database

Não há schema próprio. Leitura **somente** do SQLite do Cursor:

- `%APPDATA%\Cursor\User\globalStorage\state.vscdb`
- Tabelas usadas: `composerHeaders`, `cursorDiskKV`
- Também lê `workspaceStorage/<id>/workspace.json`

Codex usa JSONL em `CODEX_HOME` / `~/.codex` (não é SQL).

Detalhe: [08-database.md](./08-database.md)

## Integrations

| Sistema | Tipo | Componente |
|---|---|---|
| Cursor IDE | SQLite local + pasta de instalação | `CursorSource`, `read-agents.mjs` |
| Claude Code | CLI `claude` | `ClaudeSource` |
| OpenAI Codex | filesystem + WMI | `CodexSource` |
| Windows | tray, auto-launch, PowerShell, `where.exe` | `main.ts`, `which.ts`, `run-electron.mjs` |
| Google Fonts | CSS CDN | `index.html` |

Detalhe: [09-integrations.md](./09-integrations.md)

## Architecture Risks

1. **Preload CJS desatualizado vs `preload.ts` / `main.ts` / renderer** — risco crítico de IPC quebrado.
2. README desatualizado (só Cursor; canais IPC antigos).
3. Electron 34 não tem `node:sqlite`; leitura Cursor depende de Node do sistema.
4. `sandbox: false` no BrowserWindow.
5. Spawn de processos e leitura de dados de outros apps (Cursor/Claude/Codex).
6. `@types/sql.js` declarado e não usado; `public/icon.ico` referenciado e ausente no repo.

Detalhe: [16-architecture-risks.md](./16-architecture-risks.md)

## Circular Dependencies

Nenhum ciclo de módulo TypeScript encontrado. Há acoplamento estrutural (main e renderer calculam o mesmo layout independentemente) e duplicação (`childEnv`, declaração `Window.sideNotch`). Ver [15-circular-dependencies.md](./15-circular-dependencies.md).

## Navigation

- Visão: [00-system-overview.md](./00-system-overview.md)
- Estrutura: [02-project-structure.md](./02-project-structure.md)
- Call graph: [05-call-graph.md](./05-call-graph.md)
- Arquitetura: [06-architecture.md](./06-architecture.md)
- Regras: [07-business-rules.md](./07-business-rules.md)
- Config: [10-configuration.md](./10-configuration.md)
- Testes: [11-tests.md](./11-tests.md)
- Segurança: [12-security.md](./12-security.md)
- Observabilidade: [13-observability.md](./13-observability.md)
- Classes / métodos: [indexes/classes.md](./indexes/classes.md) · [indexes/methods.md](./indexes/methods.md)
- Grafos: [graphs/system.dot](./graphs/system.dot)
