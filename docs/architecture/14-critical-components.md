# 14 — Componentes críticos

Acoplamento: BAIXO / MÉDIO / ALTO / CRÍTICO — impacto se o componente mudar ou falhar.

---

## `electron/main.ts` (módulo de processo)

| Campo | Valor |
|---|---|
| Responsabilidade | Boot, janela, dock, IPC, poll, tray, auto-launch |
| Chamado por | Electron via `package.json` `"main"` |
| Depende de | SourceHub, NotificationHub, Store, AutoLaunch, layout, screen |
| Módulos afetados | todos em runtime |
| Banco afetado | não grava; dispara leitura Cursor |
| Integrações afetadas | todas indiretamente |
| Acoplamento | **CRÍTICO** |
| Risco | Estado global grande; geometria + IPC + poll no mesmo arquivo. Qualquer regressão de bounds/IPC derruba o produto |

---

## `shared/types.ts`

| Campo | Valor |
|---|---|
| Responsabilidade | Contrato de dados, `SideNotchAPI`, helpers de fonte |
| Chamado por | main (via `electron/types.ts`), renderer, NotificationHub |
| Depende de | nada |
| Módulos afetados | main, renderer, testes de snapshot |
| Banco afetado | tipos `ComposerHeaderValue` espelham JSON Cursor |
| Acoplamento | **CRÍTICO** |
| Risco | Mudança de campo quebra as três fontes e a UI ao mesmo tempo |

---

## `shared/layout.ts`

| Campo | Valor |
|---|---|
| Responsabilidade | Tamanhos compact/preview/expanded/toast por dock |
| Chamado por | `electron/main.ts` (`applyBounds`), `src/App.tsx` (`syncPill`) |
| Acoplamento | **ALTO** |
| Risco | Main e renderer devem produzir o mesmo tamanho; divergência = clipping ou “buraco” transparente |

---

## `SourceHub` (`electron/sources/collect.ts`)

| Campo | Valor |
|---|---|
| Responsabilidade | `Promise.all` das três sources na ordem Cursor, Claude, Codex |
| Chamado por | `collectSources` |
| Depende de | CursorSource, ClaudeSource, CodexSource |
| Integrações afetadas | as três |
| Acoplamento | **ALTO** |
| Risco | Ordem do array é contrato implícito com `SOURCE_ORDER` na UI (UI reordena por `SOURCE_ORDER`, então ordem do hub é menos rígida). Timeout efetivo = pior source (8s Claude/Cursor, 5s WMI) |

---

## `CursorReader` + `scripts/read-agents.mjs`

| Campo | Valor |
|---|---|
| Responsabilidade | Único acesso SQL |
| Chamado por | CursorSource |
| Depende de | Node sistema, `state.vscdb`, unpack asar |
| Banco afetado | Cursor `composerHeaders`, `cursorDiskKV` |
| Acoplamento | **CRÍTICO** para a fonte Cursor |
| Risco | Schema Cursor muda → agentes 0 ou parse error. Node < 22.5 → health error. Preload/path errado historicamente zerou a UI |

---

## Preload (`preload.cjs` vs `preload.ts`)

| Campo | Valor |
|---|---|
| Responsabilidade | Única ponte renderer ↔ main |
| Chamado por | Chromium ao criar a janela |
| Acoplamento | **CRÍTICO** |
| Risco | CJS desatualizado vs App atual. README e `copy-preload.mjs` afirmam que CJS é obrigatório |

---

## `src/App.tsx`

| Campo | Valor |
|---|---|
| Responsabilidade | Estado visual, IPC subscriptions, toasts, demo |
| Chamado por | `src/main.tsx` |
| Depende de | shared, motion, source-model, NotchShell, views, `window.sideNotch` |
| Acoplamento | **ALTO** |
| Risco | Máquina de estados densa (refs + timers). Strict Mode tem `lifecycleRef` para cleanup |

---

## `NotificationHub`

| Campo | Valor |
|---|---|
| Responsabilidade | Eventos de atividade |
| Chamado por | `collectSources`; callback em whenReady |
| Depende de | settings notify*, snapshots |
| Acoplamento | **MÉDIO** (isolado; bem testado) |
| Risco | Falsos “concluído” se health for mal classificado; mitigado para status error |

---

## `NotchShell`

| Campo | Valor |
|---|---|
| Responsabilidade | Drag, morph CSS vars, camadas compact/preview/expanded/toast |
| Chamado por | App |
| Acoplamento | **MÉDIO** |
| Risco | Contrato posicional `Children` [0]=compact [1]=preview [2]=expanded |

---

## Utilitários centrais

| Componente | Acoplamento | Motivo |
|---|---|---|
| `src/lib/source-model.ts` | ALTO na UI | status, slots, groupAgents |
| `src/lib/motion.ts` | ALTO na UI | durações e mapeamento Motion→ViewMode |
| `electron/which.ts` `childEnv` | MÉDIO | Claude + Codex; **duplicado** em `cursor-reader.ts` |
| `electron-store` instância | ALTO | settings globais |

---

## Pontos de alto impacto (blast radius)

1. Alterar IPC / `SideNotchAPI` sem atualizar **os dois** preloads e o main.
2. Alterar regra em `read-agents.mjs` sem atualizar README e `ComposerHeaderValue`.
3. Alterar `compactSize` / `sizeForMode` só de um lado (já é shared — mexer no shared afeta os dois processos).
4. Adicionar fonte: `SOURCE_ORDER`, SourceHub, NotificationHub.enabled, tray checkboxes, CSS `--ch-*`.
