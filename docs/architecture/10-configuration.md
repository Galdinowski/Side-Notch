# 10 — Configuração e dependências dinâmicas

## Environment variables

| Variável | Quem lê | Papel |
|---|---|---|
| `APPDATA` | `read-agents.mjs`, `cursor-source.ts` | raiz Cursor / SQLite |
| `CODEX_HOME` | `codex-source.ts` | override de `~/.codex` |
| `SIDE_NOTCH_NODE` | `cursor-reader.ts`; setado em `run-electron.mjs` para `process.execPath` | binário Node para o reader |
| `npm_node_execpath` | `cursor-reader.ts` | candidato a Node |
| `ProgramFiles`, `ProgramFiles(x86)`, `LOCALAPPDATA` | `cursor-reader.ts`, `run-electron.mjs` | paths de `node.exe` / dist Electron |
| `ELECTRON_OVERRIDE_DIST_PATH` | setado no launch; **removido** no `childEnv` dos spawns | dist Electron custom |
| `ELECTRON_RUN_AS_NODE`, `ELECTRON_NO_ASAR`, `NODE_OPTIONS` | deletados em `childEnv` | evitar herdar ambiente Electron no Node/claude/powershell |
| `FORCE_COLOR` | forçado `"0"` em child | stdout JSON limpo |

Nenhum `.env` no repositório. `.gitignore` reserva `.env*`.

Não copiar valores. Se um env de máquina tiver secrets, não pertencem a este app.

---

## Arquivos de configuração

| Arquivo | Uso efetivo |
|---|---|
| `package.json` | scripts, `main`, electron-builder |
| `vite.config.ts` | `base: "./"`, `127.0.0.1:5173`, `outDir: dist` |
| `tsconfig.json` / `tsconfig.electron.json` / `tsconfig.node.json` | compilação |
| `electron-store` defaults em `main.ts:30-39` | dock, poll 1500, notify* true, launchOnStartup false |
| Store keys extras | `windowX`, `windowY` persistidos em `persistAnchor` |

`isDev = !app.isPackaged` controla URL vs arquivo HTML e auto-launch.

---

## Feature flags

Não há sistema de flags. Comportamento condicional:

- `app.isPackaged` — item de menu auto-launch; `isDev` loadURL
- `notifyCursor` / `notifyClaude` / `notifyCodex` — toasts por fonte
- query `?demo=toast|grouped|completed` — UI fake sem preload
- `ClaudeSource.capability` — cache missing/outdated

---

## Dependency injection

Não há container. Instâncias manuais:

```text
const store = new Store(...)
const sourceHub = new SourceHub()      # cria as 3 sources no construtor
const notifications = new NotificationHub()
CursorSource: new CursorReader()
```

`NotificationHub` aceita `now` / timeouts no construtor — usado pelos testes.

---

## Reflection / plugins / dynamic import

**Não encontrados** `import()`, `require(string variável de classe)`, registries de plugin, service locator.

---

## Carga por string / factories

| Mecanismo | Onde | Risco |
|---|---|---|
| Resolução de script por walk de diretórios | `CursorReader.findProjectRoot` | ALTO se `package.json`+script não encontrados |
| Candidatos de `node.exe` | `resolveNodeBinary` | MÉDIO — pode cair no `"node"` do PATH |
| Skip se path contém `electron.exe` | mesmo | evita Node errado |
| Skip arquivos dentro de `app.asar` (não unpacked) | `isInsideAsarArchive` | crítico no build empacotado |
| `which("claude")` | string fixa `"claude"` | PATH |
| IPC channel names | strings nos preloads | ver conflito CJS vs TS |
| `key = composerData:${id}` | SQL bind | formato Cursor |
| Demo query string | `App.tsx` | só renderer browser |

---

## Preload: duas fontes de verdade

| Artefato | Compilado? | Copiado para dist? | API |
|---|---|---|---|
| `electron/preload.ts` | **Não** (`exclude` no tsconfig) | Não | alinhada a `SideNotchAPI` / main / App |
| `electron/preload.cjs` | n/a (fonte CJS) | **Sim** `copy-preload.mjs` | API antiga |

Runtime da janela: `getPreloadPath()` → `__dirname/preload.cjs`.

Isto é dependência dinâmica/config: o processo renderer só vê o que o CJS expõe.

---

## Factories / singletons de fato

Módulo `main.ts` guarda estado global: `mainWindow`, `tray`, `store`, `sourceHub`, `pollTimer`, `lastSources`. São singletons de processo, não padrão GoF exportado.

`ClaudeSource` / `CodexSource` / `CursorReader` deduplicam polls com `inFlight`.
