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
        <button
          type="button"
          class="send-btn secondary"
          :disabled="busy || !canRegenerate"
          @click="$emit('regenerate')"
        >
          重生
        </button>
        <button
          type="button"
          class="send-btn secondary"
          :disabled="busy || !canRegenerateEdited"
          @click="$emit('regenerate-edited')"
        >
          改词重生
        </button>
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
  canRegenerate: boolean;
  canRegenerateEdited: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
  (event: 'submit'): void;
  (event: 'regenerate'): void;
  (event: 'regenerate-edited'): void;
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
  background: rgba(20, 28, 46, 0.96);
  border: 1px solid rgba(126, 160, 255, 0.18);
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
  background: rgba(255, 255, 255, 0.08);
}

.status-pill.is-streaming {
  background: rgba(95, 208, 255, 0.16);
}

.status-pill.is-done,
.status-pill.is-persisting {
  background: rgba(137, 255, 184, 0.16);
}

.status-pill.is-error {
  background: rgba(255, 120, 120, 0.16);
}

.composer-tip {
  font-size: 11px;
  color: rgba(230, 236, 255, 0.64);
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
  border: 1px solid rgba(126, 160, 255, 0.25);
  background: rgba(7, 11, 20, 0.92);
  color: #f3f7ff;
  padding: 10px;
}

.send-btn {
  flex: 0 0 88px;
  border: 0;
  border-radius: 10px;
  background: linear-gradient(135deg, #78a0ff, #5fd0ff);
  color: #07111f;
  font-weight: 700;
}

.send-btn.secondary {
  background: rgba(255, 255, 255, 0.08);
  color: #f3f7ff;
  border: 1px solid rgba(126, 160, 255, 0.2);
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
