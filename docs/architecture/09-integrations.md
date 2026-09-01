# 09 — Integrações

Não há clientes HTTP de domínio (REST/SOAP/GraphQL/gRPC) neste repositório. Integrações são **locais**: filesystem, CLI, WMI, OS, CDN de fontes, download do Electron.

Tokens/senhas: nenhum secret de API encontrado no código. Env vars são caminhos e override de binário.

---

## Cursor IDE

```text
Cursor (instalação + state.vscdb)
  ↓
CursorSource.read / CursorReader / read-agents.mjs
  ↓ métodos: read, getActiveAgents, getActiveAgents (script)
  ↓ enviados: nenhum (somente leitura)
  ↓ recebidos: headers JSON, composerData, workspace folder
  ↓ config: APPDATA, SIDE_NOTCH_NODE, scripts/read-agents.mjs
```

Tipo: SQLite + arquivos. Confiança CONFIRMADA.

---

## Claude Code CLI

```text
claude (PATH)
  ↓
ClaudeSource.readOnce
  ↓ método: execFile(binary, ["agents", "--json"])
  ↓ enviados: argv --json
  ↓ recebidos: JSON array (id, sessionId, name, cwd, kind, state, status, waitingFor, pid, startedAt)
  ↓ config: which("claude"); backoff 30s/60s
```

Tipo: CLI local. Contrato da CLI é **externo**; campos tipados como opcionais (`ClaudeAgentJson`). Se a CLI não tiver `agents --json`, health `outdated`.

---

## OpenAI Codex (estado local)

```text
CODEX_HOME | ~/.codex
  ↓
CodexSource.readActiveSessions + readLockedSessionIds
  ↓ dados lidos: JSONL meta/eventos, nomes, locks
  ↓ recebidos: session_id, cwd, thread_name, task_started/complete
```

```text
Windows WMI (opcional)
  ↓
powershell.exe Get-CimInstance Win32_Process
  ↓ filtro Name node.exe OR codex.exe
  ↓ isCodexProcess(Name, CommandLine)
  ↓ liveProcessCount
```

Falha de WMI é engolida (`liveProcessCount = 0`); sessões continuam. Confiança CONFIRMADA.

---

## Windows / Electron OS

| Sistema | Componente | Finalidade |
|---|---|---|
| Tray + Menu | `main.createTray` | dock, notifies, quit |
| Auto-launch | `auto-launch` | login Windows (packaged) |
| `where.exe` | `which.ts` | achar `claude` |
| Screen APIs | `main.ts` | workArea, multi-monitor |
| AppUserModelId | `com.sidenotch.app` | Win32 toasts/agrupamento (app id) |
| Single instance | `requestSingleInstanceLock` | focar overlay |

---

## Google Fonts

```text
fonts.googleapis.com / fonts.gstatic.com
  ↓
index.html <link>
  ↓
Renderer CSS (Sora, Oxanium)
```

Rede no overlay. Sem fallback local no repo. Tipo: CDN.

---

## Download Electron (`@electron/get`)

```text
artefato electron win32-x64 (versão de node_modules/electron)
  ↓
scripts/run-electron.mjs ensureElectronBinary
  ↓
%LOCALAPPDATA%\side-notch-electron
```

Usado no `postinstall` / `electron:ensure`. Não é integração de produto.

---

## electron-builder / NSIS

Empacota `appId: com.sidenotch.app`, `productName: Side-notch`, ícone `public/icon.ico` (**arquivo ausente no inventário**). `asarUnpack` de `scripts/**`.

---

## Não encontrado

Filas, webhooks, OAuth, pagamento, APIs fiscais, S3, Firebase, telemetry SaaS.
