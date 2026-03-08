export type DemoStatus = 'idle' | 'preparing' | 'streaming' | 'persisting' | 'done' | 'error';

export type TranscriptFilterMode = 'assistant' | 'all';

export type TranscriptDensity = 'comfortable' | 'compact' | 'minimal';

export type ReadingMode = 'following_latest' | 'browsing_history';

export type TranscriptItem = {
  message_id: number;
  role: 'assistant' | 'user' | 'system';
  roleLabel: string;
  isOpening: boolean;
  raw: string;
  renderSource: string;
  content: string;
  preview: string;
  regexText: string;
  streamHtml: string;
  finalHtml: string;
  options: string[];
  hidden: boolean;
  phase: 'stream' | 'done' | 'plain';
  isLatest: boolean;
  isStreaming: boolean;
  canOpenDetail: boolean;
  canDeleteFrom: boolean;
};

export type ReaderSummary = {
  turnCount: number;
  latestUserPreview: string;
  latestAssistantPreview: string;
  readingModeLabel: string;
  statusLabel: string;
  assistantAnchorLabel: string;
  storySummary: string;
};

export type ReaderLogItem = {
  id: string;
  type: 'info' | 'action' | 'error';
  title: string;
  detail: string;
  createdAt: string;
};

export type ReaderChatState = {
  version: number;
  initialized: boolean;
  opening_message_id: number | null;
  latest_user_message_id: number | null;
  latest_assistant_message_id: number | null;
  reading_mode: ReadingMode;
  density: TranscriptDensity;
  opening_expanded: boolean;
  updated_at: number;
};
