import { listReachableHostWindows } from './hostBridge';
import type { SameLayerRuntimeLease } from './runtimeLeasePersistence';

const SAME_LAYER_RUNTIME_HEARTBEAT_STORE_KEY = '__edenSameLayerRuntimeHeartbeatStore';

type RuntimeHeartbeatStore = Record<string, SameLayerRuntimeLease>;

function cloneRuntimeLease(lease: SameLayerRuntimeLease): SameLayerRuntimeLease {
  return {
    version: lease.version,
    sessionId: lease.sessionId,
    containerMessageId: lease.containerMessageId,
    heartbeatAt: lease.heartbeatAt,
    status: lease.status,
  };
}

function toHeartbeatStoreKey(containerMessageId: number): string {
  return `container:${Math.trunc(Number(containerMessageId)) || 0}`;
}

function readHeartbeatStore(hostWindow: Window & typeof globalThis): RuntimeHeartbeatStore | null {
  const raw = (hostWindow as any)[SAME_LAYER_RUNTIME_HEARTBEAT_STORE_KEY];
  return raw && typeof raw === 'object' ? (raw as RuntimeHeartbeatStore) : null;
}

function ensureHeartbeatStore(hostWindow: Window & typeof globalThis): RuntimeHeartbeatStore {
  const existing = readHeartbeatStore(hostWindow);
  if (existing) return existing;
  const created: RuntimeHeartbeatStore = {};
  (hostWindow as any)[SAME_LAYER_RUNTIME_HEARTBEAT_STORE_KEY] = created;
  return created;
}

export function writeSameLayerRuntimeHeartbeat(lease: SameLayerRuntimeLease): void {
  const key = toHeartbeatStoreKey(lease.containerMessageId);
  for (const hostWindow of listReachableHostWindows()) {
    try {
      ensureHeartbeatStore(hostWindow)[key] = cloneRuntimeLease(lease);
    } catch {
      // non-fatal
    }
  }
}

export function readSameLayerRuntimeHeartbeat(containerMessageId: number): SameLayerRuntimeLease | null {
  const key = toHeartbeatStoreKey(containerMessageId);
  for (const hostWindow of listReachableHostWindows()) {
    try {
      const heartbeat = readHeartbeatStore(hostWindow)?.[key];
      if (heartbeat) return cloneRuntimeLease(heartbeat);
    } catch {
      // non-fatal
    }
  }
  return null;
}

export function clearSameLayerRuntimeHeartbeat(containerMessageId?: number | null): void {
  const key =
    containerMessageId == null || !Number.isFinite(Number(containerMessageId))
      ? null
      : toHeartbeatStoreKey(containerMessageId);
  for (const hostWindow of listReachableHostWindows()) {
    try {
      const store = readHeartbeatStore(hostWindow);
      if (!store) continue;
      if (key) {
        delete store[key];
      } else {
        delete (hostWindow as any)[SAME_LAYER_RUNTIME_HEARTBEAT_STORE_KEY];
      }
    } catch {
      // non-fatal
    }
  }
}
