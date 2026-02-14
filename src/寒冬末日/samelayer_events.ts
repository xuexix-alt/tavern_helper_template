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
  // st-chatu8 生图桥接协议
  CHATU8_PROXY_PING: 'eden:samelayer:chatu8:proxy-ping',
  CHATU8_PROXY_PONG: 'eden:samelayer:chatu8:proxy-pong',
  CHATU8_GENERATE_REQUEST: 'eden:samelayer:chatu8:generate-request',
  CHATU8_GENERATE_RESPONSE: 'eden:samelayer:chatu8:generate-response',
  CHATU8_LLM_PROMPT_REQUEST: 'eden:samelayer:chatu8:llm-prompt-request',
  CHATU8_LLM_PROMPT_RESPONSE: 'eden:samelayer:chatu8:llm-prompt-response',
  // st-chatu8 插件缓存查询协议
  CHATU8_CACHE_QUERY: 'eden:samelayer:chatu8:cache-query',
  CHATU8_CACHE_RESPONSE: 'eden:samelayer:chatu8:cache-response',
} as const;

export type SameLayerPayload = {
  anchor_message_id: number | null;
  message_id: number | null;
  raw: string;
  during_streaming: boolean;
  chat_id: string | null;
  /** 桥接事务ID（同一轮流式/最终态共享ID） */
  tx_id?: string;
  /** 桥接事件单调递增序号（用于前台丢弃过期包） */
  tx_seq?: number;
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
