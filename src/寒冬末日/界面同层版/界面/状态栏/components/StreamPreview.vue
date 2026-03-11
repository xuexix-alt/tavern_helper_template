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
  background: var(--demo-surface-card);
  border: 1px solid var(--demo-border-accent);
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
  background: var(--demo-surface-neutral-strong);
  border-color: var(--demo-border-neutral-strong);
}

.demo-status.is-streaming {
  background: var(--demo-surface-accent);
  border-color: var(--demo-border-cyan-strong);
}

.demo-status.is-persisting,
.demo-status.is-done {
  background: var(--demo-surface-success);
  border-color: var(--demo-border-success);
}

.demo-status.is-error {
  background: var(--demo-surface-danger);
  border-color: var(--demo-border-danger-strong);
}

.demo-preview {
  margin: 0;
  padding: 10px;
  min-height: 120px;
  max-height: 220px;
  overflow: auto;
  border-radius: 10px;
  background: var(--demo-surface-panel-strong);
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
  color: var(--demo-text-muted);
}

.demo-error {
  color: var(--demo-text-danger-soft);
  font-size: 12px;
}
</style>
