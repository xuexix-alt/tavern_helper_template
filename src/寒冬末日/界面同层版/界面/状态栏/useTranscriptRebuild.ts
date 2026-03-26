import type { TranscriptItem } from './types';

/**
 * 纯文本/HTML 渲染工具函数
 *
 * 提取自 useStreamingDemo.ts，仅包含无响应式依赖的纯函数。
 * 这些函数负责把原始消息文本转换为可显示的 HTML。
 */

export function escapeHtml(input: string): string {
  return String(input ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function encodeDataAttr(input: string): string {
  return encodeURIComponent(String(input ?? ''));
}

export function applyRegexForDisplay(text: string, role: TranscriptItem['role']): string {
  if (!text) return '';
  try {
    if (typeof formatAsTavernRegexedString === 'function') {
      const source = role === 'user' ? 'user_input' : role === 'system' ? 'world_info' : 'ai_output';
      const out = formatAsTavernRegexedString(text, source, 'display', { depth: 0 });
      return typeof out === 'string' ? out : text;
    }
  } catch {
    // ignore
  }
  return text;
}

export function normalizeRoleLabel(role: TranscriptItem['role']): string {
  if (role === 'user') return '用户';
  if (role === 'system') return '系统';
  return '助手';
}

export function sortTranscriptItems<T extends { message_id: number }>(items: T[]): T[] {
  return items.slice().sort((a, b) => a.message_id - b.message_id);
}
