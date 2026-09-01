# 11 — Testes

## Inventário

| Arquivo | Tipo | Runner | O que cobre |
|---|---|---|---|
| `scripts/notifications.test.mjs` | unitário do hub (pós-build) | `node --test` | `NotificationHub` |

Script npm: `test:notifications` = `npm run build && node --test scripts/notifications.test.mjs`.

Não há Jest, Vitest, Playwright, Cypress, testes de contrato OpenAPI, nem testes E2E da janela.

O teste **importa o JS compilado** (`dist-electron/electron/notifications.js`), não o TypeScript. Falha se o build não rodou.

---

## Casos em `notifications.test.mjs`

1. Não notifica enquanto tarefas seguem ativas
2. Ação já pendente no startup vira toast sticky
3. Completions simultâneas agrupam num toast
4. Mesmo nome, ids diferentes → eventos distintos
5. Reaparecer no debounce cancela completion
6. Intervention e errors são sticky
7. Falha de leitura da fonte não vira completion

Helpers locais: `agent()`, `source()`, `setup()` com relógio injetado. Sem lib de mock.

---

## Cobertura por componente (repositório inteiro verificado)

| Componente | Teste dedicado? |
|---|---|
| NotificationHub | Sim |
| CursorReader / read-agents.mjs | Não |
| CursorSource / ClaudeSource / CodexSource | Não |
| SourceHub | Não |
| main.ts (IPC, dock, poll) | Não |
| shared/types helpers | Não (exercitados indiretamente no hub via snapshots) |
| shared/layout | Não |
| App / NotchShell / views | Não |
| preload | Não |
| which.ts | Não |
| run-electron.mjs / copy-preload.mjs | Não |

Não afirmar “sem teste” para NotificationHub. Para o restante, nenhum arquivo de teste adicional existe no inventário.

---

## Fixtures

Não há pasta `fixtures/` nem dumps de `state.vscdb`. Dados são objetos inline no teste do hub.

---

## Como correr

Requer build Electron TS bem-sucedido. Não exercita SQLite real nem CLIs.
