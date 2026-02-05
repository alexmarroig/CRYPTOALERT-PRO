# Quality Gates: Compatibilidade, Performance e Confiabilidade

## 1) Matriz de compatibilidade
A matriz oficial para validação do produto está em `tests/compatibility/compatibility-matrix.json` e cobre:
- **Browser**: Chrome, Firefox, Safari e Edge (latest-2).
- **OS**: Windows 11, macOS Sonoma, Ubuntu 24.04, Android 14 e iOS 17.
- **Dispositivo/Resolução**:
  - Desktop: 1920x1080
  - Laptop: 1440x900
  - Tablet: 834x1194
  - Mobile: 390x844

## 2) Execução no pipeline noturno e em release candidate
Workflow: `.github/workflows/quality-gates.yml`.
- **Noturno**: `schedule` diário (03:00 UTC).
- **Release candidate**: push para branches `release-candidate` ou `release/*`.
- Também pode ser disparado manualmente com `workflow_dispatch` escolhendo o profile de carga (`load`, `stress`, `soak`).

## 3) Testes de carga (k6) para rotas críticas
Script: `tests/performance/k6-critical-routes.js`.
- Rotas cobertas:
  - `/v1/news`
  - `/v1/alerts`
  - `/v1/portfolio/me` (representa `/v1/portfolio/*`)
- Profiles:
  - `load`
  - `stress`
  - `soak`

## 4) Medição de throughput, latência p95/p99 e taxa de erro por concorrência
No k6, cada requisição recebe tags por rota e profile para permitir corte por nível de concorrência.
Métricas e limites aplicados por threshold:
- `http_req_failed < 2%`
- `http_req_duration p(95) < 500ms`
- `http_req_duration p(99) < 1000ms`
- Thresholds específicos por rota (news/alerts/portfolio)
- `route_fail_rate < 3%`

## 5) Stress e soak para detectar vazamento/degradação temporal
No mesmo script k6:
- **Stress**: rampa de concorrência até 150 VUs para identificar ponto de ruptura.
- **Soak**: execução contínua de 70 minutos para detectar degradação ao longo do tempo.

## 6) SLOs e error budget como critério de go/no-go
SLOs operacionais definidos para APIs críticas:
- **Disponibilidade mensal**: 99.9%
- **Latência**:
  - p95 < 500ms
  - p99 < 1000ms
- **Taxa de erro**: < 1% em produção

### Error budget
- 99.9% de disponibilidade ⇒ **43m49s de erro/mês**.
- Orçamento de erro consumido > 50% antes do meio do ciclo de release bloqueia features de risco.

### Critério de Go/No-Go
- **Go**:
  - Compatibilidade passou na matriz mínima.
  - Load + Stress sem violar thresholds globais.
  - Soak sem tendência de degradação ou aumento progressivo da taxa de erro.
  - Error budget em faixa saudável.
- **No-Go**:
  - Qualquer violação de threshold p95/p99 ou taxa de erro.
  - Regressão de compatibilidade em browser/OS crítico.
  - Consumo acelerado do error budget.

## Execução local
```bash
# Valida matriz + smoke (se BASE_URL estiver definido)
npm run test:compatibility

# Carga
BASE_URL=https://staging-api.example.com npm run perf:k6:load

# Stress
BASE_URL=https://staging-api.example.com npm run perf:k6:stress

# Soak
BASE_URL=https://staging-api.example.com npm run perf:k6:soak
```
