## Tipo

- [ ] `feature` (nova funcionalidade → `develop`)
- [ ] `bugfix` (correção em desenvolvimento → `develop`)
- [ ] `hotfix` (correção urgente de produção → `main` e `develop`)
- [ ] `release` (corte de versão → `main` e `develop`)

## O que muda

<!-- Resumo curto do efeito da mudança. -->

## Checklist

- [ ] A branch segue o GitFlow (`feature/*` e `bugfix/*` → `develop`; `develop` / `release/*` / `hotfix/*` → `main`)
- [ ] Typecheck, testes e o instalador Windows passam no CI
- [ ] Não há push direto para `main`
