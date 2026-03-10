<template>
  <section class="composer-card hud-panel clip-corner">
    <div class="composer-meta">
      <div class="composer-meta-left">
        <span class="demo-kicker">COMMAND INPUT</span>
        <span class="status-pill clip-corner-sm" :class="`is-${status}`">{{ statusLabel }}</span>
      </div>
      <span class="composer-tip">assistant 楼层自动 hidden，仅在本 transcript 中显示。</span>
    </div>

    <div class="composer-main">
      <div class="composer-terminal clip-corner-sm">
        <span class="composer-prompt">[stream]&gt;</span>
        <textarea
          :value="modelValue"
          class="composer-textarea"
          rows="3"
          placeholder="输入内容并发送给 AI。发送后只在本界面的 transcript 中阅读 assistant 回复。"
          @input="onInput"
        />
      </div>

      <div class="composer-actions">
        <!--
        <div v-if="swipeLabel" class="composer-swipe-group">
          <button type="button" class="send-btn secondary mini clip-corner-sm" :disabled="busy || !canSwipePrev" @click="$emit('swipe', 'prev')">
            ←
          </button>
          <span class="composer-swipe-label">{{ swipeLabel }}</span>
          <button type="button" class="send-btn secondary mini clip-corner-sm" :disabled="busy || !canSwipeNext" @click="$emit('swipe', 'next')">
            →
          </button>
        </div>
        -->

        <button type="button" class="send-btn secondary mini clip-corner-sm" @click="$emit('jump-latest')">最新</button>
        <button type="button" class="send-btn secondary mini clip-corner-sm" @click="$emit('refresh')">刷新</button>
        <button type="button" class="send-btn secondary mini clip-corner-sm" :disabled="busy || !canRoll" @click="$emit('roll')">
          ROLL
        </button>
        <button type="button" class="send-btn clip-corner-sm" :disabled="busy" @click="$emit('submit')">
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
  canRoll?: boolean;
  swipeLabel?: string;
  canSwipePrev?: boolean;
  canSwipeNext?: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
  (event: 'submit'): void;
  (event: 'roll'): void;
  (event: 'swipe', direction: 'prev' | 'next'): void;
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
  gap: 12px;
  padding: 14px;
  border-radius: 16px;
}

.composer-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.composer-meta-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.status-pill {
  border: 1px solid var(--demo-border-accent-soft);
  padding: 4px 10px;
  font-size: 11px;
  background: color-mix(in srgb, var(--surface) 36%, transparent);
  color: var(--demo-text-tertiary);
}

.status-pill.is-streaming {
  background: var(--demo-surface-accent);
  color: var(--demo-text-accent);
}

.status-pill.is-done,
.status-pill.is-persisting {
  background: var(--demo-surface-success);
  color: var(--demo-text-success);
}

.status-pill.is-error {
  background: var(--demo-surface-danger);
  color: var(--demo-text-danger);
}

.composer-tip {
  font-size: 11px;
  color: var(--demo-text-subtle);
}

.composer-main {
  display: flex;
  gap: 10px;
  align-items: stretch;
}

.composer-terminal {
  flex: 1 1 auto;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 42%, transparent);
}

.composer-prompt {
  padding-top: 2px;
  font-family: var(--demo-font-mono);
  font-size: 12px;
  color: var(--demo-text-warning);
  white-space: nowrap;
}

.composer-textarea {
  flex: 1 1 auto;
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  min-height: 88px;
  border: 0;
  background: transparent;
  color: var(--demo-text-primary);
  padding: 0;
}

.composer-textarea::placeholder {
  color: var(--demo-text-muted);
}

.composer-actions {
  display: flex;
  gap: 8px;
  flex: 0 0 auto;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.composer-swipe-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.composer-swipe-label {
  min-width: 42px;
  text-align: center;
  font-size: 12px;
  color: var(--demo-text-muted);
}

.send-btn {
  min-height: 40px;
  min-width: 86px;
  border: 1px solid transparent;
  background: var(--demo-gradient-primary);
  color: var(--demo-text-inverse);
  font-weight: 700;
  padding: 0 14px;
}

.send-btn.secondary {
  background: color-mix(in srgb, var(--surface) 42%, transparent);
  color: var(--demo-text-primary);
  border-color: var(--demo-border-accent-muted);
}

.send-btn.mini {
  min-width: 70px;
  font-size: 12px;
}

.send-btn:disabled {
  opacity: 0.6;
}

@media (max-width: 680px) {
  .composer-card {
    padding: 12px;
  }

  .composer-main {
    flex-direction: column;
  }

  .composer-terminal {
    width: 100%;
  }

  .composer-actions {
    width: 100%;
    justify-content: stretch;
  }

  .send-btn {
    flex: 1 1 0;
  }
}
</style>
