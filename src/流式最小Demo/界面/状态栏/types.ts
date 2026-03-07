export type DemoStatus = 'idle' | 'preparing' | 'streaming' | 'persisting' | 'done' | 'error';

export type TranscriptFilterMode = 'assistant' | 'all';

export type TranscriptDensity = 'comfortable' | 'compact' | 'minimal';

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
