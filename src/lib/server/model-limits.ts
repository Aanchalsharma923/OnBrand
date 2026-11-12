/**
 * OnBrand Round 3 — Hosted Model Usage Quotas & Rate Limits
 * Enforces per-session and daily request caps to protect against quota exhaustion.
 */

interface UsageRecord {
  sessionCount: number;
  dailyCount: number;
  lastResetDay: string;
}

const usageStore = new Map<string, UsageRecord>();

const MAX_PER_SESSION = 50;
const MAX_PER_DAY = 200;

function currentDayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function checkAndIncrementModelQuota(identifier: string): {
  allowed: boolean;
  remainingDaily: number;
  reason?: string;
} {
  const today = currentDayString();
  let record = usageStore.get(identifier);

  if (!record || record.lastResetDay !== today) {
    record = {
      sessionCount: 0,
      dailyCount: 0,
      lastResetDay: today,
    };
    usageStore.set(identifier, record);
  }

  if (record.sessionCount >= MAX_PER_SESSION) {
    return {
      allowed: false,
      remainingDaily: Math.max(0, MAX_PER_DAY - record.dailyCount),
      reason: `Session model verification limit reached (${MAX_PER_SESSION} reviews). Switching to deterministic mode.`,
    };
  }

  if (record.dailyCount >= MAX_PER_DAY) {
    return {
      allowed: false,
      remainingDaily: 0,
      reason: `Daily model verification limit reached (${MAX_PER_DAY} reviews). Switching to deterministic mode.`,
    };
  }

  record.sessionCount += 1;
  record.dailyCount += 1;

  return {
    allowed: true,
    remainingDaily: MAX_PER_DAY - record.dailyCount,
  };
}

export function resetModelQuota(identifier: string): void {
  usageStore.delete(identifier);
}
