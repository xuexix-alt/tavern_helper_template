export type DemoStatus = 'idle' | 'preparing' | 'streaming' | 'persisting' | 'done' | 'error';

export type TranscriptFilterMode = 'assistant' | 'all';

export type TranscriptDensity = 'comfortable' | 'minimal';

export type ReaderFontMode = 'hud' | 'reading';

export type DemoTheme = 'tech' | 'dark' | 'gold' | 'ios' | 'ipod' | 'amber' | 'apple';

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
  canReroll: boolean;
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

export type PreGalleryLogItem = Pick<ReaderLogItem, 'type' | 'title' | 'detail'>;

export type ReaderChatState = {
  version: number;
  reading_mode: ReadingMode;
  density: TranscriptDensity;
  theme: DemoTheme;
  font_mode: ReaderFontMode;
  opening_expanded: boolean;
  collapsed_assistant_message_ids: number[];
};
