import { applyRegexForDisplay, escapeHtml } from './useTranscriptRebuild.ts';
import type { TranscriptItem } from './types';

/**
 * StreamRenderer 流式预览渲染纯函数
 *
 * 提取自接入需求：流式阶段只做「忠实反映 AI 输出」的轻量渲染。
 * - 流式阶段使用 role-aware Tavern display 正则，不依赖尚未落盘的预测 message_id。
 * - 不做 chunk 切断防护 / blocks 增量解析：同层框架给的是全量快照而非 SSE delta。
 * - 不处理图片 token / artifact：生图协议交给插件事件客户端与宿主插件。
 *
 * 详见 `.tmp/界面同层版-流式性能优化施工说明.md` §3.5.7。
 */

/** 流式正文为空时的占位 HTML。 */
export const STREAM_RENDERER_PENDING_HTML = '<span class="stream-renderer__pending">等待 token…</span>';

/**
 * 把流式原文转换为可直接 v-html 的预览 HTML。
 *
 * @param message 流式原文（即 `item.content`，已是 extractStreamDemoContent 的结果）
 * @param role    消息角色；用户消息仍保持字面输出。
 * @param messageId 楼层号，传给宿主 display formatter。
 */
export function buildStreamRendererHtml(message: string, role: TranscriptItem['role'], messageId: number): string {
  const source = String(message ?? '').trim();
  if (!source) return STREAM_RENDERER_PENDING_HTML;

  void messageId;
  const regexed = applyRegexForDisplay(source, role);
  return typeof regexed === 'string' && regexed.trim() ? regexed : escapeHtml(source);
}
