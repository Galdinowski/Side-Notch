# 06 — Arquitetura

**Confiança:** CONFIRMADA. Descreve o que o código faz, não um target hexagonal.

## Estilo real

Aplicação desktop em **dois processos** (main / renderer) com **contrato compartilhado** (`shared/`) e **adapters de leitura** por ferramenta (`electron/sources/*`).

Não há camadas Domain / Application / Infrastructure nomeadas. A lógica de “o que é um agente ativo” vive nos adapters e no script SQLite, não num domínio isolado.

```text
┌─────────────────────────────────────────────────────────┐
│ Renderer (React)                                        │
│  apresentação + máquina de motion + drag                 │
│  depende de shared + window.sideNotch                    │
└──────────────────────────▲──────────────────────────────┘
                           │ IPC (contextBridge)
┌──────────────────────────┴──────────────────────────────┐
│ Preload (CJS efetivo / TS documental)                   │
└──────────────────────────▲──────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────┐
│ Main                                                    │
│  janela, dock, store, tray, poll                         │
│  NotificationHub (regras de evento)                      │
│  SourceHub → adapters                                    │
└─────────────┬─────────────┬──────────────┬──────────────┘
              │             │              │
         CursorReader    claude CLI     ~/.codex + WMI
              │
        node:sqlite (processo externo)
```

## Fronteiras

| Fronteira | Mecanismo | Quem cruza |
|---|---|---|
| Main ↔ Renderer | IPC allowlist no preload | `SideNotchAPI` |
| Main ↔ Cursor DB | subprocesso Node | `CursorReader` |
| Main ↔ Claude | processo CLI | `ClaudeSource` |
| Main ↔ Codex | filesystem + PowerShell | `CodexSource` |
| Main ↔ OS | Electron APIs, auto-launch, tray | `main.ts` |
| Geometria | `shared/layout.ts` | main **e** renderer (duplicado em cálculo, um único fonte) |

## Quem depende de quem (real)

```text
UI  →  shared  →  (nada)
UI  →  preload API  →  main
main  →  shared
main  →  sources  →  OS / arquivos de terceiros
main  →  NotificationHub  →  shared (tipos)
sources  NÃO dependem da UI
NotificationHub  NÃO depende das sources concretas (só SourceSnapshot)
```

**Direção saudável:** adapters e UI dependem do contrato `shared`; main orquestra. Isso está majoritariamente verdadeiro.

## Quem deveria depender de quem

Não há spec formal no repo. O desenho implícito no código:

- `shared` não deve importar `electron` nem `react`. **Confirmado:** não importa.
- Fontes não devem importar `main` ou React. **Confirmado.**
- Renderer não deve importar `electron/*`. **Confirmado.**

## Violações / inversões

| Item | Classificação | Evidência |
|---|---|---|
| `electron/preload.ts` excluído do build enquanto `preload.cjs` é a ponte real | inversão documental vs runtime | `tsconfig.electron.json` exclude; `copy-preload.mjs` |
| README descreve arquitetura Cursor-only | doc desatualizada | `README.md` vs `SourceHub` |
| `App` e `main` ambos chamam `sizeForMode` | acoplamento por contrato compartilhado, não inversão | intencional |
| `AgentCard.formatTokens` assume 200k tokens | regra de UI no componente, não no domínio Cursor | `AgentCard.tsx:10-14` |
| `panelSources` === `inUseSources` | abstração redundante | `shared/types.ts:119-121` |

Não há dependência renderer → main via import (só IPC). Não há import de `src` a partir de `electron`.

## Bounded contexts (de fato)

Três contextos de leitura, um contexto de overlay:

1. **Cursor monitoring** — SQLite + mapping
2. **Claude monitoring** — CLI JSON
3. **Codex monitoring** — JSONL + processos
4. **Overlay shell** — dock, morph, toasts, settings

Unificados apenas em `SourceSnapshot` / `AgentSnapshot`. Campos nascidos no Cursor (`composerId`, `linesAdded`, `contextUsagePercent`) são reutilizados com sentinelas (`null`, `0`, `""`) nas outras fontes.

## Persistência da app

Só settings (`electron-store`). Sem repositório de tarefas. Estado de notificação é **in-memory** (`NotificationHub`) e zera no quit.

## Adapters

| Adapter | Porta conceitual | Implementação |
|---|---|---|
| Cursor | “agentes ativos Cursor” | `CursorSource` + script |
| Claude | “sessões Claude ativas” | `ClaudeSource` |
| Codex | “sessões/processos Codex” | `CodexSource` |
| Settings | KV | `electron-store` |
| Auto-start | OS login item | `auto-launch` |
| Which | localizar binário | `where.exe` |
