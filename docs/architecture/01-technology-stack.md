# 01 — Technology stack

**Confiança:** CONFIRMADA via `package.json`, lockfile e imports, salvo onde marcado.

## Linguagens

| Linguagem | Onde |
|---|---|
| TypeScript 5.8 | `electron/**/*.ts`, `src/**`, `shared/**`, `vite.config.ts` |
| JavaScript ESM (`.mjs`) | `scripts/read-agents.mjs`, `copy-preload.mjs`, `run-electron.mjs`, `notifications.test.mjs` |
| JavaScript CJS (`.cjs`) | `electron/preload.cjs` (preload runtime) |
| CSS | `src/styles/global.css` |
| HTML | `index.html` |

Não há C#, Java, Python, Go, Rust, SQL de migrations, nem templates server-side.

## Runtimes

| Runtime | Uso | Notas |
|---|---|---|
| Electron 34.2.0 | App | Node embutido ~20.18 — **sem** `node:sqlite` |
| Node.js do sistema ≥ 22.5 | `read-agents.mjs` | `DatabaseSync` de `node:sqlite` |
| Chromium (via Electron) | Renderer | `contextIsolation: true` |
| PowerShell | Codex process list; unzip do Electron | Windows |

## Frameworks e UI

- React 19 (`react`, `react-dom`)
- Vite 6 + `@vitejs/plugin-react`
- Sem router, sem Redux/Zustand, sem Tailwind, sem CSS-in-JS
- Fontes: Google Fonts (Sora, Oxanium) em `index.html`

## SDKs e bibliotecas de runtime

| Pacote | Papel | Tipo |
|---|---|---|
| `electron` | Shell desktop | devDependency (empacotado no build) |
| `electron-store` 10 | Settings JSON no disco do usuário | dependency |
| `auto-launch` 5 | Iniciar com Windows | dependency |

Não há axios/fetch de API de produto, ORM, cliente GraphQL, Stripe, auth cloud.

## Build e empacotamento

| Ferramenta | Papel |
|---|---|
| npm | Gerenciador (`package-lock.json` v3) |
| `tsc` | Main process → `dist-electron/`; typecheck renderer (`noEmit`) |
| Vite | Bundle renderer → `dist/` |
| `electron-builder` 25 | NSIS Windows → `release/` |
| `concurrently` + `wait-on` | Dev: Vite + compile electron + launch |
| `@electron/get` | Download do zip Electron para `%LOCALAPPDATA%\side-notch-electron` |
| `scripts/copy-preload.mjs` | Copia CJS preload para `dist-electron/electron/` |

Scripts npm: `dev`, `build`, `test:notifications`, `preview`, `postinstall`, `electron:ensure`, `electron:dev`, `electron:build`.

## Bancos e acesso a dados

| Tecnologia | Papel | ORM |
|---|---|---|
| SQLite (arquivo do Cursor) | Leitura `composerHeaders` / `cursorDiskKV` | Nenhum; `node:sqlite` |
| JSONL / JSON (Codex) | Sessões e locks | Nenhum; `fs` |
| JSON (`electron-store`) | Settings do app | Nenhum |

`@types/sql.js` está em `devDependencies` e **não é importado** em nenhum arquivo-fonte. **Confirmado:** dependência morta (provável resquício de tentativa anterior de ler SQLite no processo Electron).

## Infraestrutura

Não encontrado: Docker, compose, Kubernetes, Terraform, GitHub Actions, GitLab CI, servidores, filas, Redis, Postgres próprio.

`electron-builder` `asarUnpack: ["scripts/**"]` existe para o Node externo conseguir executar `read-agents.mjs` fora do asar.

## Serviços externos (rede)

- Google Fonts CSS (renderer, `index.html`)
- Download de artefato Electron no `postinstall` / `electron:ensure` (`@electron/get`)

Não há clientes REST/SOAP/gRPC/GraphQL de domínio. Claude é CLI local, não HTTP no código deste repo.

## Testes

- Node test runner (`node --test`)
- Um arquivo: `scripts/notifications.test.mjs`
- Depende do build (`dist-electron/electron/notifications.js`)
