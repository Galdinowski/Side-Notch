# Side-notch

Overlay estilo Dynamic Island para Windows que monitora tarefas ativas do Cursor em tempo real.

## Funcionalidades

- Widget flutuante ou encostado nas laterais da tela
- Monitora agentes ativos do Cursor
- Exibe contagem de tarefas e percentual de contexto usado
- Hover mostra preview; clique expande a lista completa
- Inicia com Windows (somente no build empacotado)

---

## O problema: widget mostrava 0% mesmo com agentes rodando

Durante o desenvolvimento, o Side-notch parecia **não capturar o uso do Cursor**: a contagem ficava em **0**, o percentual em **0%**, ou aparecia uma mensagem de erro cortada na interface (ex.: *"API do Electron"*).

Na prática, havia **três causas distintas** — e o sintoma nem sempre era realmente "zero", mas sim **falha silenciosa** ou **erro mal exibido**.

### 1. Preload ESM não carregava no Electron (causa principal)

O `package.json` do projeto define `"type": "module"`. O preload era compilado como **ESM** (`preload.js` com `import`).

No **Electron 34**, scripts de preload em contexto isolado **não carregam como ESM**. O preload falhava silenciosamente e **`window.sideNotch` nunca existia** no renderer.

**Sintomas:**

- Contagem e percentual sempre em 0
- Hover mostrava texto quebrado verticalmente (*"API do Electron"*)
- `refreshAgents()` e redimensionamento da janela não funcionavam

**Correção:** preload em **CommonJS** (`electron/preload.cjs`), copiado para `dist-electron/electron/` via `scripts/copy-preload.mjs`, com `sandbox: false` na janela.

### 2. Caminho errado do script de leitura do banco

O `CursorReader` resolvia a raiz do projeto como `dist-electron/` (um nível acima de `dist-electron/electron/`), procurando o script em:

```
dist-electron/scripts/read-agents.mjs   ❌ não existe
```

O script real está em:

```
scripts/read-agents.mjs   ✅
```

**Sintoma:** polling falhava a cada 1,5 s; a UI permanecia vazia.

**Correção:** `findProjectRoot()` sobe diretórios a partir de `__dirname` até encontrar `package.json` + `scripts/read-agents.mjs`.

### 3. Auto-launch de desenvolvimento apontando para caminho inválido

Com *"Iniciar com Windows"* ativo em modo dev, o app registrava o **executável do Electron** (`electron.exe`) com argumentos incorretos. Isso gerava o popup:

> *Error launching app — Unable to find Electron app at …*

**Correção:**

- Auto-launch desabilitado por padrão em dev
- Entrada antiga removida automaticamente ao iniciar (`clearDevAutoLaunch`)
- Opção *"Iniciar com Windows"* só aparece no menu da bandeja quando o app está **empacotado**

---

## Como funciona (arquitetura)

```
┌─────────────────┐     IPC      ┌──────────────────┐
│  Renderer       │ ◄──────────► │  Electron Main   │
│  (React/Vite)   │  sideNotch   │  (main.ts)       │
└─────────────────┘              └────────┬─────────┘
                                          │ spawn
                                          ▼
                                 ┌──────────────────┐
                                 │  Node.js (v24+)  │
                                 │  read-agents.mjs │
                                 └────────┬─────────┘
                                          │ readOnly
                                          ▼
                                 ┌──────────────────┐
                                 │  state.vscdb     │
                                 │  composerHeaders │
                                 └──────────────────┘
```

1. **Main process** faz polling a cada 1,5 s via `CursorReader`
2. **CursorReader** executa `scripts/read-agents.mjs` com o **Node do sistema** (não o Node embutido no Electron)
3. O script abre `%APPDATA%\Cursor\User\globalStorage\state.vscdb` em modo somente leitura
4. Lê a tabela `composerHeaders` e filtra agentes ativos
5. Resultado é enviado ao renderer via IPC (`agents:update`)

### Por que usar Node externo?

| Runtime | Versão Node | `node:sqlite` |
|---------|-------------|---------------|
| Sistema (`node.exe`) | v24.17.0 | ✅ Disponível |
| Electron 34 embutido | v20.18.2 | ❌ Indisponível |

O módulo nativo `node:sqlite` só existe a partir do **Node 22.5+**. Por isso a leitura do banco roda em subprocesso com o Node instalado no sistema.

### Critério de "agente ativo"

Um registro em `composerHeaders` é considerado ativo quando:

- `isArchived = 0` e `isDraft = false`
- **e** (`unfinishedRunAt != null` **ou** `hasBlockingPendingActions = true`)

O campo `contextUsagePercent` vem do JSON em `value`. Exemplo real:

```json
{
  "name": "Cursor usage update issue",
  "contextUsagePercent": 37.65,
  "unfinishedRunAt": 1788275644903,
  "unifiedMode": "agent"
}
```

> **Nota:** o Cursor só preenche `unfinishedRunAt` enquanto o agente está **executando de fato**. Agentes parados mas visíveis no histórico não entram na contagem — isso é comportamento esperado do banco, não bug do Side-notch.

---

## Requisitos

- **Windows 10/11**
- **Node.js 22.5+** (recomendado v24+) — usado pelo script de leitura
- **Cursor IDE** instalado (banco em `%APPDATA%\Cursor\`)

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

No terminal, você deve ver algo como:

```
[side-notch] Removed stale dev auto-launch entry
[side-notch] reader C:\Program Files\nodejs\node.exe C:\...\Side-Notch\scripts\read-agents.mjs
[side-notch] captured 1 agent(s) Cursor usage update issue:38%
```

### Testar leitura do banco manualmente

```bash
node scripts/read-agents.mjs
```

Saída esperada (JSON com agentes ativos):

```json
[{"name":"...","contextUsagePercent":37.65,"isRunning":true,...}]
```

---

## Build

```bash
npm run electron:build
```

---

## Configurações (bandeja do sistema)

- **Centralizar** — widget flutuante no centro
- **Encostar à esquerda / direita** — modo lateral
- **Flutuante** — arraste livremente (snap automático nas bordas)
- **Iniciar com Windows** — apenas no app empacotado
- **Sair** — encerra o processo

---

## Troubleshooting

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| Sempre 0 / 0% | Preload não carregou | Reinicie com `npm run electron:dev`; confirme `dist-electron/electron/preload.cjs` |
| Texto *"API do Electron"* no hover | `window.sideNotch` ausente | Mesmo acima — preload CommonJS |
| Popup *Error launching app* | Auto-launch antigo | Bandeja → Sair; reinicie; entrada é limpa em dev |
| `node scripts/read-agents.mjs` funciona, widget não | Instância Electron antiga | Mate processos `electron` e reinicie |
| Nenhum agente listado | Nenhum com `unfinishedRunAt` | Normal se nenhum agente está executando agora |
| Erro ao ler banco | Node < 22.5 | Atualize Node: `node -v` deve ser ≥ 22.5 |

---

## Estrutura relevante

```
Side-Notch/
├── electron/
│   ├── main.ts           # Janela, polling, IPC, bandeja
│   ├── cursor-reader.ts  # Spawn do script de leitura
│   └── preload.cjs       # Ponte IPC (CommonJS — obrigatório)
├── scripts/
│   ├── read-agents.mjs   # Leitura SQLite do Cursor
│   └── copy-preload.mjs  # Copia preload.cjs para dist-electron
└── src/                  # UI React (CompactView, PreviewView, …)
```
