<template>
  <section class="demo-card">
    <div class="demo-card-title">3. Demo 楼层历史</div>
    <div v-if="items.length === 0" class="demo-empty">还没有写回的 demo 助手楼层。</div>
    <ul v-else class="demo-list">
      <li v-for="item in items" :key="item.message_id" class="demo-list-item">
        <div class="demo-list-head">
          <strong>#{{ item.message_id }}</strong>
          <span>{{ item.phase === 'stream' ? '流式占位' : '最终楼层' }}</span>
        </div>
        <div class="demo-list-body">{{ item.preview }}</div>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  items: Array<{
    message_id: number;
    preview: string;
    phase: 'stream' | 'done';
  }>;
}>();
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

.demo-card-title {
  font-size: 13px;
  font-weight: 700;
}

.demo-empty {
  font-size: 12px;
  color: var(--demo-text-tertiary);
}

.demo-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.demo-list-item {
  padding: 8px;
  border-radius: 10px;
  background: var(--demo-surface-panel-strong);
}

.demo-list-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--demo-text-tertiary);
}

.demo-list-body {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
