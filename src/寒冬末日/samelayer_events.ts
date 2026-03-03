export const SAMELAYER_EVENTS = {
  // Unified bridge path.
  SHOW: 'eden:samelayer:show-ui',
  COMMAND_REQUEST: 'eden:samelayer:command-request',
  COMMAND_RESPONSE: 'eden:samelayer:command-response',

  // st-chatu8 plugin channels.
  CHATU8_PROXY_PING: 'eden:samelayer:chatu8:proxy-ping',
  CHATU8_PROXY_PONG: 'eden:samelayer:chatu8:proxy-pong',
  CHATU8_GENERATE_REQUEST: 'eden:samelayer:chatu8:generate-request',
  CHATU8_GENERATE_RESPONSE: 'eden:samelayer:chatu8:generate-response',
  CHATU8_LLM_PROMPT_REQUEST: 'eden:samelayer:chatu8:llm-prompt-request',
  CHATU8_LLM_PROMPT_RESPONSE: 'eden:samelayer:chatu8:llm-prompt-response',
  CHATU8_CACHE_QUERY: 'eden:samelayer:chatu8:cache-query',
  CHATU8_CACHE_RESPONSE: 'eden:samelayer:chatu8:cache-response',
} as const;

export type SameLayerPayload = {
  anchor_message_id: number | null;
  message_id: number | null;
  raw: string;
  during_streaming: boolean;
  chat_id: string | null;
  tx_id?: string;
  tx_seq?: number;
  phase?: 'stream' | 'final' | 'reset' | 'sync';
  source?: string;
};

export type SameLayerCommandName =
  | 'ping'
  | 'get_snapshot'
  | 'send_message'
  | 'get_context'
  | 'generate_image'
  | 'get_llm_prompt'
  | 'query_image_cache';

export type SameLayerCommandRequestPayload = {
  id: string;
  command: SameLayerCommandName;
  payload?: Record<string, unknown>;
  source?: string;
};

export type SameLayerCommandResponsePayload = {
  id: string;
  command: SameLayerCommandName;
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
  source?: string;
};
