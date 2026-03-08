<template>
  <section v-if="visible" class="history-banner">
    <div class="history-banner-copy">
      <strong>当前正在浏览历史</strong>
      <span>自动追底已暂停。点“回到最新”可恢复跟随最新消息。</span>
    </div>
    <button type="button" class="history-banner-btn" @click="$emit('jump-latest')">回到最新</button>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  visible: boolean;
}>();

defineEmits<{
  (event: 'jump-latest'): void;
}>();
</script>

<style scoped>
.history-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--demo-border-warning-muted);
  background: var(--demo-surface-user-banner);
}

.history-banner-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.history-banner-copy strong {
  font-size: 13px;
  color: var(--demo-text-warning-soft);
}

.history-banner-copy span {
  font-size: 12px;
  color: var(--demo-text-warning-muted);
}

.history-banner-btn {
  flex: 0 0 auto;
  border-radius: 999px;
  border: 1px solid var(--demo-border-warning-strong);
  background: var(--demo-surface-history);
  color: var(--demo-text-warning-muted);
  min-height: 34px;
  padding: 6px 12px;
}

@media (max-width: 520px) {
  .history-banner {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
