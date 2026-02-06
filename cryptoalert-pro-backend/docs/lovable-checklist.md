# Checklist de integração para Lovable

## Padrão de resposta
- Sucesso: `{ "request_id": "uuid", "data": ... }`
- Erro: `{ "request_id": "uuid", "error": { "code": "STRING", "message": "...", "details": { ... } } }`
- Header: `X-Request-Id` presente em todas as respostas (respeita o valor enviado pelo cliente).

## Exemplos rápidos (novos endpoints)

### GET /v1/news?lang=pt&limit=5&assets=BTC,ETH
**Request**
```
GET /v1/news?lang=pt&limit=5&assets=BTC,ETH
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

**Response (200)**
```
{
  "request_id": "6f4c9f1b-9b9d-4c71-9aa7-52f7b754c4d1",
  "data": {
    "items": [
      {
        "id": "news-123",
        "title": "Bitcoin reage ao Fed",
        "source": "CryptoNews",
        "url": "https://example.com/news/123",
        "published_at": "2024-02-09T10:00:00.000Z",
        "assets": ["BTC"],
        "summary": "Resumo curto."
      }
    ],
    "meta": {
      "provider": "free-crypto-news",
      "cached": false,
      "ttl_seconds": 120,
      "degraded": false,
      "fetched_at": "2024-02-09T10:00:01.000Z"
    }
  }
}
```

### POST /v1/support/tickets
**Request**
```
POST /v1/support/tickets
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
Content-Type: application/json

{
  "type": "bug",
  "title": "Crash ao abrir portfólio",
  "message": "App fecha quando abro a aba de portfólio.",
  "page_url": "app://portfolio",
  "device": "iPhone 14",
  "app_version": "1.4.2",
  "screenshots": ["https://cdn.exemplo.com/prints/1.png"]
}
```

**Response (201)**
```
{
  "request_id": "bdbb71d3-9b2d-4ea0-8db0-4a2a12aa4a58",
  "data": {
    "ticket": {
      "id": "9a1e...",
      "status": "open",
      "created_at": "2024-02-09T10:12:00.000Z",
      "protocol": "SUP-9A1E"
    }
  }
}
```

### GET /v1/expert/dashboard/me
**Response (200)**
```
{
  "request_id": "c3a1fe52-9b5e-4ab5-9d2b-0a5dfcb44e9a",
  "data": {
    "dashboard": {
      "my_followers": 120,
      "active_alerts": 4,
      "closed_alerts_30d": 8,
      "avg_return_estimate": null,
      "engagement": {
        "followers_growth_hint": "Acompanhe alertas fechados para manter engajamento."
      },
      "top_assets": [
        { "asset": "BTC", "count": 2 }
      ]
    }
  }
}
```

### GET /v1/admin/usage/summary?range=7d
**Response (200)**
```
{
  "request_id": "e14f0f1a-4a6b-4c1b-bec5-2e1e9a72b5fd",
  "data": {
    "range": "7d",
    "as_of": "2024-02-09",
    "summary": {
      "dau": 120,
      "wau": 420,
      "mau": 1200,
      "alerts_created": 32,
      "syncs": 18,
      "posts_created": 12,
      "follows": 55
    }
  }
}
```

## Observações
- `/v1/news` retorna `meta.degraded=true` quando o provider falha e o cache é usado como fallback.
- `/v1/market/fear-greed` retorna `meta.note="estimativa"` quando usa proxy.
- Alertas trazem `entry`, `take_profit`, `stop_loss`, `confidence_score` e `explainability`.
- Métricas de experts incluem metodologia e disclaimer.
