<template>
  <aside class="dock-shell" :class="{ 'is-collapsed': collapsed }">
    <div class="dock-head">
      <div class="dock-title">
        <span class="material-symbols-outlined">badge</span>
        <span>个人状态</span>
      </div>
      <button class="dock-toggle" @click="toggleCollapsed">
        <span class="material-symbols-outlined">{{ collapsed ? 'chevron_right' : 'chevron_left' }}</span>
        <span>{{ collapsed ? '展开' : '收起' }}</span>
      </button>
    </div>

    <div v-if="!collapsed" class="dock-tabs">
      <button class="dock-tab" :class="{ active: activeTab === 'status' }" @click="activeTab = 'status'">
        角色信息
      </button>
      <button class="dock-tab" :class="{ active: activeTab === 'tasks' }" @click="activeTab = 'tasks'">任务日志</button>
    </div>

    <div v-if="!collapsed" class="dock-body">
      <div v-if="activeTab === 'status'" class="dock-section">
        <ServiceStatus />
        <ServiceStats />
      </div>
      <div v-else class="dock-section">
        <div class="dock-card">
          <div class="dock-card-title">
            <span class="material-symbols-outlined">assignment</span>
            当前任务
          </div>
          <div class="dock-card-desc">暂无任务日志，等待剧情推进。</div>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import ServiceStatus from './ServiceStatus.vue';
import ServiceStats from './ServiceStats.vue';

const props = defineProps<{ collapsed?: boolean }>();
const emit = defineEmits<{
  (e: 'update:collapsed', value: boolean): void;
}>();

const collapsed = ref(props.collapsed ?? false);
const activeTab = ref<'status' | 'tasks'>('status');

function toggleCollapsed() {
  collapsed.value = !collapsed.value;
  emit('update:collapsed', collapsed.value);
}

watch(
  () => props.collapsed,
  value => {
    if (typeof value === 'boolean') {
      collapsed.value = value;
    }
  },
);
</script>

<style scoped lang="scss">
.dock-shell {
  border-radius: 18px;
  border: 1px solid rgba(59, 130, 246, 0.25);
  background: rgba(15, 23, 42, 0.85);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: #e2e8f0;
  transition:
    width 0.2s ease,
    padding 0.2s ease;
}

.dock-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.dock-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
}

.dock-toggle {
  border-radius: 999px;
  padding: 4px 8px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: rgba(2, 6, 23, 0.7);
  color: rgba(226, 232, 240, 0.8);
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.dock-shell.is-collapsed {
  width: 64px;
  padding: 10px 6px;
  align-items: center;
}

.dock-shell.is-collapsed .dock-head {
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.dock-shell.is-collapsed .dock-title span {
  display: none;
}

.dock-shell.is-collapsed .dock-toggle span {
  display: none;
}

.dock-tabs {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}

.dock-tab {
  border-radius: 10px;
  padding: 6px 8px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(2, 6, 23, 0.6);
  color: rgba(226, 232, 240, 0.8);
  font-size: 11px;
  font-weight: 600;
}

.dock-tab.active {
  border-color: rgba(59, 130, 246, 0.5);
  background: rgba(59, 130, 246, 0.2);
  color: #e0f2fe;
}

.dock-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dock-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dock-card {
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(2, 6, 23, 0.6);
  padding: 10px;
}

.dock-card-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 6px;
}

.dock-card-desc {
  font-size: 11px;
  color: rgba(226, 232, 240, 0.6);
  line-height: 1.5;
}
</style>
