# Side-notch

Overlay estilo Dynamic Island para Windows. Monitora tarefas ativas do **Cursor**, **Claude Code** e **Codex** e mostra um widget sempre no topo: compacto, preview no hover, expandido no clique, e toasts de atividade.

## Funcionalidades

- Widget flutuante ou encostado nas laterais / topo da tela
- Três fontes: Cursor (SQLite local), Claude (`claude agents --json`), Codex (`~/.codex` + processos)
- Compacto mostra nome da fonte, estado e contexto quando o Cursor informa o percentual
- Hover abre preview; clique no compacto (ou em “Expandir lista”) abre a lista completa
- Toasts de intervenção, erro de leitura e conclusão
- Inicia com Windows (somente no build empacotado)

---

## Como funciona

```
┌─────────────────┐     IPC sources:*    ┌──────────────────┐
│  Renderer       │ ◄──────────────────► │  Electron Main   │
│  (React/Vite)   │  window.sideNotch    │  (main.ts)       │
└─────────────────┘                      └────────┬─────────┘
                                                  │ SourceHub
                              ┌───────────────────┼───────────────────┐
                              ▼                   ▼                   ▼
                        CursorReader        claude CLI           ~/.codex
                        + node:sqlite                            + WMI (opcional)
```

1. O processo main faz polling (~1,5 s). Cada fonte tem timeout próprio; uma CLI lenta não segura as outras.
2. Cursor: Node do sistema executa `scripts/read-agents.mjs` (Electron 34 não tem `node:sqlite`).
3. Claude: `claude agents --json` (resultado ok é reutilizado por 4 s).
4. Codex: JSONL recentes/locks; WMI no máximo a cada 10 s.
5. O resultado vai ao renderer em `sources:update`.

O preload efetivo é **CommonJS** (`electron/preload.cjs`, copiado para `dist-electron`). Precisa espelhar `electron/preload.ts` / `SideNotchAPI`.

### O que aparece no compacto

Uma fonte entra no widget se:

- tem tarefas ativas, ou
- é Codex com processo ao vivo, ou
- a leitura falhou (`error`) ou o CLI está desatualizado (`outdated`)

Ferramenta **não instalada** (`missing`) não ocupa slot; o tooltip da bandeja ainda mostra “ausente”.

Sem tarefas o compacto dissolve a pílula (sem `backdrop-filter`) e deixa o pet na borda com `position: fixed`. Nas laterais e no topo ele atravessa a borda inteira sempre no mesmo sentido; nos cantos inferiores fica enrolado, só a língua se mexe. Recolher encolhe a pílula — não varre a tela.

Toasts de **ATIVIDADE** crescem com o texto empilhado; a mensagem não é cortada pela pílula.

### Critério Cursor (agente ativo)

Header não arquivado/draft **e** (`isRunning` **ou** `hasBlockingPendingActions`). `isRunning` considera `unfinishedRunAt`, geração em andamento e grouping “live” no `composerData`.

---

## Requisitos

- **Windows 10/11**
- **Node.js 22.5+** (recomendado v24+) — leitura SQLite do Cursor
- Cursor / Claude Code / Codex instalados conforme as fontes que você quer monitorar

---

## Desenvolvimento

```bash
npm install
npm run electron:dev
```

Antes de iniciar, encerre instâncias antigas:

```powershell
Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force
npm run electron:dev
```

Testes:

```bash
npm test
```

Leitura Cursor manual:

```bash
node scripts/read-agents.mjs
```

---

## Build

```bash
npm run electron:build
```

---

## Configurações (bandeja)

Clique no ícone da bandeja para mostrar o overlay. Menu de contexto:

- **Centralizar** / **Encostar à esquerda / direita / topo** / **Flutuante**
- Notificações por fonte
- **Iniciar com Windows** — apenas no app empacotado
- **Sair**

---

## Troubleshooting

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| Pip dourado, zero tarefas | Preload antigo ou nenhum agente ativo | Confirme `dist-electron/electron/preload.cjs` com canais `sources:*`; `npm run electron:dev` |
| Compacto mostra “erro” | Node abaixo de 22.5, banco Cursor ocupado, CLI Claude | Atualize Node; clique o widget para ver o detalhe |
| Popup *Error launching app* | Auto-launch antigo em modo dev | Bandeja → Sair; a entrada é limpa em dev |
| Widget não atualiza, script manual funciona | Instância Electron antiga | Mate `electron` e reinicie |
| Claude some por ~1 min | CLI sem `agents --json` | Atualize o Claude Code |
| Codex “ao vivo” sem cards | Processo detectado, sessão sem `task_started` aberto | Esperado: o compacto conta processo; o painel explica |

---

## Estrutura relevante

```
Side-Notch/
├── electron/           # Main, preload CJS, fontes, tray
├── shared/             # Tipos, layout, regras de visibilidade
├── src/                # Overlay React
├── scripts/            # read-agents.mjs, derive-crawl-pose, preload copy, ícone, testes
└── public/             # ícone da bandeja; frames do pet em public/pet/frames
```
