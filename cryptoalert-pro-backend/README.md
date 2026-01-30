# CryptoAlert Pro Backend

Production-ready backend for CryptoAlert Pro, built with Node.js 20, Express, Supabase, Stripe, BullMQ, Firebase, and CCXT.

## Features
- Supabase Auth + Postgres
- REST API for auth, signals, portfolio, payments, influencer
- Stripe subscriptions + webhook handling
- BullMQ signal distribution
- Firebase push notifications
- CoinGecko live pricing
- CCXT portfolio sync
- Winston logging + rate limiting

## Project Structure
```
cryptoalert-pro-backend/
├── src/
│ ├── controllers/
│ ├── services/
│ ├── models/
│ ├── middleware/
│ ├── utils/
│ ├── routes/
│ └── config/
├── migrations/
├── package.json
├── vercel.json
└── README.md
```

## Environment Variables
Create a `.env` file with:
```
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_PRO=price_xxx
STRIPE_PRICE_VIP=price_xxx
FIREBASE_PROJECT_ID=your_project
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_jwt_secret
ENCRYPTION_KEY=64_hex_chars
COINGECKO_API_KEY=optional
FRONTEND_URL=https://cryptoalert.pro
PORT=3000
```

## Local Development
```
npm install
npm run dev
```

## Migrations
Run the SQL in `migrations/001_init.sql` in your Supabase SQL editor.

## Deployment
- Vercel configuration in `vercel.json`.
- Set Vercel secrets to match the environment variables.

## API Routes
- `/api/auth/*`
- `/api/signals/*`
- `/api/portfolio/*`
- `/api/payments/*`
- `/api/influencer/*`

## Subscription Rules
- **FREE**
  - Limited to **3 new signals per 7 days** for influencer publishing (counted in `signals`).
  - Limited to **3 copied signals per 7 days** for users (counted in `user_trades`).
  - Portfolio exchange sync is blocked; manual portfolio remains available.
  - Billing portal is unavailable.
- **PRO**
  - Unlimited signal publishing/copying.
  - Portfolio exchange sync available.
  - Billing portal available.
- **VIP**
  - Same limits as PRO (no weekly caps).
  - Billing portal available.

## Notes
- Ensure Redis is reachable for BullMQ.
- Stripe webhook endpoint: `/api/payments/webhook`.

## Investment Wallet Feature Checklist
- Multi-exchange portfolio aggregation (CCXT supported).
- Live pricing + PnL with CoinGecko pricing.
- Manual holdings for cold wallets and off-exchange assets.
- Encrypted API key storage at rest.
- Rate-limited API to prevent abuse.
