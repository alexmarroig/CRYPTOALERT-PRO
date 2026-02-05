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


## Testes (padrão oficial do projeto)
- Framework: **Node Test Runner (`node:test`)** com testes em `tests/` e `tests/unit/`.
- Convenção:
  - `*.test.js` para integração/HTTP (`supertest`)
  - `tests/unit/*.test.js` para testes unitários de controladores e serviços
  - Mocks obrigatórios para dependências externas: `supabaseAdmin`, `fetch`, `stripe`, `firebaseAdmin`
- Comandos:
  - `npm test` → executa suite padrão
  - `npm run test:coverage` → executa cobertura com gate mínimo de **80%** (linhas, funções e branches)

## OpenAPI
- `docs/openapi.json`

## Deploy
Compatível com Railway/Render/Vercel Serverless. Garanta:
- Secrets e ENV configurados
- Webhook Stripe apontando para `/v1/billing/webhook`
- CORS restrito ao domínio do app (ex.: `FRONTEND_URL`)

## Observações de segurança
- **Nunca** retornamos `api_secret` em respostas.
- `exchange_connections` guarda `api_secret_encrypted` com AES-256-GCM.
- Nenhuma execução de trade é realizada neste backend.
