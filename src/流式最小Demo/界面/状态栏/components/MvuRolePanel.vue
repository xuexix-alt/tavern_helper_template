<template>
  <section class="mvu-role-card">
    <header class="mvu-role-head">
      <div>
        <span class="mvu-role-kicker">MVU ROLE VIEW</span>
        <h3>角色变量面板</h3>
      </div>
      <div class="mvu-role-meta">
        <span class="meta-pill">来源：{{ sourceLabel }}</span>
        <span v-if="isDuringExtraAnalysis" class="meta-pill is-analysis">额外模型解析中</span>
      </div>
    </header>

    <div class="mvu-role-top-tabs" role="tablist" aria-label="角色分类">
      <button
        v-for="tab in topTabs"
        :key="tab.id"
        type="button"
        class="mvu-role-top-tab"
        :class="{ active: activeTab === tab.id }"
        @click="switchTopTab(tab.id)"
      >
        {{ tab.label }}
      </button>
    </div>

    <div v-if="!ready && !hasAnyRole" class="mvu-role-empty">
      当前目标楼层还没有可展示的 `stat_data`，已自动尝试回退到最新楼层。
    </div>

    <div v-else-if="activeEntries.length === 0" class="mvu-role-empty">当前分类下暂无可展示角色。</div>

    <template v-else>
      <div class="character-nav-mobile">
        <button class="character-nav-btn prev" type="button" :disabled="currentCharacterIndex <= 0" @click="navigateCharacter(-1)">
          ‹
        </button>
        <div class="character-nav-current" @click="toggleCharacterDropdown">
          <span class="character-nav-name">{{ currentCharacterLabel }}</span>
          <span class="status-pill small" :class="currentCharacterStatus">{{ currentCharacterStatus }}</span>
          <span class="character-nav-count">{{ currentCharacterIndex + 1 }}/{{ activeEntries.length }}</span>
          <span class="character-nav-dropdown-icon">▼</span>
        </div>
        <button
          class="character-nav-btn next"
          type="button"
          :disabled="currentCharacterIndex >= activeEntries.length - 1"
          @click="navigateCharacter(1)"
        >
          ›
        </button>

        <Teleport to="body">
          <div v-if="characterDropdownOpen" class="character-dropdown-overlay" @click="characterDropdownOpen = false">
            <div class="character-dropdown-modal" @click.stop>
              <div class="character-dropdown-header">
                <span>选择角色</span>
                <button type="button" class="character-dropdown-close" @click="characterDropdownOpen = false">×</button>
              </div>
              <div class="character-dropdown-list">
                <button
                  v-for="(entry, idx) in activeEntries"
                  :key="entry.key"
                  type="button"
                  class="character-dropdown-item"
                  :class="{ active: activeCharacterKey === entry.key }"
                  @click="selectCharacterFromDropdown(entry.key)"
                >
                  <span class="character-dropdown-index">{{ idx + 1 }}</span>
                  <span class="character-dropdown-name">{{ roleName(entry) }}</span>
                  <span class="status-pill small" :class="statusClass(entry)">{{ statusText(entry) }}</span>
                </button>
              </div>
            </div>
          </div>
        </Teleport>
      </div>

      <div class="tab-buttons desktop-only">
        <button
          v-for="entry in activeEntries"
          :key="entry.key"
          class="tab-button"
          :class="{ active: activeCharacterKey === entry.key }"
          type="button"
          @click="setActiveCharacter(entry.key)"
        >
          {{ roleName(entry) }}
          <span class="status-pill small" :class="statusClass(entry)">{{ statusText(entry) }}</span>
        </button>
      </div>

      <div v-if="activeCharacter" class="tab-content active">
        <div class="status-grid">
          <div class="status-item health-section">
            <div class="health-section-header">
              <div class="label">❤️ 健康</div>
              <div class="value">{{ String(activeCharacter.role.健康 ?? '--') }}</div>
            </div>
            <div class="health-status-subtext">{{ String(activeCharacter.role.健康状况 ?? '--') }}</div>
          </div>

          <div class="status-item imprint-section">
            <div class="health-section-header">
              <div class="label">🔱 秩序刻印</div>
              <div class="value">{{ String(activeCharacter.role.秩序刻印 ?? '--') }}</div>
            </div>
            <div class="imprint-status-subtext">
              {{ String(activeCharacter.role.关系 ?? '--') }} · 关系倾向：{{ String(activeCharacter.role.关系倾向 ?? '--') }}
            </div>
          </div>

          <div class="details-grid">
            <div class="status-item">
              <div class="label">👚 衣着</div>
              <div class="value">{{ String(activeCharacter.role.衣着 ?? '--') || '--' }}</div>
            </div>
            <div class="status-item">
              <div class="label">😊 神态样貌</div>
              <div class="value">{{ String(activeCharacter.role.神态样貌 ?? '--') || '--' }}</div>
            </div>
            <div class="status-item">
              <div class="label">💃 动作姿势</div>
              <div class="value">{{ String(activeCharacter.role.动作姿势 ?? '--') || '--' }}</div>
            </div>
            <div class="status-item">
              <div class="label">📍 所在房间</div>
              <div class="value">{{ String(activeCharacter.role.所在房间 ?? '--') || '--' }}</div>
            </div>
          </div>

          <div class="status-item">
            <div class="label">💭 内心想法</div>
            <div class="value thought-text">{{ String(activeCharacter.role.内心想法 ?? '--') || '--' }}</div>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { useWindowSize } from '@vueuse/core';

import { useMvuRoleStore } from '../mvuRoleStore';

const props = defineProps<{
  targetMessageId?: number | null;
}>();

type RoleTab = 'main' | 'temp';

const activeTab = ref<RoleTab>('main');
const targetMessageId = computed(() => props.targetMessageId ?? null);
const { width } = useWindowSize();
const useVirtualTabs = computed(() => width.value <= 760);

const { ready, source, isDuringExtraAnalysis, hasAnyRole, mainRoleEntries, tempNpcEntries } = useMvuRoleStore(targetMessageId);

const topTabs = computed(() => [
  { id: 'main' as const, label: `主要角色 ${mainRoleEntries.value.length}` },
  { id: 'temp' as const, label: `临时NPC ${tempNpcEntries.value.length}` },
]);

const activeEntries = computed(() => (activeTab.value === 'main' ? mainRoleEntries.value : tempNpcEntries.value));
const activeCharacterKey = ref<string | null>(null);
const characterDropdownOpen = ref(false);

const currentCharacterIndex = computed(() => {
  const idx = activeEntries.value.findIndex(entry => entry.key === activeCharacterKey.value);
  return idx >= 0 ? idx : 0;
});

const activeCharacter = computed(() => activeEntries.value.find(entry => entry.key === activeCharacterKey.value) ?? activeEntries.value[0] ?? null);
const currentCharacterLabel = computed(() => (activeCharacter.value ? roleName(activeCharacter.value) : '暂无角色'));
const currentCharacterStatus = computed(() => (activeCharacter.value ? statusClass(activeCharacter.value) : 'status-neutral'));

const sourceLabel = computed(() => {
  if (source.value === 'current') return '当前楼层';
  if (source.value === 'latest') return '回退最新';
  return '默认空值';
});

watch(
  activeEntries,
  entries => {
    const keys = entries.map(entry => entry.key);
    if (keys.length === 0) {
      activeCharacterKey.value = null;
      characterDropdownOpen.value = false;
      return;
    }
    if (!activeCharacterKey.value || !keys.includes(activeCharacterKey.value)) {
      activeCharacterKey.value = keys[0];
    }
  },
  { immediate: true },
);

function roleName(entry: { key: string; role: Record<string, any> }) {
  return String(entry.role.姓名 ?? entry.key ?? '').trim() || entry.key;
}

function statusText(entry: { role: Record<string, any> }) {
  return String(entry.role.登场状态 ?? '未知');
}

function statusClass(entry: { role: Record<string, any> }) {
  return String(entry.role.登场状态 ?? '').trim() === '登场' ? 'status-active' : 'status-idle';
}

function switchTopTab(tab: RoleTab) {
  activeTab.value = tab;
  characterDropdownOpen.value = false;
}

function setActiveCharacter(key: string) {
  activeCharacterKey.value = key;
}

function navigateCharacter(direction: number) {
  const nextIndex = _.clamp(currentCharacterIndex.value + direction, 0, Math.max(0, activeEntries.value.length - 1));
  activeCharacterKey.value = activeEntries.value[nextIndex]?.key ?? activeCharacterKey.value;
}

function toggleCharacterDropdown() {
  if (!useVirtualTabs.value || activeEntries.value.length === 0) return;
  characterDropdownOpen.value = !characterDropdownOpen.value;
}

function selectCharacterFromDropdown(key: string) {
  activeCharacterKey.value = key;
  characterDropdownOpen.value = false;
}
</script>

<style scoped>
.mvu-role-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mvu-role-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.mvu-role-kicker {
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--demo-text-subtle);
}

.mvu-role-head h3 {
  margin: 4px 0 0;
  font-size: 15px;
}

.mvu-role-meta,
.mvu-role-title-group,
.mvu-role-top-tabs,
.health-section-header,
.status-grid,
.tab-buttons,
.character-nav-mobile,
.character-nav-current,
.character-dropdown-header,
.character-dropdown-item {
  display: flex;
}

.mvu-role-meta,
.mvu-role-top-tabs,
.tab-buttons,
.character-dropdown-header {
  gap: 8px;
  flex-wrap: wrap;
}

.mvu-role-meta {
  justify-content: flex-end;
}

.meta-pill,
.status-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 11px;
  background: var(--demo-surface-panel);
  border: 1px solid var(--demo-border-accent-soft);
  color: var(--demo-text-secondary);
}

.status-pill.small {
  font-size: 10px;
  padding: 2px 7px;
}

.status-active {
  border-color: var(--demo-border-accent-active);
  color: var(--demo-text-primary);
}

.status-idle {
  opacity: 0.78;
}

.meta-pill.is-analysis {
  color: var(--demo-text-warning);
  border-color: var(--demo-border-warning-soft);
}

.mvu-role-top-tab,
.tab-button,
.character-nav-btn {
  min-height: 34px;
  border-radius: 999px;
  border: 1px solid var(--demo-border-accent-muted);
  background: var(--demo-surface-panel);
  color: var(--demo-text-primary);
  padding: 6px 12px;
}

.mvu-role-top-tab.active,
.tab-button.active {
  background: var(--demo-gradient-chip-active);
  border-color: var(--demo-border-accent-active);
}

.mvu-role-empty {
  padding: 10px;
  border-radius: 10px;
  background: var(--demo-surface-panel);
  border: 1px dashed var(--demo-border-accent);
  font-size: 13px;
  line-height: 1.5;
  color: var(--demo-text-secondary);
}

.character-nav-mobile {
  align-items: center;
  gap: 8px;
}

.character-nav-btn {
  width: 44px;
  justify-content: center;
  padding: 0;
}

.character-nav-current {
  flex: 1 1 auto;
  min-width: 0;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--demo-border-accent-soft);
  border-radius: 12px;
  padding: 8px 10px;
  background: var(--demo-surface-panel);
}

.character-nav-name {
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.character-nav-count,
.character-nav-dropdown-icon {
  font-size: 12px;
  color: var(--demo-text-subtle);
}

.desktop-only {
  display: none;
}

.character-dropdown-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.character-dropdown-modal {
  width: min(100%, 420px);
  max-height: min(70vh, 560px);
  border-radius: 14px;
  background: var(--demo-surface-card-strong);
  border: 1px solid var(--demo-border-accent);
  overflow: hidden;
}

.character-dropdown-header {
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-bottom: 1px solid var(--demo-border-accent-soft);
}

.character-dropdown-close {
  border: 0;
  background: transparent;
  color: var(--demo-text-primary);
  font-size: 18px;
}

.character-dropdown-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  overflow-y: auto;
  max-height: calc(min(70vh, 560px) - 56px);
}

.character-dropdown-item {
  align-items: center;
  gap: 8px;
  width: 100%;
  border-radius: 10px;
  border: 1px solid var(--demo-border-accent-soft);
  background: var(--demo-surface-panel);
  color: var(--demo-text-primary);
  padding: 10px;
}

.character-dropdown-item.active {
  background: var(--demo-gradient-chip-active);
  border-color: var(--demo-border-accent-active);
}

.character-dropdown-index {
  color: var(--demo-text-subtle);
  min-width: 18px;
}

.character-dropdown-name {
  flex: 1 1 auto;
  text-align: left;
}

.tab-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.status-grid {
  flex-direction: column;
  gap: 10px;
}

.status-item,
.details-grid > .status-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border-radius: 10px;
  background: var(--demo-surface-panel);
  border: 1px solid var(--demo-border-accent-soft);
}

.details-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.label {
  font-size: 11px;
  color: var(--demo-text-subtle);
}

.value,
.health-status-subtext,
.imprint-status-subtext,
.thought-text {
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (min-width: 761px) {
  .character-nav-mobile {
    display: none;
  }

  .desktop-only {
    display: flex;
  }
}

@media (max-width: 760px) {
  .mvu-role-head {
    flex-direction: column;
  }

  .details-grid {
    grid-template-columns: 1fr;
  }
}
</style>
