# Índice: banco / armazenamento

| Recurso | Tipo | Componentes | Operações |
|---|---|---|---|
| `%APPDATA%\Cursor\User\globalStorage\state.vscdb` | SQLite externo | `read-agents.mjs` | SELECT readonly |
| `composerHeaders` | tabela | `read-agents.mjs` | SELECT não arquivados |
| `cursorDiskKV` | tabela | `read-agents.mjs` | SELECT `composerData:{id}` |
| `workspaceStorage/<id>/workspace.json` | JSON | `read-agents.mjs` | read `folder` |
| `$CODEX_HOME` / `~/.codex` | diretório | CodexSource | exists, readdir |
| `session_index.jsonl` | JSONL | CodexSource | read nomes |
| `sessions/**/*.jsonl` | JSONL | CodexSource | read eventos |
| `thread-writer-locks/*.lock` | lock file | CodexSource | list UUIDs |
| electron-store config | JSON app | main.ts | get/set settings |
| `%LOCALAPPDATA%\side-notch-electron` | dist Electron | run-electron.mjs | download/extract |

Sem migrations neste repositório.
