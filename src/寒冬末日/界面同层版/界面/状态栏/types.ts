export type DemoStatus = 'idle' | 'preparing' | 'streaming' | 'persisting' | 'done' | 'error';

export type TranscriptFilterMode = 'assistant' | 'all';

export type TranscriptDensity = 'comfortable' | 'minimal';

export type ReaderFontMode = 'hud' | 'reading';

export type DemoTheme = 'tech' | 'dark' | 'gold' | 'ios' | 'ipod' | 'amber';

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
  generatedImages: GeneratedImageRef[];
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

export type GeneratedImageRef = {
  id: string;
  messageId: number;
  markerId?: string;
  imageId?: string;
  promptToken: string;
  requestId?: string;
  anchorText?: string;
  title: string;
  characterName?: string;
  createdOrder: number;
  canRegenerate?: boolean;
  /** 直接从 DOM img 读取的图片地址，优先于 resolver 链路 */
  src?: string;
  alt?: string;
};

export type ReaderGalleryEntry = GeneratedImageRef;

export type ReaderChatState = {
  version: number;
  reading_mode: ReadingMode;
  density: TranscriptDensity;
  theme: DemoTheme;
  font_mode: ReaderFontMode;
  body_line_height: number | null;
  opening_expanded: boolean;
  collapsed_assistant_message_ids: number[];
};
