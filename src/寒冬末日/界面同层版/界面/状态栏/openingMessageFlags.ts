import _ from 'lodash';

function readMessageId(message: any): number | null {
  const id = Math.trunc(Number(message?.message_id));
  return Number.isFinite(id) ? id : null;
}

function normalizePreferredId(preferredId: unknown): number | null {
  const id = Math.trunc(Number(preferredId));
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function hasOpeningAssistantFlag(message: any): boolean {
  return _.get(message, 'data.stream_demo.opening_assistant') === true;
}

export function hasOpeningSeedFlag(message: any): boolean {
  const role = String(message?.role ?? '').toLowerCase();
  if (role !== 'user') return false;
  return _.get(message, 'data.stream_demo.opening_seed') === true;
}

export function isTrackedOpeningSeedMessage(message: any, preferredId?: unknown): boolean {
  const normalizedPreferredId = normalizePreferredId(preferredId);
  if (normalizedPreferredId != null) {
    return String(message?.role ?? '').toLowerCase() === 'user' && readMessageId(message) === normalizedPreferredId;
  }
  return hasOpeningSeedFlag(message);
}

export function isTrackedOpeningAssistantMessage(message: any, preferredId?: unknown): boolean {
  const normalizedPreferredId = normalizePreferredId(preferredId);
  if (normalizedPreferredId != null) {
    return readMessageId(message) === normalizedPreferredId;
  }
  return hasOpeningAssistantFlag(message);
}

export function isCurrentOpeningSeedMessageByPayload(
  message: any,
  payload?: { opening_seed_user_message_id?: unknown } | null,
): boolean {
  return isTrackedOpeningSeedMessage(message, payload?.opening_seed_user_message_id);
}

export function isCurrentOpeningAssistantMessageByPayload(
  message: any,
  payload?: { opening_result_message_id?: unknown } | null,
): boolean {
  return isTrackedOpeningAssistantMessage(message, payload?.opening_result_message_id);
}

export function sanitizeInheritedMessageData(input: unknown): Record<string, unknown> {
  const next =
    input && typeof input === 'object' && !Array.isArray(input) ? (_.cloneDeep(input) as Record<string, unknown>) : {};

  const streamDemo =
    next.stream_demo && typeof next.stream_demo === 'object' && !Array.isArray(next.stream_demo)
      ? (next.stream_demo as Record<string, unknown>)
      : null;

  if (!streamDemo) return next;

  delete streamDemo.opening_seed;
  delete streamDemo.opening_assistant;

  if (Object.keys(streamDemo).length === 0) {
    delete next.stream_demo;
  }

  return next;
}
