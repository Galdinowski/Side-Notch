# Base de conhecimento arquitetural — Side-notch

Documentação gerada por análise do código-fonte. Destinada a agentes de IA e humanos que precisem localizar módulos, fluxos, dependências e riscos **antes** de alterar o sistema.

## Como usar

1. Comece em [`AI_INDEX.md`](./AI_INDEX.md).
2. Siga o índice do módulo ou fluxo afetado.
3. Confirme sempre no código-fonte atual. Esta pasta é um mapa, não a fonte da verdade.

## Escopo desta análise

| Item | Valor |
|---|---|
| Data da análise | 2026-09-01 |
| Forma do repositório | Pacote npm único (não é monorepo) |
| Tipo de produto | Overlay desktop Windows (Electron + React) |
| Banco próprio | Não existe |
| CI/CD / Docker / IaC | Não encontrados |
| Confiança geral | Alta no grafo estático TypeScript; média onde há spawn/CLI/arquivos externos |

## Prioridade de evidência

Quando houver conflito:

```text
Código executável/compilável
        ↓
Configuração efetivamente utilizada
        ↓
Testes
        ↓
Documentação (README)
```

O `README.md` da raiz descreve um recorte antigo (só Cursor, IPC `agents:update`). O código atual coleta Cursor + Claude + Codex e usa IPC `sources:*`. Ver [`16-architecture-risks.md`](./16-architecture-risks.md).

## Conteúdo

| Arquivo | Conteúdo |
|---|---|
| [AI_INDEX.md](./AI_INDEX.md) | Ponto de entrada para agentes |
| [00-system-overview.md](./00-system-overview.md) | Visão do sistema |
| [01-technology-stack.md](./01-technology-stack.md) | Stack |
| [02-project-structure.md](./02-project-structure.md) | Árvore e inventário |
| [03-modules.md](./03-modules.md) | Módulos e responsabilidades |
| [04-dependencies.md](./04-dependencies.md) | Grafo de dependências |
| [05-call-graph.md](./05-call-graph.md) | Fluxos de execução |
| [06-architecture.md](./06-architecture.md) | Fronteiras reais |
| [07-business-rules.md](./07-business-rules.md) | Regras de negócio (localização) |
| [08-database.md](./08-database.md) | SQLite externo do Cursor + arquivos Codex |
| [09-integrations.md](./09-integrations.md) | Integrações |
| [10-configuration.md](./10-configuration.md) | Config, env, DI, carga dinâmica |
| [11-tests.md](./11-tests.md) | Testes |
| [12-security.md](./12-security.md) | Segurança |
| [13-observability.md](./13-observability.md) | Logs e erros |
| [14-critical-components.md](./14-critical-components.md) | Pontos de alto impacto |
| [15-circular-dependencies.md](./15-circular-dependencies.md) | Ciclos |
| [16-architecture-risks.md](./16-architecture-risks.md) | Riscos e conflitos |
| [indexes/](./indexes/) | Tabelas de busca |
| [graphs/](./graphs/) | Grafos Graphviz |

## O que esta análise não fez

- Não modificou código, dependências, banco nem configuração de runtime.
- Não executou o app nem o leitor SQLite contra `state.vscdb` real.
- Não gerou AST compilado; relações vêm de imports TypeScript, `package.json` e leitura dos arquivos.
