export type Density = 'comfortable' | 'compact' | 'minimal';
export type Role = 'user' | 'assistant' | 'system';

export interface MessageMeta {
  tokens?: number;
  timeMs?: number;
  model?: string;
  raw?: string;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  isStreaming?: boolean;
  timestamp: number;
  meta?: MessageMeta;
}
