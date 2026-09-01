# 08 — Banco de dados

O Side-notch **não possui banco próprio**, migrations, views, procedures, triggers nem ORM.

Há leitura **externa somente-leitura** do SQLite do Cursor e leitura de arquivos JSON/JSONL do Codex. Settings usam JSON via `electron-store` (não mapeado como schema relacional).

---

## A. SQLite do Cursor (externo, crítico)

**Confiança:** CONFIRMADA no script. Schema completo do Cursor é **DESCONHECIDO** (só as queries usadas).

| Campo | Valor |
|---|---|
| Arquivo | `%APPDATA%\Cursor\User\globalStorage\state.vscdb` |
| Resolução | `scripts/read-agents.mjs` linhas 6–7 |
| Abertura | `new DatabaseSync(stateDbPath, { readOnly: true })` linha 87 |
| Classificação | legado de terceiro, compartilhado com o IDE, crítico para a fonte Cursor |

Se o arquivo não existe, o script devolve `[]` (não lança). `CursorSource` ainda pode marcar `missing` se a pasta `%APPDATA%\Cursor` não existir.

### Recursos tocados

| Recurso | Tipo | Operação | Componentes |
|---|---|---|---|
| `composerHeaders` | tabela | SELECT | `read-agents.mjs` |
| `cursorDiskKV` | tabela | SELECT by key | `read-agents.mjs` |
| `workspaceStorage/<id>/workspace.json` | arquivo JSON | read | `resolveWorkspacePath` |

Índices, FKs, triggers: **DESCONHECIDOS** (não inspecionados; não são criados por este repo).

### Query 1 — headers

```text
Componente: scripts/read-agents.mjs
Método: getActiveAgents
Linha: 90–96
Query:
  SELECT composerId, workspaceId, isSubagent, checkpointAt,
         lastUpdatedAt, recency, value
  FROM composerHeaders
  WHERE isArchived = 0
```

`value` é JSON parseado em memória (`ComposerHeaderValue` em `shared/types.ts` é o formato **esperado**, não um schema imposto).

### Query 2 — run / composerData

```text
Componente: scripts/read-agents.mjs
Método: getActiveAgents (runStmt)
Linha: 98–115
Query:
  SELECT json_extract(value, '$.status') ...
         json_extract(value, '$.fullConversationHeadersOnly[#-1].grouping')
  FROM cursorDiskKV
  WHERE key = ?
Bind: composerData:{composerId}
```

Só executa se `shouldLoadRun` (linhas 137–140).

### Workspace path

```text
Tabela/arquivo: %APPDATA%\Cursor\User\workspaceStorage\{workspaceId}\workspace.json
Campo: folder (URI file://)
Componente: resolveWorkspacePath linhas 13–40
```

`workspaceId === "empty-window"` → `null`.

### Relação inversa

```text
composerHeaders
  ↓ usado por
read-agents.mjs → CursorReader.extractJson → mapCursorAgent → CursorSource
  ↓
SourceHub → main → IPC → App / NotificationHub
```

`cursorDiskKV` mesmo caminho, só no script.

Nenhum outro arquivo do repo executa SQL.

---

## B. Arquivos Codex (não SQL)

| Recurso | Tipo | Classificação |
|---|---|---|
| `$CODEX_HOME` ou `~/.codex` | diretório | específico da fonte Codex |
| `session_index.jsonl` | JSONL | nomes de thread |
| `sessions/**/*.jsonl` | JSONL eventos | estado active |
| `thread-writer-locks/*.lock` | lock files UUID | sessão locked |

Componentes: `CodexSource` apenas.

---

## C. Settings do app

`electron-store` persiste `AppSettings` (dock, notify*, poll, windowX/Y, launchOnStartup). Caminho típico do pacote: diretório de user data do Electron / config JSON. **Não** é SQLite. Sem encryption configurada no construtor (`electron/main.ts` 30–39).

---

## D. Classificação

| Recurso | Específico / compartilhado | Crítico | Legado | Notas |
|---|---|---|---|---|
| `state.vscdb` | compartilhado com Cursor | crítico | legado terceiro | schema pode mudar sem aviso |
| `workspace.json` | compartilhado | médio | legado terceiro | só path |
| `~/.codex` | compartilhado com Codex CLI | alto para fonte Codex | terceiro | JSONL append-only |
| electron-store | específico Side-notch | médio | — | settings |
