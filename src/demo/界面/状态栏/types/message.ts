export type Role = 'user' | 'assistant' | 'system';

export interface MessageMeta {
  tokens?: number;
  timeMs?: number;
  model?: string;
  raw?: string;
}

export interface UI_Message {
  id: string;
  role: Role;
  content: string;
  isStreaming?: boolean;
  timestamp: number;
  meta?: MessageMeta;
  mesId?: number;
}

export type Density = 'comfortable' | 'compact' | 'minimal';

export type Theme = 'tech' | 'dark' | 'gold' | 'ios' | 'ipod' | 'amber';

export interface TypographyState {
  fontFamily: 'sans' | 'serif' | 'mono' | 'outfit' | 'quicksand';
  fontSize: 'sm' | 'base' | 'lg' | 'xl';
  lineHeight: 'tight' | 'normal' | 'relaxed' | 'loose';
}
