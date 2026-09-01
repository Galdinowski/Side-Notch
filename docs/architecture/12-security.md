# 12 — Segurança

App local de overlay. Sem login de usuário, roles ou policies de produto.

## Autenticação / autorização

**Não existem** no código: JWT, OAuth, guards de rota, RBAC, middleware HTTP.

Controle de acesso efetivo:

- Dados lidos são os do **usuário do Windows** (APPDATA, `~/.codex`, PATH).
- Overlay é `alwaysOnTop` + `skipTaskbar`; mouse ignore com forward.

## Isolamento Electron

| Setting | Valor | Arquivo |
|---|---|---|
| `contextIsolation` | `true` | `main.ts` `createWindow` |
| `nodeIntegration` | `false` | idem |
| `sandbox` | `false` | idem — necessário ao preload CJS no Electron 34 (README) |
| Preload | `preload.cjs` | `getPreloadPath` |

`contextBridge.exposeInMainWorld("sideNotch", ...)` é a superfície do renderer.

IPC: handlers aceitam `Partial<AppSettings>` e números de posição **sem schema/validação Zod**. `window:move` ignora não-números. Risco limitado ao próprio renderer (não há páginas web de terceiros carregadas no código; em prod `loadFile` local).

## Secrets

Nenhum `password`, `api_key`, token de serviço ou connection string com credencial encontrado no fonte.

| Padrão | Situação |
|---|---|
| `electron-store` | persiste settings; **sem** `encryptionKey` no construtor |
| Tray icon | data URL PNG 1×1 (não é secret) |
| `token` em AgentCard | significa “tokens de contexto” estimados, não auth |

Se no futuro aparecer valor real de credencial: documentar `SENSITIVE_VALUE_PRESENT` apenas.

`.gitignore` inclui `.env`, `*.exe`, `release/`.

## Criptografia

Não há uso de `crypto` / hashes / TLS custom. Fontes HTTPS: Google Fonts e download Electron (biblioteca).

## Spawn e superfície OS

| Spawn | Risco |
|---|---|
| Node + `read-agents.mjs` | lê DB do Cursor; timeout 8s; maxBuffer 10MB |
| `claude agents --json` | executa binário do PATH |
| `powershell.exe` + WMI | enumeração de processos; timeout 5s |
| `where.exe` | lookup de binário |
| Expand-Archive no setup Electron | paths interpolados em string PowerShell |

`childEnv()` remove `NODE_OPTIONS` e flags Electron para reduzir hijack de subprocesso.

Reader recusa executar script **dentro** de `app.asar` (Node externo não lê asar). Empacotado depende de `asarUnpack: scripts/**`.

## Armazenamento de credenciais

Não gerencia credenciais de Cursor/Claude/Codex. Pode exibir **nomes de tarefas e paths de workspace** na UI (dados do usuário, não secrets de API).

## App id

`com.sidenotch.app` (`package.json` build.appId e `setAppUserModelId`).
