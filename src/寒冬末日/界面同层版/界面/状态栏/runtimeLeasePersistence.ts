import _ from 'lodash';
import {
  SAME_LAYER_LEASE_SUSPEND_GRACE_MS,
  SAME_LAYER_LEASE_STALE_MS,
  SAME_LAYER_RUNTIME_LEASE_PATH,
  SAME_LAYER_RUNTIME_LEASE_VERSION,
} from './runtimeLeasePolicy';

export type SameLayerRuntimeLeaseStatus = 'booting' | 'active' | 'suspended' | 'closing';

export type SameLayerRuntimeLease = {
  version: number;
  sessionId: string;
  containerMessageId: number;
  heartbeatAt: string;
  status: SameLayerRuntimeLeaseStatus;
};

function normalizeLeaseStatus(input: unknown): SameLayerRuntimeLeaseStatus {
  const value = String(input ?? '').trim();
  if (value === 'active' || value === 'suspended' || value === 'closing') return value;
  return 'booting';
}

function normalizeIsoTimestamp(input: unknown): string {
  if (typeof input === 'string' && input.trim()) {
    const parsed = Date.parse(input);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  if (input instanceof Date && Number.isFinite(input.getTime())) {
    return input.toISOString();
  }
  const numeric = Number(input);
  if (Number.isFinite(numeric) && numeric > 0) {
    return new Date(numeric).toISOString();
  }
  return new Date().toISOString();
}

export function createSameLayerRuntimeLease(input: {
  sessionId: string;
  containerMessageId: number;
  heartbeatAt?: string | number | Date;
  status?: SameLayerRuntimeLeaseStatus;
}): SameLayerRuntimeLease {
  return {
    version: SAME_LAYER_RUNTIME_LEASE_VERSION,
    sessionId: String(input.sessionId ?? '').trim(),
    containerMessageId: Math.trunc(Number(input.containerMessageId)) || 0,
    heartbeatAt: normalizeIsoTimestamp(input.heartbeatAt),
    status: normalizeLeaseStatus(input.status),
  };
}

export function normalizeSameLayerRuntimeLease(raw: unknown): SameLayerRuntimeLease | null {
  if (!raw || typeof raw !== 'object') return null;

  const lease = raw as Partial<SameLayerRuntimeLease>;
  const version = Number(lease.version);
  const sessionId = String(lease.sessionId ?? '').trim();
  const containerMessageId = Number(lease.containerMessageId);

  if (!Number.isFinite(version) || !sessionId || !Number.isFinite(containerMessageId)) {
    return null;
  }

  return {
    version: Math.trunc(version),
    sessionId,
    containerMessageId: Math.trunc(containerMessageId),
    heartbeatAt: normalizeIsoTimestamp(lease.heartbeatAt),
    status: normalizeLeaseStatus(lease.status),
  };
}

export function readSameLayerRuntimeLease(): SameLayerRuntimeLease | null {
  try {
    const vars = getVariables?.({ type: 'chat' }) ?? {};
    const raw = _.get(vars, SAME_LAYER_RUNTIME_LEASE_PATH, null);
    return normalizeSameLayerRuntimeLease(raw);
  } catch {
    return null;
  }
}

export function writeSameLayerRuntimeLease(lease: SameLayerRuntimeLease): void {
  try {
    updateVariablesWith(
      (vars: Record<string, unknown>) => {
        _.set(vars, SAME_LAYER_RUNTIME_LEASE_PATH, {
          version: SAME_LAYER_RUNTIME_LEASE_VERSION,
          sessionId: lease.sessionId,
          containerMessageId: lease.containerMessageId,
          heartbeatAt: normalizeIsoTimestamp(lease.heartbeatAt),
          status: normalizeLeaseStatus(lease.status),
        });
        return vars;
      },
      { type: 'chat' },
    );
  } catch {
    // non-fatal
  }
}

export function clearSameLayerRuntimeLease(): void {
  try {
    updateVariablesWith(
      (vars: Record<string, unknown>) => {
        _.unset(vars, SAME_LAYER_RUNTIME_LEASE_PATH);
        return vars;
      },
      { type: 'chat' },
    );
  } catch {
    // non-fatal
  }
}

export function isSameLayerRuntimeLeaseFresh(
  lease: SameLayerRuntimeLease | null | undefined,
  now = Date.now(),
  staleMs = SAME_LAYER_LEASE_STALE_MS,
): boolean {
  if (!lease) return false;
  const heartbeatMs = Date.parse(String(lease.heartbeatAt ?? ''));
  if (!Number.isFinite(heartbeatMs)) return false;
  return now - heartbeatMs <= staleMs;
}

export function isSameLayerRuntimeLeaseStale(
  lease: SameLayerRuntimeLease | null | undefined,
  now = Date.now(),
  staleMs = SAME_LAYER_LEASE_STALE_MS,
): boolean {
  return !isSameLayerRuntimeLeaseFresh(lease, now, staleMs);
}

function isSameRuntimeLeaseScope(lhs: SameLayerRuntimeLease, rhs: SameLayerRuntimeLease | null | undefined): boolean {
  return Boolean(
    rhs && rhs.sessionId === lhs.sessionId && Number(rhs.containerMessageId) === Number(lhs.containerMessageId),
  );
}

export function isSameLayerRuntimeLeaseRecoverable(
  lease: SameLayerRuntimeLease | null | undefined,
  heartbeat?: SameLayerRuntimeLease | null,
  now = Date.now(),
): boolean {
  if (!lease || lease.status === 'closing') return false;
  if (lease.status === 'suspended') {
    return isSameLayerRuntimeLeaseFresh(lease, now, SAME_LAYER_LEASE_SUSPEND_GRACE_MS);
  }

  const freshnessSource = isSameRuntimeLeaseScope(lease, heartbeat) ? heartbeat : lease;
  return isSameLayerRuntimeLeaseFresh(freshnessSource, now, SAME_LAYER_LEASE_STALE_MS);
}
