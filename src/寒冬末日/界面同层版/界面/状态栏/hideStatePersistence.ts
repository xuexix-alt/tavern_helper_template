import _ from 'lodash';

export const HIDE_STATE_PATH = 'stream_demo.hide_state';
export const HIDE_STATE_VERSION = 1;

export type HideStateRecord = {
  version: number;
  containerMessageId: number;
  hiddenMessageIds: number[];
  updatedAt: string;
};

export function normalizeHideStateRecord(raw: unknown): HideStateRecord | null {
  if (!raw || typeof raw !== 'object') return null;

  const record = raw as Partial<HideStateRecord>;
  const version = Number(record.version);
  const containerMessageId = Number(record.containerMessageId);
  const hiddenMessageIds = Array.isArray(record.hiddenMessageIds)
    ? record.hiddenMessageIds.map(id => Math.trunc(Number(id))).filter(id => Number.isFinite(id) && id > 0)
    : [];

  if (!Number.isFinite(version) || !Number.isFinite(containerMessageId)) return null;

  return {
    version,
    containerMessageId: Math.trunc(containerMessageId),
    hiddenMessageIds,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString(),
  };
}

export function readHideState(): HideStateRecord | null {
  try {
    const vars = getVariables?.({ type: 'chat' }) ?? {};
    const raw = _.get(vars, HIDE_STATE_PATH, null);
    return normalizeHideStateRecord(raw);
  } catch {
    return null;
  }
}

export function writeHideState(record: HideStateRecord): void {
  try {
    updateVariablesWith(
      (vars: Record<string, unknown>) => {
        _.set(vars, HIDE_STATE_PATH, {
          version: HIDE_STATE_VERSION,
          containerMessageId: record.containerMessageId,
          hiddenMessageIds: record.hiddenMessageIds,
          updatedAt: new Date().toISOString(),
        });
        return vars;
      },
      { type: 'chat' },
    );
  } catch {
    // non-fatal
  }
}

export function clearHideState(): void {
  try {
    updateVariablesWith(
      (vars: Record<string, unknown>) => {
        _.unset(vars, HIDE_STATE_PATH);
        return vars;
      },
      { type: 'chat' },
    );
  } catch {
    // non-fatal
  }
}

export function buildHideStateRecord(containerMessageId: number, hiddenMessageIds: number[]): HideStateRecord {
  return {
    version: HIDE_STATE_VERSION,
    containerMessageId: Math.trunc(Number(containerMessageId)) || 0,
    hiddenMessageIds: [...hiddenMessageIds].filter(id => Number.isFinite(id) && id > 0),
    updatedAt: new Date().toISOString(),
  };
}
