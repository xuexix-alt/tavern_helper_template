export const SAMELAYER_EVENTS = {
  // 新协议（推荐）：show/sync/send
  SHOW: 'eden:samelayer:show-ui',
  REQUIRE_DATA: 'eden:samelayer:require-data',
  SYNC_DATA: 'eden:samelayer:sync-data',

  // 旧协议（兼容）：stream/final/reset/sync-request/sync-response
  STREAM: 'eden:samelayer:stream',
  FINAL: 'eden:samelayer:final',
  RESET: 'eden:samelayer:reset',
  SYNC_REQUEST: 'eden:samelayer:sync-request',
  SYNC_RESPONSE: 'eden:samelayer:sync-response',
  SEND_REQUEST: 'eden:samelayer:send-request',
  SEND_RESULT: 'eden:samelayer:send-result',
} as const;

export type SameLayerPayload = {
  anchor_message_id: number | null;
  message_id: number | null;
  raw: string;
  during_streaming: boolean;
  chat_id: string | null;
  phase?: 'stream' | 'final' | 'reset' | 'sync';
  source?: string;
};

export type SameLayerSendRequestPayload = {
  text: string;
  await_trigger: boolean;
  source?: string;
};

export type SameLayerSendResultPayload = {
  ok: boolean;
  reason: string;
  text: string;
  source?: string;
};
