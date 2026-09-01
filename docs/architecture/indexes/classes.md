# Índice: classes

O código usa poucas classes. Funções e componentes React completam o modelo.

| Classe | Componente | Responsabilidade | Dependências | Arquivo |
|---|---|---|---|---|
| `SourceHub` | SourceHub | `collect()` das três fontes | CursorSource, ClaudeSource, CodexSource | `electron/sources/collect.ts` |
| `CursorSource` | CursorSource | snapshot Cursor | CursorReader, mapCursorAgent, fs | `electron/sources/cursor-source.ts` |
| `ClaudeSource` | ClaudeSource | snapshot Claude + capability cache | which, execFile | `electron/sources/claude-source.ts` |
| `CodexSource` | CodexSource | sessões + liveProcessCount | fs, powershell | `electron/sources/codex-source.ts` |
| `CursorReader` | CursorReader | spawn read-agents.mjs | execFile, fs | `electron/cursor-reader.ts` |
| `NotificationHub` | NotificationHub | toasts por diferença de snapshots | AppSettings | `electron/notifications.ts` |
| `Store<AppSettings>` | persistência | settings (lib) | electron-store | `electron/main.ts` (instância) |
| `AutoLaunch` | auto-start | login Windows (lib) | auto-launch | `electron/main.ts` |

Componentes React (funções, não classes): `App`, `NotchShell`, `CompactView`, `ChannelSlot`, `PreviewView`, `ExpandedView`, `SourcePanel`, `SourceBlock`, `AgentCard`, `ContextMeter`, `IslandToast`.
