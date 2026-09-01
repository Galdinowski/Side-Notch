# 13 — Observabilidade

Não há OpenTelemetry, Sentry, métricas Prometheus, tracing distribuído nem audit log estruturado.

## Logging

Canal: `console.log` / `warn` / `error` no processo main (e renderer para poucos erros). Prefixo comum `[side-notch]`.

| Evento | Onde | Nível |
|---|---|---|
| Health line uma vez | `collectSources` após primeiro poll | log |
| Caminho do reader | `CursorReader.readOnce` uma vez | log |
| Captura inicial de agentes Cursor | idem `loggedCapture` | log |
| stderr do reader | warn, truncado 500 | warn |
| Falha no poll | `startPolling` catch | error |
| Renderer crash | `render-process-gone` | error; reload após 400ms se não clean-exit |
| Auto-launch limpo em dev | `clearDevAutoLaunch` | log / warn |
| Commit bounds / refresh no renderer | `App.tsx` | error |
| Download Electron | `run-electron.mjs` | log / error |

Não há rotação de arquivo de log no app. `.gitignore` ignora `*.log`.

## UX como telemetria informal

- `tray.setToolTip("Side-notch · " + healthLine(sources))`
- Compact tooltip = `healthLine`
- Toasts de `error` quando health da fonte vai para error

## Tracing / metrics

Ausentes.

## Erros: gerar → tratar → registrar → propagar

```text
read-agents.mjs catch
  → stderr + exit 1
       CursorReader.readOnce catch
         → throw Error (stderr anexado)
              CursorSource.read catch
                → SourceSnapshot health error|missing (não throw)
                     SourceHub.collect resolve (Promise.all)
                          collectSources / pollSources
                            catch no interval: console.error (não envia payload de erro ao renderer)
```

Claude/Codex: erros viram `health` no snapshot, **não** rejeitam `collect()`. O renderer sempre recebe três fontes (CursorSource ainda devolve objeto).

NotificationHub: erro de fonte **não** gera completion; gera toast `error` se notify habilitado.

Renderer: `refreshSources()` catch só loga; `commitBounds` catch só loga. Sem Error Boundary React.

IPC: se preload CJS antigo, falhas aparecem como `window.sideNotch` incompleto / métodos undefined (histórico no README: texto “API do Electron”).

## Audit

Não há log de quem viu quais tarefas. Settings mudam via tray/IPC sem trilha.
