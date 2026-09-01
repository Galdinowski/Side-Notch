# 15 — Dependências circulares

Busca: imports estáticos TypeScript/JS do repositório (sem `node_modules`).

## Resultado

**Nenhum ciclo de módulo A → B → C → A foi encontrado.**

```text
shared/types.ts          (raiz)
shared/layout.ts         → types
electron/types.ts        → shared/types
electron/layout.ts       → shared/layout
electron/which.ts        (raiz)
electron/notifications   → types
electron/cursor-map      → types
electron/cursor-reader   → cursor-map
electron/cursor-source   → cursor-reader, cursor-map, types
electron/claude-source   → types, which
electron/codex-source    → types, which
electron/collect         → três sources
electron/main            → layout, notifications, collect, types

src/lib/*                → shared
src/components/*         → shared / lib / irmãos unidirecionais
src/App                  → components + lib + shared
src/main                 → App
```

`AgentCard` → `ContextMeter` (folha). `SourcePanel` → `AgentCard`. `NotchShell` → `IslandToast`. Sem volta.

Scripts `.mjs` não importam `src/` nem `electron/*.ts` (exceto o teste que importa **output** `dist-electron/.../notifications.js`). Isso não forma ciclo de fonte.

## Ciclos lógicos (não são import cycles)

### 1. Handshake de tamanho main ↔ renderer

```text
App.syncPill / commitBounds
  ↓ IPC window:commit-bounds
main.commitMode / applyBounds (sizeForMode)
  ↓ setBounds
App recebe WindowRect e ajusta pillSize
```

Não é ciclo de compilação. Risco: feedback se `commitWindow` no efeito de `slots.length` brigar com morph. **INFERIDA** como área sensível; não classificada como bug.

### 2. Poll → toast → bounds → poll

Toasts mudam modo da janela; poll continua. NotificationHub não chama SourceHub. Sem ciclo de módulo.

## Duplicação que parece ciclo

`childEnv` existe em `electron/which.ts` e `electron/cursor-reader.ts` (cópias). `Window.sideNotch` declarado em dois tsconfigs. Manutenção duplicada, não ciclo.

## Se um ciclo aparecer no futuro

Documentar: componentes, origem, destino, motivo, risco. Não “corrigir” nesta pasta de análise.
