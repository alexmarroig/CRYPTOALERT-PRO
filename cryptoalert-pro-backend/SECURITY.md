# Security Policy

## Scope
Este backend aplica segurança contínua para o ecossistema Node/TypeScript em `/v1/*`.

## CI Security Controls
- **SAST**: CodeQL para JavaScript/TypeScript em cada PR/push.
- **Dependency scanning**: `npm audit` com relatório JSON e gate automatizado.
- **DAST em staging**: OWASP ZAP baseline em `${STAGING_BASE_URL}/v1` (agendado e manual).
- **Release gate**: publicação de release falha quando existir vulnerabilidade `critical`.

## SLA de correção por severidade
- **Critical**: correção/mitigação em até **24h** (release bloqueado).
- **High**: correção em até **3 dias úteis**.
- **Medium**: correção em até **14 dias corridos**.
- **Low**: correção em até **30 dias corridos** ou próximo ciclo planejado.

## Input validation e AuthN/AuthZ
- Todos os controladores que recebem `req.body` devem validar com Zod `safeParse`.
- Há verificação automatizada via `npm run security:verify-input`.
- Testes automatizados cobrem autenticação inválida, role bypass em admin routes e cenário IDOR.

## Secrets hardening
- `ENCRYPTION_KEY` obrigatoriamente com 64 caracteres hexadecimais.
- Segredos sensíveis rejeitam placeholders triviais (`changeme`, `dummy`, etc.).
- Nunca commitar secrets reais em `.env`.
