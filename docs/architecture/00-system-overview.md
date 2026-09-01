# 00 — Visão do sistema

**Confiança:** CONFIRMADA (código + `package.json`).

## O que é

Side-notch é um **overlay estilo Dynamic Island** para Windows. Monitora tarefas ativas de três ferramentas de agente (Cursor, Claude Code, Codex) e mostra um widget sempre no topo: compacto, preview no hover, expandido no clique, e toasts de atividade.

Não é API, CLI de produto, biblioteca publicável, mobile nem serviço de rede. É um **aplicativo desktop local**.

## Forma arquitetural encontrada

```text
Aplicação desktop monolítica (um package.json)
    ├── Processo main Electron (Node)
    ├── Processo renderer (Chromium + React)
    ├── Ponte IPC (preload CommonJS)
    └── Subprocessos de coleta (Node externo, claude CLI, PowerShell)
```

Não há microsserviços, monorepo, ORM próprio, filas, GraphQL ou backend HTTP.

## Atores e dados

O app **não é dono** dos agentes. Ele observa estado que outros produtos gravam no disco ou expõem via CLI.

```text
Cursor (state.vscdb)
Claude Code (CLI)
Codex (~/.codex + processos)
        ↓  poll ~1,5 s
   SourceHub (main)
        ↓  IPC sources:update
   App React (overlay)
        ↓  hover / click / drag
   Main ajusta bounds da BrowserWindow
```

## Processos em runtime

| Processo | Como sobe | Papel |
|---|---|---|
| `electron.exe` main | `scripts/run-electron.mjs` ou instalador NSIS | Janela, tray, poll, IPC |
| Renderer | `loadURL` Vite em dev / `dist/index.html` empacotado | UI |
| `node.exe` + `read-agents.mjs` | `CursorReader.execFile` a cada poll | SQLite Cursor |
| `claude.exe` (se no PATH) | `ClaudeSource.execFile` | Lista de sessões |
| `powershell.exe` | `CodexSource` (opcional) | Contagem de processos Codex |

Single-instance lock: segunda instância foca o overlay e pede expand (`view:expand`). **Confirmado** em `electron/main.ts` linhas 761–767.

## Modos visuais

Definidos em `shared/types.ts` (`ViewMode`) e refinados em `src/lib/motion.ts` (`MotionState`):

```text
compact ↔ expanding → preview ↔ pinning → expanded
                  ↘ toasting → toast
```

Dock: `floating` | `left` | `right` | `top`. Persistido em `electron-store`.

## Limites de plataforma

- Alvo de build: `win` / NSIS (`package.json` → `build.win`).
- `run-electron.mjs` recusa setup de binário Electron fora de `win32`.
- Resolução de Node, `where.exe`, WMI e `%APPDATA%` são específicos de Windows.

macOS tem handlers `activate` / `window-all-closed` no main, mas o restante do código (leitor Cursor, Codex WMI, auto-launch empacotado) é Windows-first. **INFERIDA:** macOS/Linux não são alvos suportados de produto.

## Documentação vs código

O README da raiz ainda descreve apenas Cursor e o canal IPC `agents:update`. O código coleta três fontes e usa `sources:update`. Priorize o código. Lista de conflitos: [16-architecture-risks.md](./16-architecture-risks.md).
