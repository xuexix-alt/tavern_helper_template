<template>
  <section class="composer-shell">
    <div class="composer-toolbar">
      <div class="composer-role-tabs" role="tablist" aria-label="快速角色切换">
        <button
          v-for="role in roleTabs"
          :key="role.key"
          type="button"
          class="role-tab-chip clip-corner-sm"
          :class="{ active: activeRoleKey === role.key }"
          @click="$emit('open-role', role.key)"
        >
          <span class="role-dot" :class="role.statusClass"></span>
          {{ role.label }}
        </button>
      </div>

      <div class="composer-quick-actions">
        <button type="button" class="quick-btn clip-corner-sm" @click="$emit('jump-latest')">最新</button>
        <button type="button" class="quick-btn clip-corner-sm" @click="$emit('refresh')">刷新</button>
        <button type="button" class="quick-btn clip-corner-sm" :disabled="busy || !canRoll" @click="$emit('roll')">
          RE-SYNC
        </button>
      </div>
    </div>

    <div class="composer-input-shell clip-corner">
      <div class="composer-input-icon">◎</div>
      <div class="composer-input-main">
        <textarea
          :value="modelValue"
          class="composer-textarea"
          rows="2"
          placeholder="AWAITING_COMMAND..."
          @input="onInput"
        />
      </div>
      <button type="button" class="send-btn clip-corner-sm" :disabled="busy" @click="$emit('submit')">
        {{ busy ? '生成中…' : '发送' }}
      </button>
    </div>

    <div class="composer-status-row">
      <span class="status-pill clip-corner-sm" :class="`is-${status}`">{{ statusLabel }}</span>
      <span class="composer-tip">assistant hidden 楼层仅在当前 transcript 中重建显示。</span>
      <span v-if="swipeLabel" class="composer-swipe-label">{{ swipeLabel }}</span>
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
  roleTabs?: Array<{ key: string; label: string; statusClass?: string; statusText?: string }>;
  activeRoleKey?: string | null;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
  (event: 'submit'): void;
  (event: 'roll'): void;
  (event: 'swipe', direction: 'prev' | 'next'): void;
  (event: 'jump-latest'): void;
  (event: 'refresh'): void;
  (event: 'open-role', key: string): void;
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
.composer-shell,
.composer-toolbar,
.composer-role-tabs,
.composer-quick-actions,
.composer-input-shell,
.composer-status-row {
  display: flex;
}
.composer-shell {
  width: 100%;
  max-width: 1040px;
  margin: 0 auto;
  flex-direction: column;
  gap: 12px;
}
.composer-toolbar {
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.composer-role-tabs {
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
  overflow-x: auto;
  padding-bottom: 2px;
  min-width: 0;
}
.role-tab-chip,
.quick-btn,
.send-btn,
.status-pill {
  font-family: var(--demo-font-mono);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.role-tab-chip {
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 28%, transparent);
  color: var(--demo-text-primary);
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  flex: 0 0 auto;
}
.role-tab-chip.active {
  color: var(--demo-text-accent);
  border-color: var(--demo-border-accent-active);
  background: color-mix(in srgb, var(--primary) 10%, transparent);
}
.role-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--foreground) 28%, transparent);
}
.role-dot.status-active {
  background: var(--demo-color-neon);
  box-shadow: 0 0 10px color-mix(in srgb, var(--demo-color-neon) 45%, transparent);
}
.role-dot.status-idle {
  background: var(--demo-color-idle);
}
.composer-quick-actions {
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.quick-btn {
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 24%, transparent);
  color: var(--demo-text-secondary);
  font-size: 12px;
}
.composer-input-shell {
  align-items: stretch;
  gap: 0;
  border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent);
  background: color-mix(in srgb, var(--surface) 30%, transparent);
  padding: 0;
  overflow: hidden;
}
.composer-input-icon {
  width: 54px;
  flex: 0 0 54px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid color-mix(in srgb, var(--primary) 20%, transparent);
  font-family: var(--demo-font-mono);
  font-size: 22px;
  color: var(--demo-text-accent);
}
.composer-input-main {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  padding: 0 14px;
}
.composer-textarea {
  width: 100%;
  min-height: 74px;
  resize: vertical;
  border: 0;
  background: transparent;
  color: var(--demo-text-primary);
  padding: 14px 0;
  font-family: var(--demo-font-mono);
  font-size: 14px;
  line-height: 1.6;
}
.composer-textarea::placeholder {
  color: color-mix(in srgb, var(--demo-text-accent) 30%, transparent);
  letter-spacing: 0.12em;
}
.send-btn {
  min-height: 44px;
  min-width: 88px;
  margin: 10px;
  align-self: flex-end;
  padding: 0 16px;
  border: 1px solid transparent;
  background: var(--demo-gradient-primary);
  color: var(--demo-text-inverse);
  font-size: 12px;
  font-weight: 700;
}
.composer-status-row {
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.status-pill {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--demo-border-accent-soft);
  background: color-mix(in srgb, var(--surface) 36%, transparent);
  font-size: 12px;
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
.composer-tip,
.composer-swipe-label {
  font-size: 12px;
  color: var(--demo-text-subtle);
}
@media (max-width: 760px) {
  .composer-toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  .composer-role-tabs {
    width: 100%;
  }
  .composer-quick-actions {
    width: 100%;
  }
  .quick-btn {
    flex: 1 1 0;
  }
  .composer-input-icon {
    width: 48px;
    flex-basis: 48px;
  }
  .composer-textarea {
    min-height: 68px;
    font-size: 13px;
  }
  .send-btn {
    min-width: 78px;
  }
}
</style>
