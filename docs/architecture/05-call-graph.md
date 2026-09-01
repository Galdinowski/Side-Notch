# 05 — Call graph

**Confiança:** CONFIRMADA nos caminhos TypeScript. Canais IPC do preload CJS divergem — ver riscos.

Não há controllers HTTP. Entradas reais: boot Electron, timer de poll, IPC, UI pointer, tray, second-instance.

---

## 1. Boot

```text
scripts/run-electron.mjs main()
  → ensureElectronBinary()            # se não --launch-only
  → launchElectron()
       spawn node electron/cli.js <projectRoot>
         env SIDE_NOTCH_NODE, ELECTRON_OVERRIDE_DIST_PATH

electron/main.ts (módulo)
  → app.requestSingleInstanceLock()
  → app.whenReady()
       notifications.setOnToast(...)
       clearDevAutoLaunch()
       registerIpc()
       createWindow()
         BrowserWindow({ preload: preload.cjs, sandbox: false })
         loadRenderer()  # Vite 5173 ou dist/index.html
         did-finish-load → startPolling()
       createTray()
       screen.on(display-*) → reflowForDisplayChange
       syncAutoLaunch se launchOnStartup
```

**Arquivo:** `scripts/run-electron.mjs` · `electron/main.ts` linhas 761–798.

Renderer:

```text
src/main.tsx
  → se !window.sideNotch: class browser-preview
  → createRoot(#root).render(<App />)
```

---

## 2. Poll de fontes (fluxo principal de dados)

```text
setInterval (pollIntervalMs, default 1500)
  → pollSources()                         # electron/main.ts:556
       → collectSources()                 # :538
            → sourceHub.collect()         # sources/collect.ts:11
                 Promise.all
                   CursorSource.read()
                   ClaudeSource.read()
                   CodexSource.read()
            → sendToRenderer("sources:update", payload)
            → notifications.ingest(sources, store.store)
            → applyBounds compact se modo compact
            → tray.setToolTip(healthLine)
```

### Cursor

```text
CursorSource.read()                       # cursor-source.ts:44
  → fs.existsSync(%APPDATA%/Cursor)
  → reader.getActiveAgents()              # cursor-reader.ts:104
       → execFile(nodeBinary, [read-agents.mjs])
            scripts/read-agents.mjs
              getActiveAgents()           # :82
                DatabaseSync(state.vscdb, readOnly)
                SELECT composerHeaders
                opcionalmente cursorDiskKV key composerData:{id}
                resolveWorkspacePath(workspace.json)
              stdout JSON
       → extractJson
  → mapCursorAgent()                      # cursor-map.ts:19
```

### Claude

```text
ClaudeSource.read() → readOnce()          # claude-source.ts:80 / 88
  → which("claude")                       # which.ts:16  where.exe
  → execFile(binary, ["agents", "--json"])
  → parseClaudeJson → filter isClaudeActive → mapClaudeAgent
```

Probe em backoff 30s (missing) / 60s (outdated).

### Codex

```text
CodexSource.read() → readOnce()           # codex-source.ts:57 / 65
  → readActiveSessions(~/.codex)
       session_index.jsonl
       thread-writer-locks/*.lock
       sessions/**/*.jsonl  (task_started / task_complete)
  → opcional: powershell Get-CimInstance Win32_Process
       isCodexProcess → liveProcessCount
```

---

## 3. IPC (contrato do código atual: main + preload.ts + App)

Handlers no main (`registerIpc`, `electron/main.ts` 702–754):

| Canal | Direção | Handler |
|---|---|---|
| `settings:get` | invoke | retorna `store.store` |
| `settings:set` | invoke | merge store; pode `startPolling`, `setDock`, `syncAutoLaunch`, `refreshTrayMenu` |
| `window:commit-bounds` | invoke | `commitMode` → `applyBounds` |
| `window:move` | send | `moveWindowTo` (snap dock) |
| `window:mouse-ignore` | send | `setIgnoreMouseEvents` |
| `window:end-drag` | send | `endDrag` → `applyBounds` |
| `sources:refresh` | invoke | `pollSources` |

Main → renderer:

| Canal | Quando |
|---|---|
| `sources:update` | cada collect |
| `dock:update` | `sendDock` |
| `view:expand` | second-instance / `focusOverlay` |
| `toast:show` | `NotificationHub` |

```text
App useEffect
  getSettings()
  onSourcesUpdate → setPayload + reconcileToast
  onDockChange → setSettings.dock
  onRequestExpand → go("pinning")
  onToast → presentToast
  refreshSources()
```

**Conflito CONFIRMADO:** `electron/preload.cjs` expõe `resizeWindow`/`refreshAgents`/`onAgentsUpdate` e escuta `window:resize`, `agents:refresh`, `agents:update`. O main **não** registra esses canais. Se o CJS for o preload efetivo, `window.sideNotch.commitBounds` é `undefined` e o renderer atual quebra.

---

## 4. Máquina visual (renderer)

```text
hover enter (NotchShell onMouseEnter)
  → App.handleHoverEnter
       setMouseIgnore(false)
       se há fontes in-use e compact → go("expanding")
            syncPill + commitBounds("preview")
            timeout MORPH.expandMs → motion "preview"

click
  → preview → go("pinning") → "expanded"
  → expanded → unpinning/collapsing ou toast se houver fila
  → toast → pinning (expande lista)

hover leave
  → timer MORPH.leaveMs → collapsing → commitBounds("compact")

drag
  → moveWindow(screenX - offset)
  → endDrag → applyBounds
```

`go()` em `src/App.tsx` linhas 87–144.

---

## 5. Toasts

```text
NotificationHub.ingest()                  # notifications.ts:68
  prime no primeiro snapshot (ações já pendentes)
  pending rising-edge → emit action (sticky)
  running true→false → queueCompletion (groupMs 1200)
  agente some de fonte healthy por goneMs → completion
  health ok→error → emit error (sticky)
  → onToast
       main webContents.send("toast:show")
            App.presentToast
              go("toasting") / commitBounds("toast")
              IslandToast
```

Testes cobrem este grafo: `scripts/notifications.test.mjs`.

---

## 6. Tray

```text
createTray() → Menu
  Centralizar → setDock("floating", { center: true })
  Encostar esquerda/direita/topo / Flutuante → setDock
  Notificações Cursor/Claude/Codex → store notify*
  Iniciar com Windows (só packaged) → syncAutoLaunch
  Sair → app.quit → before-quit clearInterval + notifications.reset
```

---

## 7. Demo sem Electron

```text
src/main.tsx: se !sideNotch → .browser-preview
src/App.tsx: query ?demo=toast|grouped|completed
  → presentToast sintético, sem IPC
```

Útil para `npm run dev` (Vite só).
