import fs from 'node:fs/promises';
import path from 'node:path';

export type FailureType = 'rede' | 'banco' | 'validacao' | 'auth' | 'provider_externo' | 'desconhecido';

export interface IncidentRecord {
  timestamp?: string;
  trace_id: string | null;
  user_id: string | null;
  endpoint: string;
  status: number;
  erro: string;
  failure_type: FailureType;
}

export interface ClusteredIncident {
  cluster_id: string;
  signature: string;
  endpoint: string;
  failure_type: FailureType;
  erro_representativo: string;
  frequencia: number;
  status_medio: number;
  impacto: number;
  sugestoes: string[];
  trace_ids: string[];
  usuarios_afetados: number;
}

const PLAYBOOKS: Record<FailureType, string[]> = {
  rede: [
    'Validar conectividade e DNS entre serviços.',
    'Aplicar retry com backoff exponencial para chamadas idempotentes.',
    'Revisar timeouts de cliente e servidor para reduzir falhas transitórias.'
  ],
  banco: [
    'Inspecionar pool de conexões e saturação de queries lentas.',
    'Executar EXPLAIN nas consultas afetadas e aplicar índices necessários.',
    'Revisar políticas de retry/transação para deadlocks e timeouts.'
  ],
  validacao: [
    'Ajustar schema de validação para mensagens claras ao cliente.',
    'Adicionar validações antecipadas no endpoint para evitar processamento desnecessário.',
    'Documentar payload esperado no contrato da API.'
  ],
  auth: [
    'Verificar validade/expiração de tokens e sincronismo de relógio.',
    'Conferir permissões/roles exigidas no endpoint.',
    'Reforçar logs de auditoria para tentativas de acesso negadas.'
  ],
  provider_externo: [
    'Validar SLA/status do provider externo e habilitar fallback.',
    'Cachear respostas quando possível para mitigar indisponibilidade.',
    'Configurar circuit breaker para evitar cascata de falhas.'
  ],
  desconhecido: ['Classificar manualmente o erro e atualizar playbook interno.']
};

const LOG_FILES = ['error.log', 'combined.log'];

function normalizeErrorMessage(message: string): string {
  return message
    .toLowerCase()
    .replace(/[0-9a-f]{8,}/gi, '#id')
    .replace(/\b\d+\b/g, '#n')
    .replace(/\s+/g, ' ')
    .trim();
}

export function classifyFailureType(errorMessage: string, endpoint: string, status: number): FailureType {
  const haystack = `${errorMessage} ${endpoint}`.toLowerCase();

  if (status === 401 || status === 403 || /unauthorized|forbidden|jwt|token|auth/.test(haystack)) {
    return 'auth';
  }

  if (/validation|invalid|zod|required|schema|payload/.test(haystack) || status === 400 || status === 422) {
    return 'validacao';
  }

  if (/supabase|sql|postgres|database|db|query|relation|constraint|deadlock/.test(haystack)) {
    return 'banco';
  }

  if (/timeout|econn|network|socket|dns|fetch failed|unreachable/.test(haystack)) {
    return 'rede';
  }

  if (/stripe|firebase|coingecko|provider|third-party|webhook/.test(haystack)) {
    return 'provider_externo';
  }

  return 'desconhecido';
}

function buildClusterId(failureType: FailureType, endpoint: string, normalizedError: string): string {
  return `${failureType}:${endpoint}:${normalizedError}`;
}

function calculateImpact(frequency: number, avgStatus: number, affectedUsers: number): number {
  const statusWeight = avgStatus >= 500 ? 5 : avgStatus >= 400 ? 3 : 1;
  return frequency * statusWeight + affectedUsers;
}

function parseLogLine(line: string): IncidentRecord | null {
  if (!line.trim()) {
    return null;
  }

  try {
    const payload = JSON.parse(line) as Record<string, unknown>;
    const level = String(payload.level ?? 'info');
    if (level !== 'error' && payload.erro === undefined) {
      return null;
    }

    const endpoint = String(payload.endpoint ?? payload.path ?? 'unknown');
    const status = Number(payload.status ?? 500);
    const erro = String(payload.erro ?? payload.message ?? 'Erro não identificado');
    const traceId = payload.trace_id ? String(payload.trace_id) : null;
    const userId = payload.user_id ? String(payload.user_id) : null;
    const failureType = classifyFailureType(erro, endpoint, status);

    return {
      timestamp: payload.timestamp ? String(payload.timestamp) : undefined,
      trace_id: traceId,
      user_id: userId,
      endpoint,
      status,
      erro,
      failure_type: failureType
    };
  } catch {
    return null;
  }
}

async function loadIncidentRecords(logDirectory: string): Promise<IncidentRecord[]> {
  const records: IncidentRecord[] = [];

  for (const fileName of LOG_FILES) {
    const filePath = path.join(logDirectory, fileName);

    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n');

      for (const line of lines) {
        const parsed = parseLogLine(line);
        if (parsed) {
          records.push(parsed);
        }
      }
    } catch {
      // Ignore missing files.
    }
  }

  return records;
}

export async function buildIncidentPanel(limit = 20, logDirectory = process.cwd()): Promise<ClusteredIncident[]> {
  const records = await loadIncidentRecords(logDirectory);
  const clusters = new Map<string, ClusteredIncident>();

  for (const record of records) {
    const normalizedError = normalizeErrorMessage(record.erro);
    const clusterId = buildClusterId(record.failure_type, record.endpoint, normalizedError);

    const existing = clusters.get(clusterId);
    if (!existing) {
      clusters.set(clusterId, {
        cluster_id: clusterId,
        signature: normalizedError,
        endpoint: record.endpoint,
        failure_type: record.failure_type,
        erro_representativo: record.erro,
        frequencia: 1,
        status_medio: record.status,
        impacto: 0,
        sugestoes: PLAYBOOKS[record.failure_type],
        trace_ids: record.trace_id ? [record.trace_id] : [],
        usuarios_afetados: record.user_id ? 1 : 0
      });
      continue;
    }

    existing.frequencia += 1;
    existing.status_medio = Number(((existing.status_medio + record.status) / 2).toFixed(0));
    if (record.trace_id && !existing.trace_ids.includes(record.trace_id)) {
      existing.trace_ids.push(record.trace_id);
    }
    if (record.user_id) {
      existing.usuarios_afetados += 1;
    }
  }

  const ranked = Array.from(clusters.values())
    .map((cluster) => ({
      ...cluster,
      impacto: calculateImpact(cluster.frequencia, cluster.status_medio, cluster.usuarios_afetados)
    }))
    .sort((a, b) => b.impacto - a.impacto || b.frequencia - a.frequencia)
    .slice(0, limit);

  return ranked;
}
