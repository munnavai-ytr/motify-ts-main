import {
  formatQuotaResetLocalDateTime,
  formatQuotaResetLocalTime,
  getQuotaDayBounds,
} from '@/lib/ai/quota-time';
import { getDb, type UsageLedgerRecord } from '@/lib/db';

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export function normalizeUsageModelName(modelName: string): string {
  return modelName.trim().replace(/^models\//i, '').toLowerCase();
}

export interface UsageLedgerInput {
  timestamp?: number;
  model: string;
  promptTokens: number;
  outputTokens: number;
  thoughtTokens: number;
  ok: boolean;
}

export interface ModelQuotaDayUsage {
  model: string;
  requests: number;
  successfulRequests: number;
  failedRequests: number;
  promptTokens: number;
  outputTokens: number;
  thoughtTokens: number;
  totalTokens: number;
}

export interface QuotaDayUsageSummary {
  startMs: number;
  resetMs: number;
  laDateKey: string;
  resetLocalTime: string;
  resetLocalDateTime: string;
  models: ModelQuotaDayUsage[];
}

export async function pruneOldUsageRecords(
  nowMs: number = Date.now()
): Promise<number> {
  if (typeof window === 'undefined') return 0;
  try {
    const db = await getDb();
    const cutoff = nowMs - RETENTION_MS;
    const tx = db.transaction('usage_ledger', 'readwrite');
    const index = tx.objectStore('usage_ledger').index('by-timestamp');
    const oldKeys = await index.getAllKeys(IDBKeyRange.upperBound(cutoff, true));
    for (const key of oldKeys) {
      await tx.objectStore('usage_ledger').delete(key);
    }
    await tx.done;
    return oldKeys.length;
  } catch {
    return 0;
  }
}

export async function recordUsageLedgerEntry(
  input: UsageLedgerInput
): Promise<void> {
  if (typeof window === 'undefined') return;
  const timestamp = input.timestamp ?? Date.now();
  const normalizedModel = normalizeUsageModelName(input.model);
  if (!normalizedModel) return;

  const record: UsageLedgerRecord = {
    timestamp,
    model: normalizedModel,
    promptTokens: Math.max(0, Math.round(input.promptTokens)),
    outputTokens: Math.max(0, Math.round(input.outputTokens)),
    thoughtTokens: Math.max(0, Math.round(input.thoughtTokens)),
    ok: input.ok,
  };

  try {
    const db = await getDb();
    const cutoff = timestamp - RETENTION_MS;
    const tx = db.transaction('usage_ledger', 'readwrite');
    const store = tx.objectStore('usage_ledger');
    await store.add(record);
    const oldKeys = await store
      .index('by-timestamp')
      .getAllKeys(IDBKeyRange.upperBound(cutoff, true));
    for (const key of oldKeys) {
      await store.delete(key);
    }
    await tx.done;
  } catch {
    // Never fail an AI request because local telemetry storage failed.
  }
}

export async function getQuotaDayUsageSummary(
  nowMs: number = Date.now()
): Promise<QuotaDayUsageSummary> {
  const { startMs, resetMs, laDateKey } = getQuotaDayBounds(nowMs);
  const resetLocalTime = formatQuotaResetLocalTime(resetMs);
  const resetLocalDateTime = formatQuotaResetLocalDateTime(resetMs);

  if (typeof window === 'undefined') {
    return {
      startMs,
      resetMs,
      laDateKey,
      resetLocalTime,
      resetLocalDateTime,
      models: [],
    };
  }

  try {
    const db = await getDb();
    const tx = db.transaction('usage_ledger', 'readonly');
    const rows = await tx
      .objectStore('usage_ledger')
      .index('by-timestamp')
      .getAll(IDBKeyRange.bound(startMs, resetMs, false, true));
    await tx.done;

    const byModel = new Map<string, ModelQuotaDayUsage>();
    for (const row of rows) {
      const modelKey = normalizeUsageModelName(row.model);
      if (!modelKey) continue;
      const existing = byModel.get(modelKey) ?? {
        model: modelKey,
        requests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        promptTokens: 0,
        outputTokens: 0,
        thoughtTokens: 0,
        totalTokens: 0,
      };

      existing.requests += 1;
      if (row.ok) {
        existing.successfulRequests += 1;
      } else {
        existing.failedRequests += 1;
      }
      existing.promptTokens += row.promptTokens;
      existing.outputTokens += row.outputTokens;
      existing.thoughtTokens += row.thoughtTokens;
      existing.totalTokens +=
        row.promptTokens + row.outputTokens + row.thoughtTokens;
      byModel.set(modelKey, existing);
    }

    const models = Array.from(byModel.values()).sort(
      (a, b) => b.requests - a.requests || a.model.localeCompare(b.model)
    );

    return {
      startMs,
      resetMs,
      laDateKey,
      resetLocalTime,
      resetLocalDateTime,
      models,
    };
  } catch {
    return {
      startMs,
      resetMs,
      laDateKey,
      resetLocalTime,
      resetLocalDateTime,
      models: [],
    };
  }
}
