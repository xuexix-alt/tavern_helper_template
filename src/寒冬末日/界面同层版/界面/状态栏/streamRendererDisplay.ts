import { applyRegexForDisplay, escapeHtml } from './useTranscriptRebuild.ts';
import { stripVisibleChatu8PromptTokensHtml } from './chatu8PromptTokenDisplay.ts';
import type { TranscriptItem } from './types';

/**
 * StreamRenderer 流式预览渲染纯函数
 *
 * 提取自接入需求：流式阶段只做「忠实反映 AI 输出」的轻量渲染。
 * - 不识别任何业务标签（<scene>/<option>/<UpdateVariable> 等），结构化呈现交给酒馆 display 正则。
 * - 不做 chunk 切断防护 / blocks 增量解析：同层框架给的是全量快照而非 SSE delta。
 * - 不注入图片 artifact：image### token 由 done 阶段插件两段式生图补回（见开发文档 §9.5.1）。
 *
 * 详见 `.tmp/界面同层版-流式性能优化施工说明.md` §3.5.7。
 */

/** 流式正文为空时的占位 HTML。 */
export const STREAM_RENDERER_PENDING_HTML = '<span class="stream-renderer__pending">等待 token…</span>';

/**
 * 把流式原文转换为可直接 v-html 的预览 HTML。
 *
 * @param message 流式原文（即 `item.content`，已是 extractStreamDemoContent 的结果）
 * @param role    消息角色，决定 applyRegexForDisplay 的正则来源
 */
export function buildStreamRendererHtml(message: string, role: TranscriptItem['role']): string {
  const source = String(message ?? '').trim();
  if (!source) return STREAM_RENDERER_PENDING_HTML;

  // 酒馆 display 正则：若用户配置了 HTML 结构干预（美化 / 折叠），优先采用其产出。
  const regexed = applyRegexForDisplay(source, role);
  // 正则未介入（返回空）时，escapeHtml 兜底，忠实反映原文且不破坏 DOM。
  const html = typeof regexed === 'string' && regexed.trim() ? regexed : escapeHtml(source);

  // 防御性剥离 image### token，与 TranscriptMessageCard 原 streamingAssistantHtml 行为保持一致。
  return stripVisibleChatu8PromptTokensHtml(html);
}
