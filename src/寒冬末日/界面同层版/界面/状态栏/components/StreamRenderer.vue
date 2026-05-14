<template>
  <div class="stream-renderer" :class="{ 'is-active': active }" :data-message-id="messageId">
    <!-- eslint-disable-next-line vue/no-v-html -->
    <span class="stream-renderer__body" v-html="displayHtml"></span
    ><span v-if="active" class="stream-renderer__cursor" aria-hidden="true"></span>
  </div>
</template>

<script setup lang="ts">
import { buildStreamRendererHtml } from '../streamRendererDisplay';
import type { TranscriptItem } from '../types';

/**
 * StreamRenderer.vue
 *
 * 流式阶段的独立预览组件（模式 B：仅流式预览，done 切回 finalHtml 完整管线）。
 * 接入边界详见 `.tmp/界面同层版-流式性能优化施工说明.md` §3.5.7。
 *
 * - 输入是同层框架的全量快照 `message`（非 SSE delta），用 computed 直接消费。
 * - 渲染逻辑收敛在 `streamRendererDisplay.ts` 的纯函数里，便于源码契约测试。
 * - 不识别业务标签、不注入图片 artifact、不跑 hydrate/rebind。
 */
const props = defineProps<{
  /** 流式原文快照（即 item.content）。 */
  message: string;
  /** 消息角色，决定 applyRegexForDisplay 的正则来源。 */
  role: TranscriptItem['role'];
  /** 是否处于流式中：为真时显示打字机光标。 */
  active: boolean;
  /** 楼层号，仅用于 data 属性与调试定位。 */
  messageId: number;
}>();

const displayHtml = computed(() => buildStreamRendererHtml(props.message, props.role));
</script>

<style scoped>
.stream-renderer {
  display: block;
  min-width: 0;
}

.stream-renderer__body {
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.stream-renderer__pending {
  opacity: 0.6;
}

.stream-renderer__cursor {
  display: inline-block;
  width: 2px;
  height: 1.05em;
  margin-left: 1px;
  background: currentColor;
  opacity: 0.55;
  vertical-align: text-bottom;
  animation: stream-renderer-blink 0.7s step-end infinite;
}

@keyframes stream-renderer-blink {
  50% {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .stream-renderer__cursor {
    animation: none;
  }
}
</style>
