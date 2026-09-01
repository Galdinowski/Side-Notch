# 07 — Regras de negócio

As regras **não foram reescritas**. Abaixo: localização, entradas e efeitos. Confirme no arquivo indicado.

---

## Fonte em uso (o que aparece no compact)

| Campo | Valor |
|---|---|
| Regra | Fonte entra no widget compacto se tem `agents.length > 0`, ou se é Codex com `liveProcessCount > 0` |
| Localização | `shared/types.ts` |
| Componente | `isSourceInUse` / `inUseSources` / `panelSources` |
| Método | `isSourceInUse` linhas 107–111 |
| Entradas | `SourceSnapshot` |
| Dependências | `SOURCE_ORDER` |
| Dados | agentes, `liveProcessCount`, `source` |
| Efeitos | tamanho da janela compacta; hover só expande se houver fontes in-use (`App.handleHoverEnter`) |

`panelSources` delega a `inUseSources` (mesma regra).

---

## Agente Cursor ativo

| Campo | Valor |
|---|---|
| Regra | Header não arquivado/draft **e** (`isRunning` **ou** `hasBlockingPendingActions`) |
| Localização | `scripts/read-agents.mjs` |
| Método | `getActiveAgents` 82–174; `isComposerRunning` 61–72; `groupingLooksLive` 52–59 |
| Entradas | linhas `composerHeaders` + opcional `cursorDiskKV` `composerData:{id}` |
| Dependências | `node:sqlite`, `RUN_LOOKBACK_MS` = 2 h |
| Dados | `unfinishedRunAt`, `chatGenerationUUID`, `isContinuationInProgress`, `generatingBubbleIds`, `status`, `lastGrouping`, `hasBlockingPendingActions`, checkpoint timestamps |
| Efeitos | JSON stdout; UI e toasts |

`isComposerRunning` é verdadeiro se: `unfinishedRunAt` no header ou run; `chatGenerationUUID`; `isContinuationInProgress`; array `generatingBubbleIds` não vazio; status `generating`/`running`/`in_progress`; ou grouping “live” (thinking sem duração, capability/tool).

**Conflito com README:** o README reduz a regra a `unfinishedRunAt \|\| hasBlockingPendingActions`. O código é mais amplo. Priorize o script. Confiança da regra no código: CONFIRMADA. Confiança do README: obsoleta.

Lookup de run só ocorre se `unfinishedRunAt` / pending **ou** checkpoint nos últimos 2 h (`shouldLoadRun`).

---

## Agente Claude ativo

| Campo | Valor |
|---|---|
| Regra | `waitingFor` **ou** state/status blocked/waiting/needs_input/working/active **ou** `pid`; idle/done/failed/stopped são inativos |
| Localização | `electron/sources/claude-source.ts` |
| Método | `isClaudeActive` 23–33; `mapClaudeAgent` 35–62 |
| Entradas | JSON de `claude agents --json` |
| Efeitos | `hasBlockingPendingActions` se waiting/blocked; `isRunning` se working/active/pid e não blocked |

---

## Sessão Codex ativa

| Campo | Valor |
|---|---|
| Regra | Arquivo de sessão `.jsonl` recente (2 min) **ou** session id com lock; stream termina com `task_started` sem `task_complete` posterior |
| Localização | `electron/sources/codex-source.ts` |
| Método | `readActiveSessions` 118–162; `readSession` 193–219; `readLockedSessionIds` 164–173 |
| Entradas | `sessions/**/*.jsonl`, `session_index.jsonl`, `thread-writer-locks` |
| Dados | `session_meta`, eventos `task_started` / `task_complete` |
| Efeitos | agentes com `isRunning: true`, `contextUsagePercent: null` |

Processos Codex (`liveProcessCount`) **não** criam cards de tarefa; só presença no compact (`isSourceInUse` + slot `presence`).

---

## Saúde das fontes

| Campo | Valor |
|---|---|
| Regra | Cursor missing se pasta `%APPDATA%/Cursor` ausente; erros classificados (Node sqlite, DB busy, enoent). Claude missing/outdated/error com cache temporal. Codex missing se não há `CODEX_HOME`. |
| Localização | `cursor-source.ts` `classifyCursorError`; `claude-source.ts` `readOnce`; `codex-source.ts` `readOnce` |
| Efeitos | `SourceHealth`; tray `healthLine`; toasts de erro; UI `sourceStatus` |

`healthLine` (`shared/types.ts` 123–145) omite fontes `missing`.

---

## Status visual do slot

| Campo | Valor |
|---|---|
| Regra | error se health error/missing; warning se outdated ou pending action; processing se running ou liveProcessCount; senão idle |
| Localização | `src/lib/source-model.ts` `sourceStatus` 32–40 |
| Efeitos | CSS `channel-slot--*`, indicadores |

Kind do slot: `meter` se há percent e health ok; `presence` se Codex; senão `count`.

---

## Toasts / ciclo de vida de tarefa

| Campo | Valor |
|---|---|
| Regra | Ver tabela abaixo; flags `notifyCursor/Claude/Codex` |
| Localização | `electron/notifications.ts` `ingest` 68–176 |
| Constantes | `VISIBLE_MS=1000`, `GONE_MS=2000`, `GROUP_MS=1200` |

Sub-regras (código):

1. Primeiro `ingest` **não** emite completions; pode emitir `action` se já pendente.
2. Rising edge de `hasBlockingPendingActions` → toast `action` sticky.
3. `running` true→false, sem pending, visível ≥ 1s, sem completion prévia → completion agrupada 1,2s.
4. Agente desaparece: só conta se a fonte ainda está `ok`; debounce 2s; se visível ≥ 1s → completion.
5. Falha de leitura **não** vira completion (teste dedicado).
6. Transição health para `error` → toast `error` sticky.
7. Completions agrupadas num único `NotchToast`.

Renderer: toasts não sticky fecham em `MORPH.toastMs` (4200). Sticky permanece até reconciliação (`reconcileToast`) ou clique.

---

## Dock / snap

| Campo | Valor |
|---|---|
| Regra | Distância ≤ 28px (`SNAP_IN`) encosta left/right/top; histerese 48px (`SNAP_OUT`) para sair |
| Localização | `electron/main.ts` `closestSnap` 134–144, `resolveDock` 146–167, `moveWindowTo` 368–406 |
| Efeitos | `store.dock`, IPC `dock:update`, posição da janela |

---

## Expandir / recolher

| Campo | Valor |
|---|---|
| Regra | Hover expande só com fontes in-use; clique em preview pina expanded; segunda instância pede expand |
| Localização | `src/App.tsx`; `main.focusOverlay` |
| Efeitos | `commitBounds`, `MotionState` |

---

## Auto-launch

| Campo | Valor |
|---|---|
| Regra | Só habilita se `app.isPackaged`; em dev desabilita entrada stale |
| Localização | `electron/main.ts` `syncAutoLaunch` 686–700, `clearDevAutoLaunch` 672–684 |
| Efeitos | registro de inicialização do Windows |

---

## Contexto / meter

| Campo | Valor |
|---|---|
| Regra | Percentual vem do JSON Cursor; UI mostra max entre agentes no compact; cores ≥65 warning, ≥85 danger |
| Localização | `read-agents.mjs` `pickNumber`; `source-model.slotFromSource`; `ContextMeter.levelClass` |
| Extra | `AgentCard.formatTokens` assume limite **200_000** (INFERIDA como heurística visual, não lida do Cursor) |

---

## Agrupamento parent/subagent

| Campo | Valor |
|---|---|
| Regra | `isSubagent` + `parentComposerId`; UI agrupa filhos sob o pai |
| Localização | `src/lib/source-model.ts` `groupAgents` 23–29 |
| Dados | só preenchido de forma rica pelo Cursor; Claude/Codex marcam `isSubagent: false` |
