<template>
  <section class="composer-card">
    <div class="composer-meta">
      <span class="status-pill" :class="`is-${status}`">{{ statusLabel }}</span>
      <span class="composer-tip">assistant 楼层会自动 hidden，仅在本界面 transcript 中显示。</span>
    </div>
    <div class="composer-main">
      <textarea
        :value="modelValue"
        class="composer-textarea"
        rows="3"
        placeholder="输入内容并发送给 AI。发送后只在本界面的 transcript 中阅读 assistant 回复。"
        @input="onInput"
      />
      <div class="composer-actions">
        <button type="button" class="send-btn secondary mini" @click="$emit('jump-latest')">最新</button>
        <button type="button" class="send-btn secondary mini" @click="$emit('refresh')">刷新</button>
        <button type="button" class="send-btn" :disabled="busy" @click="$emit('submit')">
          {{ busy ? '生成中…' : '发送' }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { DemoStatus } from '../types';

const props = defineProps<{
  modelValue: string;
  busy: boolean;
  status: DemoStatus;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
  (event: 'submit'): void;
  (event: 'jump-latest'): void;
  (event: 'refresh'): void;
}>();

const statusLabel = computed(() => {
  if (props.status === 'preparing') return '准备中';
  if (props.status === 'streaming') return '流式中';
  if (props.status === 'persisting') return '写回中';
  if (props.status === 'done') return '已完成';
  if (props.status === 'error') return '错误';
  return '空闲';
});

function onInput(event: Event) {
  const target = event.target as HTMLTextAreaElement | null;
  emit('update:modelValue', target?.value ?? '');
}
</script>

<style scoped>
.composer-card {
  position: sticky;
  bottom: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 12px;
  background: var(--demo-surface-card-sticky);
  border: 1px solid var(--demo-border-accent);
  backdrop-filter: blur(10px);
}

.composer-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.status-pill {
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 11px;
  background: var(--demo-surface-neutral-strong);
}

.status-pill.is-streaming {
  background: var(--demo-surface-accent);
}

.status-pill.is-done,
.status-pill.is-persisting {
  background: var(--demo-surface-success);
}

.status-pill.is-error {
  background: var(--demo-surface-danger);
}

.composer-tip {
  font-size: 11px;
  color: var(--demo-text-subtle);
}

.composer-main {
  display: flex;
  gap: 8px;
  align-items: stretch;
}

.composer-actions {
  display: flex;
  gap: 8px;
  flex: 0 0 auto;
}

.composer-textarea {
  flex: 1 1 auto;
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  min-height: 88px;
  border-radius: 10px;
  border: 1px solid var(--demo-border-accent-strong);
  background: var(--demo-surface-panel-strong);
  color: var(--demo-text-primary);
  padding: 10px;
}

.send-btn {
  flex: 0 0 88px;
  border: 0;
  border-radius: 10px;
  background: var(--demo-gradient-primary);
  color: var(--demo-text-inverse);
  font-weight: 700;
}

.send-btn.secondary {
  background: var(--demo-surface-neutral-strong);
  color: var(--demo-text-primary);
  border: 1px solid var(--demo-border-accent-muted);
}

.send-btn.danger {
  background: var(--demo-surface-danger-soft);
  color: var(--demo-text-danger);
  border: 1px solid var(--demo-border-danger);
}

.send-btn.mini {
  flex-basis: auto;
  min-width: 70px;
  font-size: 12px;
  padding-inline: 10px;
}

.send-btn:disabled {
  opacity: 0.6;
}

@media (max-width: 520px) {
  .composer-main {
    flex-direction: column;
  }

  .composer-actions {
    width: 100%;
  }

  .send-btn {
    flex: 1 1 0;
    min-height: 40px;
  }
}
</style>
