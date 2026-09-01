# 16 — Riscos arquiteturais e conflitos

Prioridade de evidência: código > config usada > testes > README.

---

## R1. Preload CJS ≠ preload TS ≠ main/renderer

**Confiança:** CONFIRMADA.

| Fonte | Canais / API |
|---|---|
| `electron/main.ts` | `settings:*`, `window:commit-bounds`, `window:move`, `window:mouse-ignore`, `window:end-drag`, `sources:refresh`; emite `sources:update`, `dock:update`, `view:expand`, `toast:show` |
| `electron/preload.ts` + `SideNotchAPI` + `App.tsx` | mesma API moderna |
| `electron/preload.cjs` (copiado para dist) | `window:resize`, `agents:refresh`, `agents:update`, `agents:error`, `window:dragging`; **sem** commitBounds/move/toast |

`tsconfig.electron.json` **exclude** `preload.ts`. `copy-preload.mjs` copia o CJS.

**Impacto:** se o dist usar o CJS do repo, o overlay atual não recebe `sources:update` e não consegue redimensionar. Sintomas alinhados ao README antigo (0%, “API do Electron”), agora por *drift* em vez de ESM.

**Risco:** CRÍTICO.

---

## R2. README desatualizado

**Confiança:** CONFIRMADA.

README afirma: só Cursor; IPC `agents:update`; critério simples `unfinishedRunAt`; estrutura sem `shared/`, Claude, Codex, NotificationHub.

Código: `SourceHub` de três fontes; regra Cursor mais rica em `read-agents.mjs`; IPC `sources:*`.

---

## R3. Node embutido vs `node:sqlite`

**Confiança:** CONFIRMADA (código + README; versão Node do Electron não revalidada nesta análise).

Leitura Cursor **obrigatoriamente** fora do processo Electron. Falha se `SIDE_NOTCH_NODE` / PATH não for ≥ 22.5, ou se o script ficar preso no asar.

---

## R4. Schema Cursor é implícito

**Confiança:** CONFIRMADA que o app depende dele; estabilidade do schema **DESCONHECIDA**.

`json_extract` em `fullConversationHeadersOnly[#-1].grouping` é acoplamento profundo ao formato interno do IDE.

---

## R5. `sandbox: false`

**Confiança:** CONFIRMADA. Amplia a superfície do preload em troca de CJS no Electron 34.

---

## R6. Integrações CLI/filesystem frágeis

- Claude: capability cache 30–60s pode atrasar recuperação.
- Codex: WMI pode ser negado; JSONL parcialmente escrito é ignorado (try/catch por linha).
- `isCodexProcess` tenta não contar o próprio Electron/side-notch.

**Confiança:** CONFIRMADA no código; taxa de falso positivo/negativo em produção DESCONHECIDA.

---

## R7. Dependências e artefatos fantasma

| Item | Evidência |
|---|---|
| `@types/sql.js` | em `package.json`, zero imports |
| `public/icon.ico` | `build.win.icon`; pasta `public/` ausente no inventário |
| `electron/preload.ts` | fonte “certa” mas morta no pipeline |

Build NSIS pode falhar ou usar ícone default do electron-builder. **PROVÁVEL** impacto no `electron:build`.

---

## R8. Testes estreitos

Só NotificationHub. Regras Cursor/Claude/Codex, layout e IPC sem rede de segurança.

---

## R9. Contrato AgentSnapshot puxado do Cursor

Claude/Codex preenchem `composerId`, `linesAdded=0`, `contextUsagePercent=null`. UI ramifica com `!= null`. Evolução do tipo único pode distorcer fontes novas.

---

## R10. Google Fonts em overlay transparente

Depende de rede na primeira carga das fontes. Sem self-host. Risco BAIXO de UI (fallback system fonts).

---

## R11. Single instance + window-all-closed vazio no Windows

Comentário: keep running in tray, mas o body do handler está vazio. Se a janela fechar, o processo pode continuar sem overlay visível — **INFERIDA** a intenção; comportamento exato se `close` da BrowserWindow não está customizado (não há `close` prevent). Janela não tem frame close button. Risco MÉDIO de processo zumbi só se algo destruir a window.

---

## Violações de dependência

Não há import renderer→electron. A violação prática é **runtime contract** (preload) e **doc vs code**, não camadas invertidas no grafo TS.
