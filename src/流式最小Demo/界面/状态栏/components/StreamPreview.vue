<template>
  <section class="demo-card">
    <div class="demo-head">
      <div class="demo-card-title">2. 界面内流式预览</div>
      <span class="demo-status" :class="`is-${status}`">{{ statusLabel }}</span>
    </div>
    <pre class="demo-preview">{{ previewText }}</pre>
    <div class="demo-meta">
      <span>占位助手楼层：#{{ assistantMessageId ?? '-' }}</span>
      <span>最终长度：{{ finalText.length }}</span>
    </div>
    <div v-if="errorText" class="demo-error">{{ errorText }}</div>
  </section>
</template>

<script setup lang="ts">
const props = defineProps<{
  status: 'idle' | 'preparing' | 'streaming' | 'persisting' | 'done' | 'error';
  streamText: string;
  finalText: string;
  assistantMessageId: number | null;
  errorText: string;
}>();

const statusLabel = computed(() => {
  if (props.status === 'preparing') return '准备中';
  if (props.status === 'streaming') return '流式中';
  if (props.status === 'persisting') return '写回楼层';
  if (props.status === 'done') return '完成';
  if (props.status === 'error') return '错误';
  return '空闲';
});

const previewText = computed(() => {
  if (props.status === 'idle') return '点击发送后，这里会显示 generate 的 token 流。';
  if (props.status === 'error') return props.errorText || '生成失败';
  return props.streamText || props.finalText || '等待首个 token…';
});
</script>

<style scoped>
.demo-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 12px;
  background: rgba(20, 28, 46, 0.9);
  border: 1px solid rgba(126, 160, 255, 0.18);
}

.demo-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.demo-card-title {
  font-size: 13px;
  font-weight: 700;
}

.demo-status {
  font-size: 11px;
  border-radius: 999px;
  padding: 3px 8px;
  border: 1px solid transparent;
}

.demo-status.is-idle,
.demo-status.is-preparing {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.12);
}

.demo-status.is-streaming {
  background: rgba(95, 208, 255, 0.16);
  border-color: rgba(95, 208, 255, 0.35);
}

.demo-status.is-persisting,
.demo-status.is-done {
  background: rgba(137, 255, 184, 0.16);
  border-color: rgba(137, 255, 184, 0.35);
}

.demo-status.is-error {
  background: rgba(255, 120, 120, 0.16);
  border-color: rgba(255, 120, 120, 0.35);
}

.demo-preview {
  margin: 0;
  padding: 10px;
  min-height: 120px;
  max-height: 220px;
  overflow: auto;
  border-radius: 10px;
  background: rgba(7, 11, 20, 0.92);
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.5;
}

.demo-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: rgba(230, 236, 255, 0.68);
}

.demo-error {
  color: #ff9f9f;
  font-size: 12px;
}
</style>
