# Observabilidade de Jornadas Críticas (Staging)

Este documento descreve a automação de jornadas sintéticas para monitorar fricção de usuário e bloquear releases com regressões de experiência.

## Jornadas críticas mapeadas

As jornadas automatizadas ficam em `tests/journeys/synthetic-journeys.mjs`:

1. **Onboarding**
   - `GET /v1/me`
   - `PATCH /v1/me` (idioma do perfil)
2. **Aceitar convite**
   - `POST /v1/admin/invites`
   - `POST /v1/auth/accept-invite`
3. **Seguir expert**
   - `POST /v1/follow`
   - `GET /v1/following`
4. **Criar alerta**
   - `POST /v1/alerts`
   - `GET /v1/alerts?scope=following`
5. **Sincronizar portfolio**
   - `POST /v1/portfolio/sync`
   - `GET /v1/portfolio/me`

## Cenários sintéticos com dados realistas

O runner usa `POST /v1/dev/seed` para preparar contas de staging e executa a matriz de cenários:

- `pt_free_newcomer` (pt, plano free)
- `en_pro_trader` (en, plano pro)
- `pt_vip_expert` (pt, perfil expert)
- `en_admin_ops` (en, perfil admin)

As variações mudam idioma, plano e contexto de uso para aumentar cobertura funcional.

## Execução contínua em staging + KPIs

Workflow: `.github/workflows/staging-journeys.yml`

- Executa a cada 30 minutos e também manualmente.
- Gera artefatos em `artifacts/journeys/` (`latest-report.json` e `latest-report.md`).
- KPIs por fluxo:
  - taxa de sucesso
  - latência p50/p95
  - média de latência
  - falhas por fluxo

Comandos locais:

```bash
npm run journeys:staging
npm run journeys:gate
```

## Relatório de fricção

O runner consolida estatísticas por **step** e ordena os pontos de fricção por:

1. maior abandono (`failures / attempts`)
2. maior latência média

O relatório em Markdown inclui uma seção **Friction Hotspots** com os passos mais críticos.

## Integração com E2E para bloquear release

Arquivo de baseline: `tests/journeys/kpi-thresholds.json`

Validador: `tests/journeys/assert-kpis.mjs`

- O comando `npm run journeys:gate` falha com `exit 1` se qualquer fluxo violar os thresholds de sucesso/latência.
- O workflow de staging roda o gate logo após o runner sintético.
- O script `npm run test:e2e` também inclui o gate para permitir bloqueio em pipelines de release.
