# CryptoAlert Pro Backend

Backend production-ready para o app **CryptoAlert Pro**, focado em **alertas e recomendações**, sem execução de trades. O portfolio é **read-only** via API keys. O frontend é responsável por abrir deep links para exchanges.

## Stack
- Node.js 20+, TypeScript, Express
- Supabase Postgres com RLS + Supabase Auth
- Stripe (checkout + webhook)
- Firebase Cloud Messaging (push)
- CCXT (apenas leitura de balances)
- AES-256-GCM para criptografar API secrets

## Features (MVP)
- Autenticação via Supabase Auth
- Roles: `user`, `influencer`, `admin`
- Admin definido por whitelist de emails (`admin_whitelist`)
- Convite para influencer via token
- Alerts & Posts com notificação para seguidores
- Follow social (user/influencer)
- Portfolio read-only (Binance/OKX) com snapshots
- Visibilidade de portfolio: `private`, `friends`, `public`, `percent`
- Stripe billing com planos `free`, `pro`, `vip`
- Rate limiting, validação com Zod e logs básicos
- Módulo de detecção de anomalias operacionais com feedback humano e recomendações de mitigação

## Estrutura
```
src/
  app.ts
  config/
  controllers/
  middleware/
  routes/
  services/
  utils/
supabase/
  migrations/
```

## Variáveis de ambiente
Crie `.env` baseado em `.env.example`.
```
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
STRIPE_SECRET=...
STRIPE_WEBHOOK_SECRET=...
STRIPE_PRICE_PRO=...
STRIPE_PRICE_VIP=...
FIREBASE_PROJECT_ID=...
FCM_SERVICE_ACCOUNT_JSON=...
ENCRYPTION_KEY=64_hex_chars
```

## Migrations (Supabase)
Execute o SQL em `supabase/migrations/001_init.sql` no editor SQL do Supabase.

## Rotas REST (/v1)

### Auth/Profile
- `GET /v1/me`
- `PATCH /v1/me`
- `POST /v1/auth/accept-invite`

### Admin
- `POST /v1/admin/invites`
- `GET /v1/admin/invites`
- `POST /v1/admin/invites/:id/revoke`
- `GET /v1/admin/influencers`

### Ops / Anomaly Detection (admin)
- `POST /v1/admin/ops/telemetry`
- `POST /v1/admin/ops/events`
- `POST /v1/admin/ops/analyze`
- `GET /v1/admin/ops/incidents?service_name=<name>&status=<optional>`
- `POST /v1/admin/ops/incidents/:id/feedback`

### Follow / Social
- `POST /v1/follow`
- `DELETE /v1/follow/:followingId`
- `GET /v1/following`
- `GET /v1/followers`

### Alerts / Posts
- `GET /v1/alerts`
- `POST /v1/alerts`
- `PATCH /v1/alerts/:id/status`
- `GET /v1/posts`
- `POST /v1/posts`

### Portfolio
- `POST /v1/portfolio/connect`
- `POST /v1/portfolio/test-connection`
- `POST /v1/portfolio/sync`
- `GET /v1/portfolio/me`
- `PATCH /v1/portfolio/visibility`
- `GET /v1/portfolio/public/:username`

### Influencer
- `GET /v1/influencer/metrics/me`

### Notifications
- `POST /v1/notify/test`
- `POST /v1/push/register`

### Billing (Stripe)
- `POST /v1/billing/checkout`
- `GET /v1/billing/status`
- `POST /v1/billing/webhook`

## OpenAPI
- `docs/openapi.json`


## Monitoramento de jornadas (staging)
- Runner sintético: `npm run journeys:staging`
- Gate de KPI/regressão: `npm run journeys:gate`
- Documentação: `docs/journey-observability.md`
## Qualidade e performance
- Matriz de compatibilidade + critérios go/no-go: `docs/quality-gates.md`
- Smoke de compatibilidade: `npm run test:compatibility`
- Testes de carga/stress/soak (k6):
  - `npm run perf:k6:load`
  - `npm run perf:k6:stress`
  - `npm run perf:k6:soak`

## Deploy
Compatível com Railway/Render/Vercel Serverless. Garanta:
- Secrets e ENV configurados
- Webhook Stripe apontando para `/v1/billing/webhook`
- CORS restrito ao domínio do app (ex.: `FRONTEND_URL`)

## Observações de segurança
- **Nunca** retornamos `api_secret` em respostas.
- `exchange_connections` guarda `api_secret_encrypted` com AES-256-GCM.
- Nenhuma execução de trade é realizada neste backend.

### Incident Risk Intelligence (preventivo)
Pipeline inicial para previsão de risco de incidente operacional nas próximas horas:
1. Coleta de telemetria histórica por serviço/rota (`errorRate`, latência p95/p99, memória, CPU, retries e timeout).
2. ETL para feature store simples em séries temporais agregadas por janela.
3. Treino de modelo baseline de classificação (logística incremental para versão inicial).
4. Inferência batch e near-real-time com score de risco + top fatores.
5. Geração de alertas preventivos quando score excede limiar.
6. Backtesting com métricas de AUC, precision@k e recall de incidentes.

Rotas:
- `POST /v1/incident-risk/telemetry`
- `POST /v1/incident-risk/etl/run`
- `POST /v1/incident-risk/model/train`
- `POST /v1/incident-risk/infer/batch`
- `GET /v1/incident-risk/infer/live`
- `POST /v1/incident-risk/alerts/evaluate`
- `POST /v1/incident-risk/backtest`
- `GET /v1/incident-risk/summary`
## Frontend quality gates (Playwright)

Esta API inclui uma suíte Playwright para validar o frontend publicado em `FRONTEND_URL`.

### Cobertura
- **Smoke + fluxos críticos:** carregamento de rotas principais.
- **Regressão visual:** snapshots baseline por página principal, locale e device.
- **i18n PT/EN:** valida aplicação de locale `pt-BR` e `en-US`.
- **Responsividade mobile-first:** valida ausência de overflow horizontal em mobile.
- **Acessibilidade (axe):** auditoria WCAG 2A/2AA em componentes críticos.

### Scripts
```bash
npm run test:e2e
npm run test:e2e:smoke
npm run test:e2e:update-snapshots
```

### Pré-requisitos
1. Frontend rodando ou publicado e acessível em `FRONTEND_URL`.
2. Browsers Playwright instalados:
```bash
npx playwright install --with-deps
```

### CI
Pipeline em `.github/workflows/frontend-e2e.yml` com matrix:
- chromium-desktop
- firefox-desktop
- webkit-desktop
- mobile-chrome
- mobile-safari
